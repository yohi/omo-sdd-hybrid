import type { Plugin } from '../lib/plugin-stub';
import { readState, readGuardModeState } from '../lib/state-utils';
import { determineEffectiveGuardMode } from '../lib/access-policy';

export const SddContextInjector: Plugin = async () => {
  return {
    'experimental.chat.system.transform': async (_input, output) => {
      try {
        const stateResult = await readState();
        const guardModeState = await readGuardModeState();
        const effectiveMode = determineEffectiveGuardMode(process.env.SDD_GUARD_MODE, guardModeState);

        let contextMsg = '';

        if (stateResult.status === 'ok' || stateResult.status === 'recovered') {
          const state = stateResult.state;
          
          // Truncate scopes if too long to save context window
          const scopes = state.allowedScopes.length > 5 
            ? [...state.allowedScopes.slice(0, 5), `...and ${state.allowedScopes.length - 5} more`]
            : state.allowedScopes;

          contextMsg = `[SDD Context] Active Task: ${state.activeTaskId} | Guard: ${effectiveMode} | Scopes: ${scopes.join(', ')}`;
        } else {
          // Minimal context when no task is active
          contextMsg = `[SDD Context] No active task | Guard: ${effectiveMode}`;
        }

        output.system.push(contextMsg);
      } catch (error) {
        // Fail gracefully to not break the chat
        console.warn('[SDD-INJECTOR] Failed to inject context:', error);
      }
    }
  };
};

export default SddContextInjector;
