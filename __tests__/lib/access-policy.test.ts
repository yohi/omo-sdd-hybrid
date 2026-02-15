import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStatePath, getStateDir } from '../../.opencode/lib/state-utils';
import fs from 'fs';
import path from 'path';

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
  const guardLogPath = path.join(getStateDir(), 'guard-mode.log');
  const filesToClean = [
    statePath,
    `${statePath}.bak`,
    `${statePath}.bak.1`,
    `${statePath}.bak.2`,
    guardLogPath,
    `${guardLogPath}.bak`,
    `${guardLogPath}.bak.1`,
    `${guardLogPath}.bak.2`,
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
    test('allows everything in disabled mode', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('edit', 'src/app.ts', undefined, { status: 'not_found' }, WORKTREE_ROOT, 'disabled');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('allows non-write tools', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('read', '/some/file.ts', undefined, { status: 'not_found' }, WORKTREE_ROOT);
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
    });

    test('allows ALWAYS_ALLOW paths', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('edit', 'specs/tasks.md', undefined, { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('Rule0');
    });

    test('allows .opencode/ paths', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('write', '.opencode/lib/test.ts', undefined, { status: 'not_found' }, WORKTREE_ROOT, 'warn');
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
      
      const result = evaluateAccess('edit', 'src/app.ts', undefined, { status: 'ok', state }, WORKTREE_ROOT, 'warn');
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

    test('detects destructive bash in env -i wrapper', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('bash', undefined, 'env -i rm -rf /', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('detects destructive bash in nice -n 10 wrapper', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'nice -n 10 rm -rf /', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('detects destructive bash in env -u VAR wrapper', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
      
      const result = evaluateAccess('bash', undefined, 'env -u VAR rm -rf /', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('allows implementer to edit tasks.md inside .kiro/', async () => {
      const { evaluateRoleAccess } = await import('../../.opencode/lib/access-policy');
      
      const state = { ...baseState, role: 'implementer' as const };
      
      const result = evaluateRoleAccess('edit', '.kiro/specs/foo/tasks.md', undefined, { status: 'ok', state }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(false);
      expect(result.rule).toBe('RoleAllowed');
    });

    test('denies implementer from editing design-tasks.md (must be exact match)', async () => {
      const { evaluateRoleAccess } = await import('../../.opencode/lib/access-policy');
      
      const state = { ...baseState, role: 'implementer' as const };
      
      // Use 'block' mode to ensure allowed=false
      const result = evaluateRoleAccess('edit', '.kiro/specs/foo/design-tasks.md', undefined, { status: 'ok', state }, WORKTREE_ROOT, 'block');
      expect(result.allowed).toBe(false);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('RoleDenied');
    });

    test('denies implementer from editing other files in .kiro/', async () => {
      const { evaluateRoleAccess } = await import('../../.opencode/lib/access-policy');
      
      const state = { ...baseState, role: 'implementer' as const };
      
      const result = evaluateRoleAccess('edit', '.kiro/specs/foo/requirements.md', undefined, { status: 'ok', state }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('RoleDenied');
    });


    test('does not split on command substitution separators but warns as complex', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'echo $(printf "rm -rf /; echo ok")', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
    });

    test('does not split on backtick substitution separators but warns as complex', async () => {
      const { evaluateAccess } = await import('../../.opencode/lib/access-policy');

      const result = evaluateAccess('bash', undefined, 'echo `printf "rm -rf /; echo ok"`', { status: 'not_found' }, WORKTREE_ROOT, 'warn');
      expect(result.allowed).toBe(true);
      expect(result.warned).toBe(true);
      expect(result.rule).toBe('Rule4');
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
      
      const result = evaluateMultiEdit(files, { status: 'ok', state }, WORKTREE_ROOT, 'warn');
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
      
      const result = evaluateMultiEdit(files, { status: 'ok', state }, WORKTREE_ROOT, 'warn');
      expect(result.warned).toBe(true);
    });
  });

  describe('getGuardMode', () => {
    test('returns disabled by default', async () => {
      const { getGuardMode } = await import('../../.opencode/lib/access-policy');
      
      delete process.env.SDD_GUARD_MODE;
      expect(getGuardMode()).toBe('disabled');
    });

    test('returns warn when set', async () => {
      const { getGuardMode } = await import('../../.opencode/lib/access-policy');
      
      process.env.SDD_GUARD_MODE = 'warn';
      expect(getGuardMode()).toBe('warn');
      delete process.env.SDD_GUARD_MODE;
    });

    test('returns block when set', async () => {
      const { getGuardMode } = await import('../../.opencode/lib/access-policy');
      
      process.env.SDD_GUARD_MODE = 'block';
      expect(getGuardMode()).toBe('block');
      delete process.env.SDD_GUARD_MODE;
    });
  });

  describe('determineEffectiveGuardMode', () => {
    test('default to disabled when state is missing', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
      expect(determineEffectiveGuardMode(undefined, null)).toBe('disabled');
      expect(determineEffectiveGuardMode('warn', null)).toBe('warn');
      expect(determineEffectiveGuardMode('block', null)).toBe('block');
    });

    test('returns block if env is block', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
      // Env block wins over file warn (strengthening)
      expect(determineEffectiveGuardMode('block', { mode: 'warn', updatedAt: '', updatedBy: '' })).toBe('block');
      // Env block wins over file disabled
      expect(determineEffectiveGuardMode('block', { mode: 'disabled', updatedAt: '', updatedBy: '' })).toBe('block');
    });

    test('returns block if file is block (weakening denied)', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
      // Env warn/disabled is ignored if file is block
      expect(determineEffectiveGuardMode('warn', { mode: 'block', updatedAt: '', updatedBy: '' })).toBe('block');
      expect(determineEffectiveGuardMode('disabled', { mode: 'block', updatedAt: '', updatedBy: '' })).toBe('block');
      expect(determineEffectiveGuardMode(undefined, { mode: 'block', updatedAt: '', updatedBy: '' })).toBe('block');
    });

    test('returns warn if file is warn (disabled denied)', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
      // Env disabled is ignored if file is warn
      expect(determineEffectiveGuardMode('disabled', { mode: 'warn', updatedAt: '', updatedBy: '' })).toBe('warn');
      expect(determineEffectiveGuardMode(undefined, { mode: 'warn', updatedAt: '', updatedBy: '' })).toBe('warn');
    });

    test('allows disabled if both are disabled or undefined', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
      expect(determineEffectiveGuardMode(undefined, { mode: 'disabled', updatedAt: '', updatedBy: '' })).toBe('disabled');
      expect(determineEffectiveGuardMode('disabled', { mode: 'disabled', updatedAt: '', updatedBy: '' })).toBe('disabled');
    });
  });

  describe('guard-mode audit log', () => {
    test('writes audit log on weakening denial', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');

      determineEffectiveGuardMode('warn', { mode: 'block', updatedAt: '', updatedBy: '' });

      const guardLogPath = path.join(getStateDir(), 'guard-mode.log');
      expect(fs.existsSync(guardLogPath)).toBe(true);
      const logContent = fs.readFileSync(guardLogPath, 'utf-8').trim();
      expect(logContent).toContain('DENIED_WEAKENING');
    });

    test('writes structured fail-closed entry', async () => {
      const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');

      determineEffectiveGuardMode(undefined, null);

      const guardLogPath = path.join(getStateDir(), 'guard-mode.log');
      expect(fs.existsSync(guardLogPath)).toBe(true);
      const logContent = fs.readFileSync(guardLogPath, 'utf-8').trim();
      const [firstLine] = logContent.split('\n');
      const entry = JSON.parse(firstLine);
      expect(entry.event).toBe('FAIL_CLOSED');
      expect(entry.message).toContain('Guard mode state is missing');
      expect(entry.timestamp).toBeDefined();
    });

    test('rotates audit log when size exceeds limit', async () => {
      const originalMaxBytes = process.env.SDD_GUARD_AUDIT_MAX_BYTES;
      const originalMaxBackups = process.env.SDD_GUARD_AUDIT_MAX_BACKUPS;
      process.env.SDD_GUARD_AUDIT_MAX_BYTES = '200';
      process.env.SDD_GUARD_AUDIT_MAX_BACKUPS = '2';

      try {
        const { determineEffectiveGuardMode } = await import('../../.opencode/lib/access-policy');
        for (let i = 0; i < 20; i += 1) {
          determineEffectiveGuardMode(undefined, null);
        }

        const guardLogPath = path.join(getStateDir(), 'guard-mode.log');
        const backupPath = `${guardLogPath}.bak`;
        const backupPath2 = `${guardLogPath}.bak.1`;
        const backupPath3 = `${guardLogPath}.bak.2`;

        expect(fs.existsSync(guardLogPath)).toBe(true);
        expect(fs.existsSync(backupPath)).toBe(true);
        expect(fs.existsSync(backupPath3)).toBe(false);

        if (fs.existsSync(backupPath2)) {
          expect(fs.existsSync(backupPath3)).toBe(false);
        }
      } finally {
        if (originalMaxBytes === undefined) {
          delete process.env.SDD_GUARD_AUDIT_MAX_BYTES;
        } else {
          process.env.SDD_GUARD_AUDIT_MAX_BYTES = originalMaxBytes;
        }
        if (originalMaxBackups === undefined) {
          delete process.env.SDD_GUARD_AUDIT_MAX_BACKUPS;
        } else {
          process.env.SDD_GUARD_AUDIT_MAX_BACKUPS = originalMaxBackups;
        }
      }
    });
  });
});
