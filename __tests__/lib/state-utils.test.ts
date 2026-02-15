import { describe, test, expect, spyOn } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { getStateDir, getStatePath, getTasksPath, computeTasksMdHashFromContent, computeStateHash, type StateInput } from '../../.opencode/lib/state-utils';
import { withTempDir } from '../helpers/temp-dir';

const getAuditLogPath = () => path.join(getStateDir(), 'state-audit.log');

const createValidState = async (overrides: Partial<StateInput> = {}) => {
  const tasksPath = getTasksPath();
  const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
  const tasksMdHash = computeTasksMdHashFromContent(tasksContent);
  const base = {
    version: 1,
    activeTaskId: 'Task-Backup',
    activeTaskTitle: 'Backup Task',
    allowedScopes: ['src/**'],
    startedAt: new Date().toISOString(),
    startedBy: 'test',
    validationAttempts: 0,
    role: null,
    tasksMdHash,
  };
  const merged = { ...base, ...overrides, tasksMdHash };
  const stateHash = await computeStateHash(merged);
  return { ...merged, stateHash };
};

const setupEnv = (tmpDir: string) => {
  process.env.SDD_STATE_DIR = tmpDir;
  process.env.SDD_TASKS_PATH = path.join(tmpDir, 'tasks.md');
  process.env.SDD_KIRO_DIR = path.join(tmpDir, '.kiro');
  process.env.SDD_TEST_MODE = 'true';
  process.env.SDD_GUARD_MODE = 'warn';
  fs.writeFileSync(process.env.SDD_TASKS_PATH, '* [ ] Task-1: Test Task (Scope: `src/**`)', 'utf-8');
};

