import { describe, test, expect, mock } from 'bun:test';
import SddGatekeeper from '../../.opencode/plugins/sdd-gatekeeper';

const mockStateResult = {
  status: 'ok',
  state: {
    version: 1,
    activeTaskId: 'Task-1',
    activeTaskTitle: 'Test',
    allowedScopes: ['**'],
    startedAt: new Date().toISOString(),
    startedBy: 'test'
  }
};

describe('SddGatekeeper Entry Point', () => {
  test('handles tool event with undefined args gracefully', async () => {
    const mockReadState = mock(() => Promise.resolve(mockStateResult as any));
    const mockReadGuardModeState = mock(() => Promise.resolve(null));

    const plugin = await SddGatekeeper({
      client: {} as any,
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const handler = plugin['tool.execute.before'];

    if (!handler) {
      throw new Error('Handler not found');
    }
    
    const event = {
      tool: {
        name: 'edit',
        args: undefined as any
      }
    };

    try {
      await handler(event);
    } catch (e: any) {
      expect(e).toBeInstanceOf(Error);
      expect(e.message).not.toContain('undefined is not an object');
    }
  });

  test('handles multiedit with invalid files arg via entry point', async () => {
    const mockReadState = mock(() => Promise.resolve(mockStateResult as any));
    const mockReadGuardModeState = mock(() => Promise.resolve(null));
    
    const plugin = await SddGatekeeper({
      client: {} as any,
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const handler = plugin['tool.execute.before'];

    if (!handler) throw new Error('Handler not found');

    const event = {
      tool: {
        name: 'multiedit',
        args: {
          files: "not-an-array"
        }
      }
    };

    await expect(handler(event)).rejects.toThrow('INVALID_ARGUMENTS');
  });
});
