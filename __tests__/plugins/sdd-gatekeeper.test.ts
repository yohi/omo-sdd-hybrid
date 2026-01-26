import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { evaluateAccess, evaluateMultiEdit, type AccessResult } from '../../.opencode/lib/access-policy';
import { StateResult } from '../../.opencode/lib/state-utils';

const worktreeRoot = process.cwd();

describe('sdd-gatekeeper evaluateAccess', () => {
  describe('Rule 0: Always Allow specs/** and .opencode/**', () => {
    test('allows specs/tasks.md with no state', () => {
      const stateResult: StateResult = { status: 'not_found' };
      const result = evaluateAccess('edit', 'specs/tasks.md', undefined, stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('Rule0');
    });

    test('allows .opencode/plugins/test.ts with no state', () => {
      const stateResult: StateResult = { status: 'not_found' };
      const result = evaluateAccess('write', '.opencode/plugins/test.ts', undefined, stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('Rule0');
    });

    test('allows specs/tasks.md with corrupted state', () => {
      const stateResult: StateResult = { status: 'corrupted', error: 'parse error' };
      const result = evaluateAccess('edit', 'specs/tasks.md', undefined, stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('Rule0');
    });
  });

  describe('Rule 1: State Required', () => {
    test('warns when no state exists for src file', () => {
      const stateResult: StateResult = { status: 'not_found' };
      const result = evaluateAccess('edit', 'src/a.ts', undefined, stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('NO_ACTIVE_TASK');
      expect(result.rule).toBe('Rule1');
    });

    test('warns when state has empty allowedScopes', () => {
      const stateResult: StateResult = { 
        status: 'ok', 
        state: { 
          version: 1, 
          activeTaskId: 'Task-1', 
          activeTaskTitle: 'Test',
          allowedScopes: [], 
          startedAt: new Date().toISOString(),
          startedBy: 'test'
        } 
      };
      const result = evaluateAccess('edit', 'src/a.ts', undefined, stateResult, worktreeRoot);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('NO_ACTIVE_TASK');
    });
  });

  describe('Rule 2: Scope Match', () => {
    const validState: StateResult = { 
      status: 'ok', 
      state: { 
        version: 1, 
        activeTaskId: 'Task-1', 
        activeTaskTitle: 'Auth Implementation',
        allowedScopes: ['src/auth/**'], 
        startedAt: new Date().toISOString(),
        startedBy: 'test'
      } 
    };

    test('allows file within scope', () => {
      const result = evaluateAccess('edit', 'src/auth/login.ts', undefined, validState, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('warns for file outside scope', () => {
      const result = evaluateAccess('edit', 'src/pay/checkout.ts', undefined, validState, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('SCOPE_DENIED');
      expect(result.message).toContain('Task-1');
      expect(result.rule).toBe('Rule2');
    });
  });

  describe('Rule 3: Outside Worktree', () => {
    test('warns for path outside worktree', () => {
      const stateResult: StateResult = { 
        status: 'ok', 
        state: { 
          version: 1, 
          activeTaskId: 'Task-1', 
          activeTaskTitle: 'Test',
          allowedScopes: ['**'], 
          startedAt: new Date().toISOString(),
          startedBy: 'test'
        } 
      };
      const result = evaluateAccess('edit', '../secrets.txt', undefined, stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('OUTSIDE_WORKTREE');
      expect(result.rule).toBe('Rule3');
    });
  });

  describe('Rule 4: Destructive Bash', () => {
    test('warns for rm command', () => {
      const stateResult: StateResult = { status: 'ok', state: { version: 1, activeTaskId: 'Task-1', activeTaskTitle: 'Test', allowedScopes: ['**'], startedAt: '', startedBy: '' } };
      const result = evaluateAccess('bash', undefined, 'rm -rf /tmp', stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('破壊的コマンド');
      expect(result.rule).toBe('Rule4');
    });

    test('warns for git push', () => {
      const stateResult: StateResult = { status: 'ok', state: { version: 1, activeTaskId: 'Task-1', activeTaskTitle: 'Test', allowedScopes: ['**'], startedAt: '', startedBy: '' } };
      const result = evaluateAccess('bash', undefined, 'git push origin main', stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('allows safe bash commands', () => {
      const stateResult: StateResult = { status: 'ok', state: { version: 1, activeTaskId: 'Task-1', activeTaskTitle: 'Test', allowedScopes: ['**'], startedAt: '', startedBy: '' } };
      const result = evaluateAccess('bash', undefined, 'ls -la', stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });
  });

  describe('State Corrupted', () => {
    test('warns for corrupted state on non-spec file', () => {
      const stateResult: StateResult = { status: 'corrupted', error: 'JSON parse error' };
      const result = evaluateAccess('edit', 'src/a.ts', undefined, stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.message).toContain('STATE_CORRUPTED');
      expect(result.rule).toBe('StateCorrupted');
    });
  });

  describe('Non-write tools', () => {
    test('allows read tool without state', () => {
      const stateResult: StateResult = { status: 'not_found' };
      const result = evaluateAccess('read', 'src/a.ts', undefined, stateResult, worktreeRoot);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });
  });
});

describe('sdd-gatekeeper evaluateMultiEdit', () => {
  test('warns for mixed scope files', () => {
    const stateResult: StateResult = { 
      status: 'ok', 
      state: { 
        version: 1, 
        activeTaskId: 'Task-1', 
        activeTaskTitle: 'Auth',
        allowedScopes: ['src/auth/**'], 
        startedAt: new Date().toISOString(),
        startedBy: 'test'
      } 
    };
    const files = [
      { filePath: 'src/auth/x.ts' },
      { filePath: 'src/pay/y.ts' }
    ];
    const result = evaluateMultiEdit(files, stateResult, worktreeRoot);
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('1/2');
    expect(result.message).toContain('SCOPE_DENIED');
  });

  test('allows all files within scope', () => {
    const stateResult: StateResult = { 
      status: 'ok', 
      state: { 
        version: 1, 
        activeTaskId: 'Task-1', 
        activeTaskTitle: 'Auth',
        allowedScopes: ['src/auth/**'], 
        startedAt: new Date().toISOString(),
        startedBy: 'test'
      } 
    };
    const files = [
      { filePath: 'src/auth/x.ts' },
      { filePath: 'src/auth/y.ts' }
    ];
    const result = evaluateMultiEdit(files, stateResult, worktreeRoot);
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
  });

  test('handles invalid files argument gracefully', () => {
    const stateResult: StateResult = { 
      status: 'ok', 
      state: { 
        version: 1, 
        activeTaskId: 'Task-1', 
        activeTaskTitle: 'Test',
        allowedScopes: ['**'], 
        startedAt: new Date().toISOString(),
        startedBy: 'test'
      } 
    };
    // @ts-ignore - Testing runtime validation
    const result = evaluateMultiEdit("not-an-array", stateResult, worktreeRoot);
    expect(result.allowed).toBe(false);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('INVALID_ARGUMENTS');
  });
});
