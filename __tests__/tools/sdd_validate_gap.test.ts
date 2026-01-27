import { describe, test, expect, mock } from 'bun:test';

describe('sdd_validate_gap', () => {
  test('returns error when no active task', async () => {
    const mockReadState = mock(() => Promise.resolve({ status: 'not_found' } as any));
    const mockWriteState = mock(() => Promise.resolve());
    const mockValidateGapInternal = mock(() => Promise.resolve('PASS: No issues'));

    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    const result = await sddValidateGap.default.execute({ taskId: 'Task-1' }, {
      __testDeps: { readState: mockReadState, writeState: mockWriteState, validateGapInternal: mockValidateGapInternal }
    } as any);
    
    expect(result).toContain('sdd_start_task');
    expect(result).toContain('アクティブなタスクがありません');
  });

  test('returns validation report with active state', async () => {
    const mockState = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    };
    
    const mockReadState = mock(() => Promise.resolve({ status: 'ok', state: mockState } as any));
    const mockWriteState = mock(() => Promise.resolve());
    const mockValidateGapInternal = mock(() => Promise.resolve('PASS: No issues\nTask-1\nsdd_end_task'));

    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    const result = await sddValidateGap.default.execute({}, {
      __testDeps: { readState: mockReadState, writeState: mockWriteState, validateGapInternal: mockValidateGapInternal }
    } as any);
    
    expect(mockValidateGapInternal).toHaveBeenCalled();
    expect(result).toContain('Task-1');
    expect(result).toContain('sdd_end_task');
  });
});
