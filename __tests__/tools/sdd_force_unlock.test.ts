import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStateDir, LockInfo } from '../../.opencode/lib/state-utils';

describe('sdd_force_unlock', () => {
  let stateDir: string;
  let lockPath: string;
  let internalLockPath: string;
  let lockInfoPath: string;

  beforeEach(() => {
    stateDir = setupTestState();
    lockPath = `${stateDir}.lock`;
    internalLockPath = path.join(stateDir, '.lock');
    lockInfoPath = path.join(stateDir, '.lock-info.json');
  });

  afterEach(() => {
    cleanupTestState();
    try {
      if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
      if (fs.existsSync(internalLockPath)) {
        fs.rmdirSync(internalLockPath);
      }
      if (fs.existsSync(lockInfoPath)) {
        fs.unlinkSync(lockInfoPath);
      }
    } catch {
    }
  });

  test('dry-run shows locked status when lock exists', async () => {
    // Create a fake lock directory (proper-lockfile style)
    fs.mkdirSync(lockPath);

    const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
    const result = await sddForceUnlock.default.execute({ force: false }, {} as any);

    expect(result).toContain('[DRY-RUN]');
    expect(result).toContain(`Lock Artifact Found: YES`);
    expect(fs.existsSync(lockPath)).toBe(true); // Should not delete
  });

  test('dry-run shows unlocked status when no lock exists', async () => {
    const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
    const result = await sddForceUnlock.default.execute({ force: false }, {} as any);

    expect(result).toContain('Lock Artifact Found: NO');
  });

  test('force unlock removes lock artifact', async () => {
    fs.mkdirSync(lockPath);

    const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
    const result = await sddForceUnlock.default.execute({ force: true }, {} as any);

    expect(result).toContain('[FORCE UNLOCK]');
    expect(result).toContain('Lock artifact manually removed');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('warns about corrupted state json', async () => {
    // Create invalid state json
    const statePath = path.join(stateDir, 'current_context.json');
    fs.writeFileSync(statePath, '{ invalid json');
    fs.mkdirSync(lockPath);

    const sddForceUnlock = await import('../../.opencode/tools/sdd_force_unlock');
    const result = await sddForceUnlock.default.execute({ force: false }, {} as any);

    expect(result).toContain('State Integrity: CORRUPTED');
  });
});

describe('sdd_force_unlock owner safety valve', () => {
  let stateDir: string;
  let lockPath: string;
  let internalLockPath: string;
  let lockInfoPath: string;

  beforeEach(() => {
    stateDir = setupTestState();
    lockPath = `${stateDir}.lock`;
    internalLockPath = path.join(stateDir, '.lock');
    lockInfoPath = path.join(stateDir, '.lock-info.json');
  });

  afterEach(() => {
    cleanupTestState();
    try {
      if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
      if (fs.existsSync(internalLockPath)) {
        fs.rmdirSync(internalLockPath);
      }
      if (fs.existsSync(lockInfoPath)) {
        fs.unlinkSync(lockInfoPath);
      }
    } catch {
    }
  });

  test('displays owner information when lock-info.json exists', async () => {
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

  test('force unlock succeeds when owner matches', async () => {
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

  test('force unlock is blocked and forced to dry-run when owner does not match', async () => {
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

  test('force unlock succeeds with overrideOwner when owner does not match', async () => {
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
