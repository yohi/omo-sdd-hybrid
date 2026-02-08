import type { Plugin } from '@opencode-ai/plugin';
import { readState as defaultReadState, readGuardModeState as defaultReadGuardModeState } from '../lib/state-utils';
import { getWorktreeRoot } from '../lib/path-utils';
import {
  evaluateAccess,
  evaluateRoleAccess,
  evaluateMultiEdit,
  determineEffectiveGuardMode,
  type AccessResult,
  type GuardMode,
} from '../lib/access-policy';

// Re-export for backward compatibility
// export { evaluateAccess, evaluateMultiEdit, type AccessResult, type GuardMode };

const SddGatekeeper: Plugin = async (options) => {
  const opts = options as any;
  const client = opts.client;
  const worktreeRoot = options.worktree || getWorktreeRoot();
  const readState = opts?.__testDeps?.readState ?? defaultReadState;
  const readGuardModeState = opts?.__testDeps?.readGuardModeState ?? defaultReadGuardModeState;

  return {
    'tool.execute.before': async (input, output) => {
      const toolInput = input.tool;
      const name = typeof toolInput === 'string'
        ? toolInput
        : (toolInput as any)?.name || (toolInput as any)?.id || '';

      const args = output.args;

      const guardModeState = await readGuardModeState();
      const stateResult = await readState();

      // If SDD is not initialized (no guard mode config, no env var, no active state),
      // bypass the gatekeeper checks completely.
      if (!guardModeState && !process.env.SDD_GUARD_MODE && stateResult.status === 'not_found') {
        return;
      }

      const effectiveMode = determineEffectiveGuardMode(process.env.SDD_GUARD_MODE, guardModeState);

      if (name === 'multiedit' && args?.files) {
        const result = evaluateMultiEdit(args.files, stateResult, worktreeRoot, effectiveMode);
        if (!result.allowed) {
          if (client?.tui?.showToast) {
            void client.tui.showToast({
              body: {
                title: 'SDD Gatekeeper Blocked',
                message: result.message,
                variant: 'error',
                duration: 5000
              }
            }).catch(() => { });
          }
          throw new Error(`[SDD-GATEKEEPER] ${result.message}`);
        }
        if (result.warned) {
          if (client?.tui?.showToast) {
            void client.tui.showToast({
              body: {
                title: 'SDD Gatekeeper Warning',
                message: result.message,
                variant: 'warning',
                duration: 5000
              }
            }).catch(() => { });
          } else {
            console.warn(`[SDD-GATEKEEPER] ${result.message}`);
          }
        }
        return;
      }

      const filePath = args?.filePath || args?.path;
      const command = args?.command;

      const result = evaluateRoleAccess(name, filePath, command, stateResult, worktreeRoot, effectiveMode);

      if (!result.allowed) {
        if (client?.tui?.showToast) {
          void client.tui.showToast({
            body: {
              title: 'SDD Gatekeeper Blocked',
              message: result.message,
              variant: 'error',
              duration: 5000
            }
          }).catch(() => { });
        }
        throw new Error(`[SDD-GATEKEEPER] ${result.message}`);
      }

      if (result.warned) {
        if (client?.tui?.showToast) {
          void client.tui.showToast({
            body: {
              title: 'SDD Gatekeeper Warning',
              message: result.message,
              variant: 'warning',
              duration: 5000
            }
          }).catch(() => { });
        } else {
          console.warn(`[SDD-GATEKEEPER] ${result.message}`);
        }
      }
    }
  };
};

export default SddGatekeeper;
