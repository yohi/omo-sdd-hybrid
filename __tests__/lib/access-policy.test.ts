import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStatePath } from '../../.opencode/lib/state-utils';
import fs from 'fs';

const WORKTREE_ROOT = process.cwd();
const baseState = {
  version: 1,
  activeTaskId: 'Task-1',
  activeTaskTitle: 'Test',
  allowedScopes: ['src/**'],
  startedAt: new Date().toISOString(),
  startedBy: 'test',
  validationAttempts: 0,
  role: null,
  tasksMdHash: 'test-hash',
  stateHash: 'state-hash',
};

const cleanupStateFiles = () => {
  const statePath = getStatePath();
  const filesToClean = [
    statePath,
    `${statePath}.bak`,
    `${statePath}.bak.1`,
    `${statePath}.bak.2`,
  ];
  filesToClean.forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
};

describe('access-policy', () => {
  beforeEach(() => {
    setupTestState();
    cleanupStateFiles();
  });

  afterEach(() => {
    cleanupStateFiles();
    cleanupTestState();
  });

  describe('evaluateAccess', () => {
    test('allows non-write tools', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('read', '/some/file.ts', undefined, { status: 'not_found' }, WORKTREE_ROOT);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('allows ALWAYS_ALLOW paths', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('edit', 'specs/tasks.md', undefined, { status: 'not_found' }, WORKTREE_ROOT);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('Rule0');
    });

    test('allows .opencode/ paths', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('write', '.opencode/lib/test.ts', undefined, { status: 'not_found' }, WORKTREE_ROOT);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('Rule0');
    });

    test('warns when no active task in warn mode', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('edit', 'src/app.ts', undefined, { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule1');
    });

    test('blocks when no active task in block mode', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('edit', 'src/app.ts', undefined, { status: 'not_found' }, WORKTREE_ROOT, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule1');
    });

    test('blocks when state is corrupted even in warn mode', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('edit', 'src/app.ts', undefined, { status: 'corrupted', error: 'STATE_HASH_MISMATCH' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('StateCorrupted');
    });

    test('allows file within allowed scope', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const state = { ...baseState };
      
      const result = evaluateAccess('edit', 'src/app.ts', undefined, { status: 'ok', state }, WORKTREE_ROOT);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('denies file outside allowed scope', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const state = { ...baseState };
      
      const result = evaluateAccess('edit', 'tests/app.test.ts', undefined, { status: 'ok', state }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule2');
    });

    test('detects destructive bash commands', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('bash', undefined, 'rm -rf /', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('does not detect quoted destructive strings', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'echo "rm -rf"', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('detects destructive bash in compound commands', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'ls && rm -rf /', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('detects git clean -fdx', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'git clean -fdx', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('detects git reset --hard', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'git reset --hard', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('does not split on command substitution separators', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'echo $(printf "rm -rf /; echo ok")', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('does not split on backtick substitution separators', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'echo `printf "rm -rf /; echo ok"`', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('does not split on subshell separators', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, '(rm -rf /; echo ok)', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('does not split on brace expansion separators', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'echo {rm;-rf}', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });
  });

  describe('evaluateMultiEdit', () => {
    test('allows when all files are in scope', async () => {
      const { evaluateMultiEdit } = await import('../../.opencode/lib/access-policy');
      
      const state = { ...baseState };
      
      const files = [
        { filePath: 'src/a.ts' },
        { filePath: 'src/b.ts' },
      ];
      
      const result = evaluateMultiEdit(files, { status: 'ok', state }, WORKTREE_ROOT);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('warns when some files are out of scope', async () => {
      const { evaluateMultiEdit } = await import('../../.opencode/lib/access-policy');
      
      const state = { ...baseState };
      
      const files = [
        { filePath: 'src/a.ts' },
        { filePath: 'tests/b.test.ts' },
      ];
      
      const result = evaluateMultiEdit(files, { status: 'ok', state }, WORKTREE_ROOT);
      expect(result.warned).toBe(true);
    });
  });

  describe('getGuardMode', () => {
    test('returns warn by default', async () => {
      const { getGuardMode } = await import('../../.opencode/lib/access-policy');
      
      delete process.env.SDD_GUARD_MODE;
      expect(getGuardMode()).toBe('warn');
    });

    test('returns block when set', async () => {
      const { getGuardMode } = await import('../../.opencode/lib/access-policy');
      
      process.env.SDD_GUARD_MODE = 'block';
      expect(getGuardMode()).toBe('block');
      delete process.env.SDD_GUARD_MODE;
    });
  });

  describe('determineEffectiveGuardMode', () => {
    test('fail-closed (block) when state is missing', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
      expect(determineEffectiveGuardMode(undefined, null)).toBe('block');
      expect(determineEffectiveGuardMode('warn', null)).toBe('block');
    });

    test('returns block if env is block', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
      expect(determineEffectiveGuardMode('block', null)).toBe('block');
      // Env block wins over file warn (strengthening)
      expect(determineEffectiveGuardMode('block', { mode: 'warn', updatedAt: '', updatedBy: '' })).toBe('block');
    });

    test('returns block if file is block (weakening denied)', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
      // Env warn is ignored if file is block
      expect(determineEffectiveGuardMode('warn', { mode: 'block', updatedAt: '', updatedBy: '' })).toBe('block');
      expect(determineEffectiveGuardMode(undefined, { mode: 'block', updatedAt: '', updatedBy: '' })).toBe('block');
    });
  });
});
