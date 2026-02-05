import type { Plugin } from '../lib/plugin-stub';
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
  const { client } = options || {};
  const worktreeRoot = options?.worktree || getWorktreeRoot();
  const readState = options?.__testDeps?.readState ?? defaultReadState;
  const readGuardModeState = options?.__testDeps?.readGuardModeState ?? defaultReadGuardModeState;
  
  return {
    'tool.execute.before': async (event) => {
      const { name, args } = event.tool;

      const guardModeState = await readGuardModeState();
      const effectiveMode = determineEffectiveGuardMode(process.env.SDD_GUARD_MODE, guardModeState);
      
      if (name === 'multiedit' && args?.files) {
        const stateResult = await readState();
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
            });
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
            });
          } else {
            console.warn(`[SDD-GATEKEEPER] ${result.message}`);
          }
        }
        return;
      }
      
      const filePath = args?.filePath || args?.path;
      const command = args?.command;
      
      const stateResult = await readState();
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
          });
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
          });
        } else {
          console.warn(`[SDD-GATEKEEPER] ${result.message}`);
        }
      }
    }
  };
};

export default SddGatekeeper;
