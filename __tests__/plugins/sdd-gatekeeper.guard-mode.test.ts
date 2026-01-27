import { describe, test, expect, mock } from 'bun:test';
import SddGatekeeper from '../../.opencode/plugins/sdd-gatekeeper';

describe('sdd-gatekeeper guard mode priority', () => {
  test('file=block overrides env=warn', async () => {
    const mockReadGuardModeState = mock(() => Promise.resolve({
      mode: 'block',
      updatedAt: new Date().toISOString(),
      updatedBy: 'test'
    } as any));

    process.env.SDD_GUARD_MODE = 'warn';

    const mockReadState = mock(() => Promise.resolve({
      status: 'ok',
      state: {
        activeTaskId: 'Task-1',
        allowedScopes: ['src/**'],
        validationAttempts: 0
      }
    } as any));

    const plugin = await SddGatekeeper({
      client: {} as any,
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const hook = plugin['tool.execute.before'];
    if (!hook) throw new Error('Hook not found');

    const event = {
      tool: {
        name: 'edit',
        args: { filePath: 'tests/outside.ts', newString: 'x', oldString: 'y' }
      }
    };

    await expect(hook(event)).rejects.toThrow('[SDD-GATEKEEPER] SCOPE_DENIED');
  });

  test('env=block overrides file=warn', async () => {
    const mockReadGuardModeState = mock(() => Promise.resolve({
      mode: 'warn',
      updatedAt: new Date().toISOString(),
      updatedBy: 'test'
    } as any));

    process.env.SDD_GUARD_MODE = 'block';

    const mockReadState = mock(() => Promise.resolve({
      status: 'ok',
      state: {
        activeTaskId: 'Task-1',
        allowedScopes: ['src/**'],
        validationAttempts: 0
      }
    } as any));

    const plugin = await SddGatekeeper({
      client: {} as any,
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const hook = plugin['tool.execute.before'];
    if (!hook) throw new Error('Hook not found');

    const event = {
      tool: {
        name: 'edit',
        args: { filePath: 'tests/outside.ts', newString: 'x', oldString: 'y' }
      }
    };

    await expect(hook(event)).rejects.toThrow('[SDD-GATEKEEPER] SCOPE_DENIED');
  });

  test('file=warn and env=warn allows with warning', async () => {
    const mockReadGuardModeState = mock(() => Promise.resolve({
      mode: 'warn',
      updatedAt: new Date().toISOString(),
      updatedBy: 'test'
    } as any));

    process.env.SDD_GUARD_MODE = 'warn';

    const mockReadState = mock(() => Promise.resolve({
      status: 'ok',
      state: {
        activeTaskId: 'Task-1',
        allowedScopes: ['src/**'],
        validationAttempts: 0
      }
    } as any));

    const plugin = await SddGatekeeper({
      client: {} as any,
      __testDeps: { readState: mockReadState, readGuardModeState: mockReadGuardModeState }
    } as any);
    const hook = plugin['tool.execute.before'];
    if (!hook) throw new Error('Hook not found');

    const event = {
      tool: {
        name: 'edit',
        args: { filePath: 'tests/outside.ts', newString: 'x', oldString: 'y' }
      }
    };

    await hook(event);
  });
});
