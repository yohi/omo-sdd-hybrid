import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeState, clearState, getStatePath } from '../../.opencode/lib/state-utils';
import { ensureNoBackups, deleteAllBackups, setupTestState, cleanupTestState } from '../helpers/test-harness';
import fs from 'fs';

describe('sdd_end_task', () => {
  beforeEach(() => {
    setupTestState();
    clearState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('clears state when state exists', async () => {
    ensureNoBackups();
    const state = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    };
    await writeState(state);
    
    const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
    const result = await sddEndTask.default.execute({}, {} as any);
    
    expect(result).toContain('タスク終了');
    expect(result).toContain('Task-1');
    expect(fs.existsSync(getStatePath())).toBe(false);
  });

  test('returns warning when no active task', async () => {
    ensureNoBackups();
    const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
    const result = await sddEndTask.default.execute({}, {} as any);
    
    expect(result).toContain('アクティブなタスクはありません');
  });

  test('clears corrupted state with warning', async () => {
    ensureNoBackups();
    fs.writeFileSync(getStatePath(), '{ invalid json');
    deleteAllBackups();
    
    const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
    const result = await sddEndTask.default.execute({}, {} as any);
    
    expect(result).toContain('破損');
    expect(fs.existsSync(getStatePath())).toBe(false);
  });
});

describe('sdd_show_context', () => {
  beforeEach(() => {
    setupTestState();
    clearState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('shows current task when state exists', async () => {
    ensureNoBackups();
    const state = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/auth/**', 'tests/**'],
      startedAt: '2026-01-20T00:00:00.000Z',
      startedBy: 'test',
      validationAttempts: 0
    };
    await writeState(state);
    
    const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
    const result = await sddShowContext.default.execute({}, {} as any);
    
    expect(result).toContain('Task-1');
    expect(result).toContain('Test Task');
    expect(result).toContain('src/auth/**');
  });

  test('shows message when no active task', async () => {
    ensureNoBackups();
    const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
    const result = await sddShowContext.default.execute({}, {} as any);
    
    expect(result).toContain('タスク未開始');
  });

  test('shows error for corrupted state', async () => {
    ensureNoBackups();
    fs.writeFileSync(getStatePath(), '{ invalid json');
    deleteAllBackups();
    
    const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
    const result = await sddShowContext.default.execute({}, {} as any);
    
    expect(result).toContain('破損');
  });
});
