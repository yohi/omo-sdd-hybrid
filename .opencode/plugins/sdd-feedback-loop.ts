import type { Plugin } from '../lib/plugin-stub';
import { readState } from '../lib/state-utils';
import { validateGapInternal } from '../tools/sdd_validate_gap';

// Simple throttle mechanism: taskId -> lastExecutionTimestamp
const lastExecutionMap = new Map<string, number>();
const THROTTLE_MS = 2000; // 2 seconds throttle

const TRIGGER_TOOLS = ['edit', 'write', 'patch', 'multiedit'];

export const SddFeedbackLoop: Plugin = async ({ client }) => {
  return {
    'tool.execute.after': async (input: any, output: any) => {
      // Handle tool name variation (string vs object)
      const toolName = typeof input.tool === 'string' ? input.tool : input.tool?.name;
      
      if (!TRIGGER_TOOLS.includes(toolName)) {
        return;
      }

      const stateResult = await readState();
      if (stateResult.status !== 'ok' && stateResult.status !== 'recovered') {
        return;
      }

      const state = stateResult.state;
      const now = Date.now();
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

        // Check if validation result contains any non-passing indicators
        // We look for typical error/warning markers from sdd_validate_gap output
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
        // Fail silently to not disrupt the workflow
        // console.error('[SDD-FEEDBACK] Error:', error);
      }
    }
  };
};

export default SddFeedbackLoop;
