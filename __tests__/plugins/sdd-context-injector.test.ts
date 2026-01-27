import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import SddContextInjector from '../../.opencode/plugins/sdd-context-injector';

// Mock dependencies
const mockReadState = mock(() => Promise.resolve({ status: 'not_found' }));
const mockReadGuardModeState = mock(() => Promise.resolve(null));


describe('SddContextInjector', () => {
  beforeEach(() => {
    mockReadState.mockClear();
    mockReadGuardModeState.mockClear();
    process.env.SDD_GUARD_MODE = '';
  });

  afterEach(() => {
    delete process.env.SDD_GUARD_MODE;
  });

  it('injects minimal context when no task is active', async () => {
    mockReadState.mockResolvedValue({ status: 'not_found' });
    mockReadGuardModeState.mockResolvedValue(null);

    const plugin = await SddContextInjector({
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const hook = plugin['experimental.chat.system.transform'];
    
    expect(hook).toBeDefined();

    const output = { system: [] as string[] };
    await hook!({ sessionID: 'test' }, output);

    expect(output.system.length).toBe(1);
    expect(output.system[0]).toContain('[SDD Context] No active task');
    expect(output.system[0]).toContain('Guard: warn'); // Default
  });

  it('injects active task context', async () => {
    mockReadState.mockResolvedValue({
      status: 'ok',
      state: {
        activeTaskId: 'TASK-1',
        activeTaskTitle: 'Implement feature',
        allowedScopes: ['src/feature/**'],
        version: 1,
        startedAt: 'now',
        startedBy: 'user',
        validationAttempts: 0
      }
    });
    mockReadGuardModeState.mockResolvedValue({ mode: 'block', updatedAt: 'now', updatedBy: 'admin' });

    const plugin = await SddContextInjector({
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const hook = plugin['experimental.chat.system.transform'];
    const output = { system: [] as string[] };
    
    await hook!({ sessionID: 'test' }, output);

    expect(output.system[0]).toContain('Active Task: TASK-1');
    expect(output.system[0]).toContain('Guard: block');
    expect(output.system[0]).toContain('src/feature/**');
  });

  it('truncates many scopes', async () => {
    const scopes = ['1', '2', '3', '4', '5', '6', '7'];
    mockReadState.mockResolvedValue({
      status: 'ok',
      state: {
        activeTaskId: 'TASK-2',
        activeTaskTitle: 'Big task',
        allowedScopes: scopes,
        version: 1,
        startedAt: 'now',
        startedBy: 'user',
        validationAttempts: 0
      }
    });

    const plugin = await SddContextInjector({
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const hook = plugin['experimental.chat.system.transform'];
    const output = { system: [] as string[] };
    
    await hook!({ sessionID: 'test' }, output);

    expect(output.system[0]).toContain('1, 2, 3, 4, 5');
    expect(output.system[0]).not.toContain('6');
    expect(output.system[0]).toContain('...and 2 more');
  });

  it('handles state read error gracefully', async () => {
    mockReadState.mockRejectedValue(new Error('Disk error'));
    const consoleSpy = mock(() => {});
    const originalWarn = console.warn;
    console.warn = consoleSpy;

    try {
      const plugin = await SddContextInjector({
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
      const hook = plugin['experimental.chat.system.transform'];
      const output = { system: [] as string[] };
      
      await hook!({ sessionID: 'test' }, output);

      expect(output.system.length).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      console.warn = originalWarn;
    }
  });
});
