import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ensureNoBackups } from '../helpers/test-harness';
import fs from 'fs';

const STATE_PATH = '.opencode/state/current_context.json';

describe('sdd_validate_gap', () => {
  const originalSkipEnv = process.env.SDD_SKIP_TEST_EXECUTION;
  
  beforeEach(() => {
    fs.mkdirSync('.opencode/state', { recursive: true });
    process.env.SDD_SKIP_TEST_EXECUTION = 'true';
  });

  afterEach(() => {
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
    if (originalSkipEnv === undefined) {
      delete process.env.SDD_SKIP_TEST_EXECUTION;
    } else {
      process.env.SDD_SKIP_TEST_EXECUTION = originalSkipEnv;
    }
  });

  test('returns error when no active task', async () => {
    ensureNoBackups();
    const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
    const result = await sddValidateGap.default.execute({ taskId: 'Task-1' }, {} as any);
    
    expect(result).toContain('sdd_start_task');
    expect(result).toContain('アクティブなタスクがありません');
  });

  test('returns validation report with active state', async () => {
    ensureNoBackups();
    fs.writeFileSync(STATE_PATH, JSON.stringify({
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
