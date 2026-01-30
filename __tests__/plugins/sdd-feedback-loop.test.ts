import { describe, it, expect, mock, beforeAll, afterAll, beforeEach } from 'bun:test';
import SddFeedbackLoop from '../../.opencode/plugins/sdd-feedback-loop';

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

const mockReportBug = {
  execute: mock(() => Promise.resolve('Bug reported: .kiro/bugs/bug-test.md'))
};

describe('SddFeedbackLoop', () => {
  beforeEach(() => {
    mockReadState.mockClear();
    mockValidateGapInternal.mockClear();
    mockReportBug.execute.mockClear();
  });

  it('should ignore non-trigger tools', async () => {
    const plugin = await SddFeedbackLoop({
      __testDeps: { readState: mockReadState, validateGapInternal: mockValidateGapInternal }
    } as any);
    const hook = plugin['tool.execute.after'];
    
    if (!hook) throw new Error('Hook not found');
    
    const output = { output: 'original output' };
    await hook({ tool: { name: 'ls' } } as any, output as any);
    
    expect(mockValidateGapInternal).not.toHaveBeenCalled();
    expect(output.output).toBe('original output');
  });

  it('should run validation for trigger tools', async () => {
    const plugin = await SddFeedbackLoop({
      __testDeps: { readState: mockReadState, validateGapInternal: mockValidateGapInternal }
    } as any);
    const hook = plugin['tool.execute.after'];
    
    if (!hook) throw new Error('Hook not found');
    
    const output = { output: 'file edited' };
    await hook({ tool: { name: 'edit' } } as any, output as any);
    
    expect(mockValidateGapInternal).toHaveBeenCalled();
  });

  it('should append warning when validation fails', async () => {
    mockValidateGapInternal.mockResolvedValueOnce('WARN: Scope violation');
    
    const plugin = await SddFeedbackLoop({
      __testDeps: { readState: mockReadState, validateGapInternal: mockValidateGapInternal }
    } as any);
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
    
    const plugin = await SddFeedbackLoop({
      __testDeps: { readState: mockReadState, validateGapInternal: mockValidateGapInternal }
    } as any);
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
    
    const plugin = await SddFeedbackLoop({
      __testDeps: { readState: mockReadState, validateGapInternal: mockValidateGapInternal }
    } as any);
    const hook = plugin['tool.execute.after'];
    
    if (!hook) throw new Error('Hook not found');
    
    const output = { output: 'file edited' };
    
    // Wait for throttle
    await new Promise(r => setTimeout(r, 2100));

    await hook({ tool: 'edit' } as any, output as any);
    
    expect(mockValidateGapInternal).toHaveBeenCalled();
    expect(output.output).toContain('[SDD-FEEDBACK]');
  });

  it('should report bug when bun test fails', async () => {
    const plugin = await SddFeedbackLoop({
      __testDeps: {
        readState: mockReadState,
        validateGapInternal: mockValidateGapInternal,
        reportBug: mockReportBug
      }
    } as any);

    const beforeHook = plugin['tool.execute.before'];
    const afterHook = plugin['tool.execute.after'];

    if (!beforeHook || !afterHook) throw new Error('Hooks not found');

    const callID = 'call-1';

    // 1. Before: Capture command
    await beforeHook(
      { tool: 'bash', callID } as any,
      { args: { command: 'bun test specific.test.ts' } } as any
    );

    // 2. After: Check output with failure
    const output = { output: '\n2 fail\nRan 5 tests.' };
    
    await afterHook(
      { tool: 'bash', callID } as any,
      output as any
    );

    expect(mockReportBug.execute).toHaveBeenCalled();
    const args = mockReportBug.execute.mock.calls[0][0];
    expect(args.title).toContain('Test Failure: bun test specific.test.ts');
    expect(args.actual).toContain('2 tests failed');
    expect(output.output).toContain('[SDD-QA]');
  });

  it('should NOT report bug when bun test passes', async () => {
    const plugin = await SddFeedbackLoop({
      __testDeps: {
        readState: mockReadState,
        validateGapInternal: mockValidateGapInternal,
        reportBug: mockReportBug
      }
    } as any);

    const beforeHook = plugin['tool.execute.before'];
    const afterHook = plugin['tool.execute.after'];
    
    if (!beforeHook || !afterHook) throw new Error('Hooks not found');

    const callID = 'call-2';

    await beforeHook(
      { tool: 'bash', callID } as any,
      { args: { command: 'bun test' } } as any
    );

    const output = { output: '\n0 fail\n5 pass\nRan 5 tests.' };
    
    await afterHook(
      { tool: 'bash', callID } as any,
      output as any
    );

    expect(mockReportBug.execute).not.toHaveBeenCalled();
    expect(output.output).not.toContain('[SDD-QA]');
  });

  it('should NOT report bug for non-test bash commands', async () => {
    const plugin = await SddFeedbackLoop({
      __testDeps: {
        readState: mockReadState,
        validateGapInternal: mockValidateGapInternal,
        reportBug: mockReportBug
      }
    } as any);

    const beforeHook = plugin['tool.execute.before'];
    const afterHook = plugin['tool.execute.after'];

    const callID = 'call-3';

    await beforeHook(
      { tool: 'bash', callID } as any,
      { args: { command: 'echo "fail count is high"' } } as any
    );

    // Output contains "fail" but command is not bun test
    const output = { output: 'fail count is high' };

    await afterHook(
      { tool: 'bash', callID } as any,
      output as any
    );

    expect(mockReportBug.execute).not.toHaveBeenCalled();
  });
});
