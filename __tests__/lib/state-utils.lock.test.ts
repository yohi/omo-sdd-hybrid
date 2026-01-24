import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStateDir } from '../../.opencode/lib/state-utils';

describe('state-utils lock contention', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = setupTestState();
    // Reduce retry count for faster tests
    process.env.SDD_LOCK_RETRIES = '2'; 
    process.env.SDD_LOCK_STALE = '1000'; // short stale
    process.env.SDD_TEST_MODE = 'true';
  });

  afterEach(() => {
    cleanupTestState();
    delete process.env.SDD_LOCK_RETRIES;
    delete process.env.SDD_LOCK_STALE;
  });

  test('writeState fails with specific error when lock is held', async () => {
    const { writeState } = await import('../../.opencode/lib/state-utils');
    
    // Acquire lock manually
    const release = await lockfile.lock(stateDir);
    
    try {
      // Attempt to write state (should fail after retries)
      const state = {
        version: 1,
        activeTaskId: 'Task-Lock',
        activeTaskTitle: 'Lock Test',
        allowedScopes: ['src/**'],
        startedAt: new Date().toISOString(),
        startedBy: 'test',
        validationAttempts: 0
      };

      await expect(writeState(state)).rejects.toThrow(/Failed to acquire lock/);
      
    } finally {
      await release();
    }
  });

  test('lockStateDir reports stale lock hint in error message', async () => {
    const { lockStateDir } = await import('../../.opencode/lib/state-utils');
    
    // Acquire lock manually
    const release = await lockfile.lock(stateDir);
    
    try {
      await expect(lockStateDir()).rejects.toThrow(/sdd_force_unlock/);
    } finally {
      await release();
    }
  });
});