describe('state-utils', () => {
  describe('writeState and readState', () => {
    test('writes and reads state correctly', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { writeState, readState } = await import('../../.opencode/lib/state-utils');
        
        const state = {
          version: 1,
          activeTaskId: 'Task-1',
          activeTaskTitle: 'Test Task',
          allowedScopes: ['src/auth/**'],
          startedAt: new Date().toISOString(),
          startedBy: 'test',
          validationAttempts: 0, role: null
        };
        
        await writeState(state);
        
        const result = await readState();
        expect(result.status).toBe('ok');
        if (result.status === 'ok') {
          expect(result.state.activeTaskId).toBe('Task-1');
          expect(result.state.allowedScopes).toEqual(['src/auth/**']);
        }
      });
    });

    test('returns not_found when state file does not exist', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState } = await import('../../.opencode/lib/state-utils');
        
        const result = await readState();
        expect(result.status).toBe('not_found');
      });
    });

    test('returns corrupted for invalid JSON', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState } = await import('../../.opencode/lib/state-utils');
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        fs.writeFileSync(getStatePath(), '{ invalid json');
        
        const result = await readState();
        expect(result.status).toBe('corrupted');
      });
    });

    test('returns corrupted for missing required fields', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState } = await import('../../.opencode/lib/state-utils');
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        fs.writeFileSync(getStatePath(), JSON.stringify({ version: 1 }));
        
        const result = await readState();
        expect(result.status).toBe('corrupted');
      });
    });

    test('migrates legacy state (missing hashes) on read', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState, getStateDir, getStatePath } = await import('../../.opencode/lib/state-utils');
        
        const legacyState = {
          version: 1,
          activeTaskId: 'Task-Legacy',
          activeTaskTitle: 'Legacy Task',
          allowedScopes: ['src/**'],
          startedAt: new Date().toISOString(),
          startedBy: 'test',
          validationAttempts: 0,
          role: null
        };
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        fs.writeFileSync(getStatePath(), JSON.stringify(legacyState));
        
        const result = await readState();
        expect(result.status).toBe('ok');
        if (result.status === 'ok') {
          expect(result.state.activeTaskId).toBe('Task-Legacy');
          expect(result.state.tasksMdHash).toBeDefined();
          expect(result.state.stateHash).toBeDefined();
        }
      });
    });
  });

  describe('clearState', () => {
    test('deletes state file', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { writeState, clearState, readState } = await import('../../.opencode/lib/state-utils');
        
        const state = {
          version: 1,
          activeTaskId: 'Task-1',
          activeTaskTitle: 'Test',
          allowedScopes: ['src/**'],
          startedAt: new Date().toISOString(),
          startedBy: 'test',
          validationAttempts: 0, role: null
        };
        
        await writeState(state);
        expect(fs.existsSync(getStatePath())).toBe(true);
        
        await clearState();
        expect(fs.existsSync(getStatePath())).toBe(false);
        
        const result = await readState();
        expect(result.status).toBe('not_found');
      });
    });

    test('does not throw when file does not exist', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { clearState } = await import('../../.opencode/lib/state-utils');
        
        await expect(clearState()).resolves.toBeUndefined();
      });
    });
  });

  describe('backup integration', () => {
    test('creates backup file after writeState', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { writeState } = await import('../../.opencode/lib/state-utils');
        
        const state1 = {
          version: 1,
          activeTaskId: 'Task-1',
          activeTaskTitle: 'First Task',
          allowedScopes: ['src/**'],
          startedAt: new Date().toISOString(),
          startedBy: 'test',
          validationAttempts: 0, role: null
        };
        
        await writeState(state1);
        
        const state2 = {
          ...state1,
          activeTaskId: 'Task-2',
          activeTaskTitle: 'Second Task',
        };
        
        await writeState(state2);
        
        const statePath = getStatePath();
        expect(fs.existsSync(`${statePath}.bak`)).toBe(true);
        const backup = JSON.parse(fs.readFileSync(`${statePath}.bak`, 'utf-8'));
        expect(backup.activeTaskId).toBe('Task-1');
      });
    });

    test('rotates backups on multiple writes', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { writeState } = await import('../../.opencode/lib/state-utils');
        
        const createState = (id: string) => ({
          version: 1,
          activeTaskId: id,
          activeTaskTitle: `Task ${id}`,
          allowedScopes: ['src/**'],
          startedAt: new Date().toISOString(),
          startedBy: 'test',
          validationAttempts: 0, role: null
        });
        
        await writeState(createState('v1'));
        await writeState(createState('v2'));
        await writeState(createState('v3'));
        await writeState(createState('v4'));
        
        const statePath = getStatePath();
        expect(fs.existsSync(`${statePath}.bak`)).toBe(true);
        expect(fs.existsSync(`${statePath}.bak.1`)).toBe(true);
        expect(fs.existsSync(`${statePath}.bak.2`)).toBe(true);
        
        const bak = JSON.parse(fs.readFileSync(`${statePath}.bak`, 'utf-8'));
        const bak1 = JSON.parse(fs.readFileSync(`${statePath}.bak.1`, 'utf-8'));
        const bak2 = JSON.parse(fs.readFileSync(`${statePath}.bak.2`, 'utf-8'));
        
        expect(bak.activeTaskId).toBe('v3');
        expect(bak1.activeTaskId).toBe('v2');
        expect(bak2.activeTaskId).toBe('v1');
      });
    });
  });

  describe('auto recovery', () => {
    test('recovers from backup when state is corrupted', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState } = await import('../../.opencode/lib/state-utils');
        const validState = await createValidState();
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        
        const statePath = getStatePath();
        fs.writeFileSync(`${statePath}.bak`, JSON.stringify(validState));
        fs.writeFileSync(statePath, '{ invalid json');
        
        const warnSpy = spyOn(console, 'warn');
        const result = await readState();
        
        expect(result.status).toBe('recovered');
        if (result.status === 'recovered') {
          expect(result.state.activeTaskId).toBe('Task-Backup');
          expect(result.fromBackup).toContain('.bak');
        }
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    test('tries older backups if primary backup is also corrupted', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState } = await import('../../.opencode/lib/state-utils');
        const validState = await createValidState();
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        
        const statePath = getStatePath();
        fs.writeFileSync(statePath, '{ invalid json');
        fs.writeFileSync(`${statePath}.bak`, '{ also invalid');
        fs.writeFileSync(`${statePath}.bak.1`, JSON.stringify(validState));
        
        const warnSpy = spyOn(console, 'warn');
        const result = await readState();
        
        expect(result.status).toBe('recovered');
        if (result.status === 'recovered') {
          expect(result.state.activeTaskId).toBe('Task-Backup');
          expect(result.fromBackup).toContain('.bak.1');
        }
        warnSpy.mockRestore();
      });
    });

    test('returns corrupted when all backups are invalid', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState } = await import('../../.opencode/lib/state-utils');
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        
        const statePath = getStatePath();
        fs.writeFileSync(statePath, '{ invalid json');
        fs.writeFileSync(`${statePath}.bak`, '{ also invalid');
        fs.writeFileSync(`${statePath}.bak.1`, '{ older invalid');
        fs.writeFileSync(`${statePath}.bak.2`, '{ oldest invalid');
        
        const warnSpy = spyOn(console, 'warn');
        const result = await readState();
        
        expect(result.status).toBe('corrupted');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    test('returns corrupted when no backups exist', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState } = await import('../../.opencode/lib/state-utils');
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        
        const statePath = getStatePath();
        fs.writeFileSync(statePath, '{ invalid json');
        
        const warnSpy = spyOn(console, 'warn');
        const result = await readState();
        
        expect(result.status).toBe('corrupted');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });
  });

  describe('audit logging', () => {
    test('logs parse errors to audit log', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState, getStateDir } = await import('../../.opencode/lib/state-utils');
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        
        // Create corrupted state file
        const statePath = getStatePath();
        fs.writeFileSync(statePath, '{ invalid json');
        
        await readState();
        
        const auditLogPath = getAuditLogPath();
        expect(fs.existsSync(auditLogPath)).toBe(true);
        
        const logContent = fs.readFileSync(auditLogPath, 'utf-8');
        expect(logContent).toContain('STATE_CORRUPTED_PARSE');
        expect(logContent).toMatch(/parse|error|unexpected/i);
      });
    });

    test('logs backup parse errors to audit log', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        const { readState, getStateDir } = await import('../../.opencode/lib/state-utils');
        
        if (!fs.existsSync(getStateDir())) {
          fs.mkdirSync(getStateDir(), { recursive: true });
        }
        
        const statePath = getStatePath();
        fs.writeFileSync(statePath, '{ invalid json');
        // Invalid backup
        fs.writeFileSync(`${statePath}.bak`, '{ invalid backup json');
        
        await readState();
        
        const auditLogPath = getAuditLogPath();
        expect(fs.existsSync(auditLogPath)).toBe(true);
        
        const logContent = fs.readFileSync(auditLogPath, 'utf-8');
        expect(logContent).toContain('STATE_CORRUPTED_PARSE');
        expect(logContent).toContain('STATE_CORRUPTED_PARSE_BACKUP');
        expect(logContent).toContain('current_context.json.bak');
      });
    });
  });
});
