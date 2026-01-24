import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ensureNoBackups, setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStatePath } from '../../.opencode/lib/state-utils';
import fs from 'fs';

describe('sdd_validate_gap', () => {
  const originalSkipEnv = process.env.SDD_SKIP_TEST_EXECUTION;
  
  beforeEach(() => {
    setupTestState();
    process.env.SDD_SKIP_TEST_EXECUTION = 'true';
  });

  afterEach(() => {
    cleanupTestState();
    if (originalSkipEnv === undefined) {
      delete process.env.SDD_SKIP_TEST_EXECUTION;
    } else {
      process.env.SDD_SKIP_TEST_EXECUTION = originalSkipEnv;
    }
  });

  test('returns error when no active task', async () => {
    await ensureNoBackups();
    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    const result = await sddValidateGap.default.execute({ taskId: 'Task-1' }, {} as any);
    
    expect(result).toContain('sdd_start_task');
    expect(result).toContain('アクティブなタスクがありません');
  });

  test('returns validation report with active state', async () => {
    await ensureNoBackups();
    fs.writeFileSync(getStatePath(), JSON.stringify({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    }));
    
    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    const result = await sddValidateGap.default.execute({}, {} as any);
    
    expect(result).toContain('Task-1');
    expect(result).toContain('sdd_end_task');
  });
});
