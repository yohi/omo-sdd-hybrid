import type { Plugin } from '../lib/plugin-stub';
import { readState } from '../lib/state-utils';
import { getWorktreeRoot } from '../lib/path-utils';
import {
  evaluateAccess,
  evaluateMultiEdit,
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
      
      if (name === 'multiedit' && args?.files) {
        const stateResult = await readState();
        const result = evaluateMultiEdit(args.files, stateResult, worktreeRoot);
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
      const result = evaluateAccess(name, filePath, command, stateResult, worktreeRoot);
      
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
