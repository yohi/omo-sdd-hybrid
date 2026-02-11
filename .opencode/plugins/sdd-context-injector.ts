import type { Plugin } from '@opencode-ai/plugin';
import { readState as defaultReadState, readGuardModeState as defaultReadGuardModeState } from '../lib/state-utils';
import { determineEffectiveGuardMode } from '../lib/access-policy';

const SddContextInjector: Plugin = async (options) => {
  const opts = options as any;
  const readState = opts?.__testDeps?.readState ?? defaultReadState;
  const readGuardModeState = opts?.__testDeps?.readGuardModeState ?? defaultReadGuardModeState;

  return {
    'experimental.chat.system.transform': async (_input, output) => {
      try {
        const stateResult = await readState();
        const guardModeState = await readGuardModeState();
        const effectiveMode = determineEffectiveGuardMode(process.env.SDD_GUARD_MODE, guardModeState);

        let contextMsg = '';

        if (stateResult.status === 'ok' || stateResult.status === 'recovered') {
          const state = stateResult.state;
          
          const scopes = state.allowedScopes.length > 5 
            ? [...state.allowedScopes.slice(0, 5), `...and ${state.allowedScopes.length - 5} more`]
            : state.allowedScopes;

          const rolePart = state.role ? ` | Role: ${state.role}` : '';
          contextMsg = `[SDD Context] Active Task: ${state.activeTaskId} | Guard: ${effectiveMode}${rolePart} | Scopes: ${scopes.join(', ')}`;
        } else {
          contextMsg = `[SDD Context] No active task | Guard: ${effectiveMode}`;
        }

        output.system.push(contextMsg);
      } catch (error) {
        console.warn('[SDD-INJECTOR] Failed to inject context:', error);
      }
    }
  };
};

export default SddContextInjector;
