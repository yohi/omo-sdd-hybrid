import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';

const STATE_PATH = '.opencode/state/current_context.json';
const BACKUP_PATH = STATE_PATH + '.bak';

describe('sdd_validate_gap enhanced', () => {
  const originalSkipEnv = process.env.SDD_SKIP_TEST_EXECUTION;
  let hadExistingState = false;
  
  beforeEach(() => {
    fs.mkdirSync('.opencode/state', { recursive: true });
    
    if (fs.existsSync(STATE_PATH)) {
      fs.copyFileSync(STATE_PATH, BACKUP_PATH);
      hadExistingState = true;
    } else {
      hadExistingState = false;
    }
    
    process.env.SDD_SKIP_TEST_EXECUTION = 'true';
  });

  afterEach(() => {
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
    
    if (hadExistingState && fs.existsSync(BACKUP_PATH)) {
      fs.copyFileSync(BACKUP_PATH, STATE_PATH);
      fs.unlinkSync(BACKUP_PATH);
    }
    
    if (originalSkipEnv === undefined) {
      delete process.env.SDD_SKIP_TEST_EXECUTION;
    } else {
      process.env.SDD_SKIP_TEST_EXECUTION = originalSkipEnv;
    }
  });

  describe('with active state', () => {
    beforeEach(() => {
      fs.writeFileSync(STATE_PATH, JSON.stringify({
        version: 1,
        activeTaskId: 'Task-1',
        activeTaskTitle: 'Test Task',
        allowedScopes: ['src/auth/**', '__tests__/auth/**'],
        startedAt: new Date().toISOString(),
        startedBy: 'test',
        validationAttempts: 0
      }));
    });

    test('returns validation report with scope section', async () => {
      const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
      const result = await sddValidateGap.default.execute({}, {} as any);
      
      expect(result).toContain('Task-1');
      expect(result).toContain('スコープ検証');
    });

    test('includes allowed scopes in output', async () => {
      const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
      const result = await sddValidateGap.default.execute({}, {} as any);
      
      expect(result).toContain('src/auth/**');
    });

    test('includes test section in output', async () => {
      const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
      const result = await sddValidateGap.default.execute({}, {} as any);
      
      expect(result).toContain('テスト');
    });

    test('includes diagnostics section in output', async () => {
      const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
      const result = await sddValidateGap.default.execute({}, {} as any);
      
      expect(result).toContain('Diagnostics');
    });
  });

  describe('without active state', () => {
    beforeEach(() => {
      if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
    });

    test('returns error message when no active task', async () => {
      const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
      const result = await sddValidateGap.default.execute({ taskId: 'Task-1' }, {} as any);
      
      expect(result).toContain('sdd_start_task');
    });
  });
});
