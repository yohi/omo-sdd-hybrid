import { describe, it, expect, mock, beforeAll, afterAll } from 'bun:test';
import { SddFeedbackLoop } from '../../.opencode/plugins/sdd-feedback-loop';

// Mock dependencies
const mockReadState = mock(() => Promise.resolve({
  status: 'ok',
  state: {
    activeTaskId: 'Task-1',
    allowedScopes: ['src/**'],
    validationAttempts: 0
  }
}));

const mockValidateGapInternal = mock(() => Promise.resolve('PASS: No issues'));

mock.module('../../.opencode/lib/state-utils', () => ({
  readState: mockReadState
}));

mock.module('../../.opencode/tools/sdd_validate_gap', () => ({
  validateGapInternal: mockValidateGapInternal
}));

describe('SddFeedbackLoop', () => {
  it('should ignore non-trigger tools', async () => {
    const plugin = await SddFeedbackLoop({} as any);
    const hook = plugin['tool.execute.after'];
    
    if (!hook) throw new Error('Hook not found');
    
    const output = { output: 'original output' };
    await hook({ tool: { name: 'ls' } } as any, output as any);
    
    expect(mockValidateGapInternal).not.toHaveBeenCalled();
    expect(output.output).toBe('original output');
  });

  it('should run validation for trigger tools', async () => {
    const plugin = await SddFeedbackLoop({} as any);
    const hook = plugin['tool.execute.after'];
    
    if (!hook) throw new Error('Hook not found');
    
    const output = { output: 'file edited' };
    await hook({ tool: { name: 'edit' } } as any, output as any);
    
    expect(mockValidateGapInternal).toHaveBeenCalled();
  });

  it('should append warning when validation fails', async () => {
    mockValidateGapInternal.mockResolvedValueOnce('WARN: Scope violation');
    
    const plugin = await SddFeedbackLoop({} as any);
    const hook = plugin['tool.execute.after'];
    
    if (!hook) throw new Error('Hook not found');
    
    const output = { output: 'file edited' };
    
    // Wait for throttle
    await new Promise(r => setTimeout(r, 2100));
    
    await hook({ tool: { name: 'edit' } } as any, output as any);
    
    expect(output.output).toContain('[SDD-FEEDBACK]');
    expect(output.output).toContain('WARN: Scope violation');
  });

  it('should NOT append warning when validation passes', async () => {
    mockValidateGapInternal.mockResolvedValueOnce('PASS: All good');
    
    const plugin = await SddFeedbackLoop({} as any);
    const hook = plugin['tool.execute.after'];
    
    if (!hook) throw new Error('Hook not found');
    
    const output = { output: 'file edited' };
    
    // Wait for throttle
    await new Promise(r => setTimeout(r, 2100));

    await hook({ tool: { name: 'edit' } } as any, output as any);
    
    expect(output.output).not.toContain('[SDD-FEEDBACK]');
    expect(output.output).toBe('file edited');
  });

  it('should handle string tool name format', async () => {
    mockValidateGapInternal.mockResolvedValueOnce('WARN: Violation');
    
    const plugin = await SddFeedbackLoop({} as any);
    const hook = plugin['tool.execute.after'];
    
    if (!hook) throw new Error('Hook not found');
    
    const output = { output: 'file edited' };
    
    // Wait for throttle
    await new Promise(r => setTimeout(r, 2100));

    await hook({ tool: 'edit' } as any, output as any);
    
    expect(mockValidateGapInternal).toHaveBeenCalled();
    expect(output.output).toContain('[SDD-FEEDBACK]');
  });
});
