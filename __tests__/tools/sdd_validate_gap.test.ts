import { describe, test, expect } from 'bun:test';

describe('sdd_validate_gap', () => {
  test('returns manual verification steps when kiro unavailable', async () => {
    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    const result = await sddValidateGap.default.execute({ taskId: 'Task-1' }, {} as any);
    
    expect(result).toContain('Task-1');
    expect(result).toContain('手動で行ってください');
    expect(result).toContain('lsp_diagnostics');
    expect(result).toContain('sdd_end_task');
  });
});
