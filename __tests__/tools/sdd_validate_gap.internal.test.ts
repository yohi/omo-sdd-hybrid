import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { validateGapInternal } from '../../.opencode/tools/sdd_validate_gap';
import type { State } from '../../.opencode/lib/state-utils';

describe('validateGapInternal', () => {
  beforeEach(() => {
    setupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  const mockState: State = {
    version: 1,
    activeTaskId: 'Task-1',
    activeTaskTitle: 'Test Task',
    allowedScopes: ['src/**'],
    startedAt: new Date().toISOString(),
    startedBy: 'test-user',
    validationAttempts: 0
  };

  test('skipTests: true should return skip message', async () => {
    const result = await validateGapInternal(mockState, {
      skipTests: true
    });

    expect(result).toContain('SKIP: テスト実行はスキップされました');
  });

  test('skipTests: false should attempt to run tests', async () => {
    // We expect it NOT to contain the manual skip message.
    // It might return PASS, FAIL, or another SKIP message if no tests are found/env var is set.
    // But specifically 'SKIP: テスト実行はスキップされました（手動で実行してください）' should only appear
    // if skipTests is true OR env var SDD_SKIP_TEST_EXECUTION is true.
    
    const result = await validateGapInternal(mockState, {
      skipTests: false
    });

    // The message 'SKIP: テスト実行はスキップされました（手動で実行してください）'
    // comes from runScopedTests when skip is requested.
    expect(result).toContain('SKIP: テストスコープが定義されていません');
  });
});
