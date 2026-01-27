import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { writeState } from '../../.opencode/lib/state-utils';
import sddShowContext from '../../.opencode/tools/sdd_show_context';

describe('sdd_show_context', () => {
  beforeEach(() => {
    setupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('returns not started message when no state exists', async () => {
    const result = await sddShowContext.execute({}, {} as any);
    expect(result).toContain('タスク未開始');
  });

  test('shows implementer role when role is null (backward compatibility)', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/**'],
      startedAt: '2023-01-01T00:00:00.000Z',
      startedBy: 'tester',
      validationAttempts: 0,
      role: null
    });

    const result = await sddShowContext.execute({}, {} as any);
    expect(result).toContain('現在のタスク: Task-1');
    expect(result).toContain('ロール: implementer');
  });

  test('shows architect role when role is architect', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'KIRO-1',
      activeTaskTitle: 'Architect Task',
      allowedScopes: ['src/**'],
      startedAt: '2023-01-01T00:00:00.000Z',
      startedBy: 'tester',
      validationAttempts: 0,
      role: 'architect'
    });

    const result = await sddShowContext.execute({}, {} as any);
    expect(result).toContain('ロール: architect');
  });

  test('shows implementer role when role is explicitly implementer', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-2',
      activeTaskTitle: 'Dev Task',
      allowedScopes: ['src/**'],
      startedAt: '2023-01-01T00:00:00.000Z',
      startedBy: 'tester',
      validationAttempts: 0,
      role: 'implementer'
    });

    const result = await sddShowContext.execute({}, {} as any);
    expect(result).toContain('ロール: implementer');
  });
});
