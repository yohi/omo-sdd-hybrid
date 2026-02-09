import { describe, test, expect, mock } from 'bun:test';
import { validateGapInternal } from '../../.opencode/tools/sdd_validate_gap';

describe('sdd_validate_gap Smart Strategy', () => {
  test('Architect role auto-enables deep analysis', async () => {
    const mockState = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'architect'
    };

    const result = await validateGapInternal(mockState as any, {
      deep: undefined
    });

    expect(result).toContain('> Tip: Architect ロールです。より詳細な意味的検証を行うには --deep オプションを指定してください。');
  });

  test('Implementer role does NOT auto-enable deep analysis', async () => {
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

    const result = await validateGapInternal(mockState as any, {
      deep: undefined
    });

    expect(result).not.toContain('Smart Strategy: Architect ロールのため、Deep Analysis が自動的に有効化されました。');
  });

  test('Explicit deep analysis takes precedence for Architect', async () => {
    const mockState = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'architect'
    };

    // Explicitly set deep: false
    const result = await validateGapInternal(mockState as any, {
      deep: false
    });

    expect(result).not.toContain('Smart Strategy: Architect ロールのため、Deep Analysis が自動的に有効化されました。');
  });
});
