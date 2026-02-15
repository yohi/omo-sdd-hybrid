import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { withTempDir } from '../helpers/temp-dir';
import { getStateDir } from '../../.opencode/lib/state-utils';

const setupEnv = (tmpDir: string) => {
  process.env.SDD_STATE_DIR = tmpDir;
  process.env.SDD_TASKS_PATH = path.join(tmpDir, 'tasks.md');
  process.env.SDD_KIRO_DIR = path.join(tmpDir, '.kiro');
  process.env.SDD_LOCK_RETRIES = '2';
  process.env.SDD_LOCK_STALE = '1000'; // short stale
  process.env.SDD_TEST_MODE = 'true';
  process.env.SDD_GUARD_MODE = 'warn';
  fs.writeFileSync(process.env.SDD_TASKS_PATH, '* [ ] Task-1: Test Task (Scope: `src/**`)', 'utf-8');
};

describe('state-utils lock contention', () => {
  test('writeState fails with specific error when lock is held', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = path.join(tmpDir, '.lock');
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
  });

  test('lockStateDir reports stale lock hint in error message', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = path.join(tmpDir, '.lock');
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
});

describe('state-utils lock owner info', () => {
  test('lockStateDir creates lock-info.json with owner information', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockInfoPath = path.join(tmpDir, '.lock-info.json');
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
  });

  test('lockStateDir release removes lock-info.json', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = path.join(tmpDir, '.lock');
      const lockInfoPath = path.join(tmpDir, '.lock-info.json');
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
  });

  test('readLockInfo returns owner information when lock-info.json exists', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
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
  });

  test('readLockInfo returns null when lock-info.json does not exist', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const { readLockInfo } = await import('../../.opencode/lib/state-utils');

      const info = readLockInfo();
      expect(info).toBeNull();
    });
  });

  test('lockStateDir without taskId sets taskId to null', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
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
});
