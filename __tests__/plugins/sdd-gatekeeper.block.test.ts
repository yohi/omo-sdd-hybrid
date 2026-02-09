import { describe, test, expect } from 'bun:test';
import { evaluateAccess, type AccessResult } from '../../.opencode/lib/access-policy';
import { StateResult } from '../../.opencode/lib/state-utils';

const worktreeRoot = process.cwd();
const baseState = {
  version: 1,
  activeTaskId: 'Task-1',
  activeTaskTitle: 'Test',
  allowedScopes: ['**'],
  startedAt: '',
  startedBy: '',
  validationAttempts: 0,
  role: null,
  tasksMdHash: 'test-hash',
  stateHash: 'state-hash',
};

describe('sdd-gatekeeper block mode', () => {
  
  describe('Rule 1: NO_ACTIVE_TASK in block mode', () => {
    test('blocks when no state exists for src file', () => {
      const stateResult: StateResult = { status: 'not_found' };
      const result = evaluateAccess('edit', 'src/a.ts', undefined, stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('NO_ACTIVE_TASK');
      expect(result.rule).toBe('Rule1');
    });

    test('blocks when state has empty allowedScopes', () => {
      const stateResult: StateResult = { 
        status: 'ok', 
        state: { 
          ...baseState,
          activeTaskTitle: 'Test',
          allowedScopes: [], 
          startedAt: new Date().toISOString(),
          startedBy: 'test'
        } 
      };
      const result = evaluateAccess('edit', 'src/a.ts', undefined, stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('NO_ACTIVE_TASK');
    });
  });

  describe('Rule 2: SCOPE_DENIED in block mode', () => {
    const validState: StateResult = { 
      status: 'ok', 
      state: { 
        ...baseState,
        activeTaskTitle: 'Auth Implementation',
        allowedScopes: ['src/auth/**'], 
        startedAt: new Date().toISOString(),
        startedBy: 'test'
      } 
    };

    test('blocks file outside scope', () => {
      const result = evaluateAccess('edit', 'src/pay/checkout.ts', undefined, validState, worktreeRoot, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('SCOPE_DENIED');
      expect(result.message).toContain('Task-1');
      expect(result.rule).toBe('Rule2');
    });

    test('allows file within scope even in block mode', () => {
      const result = evaluateAccess('edit', 'src/auth/login.ts', undefined, validState, worktreeRoot, 'block');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });
  });

  describe('Rule 3: OUTSIDE_WORKTREE in block mode', () => {
    test('blocks path outside worktree', () => {
      const stateResult: StateResult = { 
        status: 'ok', 
        state: { 
          ...baseState,
          activeTaskTitle: 'Test',
          allowedScopes: ['**'], 
          startedAt: new Date().toISOString(),
          startedBy: 'test'
        } 
      };
      const result = evaluateAccess('edit', '../secrets.txt', undefined, stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('OUTSIDE_WORKTREE');
      expect(result.rule).toBe('Rule3');
    });
  });

  describe('Rule 4: Destructive Bash in block mode', () => {
    const stateResult: StateResult = { 
      status: 'ok', 
      state: { 
        ...baseState,
        activeTaskTitle: 'Test', 
        allowedScopes: ['**'], 
        startedAt: '', 
        startedBy: '' 
      } 
    };

    test('blocks rm command', () => {
      const result = evaluateAccess('bash', undefined, 'rm -rf /tmp', stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('破壊的コマンド');
      expect(result.rule).toBe('Rule4');
    });

    test('blocks git push', () => {
      const result = evaluateAccess('bash', undefined, 'git push origin main', stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('allows safe bash commands in block mode', () => {
      const result = evaluateAccess('bash', undefined, 'ls -la', stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });
  });

  describe('StateCorrupted in block mode', () => {
    test('blocks for corrupted state on non-spec file', () => {
      const stateResult: StateResult = { status: 'corrupted', error: 'JSON parse error' };
      const result = evaluateAccess('edit', 'src/a.ts', undefined, stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('STATE_CORRUPTED');
      expect(result.rule).toBe('StateCorrupted');
    });
  });

  describe('Default mode (disabled)', () => {
    test('allows without warning when no mode specified (defaults to disabled)', () => {
      const savedMode = process.env.SDD_GUARD_MODE;
      try {
        delete process.env.SDD_GUARD_MODE;
        const stateResult: StateResult = { status: 'not_found' };
        const result = evaluateAccess('edit', 'src/a.ts', undefined, stateResult, worktreeRoot);
        expect(result.allowed).toBe(true);
        expect(result.warned).toBe(false);
      } finally {
        if (savedMode !== undefined) {
          process.env.SDD_GUARD_MODE = savedMode;
        } else {
          delete process.env.SDD_GUARD_MODE;
        }
      }
    });

    test('allows with warning when mode is explicitly warn', () => {
      const savedMode = process.env.SDD_GUARD_MODE;
      try {
        delete process.env.SDD_GUARD_MODE;
        const stateResult: StateResult = { status: 'not_found' };
        const result = evaluateAccess('edit', 'src/a.ts', undefined, stateResult, worktreeRoot, 'warn');
        expect(result.allowed).toBe(true);
        expect(result.warned).toBe(true);
        expect(result.message).toContain('NO_ACTIVE_TASK');
      } finally {
        if (savedMode !== undefined) {
          process.env.SDD_GUARD_MODE = savedMode;
        } else {
          delete process.env.SDD_GUARD_MODE;
        }
      }
    });
  });

  describe('Rule 0: Always Allow specs/** and .opencode/** (even in block mode)', () => {
    test('allows specs/tasks.md even in block mode with no state', () => {
      const stateResult: StateResult = { status: 'not_found' };
      const result = evaluateAccess('edit', 'specs/tasks.md', undefined, stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('Rule0');
    });

    test('allows .opencode/ even in block mode with corrupted state', () => {
      const stateResult: StateResult = { status: 'corrupted', error: 'parse error' };
      const result = evaluateAccess('write', '.opencode/plugins/test.ts', undefined, stateResult, worktreeRoot, 'block');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('Rule0');
    });
  });
});
