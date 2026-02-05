import { describe, test, expect, mock } from 'bun:test';
import SddGatekeeper from '../../.opencode/plugins/sdd-gatekeeper';

const mockStateResult = {
  status: 'ok',
  state: {
    version: 1,
    activeTaskId: 'Task-1',
    activeTaskTitle: 'Test',
    allowedScopes: ['src/allowed/**'],
    startedAt: new Date().toISOString(),
    startedBy: 'test',
    validationAttempts: 0,
    role: null,
    tasksMdHash: 'test-hash',
    stateHash: 'state-hash'
  }
};

describe('SddGatekeeper Toast Notifications', () => {
  test('calls showToast on warning (warn mode)', async () => {
    const mockReadState = mock(() => Promise.resolve(mockStateResult as any));
    const mockReadGuardModeState = mock(() => Promise.resolve({ mode: 'warn' }));
    const mockShowToast = mock(() => Promise.resolve());

    const clientMock = {
      tui: {
        showToast: mockShowToast
      }
    };

    const plugin = await SddGatekeeper({
      client: clientMock as any,
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const handler = plugin['tool.execute.before'];

    if (!handler) throw new Error('Handler not found');
    
    const event = {
      tool: {
        name: 'edit',
        args: {
          filePath: 'src/denied/file.ts'
        }
      }
    };

    await handler(event);

    expect(mockShowToast).toHaveBeenCalled();
    const callArgs = mockShowToast.mock.calls[0][0];
    expect(callArgs.body.variant).toBe('warning');
    expect(callArgs.body.title).toBe('SDD Gatekeeper Warning');
  });

  test('calls showToast on block (block mode)', async () => {
    const mockReadState = mock(() => Promise.resolve(mockStateResult as any));
    const mockReadGuardModeState = mock(() => Promise.resolve({ mode: 'block' }));
    const mockShowToast = mock(() => Promise.resolve());

    const clientMock = {
      tui: {
        showToast: mockShowToast
      }
    };

    const plugin = await SddGatekeeper({
      client: clientMock as any,
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const handler = plugin['tool.execute.before'];

    if (!handler) throw new Error('Handler not found');
    
    const event = {
      tool: {
        name: 'edit',
        args: {
          filePath: 'src/denied/file.ts'
        }
      }
    };

    try {
      await handler(event);
    } catch (e) {
    }

    expect(mockShowToast).toHaveBeenCalled();
    const callArgs = mockShowToast.mock.calls[0][0];
    expect(callArgs.body.variant).toBe('error');
    expect(callArgs.body.title).toBe('SDD Gatekeeper Blocked');
  });

  test('falls back to console.warn if showToast is missing', async () => {
    const mockReadState = mock(() => Promise.resolve(mockStateResult as any));
    const mockReadGuardModeState = mock(() => Promise.resolve({ mode: 'warn' }));
    
    const clientMock = {};
    
    const consoleWarnSpy = mock(console.warn);
    const originalWarn = console.warn;
    console.warn = consoleWarnSpy;

    try {
      const plugin = await SddGatekeeper({
        client: clientMock as any,
        __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
      } as any);
      const handler = plugin['tool.execute.before'];

      if (!handler) throw new Error('Handler not found');
      
      const event = {
        tool: {
          name: 'edit',
          args: {
            filePath: 'src/denied/file.ts'
          }
        }
      };

      await handler(event);

      expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      console.warn = originalWarn;
    }
  });
});
