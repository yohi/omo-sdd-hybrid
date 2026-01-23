import type { Plugin } from '../lib/plugin-stub';
import { readState, readGuardModeState } from '../lib/state-utils';
import { getWorktreeRoot } from '../lib/path-utils';
import {
  evaluateAccess,
  evaluateMultiEdit,
  determineEffectiveGuardMode,
  type AccessResult,
  type GuardMode,
} from '../lib/access-policy';

// Re-export for backward compatibility
export { evaluateAccess, evaluateMultiEdit, type AccessResult, type GuardMode };

export const SddGatekeeper: Plugin = async ({ client }) => {
  const worktreeRoot = getWorktreeRoot();
  
  return {
    'tool.execute.before': async (event) => {
      const { name, args } = event.tool;

      const guardModeState = await readGuardModeState();
      const effectiveMode = determineEffectiveGuardMode(process.env.SDD_GUARD_MODE, guardModeState);
      
      if (name === 'multiedit' && args?.files) {
        const stateResult = await readState();
        const result = evaluateMultiEdit(args.files, stateResult, worktreeRoot, effectiveMode);
        if (!result.allowed) {
          throw new Error(`[SDD-GATEKEEPER] ${result.message}`);
        }
        if (result.warned) {
          console.warn(`[SDD-GATEKEEPER] ${result.message}`);
        }
        return;
      }
      
      const filePath = args?.filePath || args?.path;
      const command = args?.command;
      
      const stateResult = await readState();
      const result = evaluateAccess(name, filePath, command, stateResult, worktreeRoot, effectiveMode);
      
      if (!result.allowed) {
        throw new Error(`[SDD-GATEKEEPER] ${result.message}`);
      }
      
      if (result.warned) {
        console.warn(`[SDD-GATEKEEPER] ${result.message}`);
      }
    }
  };
};

export default SddGatekeeper;
