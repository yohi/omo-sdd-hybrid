import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';

const TASKS_PATH = 'specs/tasks.md';
const STATE_PATH = '.opencode/state/current_context.json';

describe('sdd_start_task', () => {
  beforeEach(() => {
    fs.mkdirSync('specs', { recursive: true });
    fs.mkdirSync('.opencode/state', { recursive: true });
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(TASKS_PATH)) fs.unlinkSync(TASKS_PATH);
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  });

  test('starts task and creates state', async () => {
    fs.writeFileSync(TASKS_PATH, '* [ ] Task-1: Test Task (Scope: `src/**`)');
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    const result = await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
    
    expect(result).toContain('Task-1');
    expect(fs.existsSync(STATE_PATH)).toBe(true);
    
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    expect(state.activeTaskId).toBe('Task-1');
    expect(state.allowedScopes).toEqual(['src/**']);
  });

  test('throws E_TASKS_NOT_FOUND when tasks.md missing', async () => {
    if (fs.existsSync(TASKS_PATH)) fs.unlinkSync(TASKS_PATH);
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    
    await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
      .rejects.toThrow('E_TASKS_NOT_FOUND');
  });

  test('throws E_TASK_NOT_FOUND for non-existent task', async () => {
    fs.writeFileSync(TASKS_PATH, '* [ ] Task-1: Existing (Scope: `src/**`)');
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    
    await expect(sddStartTask.default.execute({ taskId: 'Task-999' }, {} as any))
      .rejects.toThrow('E_TASK_NOT_FOUND');
  });

  test('throws E_TASK_ALREADY_DONE for completed task', async () => {
    fs.writeFileSync(TASKS_PATH, '* [x] Task-1: Done (Scope: `src/**`)');
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    
    await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
      .rejects.toThrow('E_TASK_ALREADY_DONE');
  });

  test('throws E_SCOPE_MISSING when no scopes defined', async () => {
    fs.writeFileSync(TASKS_PATH, '* [ ] Task-1: No Scope (Scope: ``)');
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    
    await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
      .rejects.toThrow('E_SCOPE_MISSING');
  });

  describe('strict mode (SDD_SCOPE_FORMAT=strict)', () => {
    const originalEnv = process.env.SDD_SCOPE_FORMAT;
    
    beforeEach(() => {
      process.env.SDD_SCOPE_FORMAT = 'strict';
    });
    
    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.SDD_SCOPE_FORMAT;
      } else {
        process.env.SDD_SCOPE_FORMAT = originalEnv;
      }
    });

    test('throws E_SCOPE_FORMAT for non-backtick scope in strict mode', async () => {
      fs.writeFileSync(TASKS_PATH, '* [ ] Task-1: Test (Scope: src/**)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
        .rejects.toThrow('E_SCOPE_FORMAT');
    });

    test('includes helpful message with example in E_SCOPE_FORMAT error', async () => {
      fs.writeFileSync(TASKS_PATH, '* [ ] Task-1: Test (Scope: src/pay/**)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      try {
        await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toContain('E_SCOPE_FORMAT');
        expect((e as Error).message).toContain('Task-1');
        expect((e as Error).message).toContain('バッククォート');
      }
    });

    test('works correctly with backtick scopes in strict mode', async () => {
      fs.writeFileSync(TASKS_PATH, '* [ ] Task-1: Test (Scope: `src/**`)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      const result = await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
      
      expect(result).toContain('Task-1');
      expect(fs.existsSync(STATE_PATH)).toBe(true);
    });
  });
});
