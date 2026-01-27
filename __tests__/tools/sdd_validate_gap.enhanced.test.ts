import { describe, test, expect, mock } from 'bun:test';

describe('sdd_validate_gap enhanced', () => {
  const mockState = {
    version: 1,
    activeTaskId: 'Task-1',
    activeTaskTitle: 'Test Task',
    allowedScopes: ['src/auth/**', '__tests__/auth/**'],
    startedAt: new Date().toISOString(),
    startedBy: 'test',
    validationAttempts: 0
  };

  test('returns validation report with scope section', async () => {
    const mockReadState = mock(() => Promise.resolve({ status: 'ok', state: mockState } as any));
    const mockWriteState = mock(() => Promise.resolve());
    const mockValidateGapInternal = mock(() => Promise.resolve('Task-1\nスコープ検証'));

    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    const result = await sddValidateGap.default.execute({}, {
      __testDeps: { readState: mockReadState, writeState: mockWriteState, validateGapInternal: mockValidateGapInternal }
    } as any);
    
    expect(result).toContain('Task-1');
    expect(result).toContain('スコープ検証');
  });

  test('runs deep analysis without error', async () => {
    const mockReadState = mock(() => Promise.resolve({ status: 'ok', state: mockState } as any));
    const mockWriteState = mock(() => Promise.resolve());
    const mockValidateGapInternal = mock(() => Promise.resolve('Report'));

    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    await sddValidateGap.default.execute({ deep: true }, {
      __testDeps: { readState: mockReadState, writeState: mockWriteState, validateGapInternal: mockValidateGapInternal }
    } as any);

    expect(mockValidateGapInternal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deep: true }));
  });

  test('returns error message when no active task', async () => {
    const mockReadState = mock(() => Promise.resolve({ status: 'not_found' } as any));

    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    const result = await sddValidateGap.default.execute({}, {
      __testDeps: { readState: mockReadState }
    } as any);
    
    expect(result).toContain('エラー');
    expect(result).toContain('sdd_start_task');
  });
});
