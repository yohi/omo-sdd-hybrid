import type { Plugin } from '@opencode-ai/plugin';
import { readState as defaultReadState } from '../lib/state-utils';
import { validateGapInternal as defaultValidateGapInternal } from '../tools/sdd_validate_gap';
import defaultReportBug from '../tools/sdd_report_bug';

// Simple throttle mechanism: taskId -> lastExecutionTimestamp
const lastExecutionMap = new Map<string, number>();
const lastBugReportMap = new Map<string, number>();
const commandCache = new Map<string, string>();

const THROTTLE_MS = 2000;
const BUG_REPORT_THROTTLE_MS = 30000;

const TRIGGER_TOOLS = ['edit', 'write', 'patch', 'multiedit'];

const SddFeedbackLoop: Plugin = async (options) => {
  const opts = options as any;
  const readState = opts?.__testDeps?.readState ?? defaultReadState;
  const validateGapInternal = opts?.__testDeps?.validateGapInternal ?? defaultValidateGapInternal;
  const reportBug = opts?.__testDeps?.reportBug ?? defaultReportBug;

  return {
    'tool.execute.before': async (input: any, output: any) => {
      const toolName = typeof input.tool === 'string' ? input.tool : input.tool?.name;
      
      if (toolName === 'bash' && output.args?.command) {
        commandCache.set(input.callID, output.args.command);
      }
    },

    'tool.execute.after': async (input: any, output: any) => {
      // Handle tool name variation (string vs object)
      const toolName = typeof input.tool === 'string' ? input.tool : input.tool?.name;
      
      const stateResult = await readState();
      if (stateResult.status !== 'ok' && stateResult.status !== 'recovered') {
        return;
      }
      const state = stateResult.state;
      const now = Date.now();

      if (toolName === 'bash') {
        const command = commandCache.get(input.callID);
        commandCache.delete(input.callID);

        if (command && /bun\s+test/.test(command)) {
          const failMatch = output.output?.match(/(\d+)\s+fail/);
          const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;

          if (failCount > 0) {
            const lastReport = lastBugReportMap.get(state.activeTaskId) || 0;
            if (now - lastReport < BUG_REPORT_THROTTLE_MS) {
              return;
            }
            lastBugReportMap.set(state.activeTaskId, now);

            try {
              const bugTitle = `Test Failure: ${command.slice(0, 50)}...`;
              const bugBody = {
                title: bugTitle,
                reproSteps: `Run command: \`${command}\``,
                actual: `${failCount} tests failed.`,
                expected: 'All tests should pass.',
                logs: output.output?.slice(0, 2000)
              };

              const result = await reportBug.execute(bugBody, {} as any);

              const banner = `\n\n[SDD-QA] 🐞 自動バグ起票\n` +
                             `---------------------------------------------------\n` +
                             result +
                             `\n---------------------------------------------------\n`;
              if (output.output) {
                output.output += banner;
              }

            } catch (error) {
              // Ignore errors to prevent disruption
            }
          }
        }
        return;
      }

      if (!TRIGGER_TOOLS.includes(toolName)) {
        return;
      }

      const lastRun = lastExecutionMap.get(state.activeTaskId) || 0;

      if (now - lastRun < THROTTLE_MS) {
        return;
      }
      lastExecutionMap.set(state.activeTaskId, now);

      try {
        const validationResult = await validateGapInternal(state, {
          taskId: state.activeTaskId,
          skipTests: true,
          deep: false,
          currentAttempts: state.validationAttempts
        });

        const hasIssues = validationResult.includes('WARN:') || 
                          validationResult.includes('FAIL:') || 
                          validationResult.includes('ERROR:') || 
                          validationResult.includes('❌');

        if (hasIssues) {
          const banner = `\n\n[SDD-FEEDBACK] ⚠️ 整合性チェック警告\n` +
                         `---------------------------------------------------\n` +
                         validationResult +
                         `\n---------------------------------------------------\n`;
          
          if (output.output) {
            output.output += banner;
          }
        }
      } catch (error) {
        // Ignore errors
      }
    }
  };
};

export default SddFeedbackLoop;
