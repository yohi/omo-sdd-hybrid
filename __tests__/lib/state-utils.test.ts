import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { getStateDir, getStatePath, getTasksPath, computeTasksMdHashFromContent, computeStateHash, type StateInput } from '../../.opencode/lib/state-utils';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

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

const deleteAllBackups = () => {
  const statePath = getStatePath();
  const backups = [
    `${statePath}.bak`,
    `${statePath}.bak.1`,
    `${statePath}.bak.2`,
  ];
  backups.forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
};

const createValidState = (overrides: Partial<StateInput> = {}) => {
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
  const stateHash = computeStateHash(merged);
  return { ...merged, stateHash };
};

describe('state-utils', () => {
  beforeEach(() => {
    setupTestState();
    cleanupStateFiles();
  });

  afterEach(() => {
    cleanupStateFiles();
    cleanupTestState();
  });

  describe('writeState and readState', () => {
    test('writes and reads state correctly', async () => {
      cleanupStateFiles();
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

    test('returns not_found when state file does not exist', async () => {
      cleanupStateFiles();
      const { readState } = await import('../../.opencode/lib/state-utils');
      
      const result = await readState();
      expect(result.status).toBe('not_found');
    });

    test('returns corrupted for invalid JSON', async () => {
      cleanupStateFiles();
      const { readState } = await import('../../.opencode/lib/state-utils');
      
      if (!fs.existsSync(getStateDir())) {
        fs.mkdirSync(getStateDir(), { recursive: true });
      }
      fs.writeFileSync(getStatePath(), '{ invalid json');
      deleteAllBackups();
      
      const result = await readState();
      expect(result.status).toBe('corrupted');
    });

    test('returns corrupted for missing required fields', async () => {
      cleanupStateFiles();
      const { readState } = await import('../../.opencode/lib/state-utils');
      
      if (!fs.existsSync(getStateDir())) {
        fs.mkdirSync(getStateDir(), { recursive: true });
      }
      fs.writeFileSync(getStatePath(), JSON.stringify({ version: 1 }));
      deleteAllBackups();
      
      const result = await readState();
      expect(result.status).toBe('corrupted');
    });
  });

  describe('clearState', () => {
    test('deletes state file', async () => {
      cleanupStateFiles();
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

    test('does not throw when file does not exist', async () => {
      cleanupStateFiles();
      const { clearState } = await import('../../.opencode/lib/state-utils');
      
      await expect(clearState()).resolves.toBeUndefined();
    });
  });

  describe('backup integration', () => {
    test('creates backup file after writeState', async () => {
      cleanupStateFiles();
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

    test('rotates backups on multiple writes', async () => {
      cleanupStateFiles();
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

  describe('auto recovery', () => {
    test('recovers from backup when state is corrupted', async () => {
      cleanupStateFiles();
      const { readState } = await import('../../.opencode/lib/state-utils');
      const validState = createValidState();
      
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

    test('tries older backups if primary backup is also corrupted', async () => {
      cleanupStateFiles();
      const { readState } = await import('../../.opencode/lib/state-utils');
      const validState = createValidState();
      
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

    test('returns corrupted when all backups are invalid', async () => {
      cleanupStateFiles();
      const { readState } = await import('../../.opencode/lib/state-utils');
      const validState = createValidState();
      
      if (!fs.existsSync(getStateDir())) {
        fs.mkdirSync(getStateDir(), { recursive: true });
      }
      
      const statePath = getStatePath();
      fs.writeFileSync(statePath, '{ invalid json');
      fs.writeFileSync(`${statePath}.bak`, '{ also invalid');
      deleteAllBackups();
      fs.writeFileSync(`${statePath}.bak`, '{ also invalid');
      
      const warnSpy = spyOn(console, 'warn');
      const result = await readState();
      
      expect(result.status).toBe('corrupted');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test('returns corrupted when no backups exist', async () => {
      cleanupStateFiles();
      const { readState } = await import('../../.opencode/lib/state-utils');
      
      if (!fs.existsSync(getStateDir())) {
        fs.mkdirSync(getStateDir(), { recursive: true });
      }
      
      const statePath = getStatePath();
      fs.writeFileSync(statePath, '{ invalid json');
      deleteAllBackups();
      
      const warnSpy = spyOn(console, 'warn');
      const result = await readState();
      
      expect(result.status).toBe('corrupted');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
