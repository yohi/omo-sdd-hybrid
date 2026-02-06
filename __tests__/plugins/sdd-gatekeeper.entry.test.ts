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
    startedBy: 'test',
    validationAttempts: 0,
    role: null,
    tasksMdHash: 'test-hash',
    stateHash: 'state-hash'
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

    let caughtError: any;
    try {
      await handler(event);
    } catch (e: any) {
      caughtError = e;
    }

    expect(caughtError, 'エラーが投げられること').toBeInstanceOf(Error);
    expect(caughtError.message, '未定義アクセスの例外ではないこと').not.toContain('undefined is not an object');
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

    await expect(handler(event), '無効なfilesでエラーになること').rejects.toThrow('INVALID_ARGUMENTS');
  });

  test('blocks implementer writing to .kiro/tasks.md via entry point', async () => {
    const implementerState = {
      status: 'ok',
      state: {
        version: 1,
        activeTaskId: 'Task-1',
        activeTaskTitle: 'Impl',
        allowedScopes: ['src/**'],
        startedAt: new Date().toISOString(),
        startedBy: 'implementer',
        validationAttempts: 0,
        role: 'implementer',
        tasksMdHash: 'test-hash',
        stateHash: 'state-hash'
      }
    };
    const mockReadState = mock(() => Promise.resolve(implementerState as any));
    const mockReadGuardModeState = mock(() => Promise.resolve({ mode: 'block' }));

    const plugin = await SddGatekeeper({
      client: {} as any,
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const handler = plugin['tool.execute.before'];

    if (!handler) throw new Error('Handler not found');

    const event = {
      tool: {
        name: 'edit',
        args: {
          filePath: '.kiro/requirements.md'
        }
      }
    };

    await expect(handler(event), 'implementerが.kiroに書けないこと').rejects.toThrow('ROLE_DENIED');
  });
});
