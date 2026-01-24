import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ensureNoBackups, setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStatePath } from '../../.opencode/lib/state-utils';
import fs from 'fs';

describe('sdd_validate_gap enhanced', () => {
  const originalSkipEnv = process.env.SDD_SKIP_TEST_EXECUTION;
  
  beforeEach(async () => {
    setupTestState();
    await ensureNoBackups();
    process.env.SDD_SKIP_TEST_EXECUTION = 'true';
  });

  afterEach(async () => {
    await ensureNoBackups();
    cleanupTestState();
    if (originalSkipEnv === undefined) {
      delete process.env.SDD_SKIP_TEST_EXECUTION;
    } else {
      process.env.SDD_SKIP_TEST_EXECUTION = originalSkipEnv;
    }
  });

  describe('with active state', () => {
    beforeEach(async () => {
      await ensureNoBackups();
      fs.writeFileSync(getStatePath(), JSON.stringify({
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
    test('runs deep analysis without error', async () => {
      const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
      const result = await sddValidateGap.default.execute({ deep: true }, {} as any);
      expect(result).not.toContain('エラー');
    });
  });

  describe('without active state', () => {
    beforeEach(async () => {
      await ensureNoBackups();
    });

    test('returns error message when no active task', async () => {
      const sddValidateGap = await import('../../.opencode/tools/sdd_validate_gap');
      const result = await sddValidateGap.default.execute({}, {} as any);
      
      expect(result).toContain('エラー');
      expect(result).toContain('sdd_start_task');
    });
  });
});
