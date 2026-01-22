import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ensureNoBackups } from '../helpers/test-harness';
import fs from 'fs';

const STATE_PATH = '.opencode/state/current_context.json';

describe('sdd_validate_gap enhanced', () => {
  const originalSkipEnv = process.env.SDD_SKIP_TEST_EXECUTION;
  
  beforeEach(() => {
    fs.mkdirSync('.opencode/state', { recursive: true });
    ensureNoBackups();
    process.env.SDD_SKIP_TEST_EXECUTION = 'true';
  });

  afterEach(() => {
    ensureNoBackups();
    if (originalSkipEnv === undefined) {
      delete process.env.SDD_SKIP_TEST_EXECUTION;
    } else {
      process.env.SDD_SKIP_TEST_EXECUTION = originalSkipEnv;
    }
  });

  describe('with active state', () => {
    beforeEach(() => {
      ensureNoBackups();
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
      ensureNoBackups();
    });

    test('returns error message when no active task', async () => {
      const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
      const result = await sddValidateGap.default.execute({}, {} as any);
      
      expect(result).toContain('エラー');
      expect(result).toContain('sdd_start_task');
    });
  });
});
