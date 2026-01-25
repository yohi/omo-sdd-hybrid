import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStateDir } from '../../.opencode/lib/state-utils';

describe('sdd_force_unlock', () => {
  let stateDir: string;
  let lockPath: string;

  beforeEach(() => {
    stateDir = setupTestState();
    lockPath = path.join(stateDir, '.opencode/state.lock');
    // Note: stateDir is typically `/tmp/.../state`. 
    // proper-lockfile on `stateDir` creates `${stateDir}.lock` which is `/tmp/.../state.lock`.
    // Wait, setupTestState sets `SDD_STATE_DIR`. 
    // If SDD_STATE_DIR is `/tmp/x`, lockfile locks `/tmp/x`.
    // The lock path is `/tmp/x.lock`.
    // Let's adjust lockPath accordingly.
    
    // Actually, `lockStateDir` locks `getStateDir()`.
    // proper-lockfile default for dir `foo` is `foo.lock`.
    lockPath = `${stateDir}.lock`;
  });

  afterEach(() => {
    cleanupTestState();
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
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
