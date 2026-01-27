import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStatePath } from '../../.opencode/lib/state-utils';
import fs from 'fs';

describe('sdd_start_task', () => {
  let tasksPath: string;

  beforeEach(() => {
    setupTestState();
    tasksPath = process.env.SDD_TASKS_PATH!;
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('starts task and creates state', async () => {
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Test Task (Scope: `src/**`)');
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    const result = await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
    
    expect(result).toContain('Task-1');
    expect(fs.existsSync(getStatePath())).toBe(true);
    
    const state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
    expect(state.activeTaskId).toBe('Task-1');
    expect(state.allowedScopes).toEqual(['src/**']);
  });

  test('throws E_TASKS_NOT_FOUND when tasks.md missing', async () => {
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    
    await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
      .rejects.toThrow('E_TASKS_NOT_FOUND');
  });

  test('throws E_TASK_NOT_FOUND for non-existent task', async () => {
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Existing (Scope: `src/**`)');
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    
    await expect(sddStartTask.default.execute({ taskId: 'Task-999' }, {} as any))
      .rejects.toThrow('E_TASK_NOT_FOUND');
  });

  test('throws E_TASK_ALREADY_DONE for completed task', async () => {
    fs.writeFileSync(tasksPath, '* [x] Task-1: Done (Scope: `src/**`)');
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    
    await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
      .rejects.toThrow('E_TASK_ALREADY_DONE');
  });

  test('throws E_SCOPE_MISSING when no scopes defined', async () => {
    fs.writeFileSync(tasksPath, '* [ ] Task-1: No Scope (Scope: ``)');
    
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    
    await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
      .rejects.toThrow('E_SCOPE_MISSING');
  });

  test('assigns implementer role by default', async () => {
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
    const state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
    expect(state.role).toBe('implementer');
  });

  test('assigns architect role for KIRO tasks', async () => {
    fs.writeFileSync(tasksPath, '* [ ] KIRO-123: Kiro Task (Scope: `src/**`)');
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    await sddStartTask.default.execute({ taskId: 'KIRO-123' }, {} as any);
    const state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
    expect(state.role).toBe('architect');
  });

  test('assigns explicitly provided role', async () => {
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    await sddStartTask.default.execute({ taskId: 'Task-1', role: 'architect' }, {} as any);
    const state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
    expect(state.role).toBe('architect');
  });

  test('throws for invalid role', async () => {
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');
    const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
    await expect(sddStartTask.default.execute({ taskId: 'Task-1', role: 'invalid' as any }, {} as any))
      .rejects.toThrow('E_INVALID_ROLE');
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
      fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: src/**)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
        .rejects.toThrow('E_SCOPE_FORMAT');
    });

    test('includes helpful message with example in E_SCOPE_FORMAT error', async () => {
      fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: src/pay/**)');
      
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
      fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      const result = await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
      
      expect(result).toContain('Task-1');
      expect(fs.existsSync(getStatePath())).toBe(true);
    });
  });
});
