import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';

const STATE_DIR = '.opencode/state';
const STATE_PATH = `${STATE_DIR}/current_context.json`;

describe('sdd_end_task', () => {
  beforeEach(() => {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  });

  test('clears state when state exists', async () => {
    const state = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test'
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state));
    
    const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
    const result = await sddEndTask.default.execute({}, {} as any);
    
    expect(result).toContain('タスク終了');
    expect(result).toContain('Task-1');
    expect(fs.existsSync(STATE_PATH)).toBe(false);
  });

  test('returns warning when no active task', async () => {
    const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
    const result = await sddEndTask.default.execute({}, {} as any);
    
    expect(result).toContain('アクティブなタスクはありません');
  });

  test('clears corrupted state with warning', async () => {
    fs.writeFileSync(STATE_PATH, '{ invalid json');
    
    const sddEndTask = await import('../../.opencode/tools/sdd_end_task');
    const result = await sddEndTask.default.execute({}, {} as any);
    
    expect(result).toContain('破損');
    expect(fs.existsSync(STATE_PATH)).toBe(false);
  });
});

describe('sdd_show_context', () => {
  beforeEach(() => {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  });

  test('shows current task when state exists', async () => {
    const state = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/auth/**', 'tests/**'],
      startedAt: '2026-01-20T00:00:00.000Z',
      startedBy: 'test'
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state));
    
    const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
    const result = await sddShowContext.default.execute({}, {} as any);
    
    expect(result).toContain('Task-1');
    expect(result).toContain('Test Task');
    expect(result).toContain('src/auth/**');
  });

  test('shows message when no active task', async () => {
    const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
    const result = await sddShowContext.default.execute({}, {} as any);
    
    expect(result).toContain('タスク未開始');
  });

  test('shows error for corrupted state', async () => {
    fs.writeFileSync(STATE_PATH, '{ invalid json');
    
    const sddShowContext = await import('../../.opencode/tools/sdd_show_context');
    const result = await sddShowContext.default.execute({}, {} as any);
    
    expect(result).toContain('破損');
  });
});
