import { describe, test, expect, mock } from 'bun:test';
import { withTempDir } from '../helpers/temp-dir';
import path from 'path';
import fs from 'fs';

const setupEnv = (tmpDir: string) => {
  process.env.SDD_STATE_DIR = tmpDir;
  process.env.SDD_TASKS_PATH = path.join(tmpDir, 'tasks.md');
  process.env.SDD_KIRO_DIR = path.join(tmpDir, '.kiro');
  process.env.SDD_TEST_MODE = 'true';
  process.env.SDD_GUARD_MODE = 'warn';
};

describe('sdd_end_task', () => {
  test('clears state when state exists', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const mockState = {
        version: 1,
        activeTaskId: 'Task-1',
        activeTaskTitle: 'Test',
        allowedScopes: ['src/**'],
        startedAt: new Date().toISOString(),
        startedBy: 'test',
        validationAttempts: 0,
        role: 'implementer'
      };
      
      const mockReadState = mock(() => Promise.resolve({ status: 'ok', state: mockState } as any));
      const mockClearState = mock(() => Promise.resolve());

      const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
      const result = await sddEndTask.default.execute({}, { __testDeps: { readState: mockReadState, clearState: mockClearState } } as any);
      
      expect(result).toContain('タスク終了');
      expect(result).toContain('Task-1');
      expect(mockClearState).toHaveBeenCalled();
    });
  });

  test('returns warning when no active task', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const mockReadState = mock(() => Promise.resolve({ status: 'not_found' } as any));
      const mockClearState = mock(() => Promise.resolve());

      const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
      const result = await sddEndTask.default.execute({}, { __testDeps: { readState: mockReadState, clearState: mockClearState } } as any);
      
      expect(result).toContain('アクティブなタスクはありません');
      expect(mockClearState).not.toHaveBeenCalled();
    });
  });

  test('clears corrupted state with warning', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const mockReadState = mock(() => Promise.resolve({ status: 'corrupted', error: 'Invalid JSON' } as any));
      const mockClearState = mock(() => Promise.resolve());

      const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
      const result = await sddEndTask.default.execute({}, { __testDeps: { readState: mockReadState, clearState: mockClearState } } as any);
      
      expect(result).toContain('破損');
      expect(mockClearState).toHaveBeenCalled();
    });
  });
});

describe('sdd_show_context', () => {
  test('shows current task when state exists', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const mockState = {
        version: 1,
        activeTaskId: 'Task-1',
        activeTaskTitle: 'Test Task',
        allowedScopes: ['src/auth/**', 'tests/**'],
        startedAt: '2026-01-20T00:00:00.000Z',
        startedBy: 'test',
        validationAttempts: 0,
        role: 'architect'
      };
      
      const mockReadState = mock(() => Promise.resolve({ status: 'ok', state: mockState } as any));

      const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
      const result = await sddShowContext.default.execute({}, { __testDeps: { readState: mockReadState } } as any);
      
      expect(result).toContain('Task-1');
      expect(result).toContain('Test Task');
      expect(result).toContain('src/auth/**');
    });
  });

  test('shows message when no active task', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const mockReadState = mock(() => Promise.resolve({ status: 'not_found' } as any));

      const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
      const result = await sddShowContext.default.execute({}, { __testDeps: { readState: mockReadState } } as any);
      
      expect(result).toContain('タスク未開始');
    });
  });

  test('shows error for corrupted state', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const mockReadState = mock(() => Promise.resolve({ status: 'corrupted', error: 'Invalid JSON' } as any));

      const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
      const result = await sddShowContext.default.execute({}, { __testDeps: { readState: mockReadState } } as any);
      
      expect(result).toContain('破損');
    });
  });
});
