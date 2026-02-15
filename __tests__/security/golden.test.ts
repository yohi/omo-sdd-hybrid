import { describe, it, expect } from 'bun:test';
import { evaluateAccess, type GuardMode } from '../../.opencode/lib/access-policy';
import { type StateResult } from '../../.opencode/lib/state-utils';
import dataset from '../fixtures/security-golden-dataset.json';

describe('Security Golden Test', () => {
  const worktreeRoot = process.cwd();
  
  // mock stateResult for bash tests (not used in Rule4 check usually, but required by API)
  const mockStateResult: StateResult = {
    status: 'ok',
    state: {
      activeTaskId: 'task-1',
      allowedScopes: ['src/**'],
      role: 'implementer',
      startedAt: new Date().toISOString()
    }
  };

  dataset.cases.forEach((testCase) => {
    it(`Case [${testCase.id}]: ${testCase.command || testCase.toolName}`, () => {
      // Always test in 'block' mode for golden verification
      const mode: GuardMode = 'block';
      
      const result = evaluateAccess(
        testCase.toolName,
        undefined, // filePath
        testCase.command,
        mockStateResult,
        worktreeRoot,
        mode
      );

      expect(result.allowed).toBe(testCase.expected.allowed);
      expect(result.warned).toBe(testCase.expected.warned);
      if (testCase.expected.rule) {
        expect(result.rule).toBe(testCase.expected.rule as any);
      }
    });
  });
});
