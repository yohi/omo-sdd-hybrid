import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { withTempDir } from '../helpers/temp-dir';
import { LockInfo } from '../../.opencode/lib/state-utils';

const setupEnv = (tmpDir: string) => {
  process.env.SDD_STATE_DIR = tmpDir;
  process.env.SDD_TASKS_PATH = path.join(tmpDir, 'tasks.md');
  process.env.SDD_KIRO_DIR = path.join(tmpDir, '.kiro');
  process.env.SDD_TEST_MODE = 'true';
  process.env.SDD_GUARD_MODE = 'warn';
  fs.writeFileSync(process.env.SDD_TASKS_PATH, '* [ ] Task-1: Test Task (Scope: `src/**`)', 'utf-8');
};

describe('sdd_force_unlock', () => {
  test('dry-run shows locked status when lock exists', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = `${tmpDir}.lock`;
      // Create a fake lock directory (proper-lockfile style)
      fs.mkdirSync(lockPath);

      const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
      const result = await sddForceUnlock.default.execute({ force: false }, {} as any);

      expect(result).toContain('[DRY-RUN]');
      expect(result).toContain(`Lock Artifact Found: YES`);
      expect(fs.existsSync(lockPath)).toBe(true); // Should not delete
    });
  });

  test('dry-run shows unlocked status when no lock exists', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
      const result = await sddForceUnlock.default.execute({ force: false }, {} as any);

      expect(result).toContain('Lock Artifact Found: NO');
    });
  });

  test('force unlock removes lock artifact', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = `${tmpDir}.lock`;
      fs.mkdirSync(lockPath);

      const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
      const result = await sddForceUnlock.default.execute({ force: true }, {} as any);

      expect(result).toContain('[FORCE UNLOCK]');
      expect(result).toContain('Lock artifact manually removed');
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  test('warns about corrupted state json', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = `${tmpDir}.lock`;
      // Create invalid state json
      const statePath = path.join(tmpDir, 'current_context.json');
      fs.writeFileSync(statePath, '{ invalid json');
      fs.mkdirSync(lockPath);

      const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
      const result = await sddForceUnlock.default.execute({ force: false }, {} as any);

      expect(result).toContain('State Integrity: CORRUPTED');
    });
  });
});

describe('sdd_force_unlock owner safety valve', () => {
  test('displays owner information when lock-info.json exists', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = `${tmpDir}.lock`;
      const internalLockPath = path.join(tmpDir, '.lock');
      const lockInfoPath = path.join(tmpDir, '.lock-info.json');

      // Create lock artifacts
      fs.mkdirSync(lockPath);
      fs.mkdirSync(internalLockPath);

      // Create lock info with current process info
      const lockInfo: LockInfo = {
        taskId: 'Task-Display',
        pid: process.pid,
        host: os.hostname(),
        startedAt: new Date().toISOString()
      };
      fs.writeFileSync(lockInfoPath, JSON.stringify(lockInfo, null, 2));

      const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
      const result = await sddForceUnlock.default.execute({ force: false }, {} as any);

      expect(result).toContain('## Owner情報');
      expect(result).toContain('Task ID: Task-Display');
      expect(result).toContain(`PID: ${process.pid}`);
      expect(result).toContain(`Host: ${os.hostname()}`);
    });
  });

  test('force unlock succeeds when owner matches', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = `${tmpDir}.lock`;
      const internalLockPath = path.join(tmpDir, '.lock');
      const lockInfoPath = path.join(tmpDir, '.lock-info.json');

      // Create lock artifacts with current process info
      fs.mkdirSync(lockPath);
      fs.mkdirSync(internalLockPath);

      const lockInfo: LockInfo = {
        taskId: 'Task-Match',
        pid: process.pid,
        host: os.hostname(),
        startedAt: new Date().toISOString()
      };
      fs.writeFileSync(lockInfoPath, JSON.stringify(lockInfo, null, 2));

      const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
      const result = await sddForceUnlock.default.execute({ force: true }, {} as any);

      expect(result).toContain('[FORCE UNLOCK]');
      expect(result).toContain('Owner Match: ✅ YES');
      expect(result).toContain('ロック強制解除が完了しました');
    });
  });

  test('force unlock is blocked and forced to dry-run when owner does not match', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = `${tmpDir}.lock`;
      const internalLockPath = path.join(tmpDir, '.lock');
      const lockInfoPath = path.join(tmpDir, '.lock-info.json');

      // Create lock artifacts with different process info
      fs.mkdirSync(lockPath);
      fs.mkdirSync(internalLockPath);

      const lockInfo: LockInfo = {
        taskId: 'Task-Mismatch',
        pid: 99999, // Different PID
        host: 'different-host',
        startedAt: new Date().toISOString()
      };
      fs.writeFileSync(lockInfoPath, JSON.stringify(lockInfo, null, 2));

      const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
      const result = await sddForceUnlock.default.execute({ force: true }, {} as any);

      expect(result).toContain('[OWNER MISMATCH - DRY-RUN強制]');
      expect(result).toContain('Owner Match: ❌ NO');
      expect(result).not.toContain('[FORCE UNLOCK]');
      expect(result).toContain('--force true --overrideOwner true');
      // Lock should NOT be removed
      expect(fs.existsSync(lockPath)).toBe(true);
    });
  });

  test('force unlock succeeds with overrideOwner when owner does not match', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const lockPath = `${tmpDir}.lock`;
      const internalLockPath = path.join(tmpDir, '.lock');
      const lockInfoPath = path.join(tmpDir, '.lock-info.json');

      // Create lock artifacts with different process info
      fs.mkdirSync(lockPath);
      fs.mkdirSync(internalLockPath);

      const lockInfo: LockInfo = {
        taskId: 'Task-Override',
        pid: 99999, // Different PID
        host: 'different-host',
        startedAt: new Date().toISOString()
      };
      fs.writeFileSync(lockInfoPath, JSON.stringify(lockInfo, null, 2));

      const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
      const result = await sddForceUnlock.default.execute({ force: true, overrideOwner: true }, {} as any);

      expect(result).toContain('[OVERRIDE WARNING]');
      expect(result).toContain('[FORCE UNLOCK]');
      expect(result).toContain('ロック強制解除が完了しました');
    });
  });
});
