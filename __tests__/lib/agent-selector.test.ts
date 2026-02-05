import { describe, it, expect } from 'bun:test';
import { selectRoleForTask } from '../../.opencode/lib/agent-selector';
import { SddTask } from '../../.opencode/lib/tasks_markdown';

describe('selectRoleForTask', () => {
  it('should return architect for KIRO-* IDs', async () => {
    const task: SddTask = {
      id: 'KIRO-1',
      description: 'Some task',
      scopes: [],
      checked: false,
      line: 1
    };
    expect(await selectRoleForTask(task)).toBe('architect');
  });

  it('should return architect for descriptions containing architect keywords', async () => {
    const task1: SddTask = {
      id: 'Task-1',
      description: 'Design authentication system',
      scopes: [],
      checked: false,
      line: 1
    };
    expect(await selectRoleForTask(task1)).toBe('architect');

    const task2: SddTask = {
      id: 'Task-2',
      description: '認証機能の設計を行う',
      scopes: [],
      checked: false,
      line: 1
    };
    expect(await selectRoleForTask(task2)).toBe('architect');
  });

  it('should return architect for other tasks (default safety)', async () => {
    const task: SddTask = {
      id: 'Task-3',
      description: 'Implement login button',
      scopes: [],
      checked: false,
      line: 1
    };
    expect(await selectRoleForTask(task)).toBe('architect');
  });
});
