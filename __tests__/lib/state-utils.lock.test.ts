import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStateDir } from '../../.opencode/lib/state-utils';

describe('state-utils lock contention', () => {
  let stateDir: string;
  let lockPath: string;

  beforeEach(() => {
    stateDir = setupTestState();
    lockPath = path.join(stateDir, '.lock');
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
    fs.mkdirSync(lockPath);

    try {
      // Attempt to write state (should fail after retries)
      const state = {
        version: 1,
        activeTaskId: 'Task-Lock',
        activeTaskTitle: 'Lock Test',
        allowedScopes: ['src/**'],
        startedAt: new Date().toISOString(),
        startedBy: 'test',
        validationAttempts: 0,
        role: null
      };

      await expect(writeState(state)).rejects.toThrow(/Failed to acquire lock/);

    } finally {
      if (fs.existsSync(lockPath)) {
        fs.rmdirSync(lockPath);
      }
    }
  });

  test('lockStateDir reports stale lock hint in error message', async () => {
    const { lockStateDir } = await import('../../.opencode/lib/state-utils');

    // Acquire lock manually
    fs.mkdirSync(lockPath);

    try {
      await expect(lockStateDir()).rejects.toThrow(/sdd_force_unlock/);
    } finally {
      if (fs.existsSync(lockPath)) {
        fs.rmdirSync(lockPath);
      }
    }
  });
});

describe('state-utils lock owner info', () => {
  let stateDir: string;
  let lockPath: string;
  let lockInfoPath: string;

  beforeEach(() => {
    stateDir = setupTestState();
    lockPath = path.join(stateDir, '.lock');
    lockInfoPath = path.join(stateDir, '.lock-info.json');
    process.env.SDD_LOCK_RETRIES = '2';
    process.env.SDD_LOCK_STALE = '1000';
    process.env.SDD_TEST_MODE = 'true';
  });

  afterEach(() => {
    cleanupTestState();
    delete process.env.SDD_LOCK_RETRIES;
    delete process.env.SDD_LOCK_STALE;
  });

  test('lockStateDir creates lock-info.json with owner information', async () => {
    const { lockStateDir } = await import('../../.opencode/lib/state-utils');

    const release = await lockStateDir('Task-Owner');

    try {
      // Verify lock-info.json exists
      expect(fs.existsSync(lockInfoPath)).toBe(true);

      // Verify content
      const content = JSON.parse(fs.readFileSync(lockInfoPath, 'utf-8'));
      expect(content.taskId).toBe('Task-Owner');
      expect(content.pid).toBe(process.pid);
      expect(content.host).toBe(os.hostname());
      expect(typeof content.startedAt).toBe('string');
    } finally {
      await release();
    }
  });

  test('lockStateDir release removes lock-info.json', async () => {
    const { lockStateDir } = await import('../../.opencode/lib/state-utils');

    const release = await lockStateDir('Task-Cleanup');

    // Verify lock-info.json exists before release
    expect(fs.existsSync(lockInfoPath)).toBe(true);

    await release();

    // Verify lock-info.json is removed after release
    expect(fs.existsSync(lockInfoPath)).toBe(false);
    // Verify lock directory is also removed
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('readLockInfo returns owner information when lock-info.json exists', async () => {
    const { lockStateDir, readLockInfo } = await import('../../.opencode/lib/state-utils');

    const release = await lockStateDir('Task-Read');

    try {
      const info = readLockInfo();
      expect(info).not.toBeNull();
      expect(info!.taskId).toBe('Task-Read');
      expect(info!.pid).toBe(process.pid);
      expect(info!.host).toBe(os.hostname());
    } finally {
      await release();
    }
  });

  test('readLockInfo returns null when lock-info.json does not exist', async () => {
    const { readLockInfo } = await import('../../.opencode/lib/state-utils');

    const info = readLockInfo();
    expect(info).toBeNull();
  });

  test('lockStateDir without taskId sets taskId to null', async () => {
    const { lockStateDir, readLockInfo } = await import('../../.opencode/lib/state-utils');

    const release = await lockStateDir();

    try {
      const info = readLockInfo();
      expect(info).not.toBeNull();
      expect(info!.taskId).toBeNull();
    } finally {
      await release();
    }
  });
});
