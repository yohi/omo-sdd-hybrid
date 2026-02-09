import { describe, test, expect, mock, beforeEach } from 'bun:test';
import SddCommandHandler from '../../.opencode/plugins/sdd-command-handler';
import * as stateUtils from '../../.opencode/lib/state-utils';

// writeGuardModeState をモック化
mock.module('../../.opencode/lib/state-utils', () => ({
  ...stateUtils,
  writeGuardModeState: mock(() => Promise.resolve()),
}));

describe('SddCommandHandler /guard command', () => {
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = {
      client: {
        tui: {
          showToast: mock(() => Promise.resolve()),
        },
        session: {
          prompt: mock(() => Promise.resolve()),
        },
      },
    };
  });

  test('Tool: /guard block sets mode and notifies session', async () => {
    const handler = await SddCommandHandler(mockCtx);
    const guardTool = (handler.tool as any).guard;
    
    expect(guardTool).toBeDefined();

    const result = await guardTool.execute({ mode: 'block' }, { sessionID: 'session-123' });

    expect(result).toBe('Guard mode set to block');
    
    // writeGuardModeState が呼ばれたか確認
    const { writeGuardModeState } = await import('../../.opencode/lib/state-utils');
    expect(writeGuardModeState).toHaveBeenCalled();
    const callArgs = (writeGuardModeState as any).mock.calls[0][0];
    expect(callArgs.mode).toBe('block');

    // Toast が表示されたか確認
    expect(mockCtx.client.tui.showToast).toHaveBeenCalledWith({
      body: expect.objectContaining({
        message: 'Guard mode changed to block',
        variant: 'info'
      })
    });

    // AIエージェントに通知されたか確認
    expect(mockCtx.client.session.prompt).toHaveBeenCalledWith({
      path: { id: 'session-123' },
      body: {
        parts: [{ type: 'text', text: "[System] User changed guard mode to 'block'." }]
      }
    });
  });

  test('Tool: invalid mode shows error toast', async () => {
    const handler = await SddCommandHandler(mockCtx);
    const guardTool = (handler.tool as any).guard;

    const result = await guardTool.execute({ mode: 'invalid' }, { sessionID: 'session-123' });

    expect(result).toContain('Invalid guard mode');
    expect(mockCtx.client.tui.showToast).toHaveBeenCalledWith({
      body: expect.objectContaining({
        variant: 'error'
      })
    });
  });

  test('chat.message: /guard warn replaces message and sets mode', async () => {
    const handler = await SddCommandHandler(mockCtx);
    const chatHook = (handler as any)['chat.message'];
    
    const output = {
      message: { role: 'user' },
      parts: [{ type: 'text', text: '/guard warn' }]
    };

    await chatHook({}, output);

    expect(output.parts[0].text).toBe("[System] User changed guard mode to 'warn'.");
    
    const { writeGuardModeState } = await import('../../.opencode/lib/state-utils');
    const lastCall = (writeGuardModeState as any).mock.calls.slice(-1)[0][0];
    expect(lastCall.mode).toBe('warn');
  });

  test('chat.message: /profile @idea.md expands with promptFile option', async () => {
    const handler = await SddCommandHandler(mockCtx);
    const chatHook = (handler as any)['chat.message'];
    
    const output = {
      message: { role: 'user' },
      parts: [{ type: 'text', text: '/profile @idea.md' }]
    };

    await chatHook({}, output);

    expect(output.parts[0].text).toContain('sdd_kiro');
    expect(output.parts[0].text).toContain('profile');
    expect(output.parts[0].text).toContain('--promptFile "idea.md"');
  });

  test('chat.message: /profile feature-name @idea.md combines feature and promptFile', async () => {
    const handler = await SddCommandHandler(mockCtx);
    const chatHook = (handler as any)['chat.message'];
    
    const output = {
      message: { role: 'user' },
      parts: [{ type: 'text', text: '/profile auth-feature @idea.md' }]
    };

    await chatHook({}, output);

    expect(output.parts[0].text).toContain('auth-feature');
    expect(output.parts[0].text).toContain('--promptFile "idea.md"');
  });

  test('chat.message: /impl @spec.md expands with promptFile option', async () => {
    const handler = await SddCommandHandler(mockCtx);
    const chatHook = (handler as any)['chat.message'];
    
    const output = {
      message: { role: 'user' },
      parts: [{ type: 'text', text: '/impl @spec.md' }]
    };

    await chatHook({}, output);

    expect(output.parts[0].text).toContain('sdd_kiro');
    expect(output.parts[0].text).toContain('impl');
    expect(output.parts[0].text).toContain('--promptFile "spec.md"');
  });
});
