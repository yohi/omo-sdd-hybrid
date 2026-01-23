import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { SddGatekeeper } from '../../.opencode/plugins/sdd-gatekeeper';
import { writeGuardModeState, getStatePath, getGuardModePath, getStateDir } from '../../.opencode/lib/state-utils';
import fs from 'fs';

const cleanupStateFiles = () => {
  const statePath = getStatePath();
  const guardPath = getGuardModePath();
  const logPath = `${getStateDir()}/guard-mode.log`;
  const filesToClean = [
    statePath, guardPath, logPath,
    `${statePath}.bak`
  ];
  filesToClean.forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
};

describe('sdd-gatekeeper guard mode priority', () => {
  beforeEach(() => {
    setupTestState();
    cleanupStateFiles();
    // Default valid state for gatekeeper to pass Rule1
    const validState = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    };
    if (!fs.existsSync(getStateDir())) {
      fs.mkdirSync(getStateDir(), { recursive: true });
    }
    fs.writeFileSync(getStatePath(), JSON.stringify(validState));
  });

  afterEach(() => {
    cleanupStateFiles();
    cleanupTestState();
    delete process.env.SDD_GUARD_MODE;
  });

  test('file=block overrides env=warn', async () => {
    // Setup: File is BLOCK
    await writeGuardModeState({
      mode: 'block',
      updatedAt: new Date().toISOString(),
      updatedBy: 'test'
    });
    // Setup: Env is WARN (weakening attempt)
    process.env.SDD_GUARD_MODE = 'warn';

    const plugin = await SddGatekeeper({ client: {} as any });
    const hook = plugin['tool.execute.before'];

    // Action: Edit outside scope
    const event = {
      tool: {
        name: 'edit',
        args: { filePath: 'tests/outside.ts', newString: 'x', oldString: 'y' }
      }
    };

    // Expect: Error thrown (Block)
    expect(async () => {
      // @ts-ignore
      await hook(event);
    }).toThrow('[SDD-GATEKEEPER] SCOPE_DENIED');
  });

  test('env=block overrides file=warn', async () => {
     // Setup: File is WARN
    await writeGuardModeState({
      mode: 'warn',
      updatedAt: new Date().toISOString(),
      updatedBy: 'test'
    });
    // Setup: Env is BLOCK (strengthening)
    process.env.SDD_GUARD_MODE = 'block';

    const plugin = await SddGatekeeper({ client: {} as any });
    const hook = plugin['tool.execute.before'];

    // Action: Edit outside scope
    const event = {
      tool: {
        name: 'edit',
        args: { filePath: 'tests/outside.ts', newString: 'x', oldString: 'y' }
      }
    };

    // Expect: Error thrown (Block)
    expect(async () => {
      // @ts-ignore
      await hook(event);
    }).toThrow('[SDD-GATEKEEPER] SCOPE_DENIED');
  });

  test('file=warn and env=warn allows with warning', async () => {
     // Setup: File is WARN
    await writeGuardModeState({
      mode: 'warn',
      updatedAt: new Date().toISOString(),
      updatedBy: 'test'
    });
    // Setup: Env is WARN
    process.env.SDD_GUARD_MODE = 'warn';

    const plugin = await SddGatekeeper({ client: {} as any });
    const hook = plugin['tool.execute.before'];

    // Action: Edit outside scope
    const event = {
      tool: {
        name: 'edit',
        args: { filePath: 'tests/outside.ts', newString: 'x', oldString: 'y' }
      }
    };

    // Expect: No error (Warn only)
    // @ts-ignore
    await hook(event);
  });
});
