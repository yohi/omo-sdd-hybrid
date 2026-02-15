import { describe, test, expect } from 'bun:test';
import { withTempDir } from '../helpers/temp-dir';
import { getStatePath } from '../../.opencode/lib/state-utils';
import fs from 'fs';
import path from 'path';

const setupEnv = (tmpDir: string) => {
  process.env.SDD_STATE_DIR = tmpDir;
  process.env.SDD_TASKS_PATH = path.join(tmpDir, 'tasks.md');
  process.env.SDD_KIRO_DIR = path.join(tmpDir, '.kiro');
  process.env.SDD_TEST_MODE = 'true';
  process.env.SDD_GUARD_MODE = 'warn';
  // Note: SDD_SCOPE_FORMAT might be needed in some tests, handle it locally
};

describe('sdd_start_task', () => {
  test('starts task and creates state', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      fs.writeFileSync(tasksPath, '* [ ] Task-1: Test Task (Scope: `src/**`)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      const result = await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
      
      expect(result).toContain('Task-1');
      expect(fs.existsSync(getStatePath())).toBe(true);
      
      const state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(state.activeTaskId).toBe('Task-1');
      expect(state.allowedScopes).toEqual(['src/**']);
    });
  });

  test('throws E_TASKS_NOT_FOUND when tasks.md missing', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      if (fs.existsSync(tasksPath)) {
        fs.unlinkSync(tasksPath);
      }
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
        .rejects.toThrow('E_TASKS_NOT_FOUND');
    });
  });

  test('throws E_TASK_NOT_FOUND for non-existent task', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      fs.writeFileSync(tasksPath, '* [ ] Task-1: Existing (Scope: `src/**`)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      await expect(sddStartTask.default.execute({ taskId: 'Task-999' }, {} as any))
        .rejects.toThrow('E_TASK_NOT_FOUND');
    });
  });

  test('throws E_TASK_ALREADY_DONE for completed task', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      fs.writeFileSync(tasksPath, '* [x] Task-1: Done (Scope: `src/**`)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
        .rejects.toThrow('E_TASK_ALREADY_DONE');
    });
  });

  test('throws E_SCOPE_MISSING when no scopes defined', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      fs.writeFileSync(tasksPath, '* [ ] Task-1: No Scope (Scope: ``)');
      
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
        .rejects.toThrow('E_SCOPE_MISSING');
    });
  });

  test('assigns architect role by default (safe mode)', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
      const state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(state.role).toBe('architect');
    });
  });

  test('assigns architect role for KIRO tasks', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      fs.writeFileSync(tasksPath, '* [ ] KIRO-123: Kiro Task (Scope: `src/**`)');
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      await sddStartTask.default.execute({ taskId: 'KIRO-123' }, {} as any);
      const state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(state.role).toBe('architect');
    });
  });

  test('assigns explicitly provided role (case-insensitive)', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      await sddStartTask.default.execute({ taskId: 'Task-1', role: 'ARCHITECT' as any }, {} as any);
      let state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(state.role).toBe('architect');
      
      fs.unlinkSync(getStatePath());

      await sddStartTask.default.execute({ taskId: 'Task-1', role: 'Architect' as any }, {} as any);
      state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(state.role).toBe('architect');

      fs.unlinkSync(getStatePath());

      await sddStartTask.default.execute({ taskId: 'Task-1', role: '  implementer  ' as any }, {} as any);
      state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(state.role).toBe('implementer');

      fs.unlinkSync(getStatePath());

      await sddStartTask.default.execute({ taskId: 'Task-1', role: 'IMPLEMENTER' as any }, {} as any);
      state = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(state.role).toBe('implementer');
    });
  });

  test('throws E_TASKS_NOT_FOUND with helpful message when tasks.md missing', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      if (fs.existsSync(tasksPath)) {
        fs.unlinkSync(tasksPath);
      }
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      
      try {
        await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
        expect(true).toBe(false);
      } catch (e) {
        expect((e as Error).message).toContain('E_TASKS_NOT_FOUND');
        expect((e as Error).message).toContain('sdd_kiro init');
      }
    });
  });

  test('throws for invalid role', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const tasksPath = process.env.SDD_TASKS_PATH!;
      fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');
      const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
      await expect(sddStartTask.default.execute({ taskId: 'Task-1', role: 'invalid' as any }, {} as any))
        .rejects.toThrow('E_INVALID_ROLE');
    });
  });

  describe('strict mode (SDD_SCOPE_FORMAT=strict)', () => {
    test('throws E_SCOPE_FORMAT for non-backtick scope in strict mode', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        process.env.SDD_SCOPE_FORMAT = 'strict';
        const tasksPath = process.env.SDD_TASKS_PATH!;
        fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: src/**)');
        
        const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
        
        try {
          await expect(sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any))
            .rejects.toThrow('E_SCOPE_FORMAT');
        } finally {
          delete process.env.SDD_SCOPE_FORMAT;
        }
      });
    });

    test('includes helpful message with example in E_SCOPE_FORMAT error', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        process.env.SDD_SCOPE_FORMAT = 'strict';
        const tasksPath = process.env.SDD_TASKS_PATH!;
        fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: src/pay/**)');
        
        const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
        
        try {
          await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
          expect(true).toBe(false);
        } catch (e) {
          expect((e as Error).message).toContain('E_SCOPE_FORMAT');
          expect((e as Error).message).toContain('Task-1');
          expect((e as Error).message).toContain('バッククォート');
        } finally {
          delete process.env.SDD_SCOPE_FORMAT;
        }
      });
    });

    test('works correctly with backtick scopes in strict mode', async () => {
      await withTempDir(async (tmpDir) => {
        setupEnv(tmpDir);
        process.env.SDD_SCOPE_FORMAT = 'strict';
        const tasksPath = process.env.SDD_TASKS_PATH!;
        fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');
        
        const sddStartTask = await import('../../.opencode/tools/sdd_start_task');
        try {
          const result = await sddStartTask.default.execute({ taskId: 'Task-1' }, {} as any);
          
          expect(result).toContain('Task-1');
          expect(fs.existsSync(getStatePath())).toBe(true);
        } finally {
          delete process.env.SDD_SCOPE_FORMAT;
        }
      });
    });
  });
});
