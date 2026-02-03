import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const WORKTREE_ROOT = process.cwd();
const TEST_ENV_NAME = `symlink-test-${Date.now()}`;
const INSIDE_DIR = path.join(WORKTREE_ROOT, '__tests__', 'lib', TEST_ENV_NAME);
let OUTSIDE_DIR: string;

describe('path-utils symlink security', () => {
  let isOutsideWorktree: typeof import('../../.opencode/lib/path-utils').isOutsideWorktree;
  let evaluateAccess: typeof import('../../.opencode/lib/access-policy').evaluateAccess;
  let evaluateMultiEdit: typeof import('../../.opencode/lib/access-policy').evaluateMultiEdit;

  beforeAll(async () => {
    // Load modules
    const pathUtilsModule = await import('../../.opencode/lib/path-utils');
    isOutsideWorktree = pathUtilsModule.isOutsideWorktree;
    
    const accessPolicyModule = await import('../../.opencode/lib/access-policy');
    evaluateAccess = accessPolicyModule.evaluateAccess;
    evaluateMultiEdit = accessPolicyModule.evaluateMultiEdit;

    // Setup directories
    try {
      if (!fs.existsSync(INSIDE_DIR)) {
        fs.mkdirSync(INSIDE_DIR, { recursive: true });
      }
      OUTSIDE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'omo-sdd-test-'));
      
      // Create a real file outside
      fs.writeFileSync(path.join(OUTSIDE_DIR, 'secret.txt'), 'secret data');
      
      // Create a real file inside
      fs.writeFileSync(path.join(INSIDE_DIR, 'normal.txt'), 'normal data');

    } catch (e) {
      console.error('Failed to setup test environment:', e);
    }
  });

  afterAll(() => {
    // Cleanup
    try {
      if (fs.existsSync(INSIDE_DIR)) {
        fs.rmSync(INSIDE_DIR, { recursive: true, force: true });
      }
      if (OUTSIDE_DIR && fs.existsSync(OUTSIDE_DIR)) {
        fs.rmSync(OUTSIDE_DIR, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Failed to cleanup test environment:', e);
    }
  });

  const createSymlinkSafe = (target: string, path: string) => {
    try {
      if (fs.existsSync(path)) fs.unlinkSync(path);
      fs.symlinkSync(target, path);
      return true;
    } catch (e) {
      return false;
    }
  };

  test('symlink inside worktree -> inside worktree (safe)', () => {
    const linkPath = path.join(INSIDE_DIR, 'link-to-normal.txt');
    const targetPath = path.join(INSIDE_DIR, 'normal.txt');
    
    if (!createSymlinkSafe(targetPath, linkPath)) {
      console.warn('Skipping symlink test due to permission/fs issues');
      return;
    }

    // Should be considered INSIDE worktree
    expect(isOutsideWorktree(linkPath, WORKTREE_ROOT)).toBe(false);
  });

  test('symlink inside worktree -> outside worktree (attack)', () => {
    if (!OUTSIDE_DIR) return; // Setup failed
    
    const linkPath = path.join(INSIDE_DIR, 'link-to-secret.txt');
    const targetPath = path.join(OUTSIDE_DIR, 'secret.txt');
    
    if (!createSymlinkSafe(targetPath, linkPath)) {
      console.warn('Skipping symlink test due to permission/fs issues');
      return;
    }

    // Should be considered OUTSIDE worktree because it resolves to outside
    expect(isOutsideWorktree(linkPath, WORKTREE_ROOT)).toBe(true);
  });

  test('broken symlink (points to nothing)', () => {
    const linkPath = path.join(INSIDE_DIR, 'link-broken.txt');
    const targetPath = path.join(INSIDE_DIR, 'does-not-exist.txt');
    
    if (!createSymlinkSafe(targetPath, linkPath)) {
      return;
    }

    // Behavior check: existing implementation falls back to path.resolve() on error
    // So it should be treated as a file at linkPath (which is inside worktree)
    // This confirms it doesn't crash and returns false (safe default for nonexistent target inside)
    expect(isOutsideWorktree(linkPath, WORKTREE_ROOT)).toBe(false);
  });

  test('evaluateAccess denies access to outside symlink', () => {
    if (!OUTSIDE_DIR) return;

    const linkPath = path.join(INSIDE_DIR, 'link-to-secret-2.txt');
    const targetPath = path.join(OUTSIDE_DIR, 'secret.txt');
    
    if (!createSymlinkSafe(targetPath, linkPath)) {
      return;
    }

    // Mock state
    const mockState = {
      status: 'ok' as const,
      state: {
        activeTaskId: 'task-1',
        allowedScopes: ['__tests__/lib/**'], // The symlink ITSELF is in scope
        role: 'implementer',
        lastActive: Date.now()
      }
    };

    // Even though the file path matches the allowed scope, 
    // it resolves to outside the worktree, so it should be denied by Rule3.
    const result = evaluateAccess(
      'write', 
      linkPath, 
      undefined, 
      mockState, 
      WORKTREE_ROOT, 
      'block'
    );

    expect(result.allowed).toBe(false);
    expect(result.rule).toBe('Rule3'); // Rule3 is OUTSIDE_WORKTREE
    expect(result.message).toContain('OUTSIDE_WORKTREE');
  });

  test('symlink directory inside -> outside (new file creation)', () => {
    if (!OUTSIDE_DIR) return;

    const linkPath = path.join(INSIDE_DIR, 'link-to-outside-dir');
    const targetPath = OUTSIDE_DIR; // The directory itself

    if (!createSymlinkSafe(targetPath, linkPath)) {
      console.warn('Skipping symlink test due to permission/fs issues');
      return;
    }

    // path inside the symlinked directory, file does not exist yet
    const newFilePath = path.join(linkPath, 'new-file.txt');

    // Should be considered OUTSIDE worktree
    expect(isOutsideWorktree(newFilePath, WORKTREE_ROOT)).toBe(true);
  });

  test('symlink directory inside -> outside (deep non-existent path)', () => {
    if (!OUTSIDE_DIR) return;

    const linkPath = path.join(INSIDE_DIR, 'link-to-outside-dir-deep');
    const targetPath = OUTSIDE_DIR;

    if (!createSymlinkSafe(targetPath, linkPath)) {
      console.warn('Skipping symlink test due to permission/fs issues');
      return;
    }

    const deepFilePath = path.join(linkPath, 'nested', 'deep', 'new-file.txt');

    // Should be considered OUTSIDE worktree
    expect(isOutsideWorktree(deepFilePath, WORKTREE_ROOT)).toBe(true);
  });

  test('symlink directory inside -> outside (deep non-existent directory path)', () => {
    if (!OUTSIDE_DIR) return;

    const linkPath = path.join(INSIDE_DIR, 'link-to-outside-dir-deep-2');
    const targetPath = OUTSIDE_DIR;

    if (!createSymlinkSafe(targetPath, linkPath)) {
      return;
    }

    const deepDirPath = path.join(linkPath, 'nested', 'deep', 'dir');
    
    expect(isOutsideWorktree(deepDirPath, WORKTREE_ROOT)).toBe(true);
  });

  test('fail closed (outside) when path resolution fails due to permission', () => {
    if (process.platform === 'win32') return; // Windows permissions differ
    if (!OUTSIDE_DIR) return;

    const lockedDir = path.join(OUTSIDE_DIR, 'locked-dir');
    if (!fs.existsSync(lockedDir)) {
      fs.mkdirSync(lockedDir);
    }
    fs.chmodSync(lockedDir, 0o000); // No access

    try {
      // Create a symlink inside worktree pointing to the locked directory
      const linkPath = path.join(INSIDE_DIR, 'link-to-locked');
      
      // If symlink already exists from previous run or retry, remove it
      try {
        fs.unlinkSync(linkPath);
      } catch {
        // Ignore error if file doesn't exist
      }

      try {
        fs.symlinkSync(lockedDir, linkPath);
      } catch (e) {
        console.warn('Skipping locked dir test due to symlink creation failure', e);
        return;
      }

      const filePath = path.join(linkPath, 'file.txt');

      // resolveRealPath should fail to trace parents inside lockedDir (EACCES)
      // and isOutsideWorktree should catch the error and return true (Fail Closed)
      expect(isOutsideWorktree(filePath, WORKTREE_ROOT)).toBe(true);

    } finally {
      // Restore permissions for cleanup
      if (fs.existsSync(lockedDir)) {
        fs.chmodSync(lockedDir, 0o777);
      }
    }
  });

  test('evaluateAccess denies write to new file in symlinked dir resolving outside', () => {
    if (!OUTSIDE_DIR) return;

    const linkPath = path.join(INSIDE_DIR, 'link-to-outside-dir-write');
    const targetPath = OUTSIDE_DIR;
    
    if (!createSymlinkSafe(targetPath, linkPath)) return;

    const newFilePath = path.join(linkPath, 'attack-write.txt');

    const mockState = {
      status: 'ok' as const,
      state: {
        activeTaskId: 'task-1',
        allowedScopes: ['__tests__/lib/**'], 
        role: 'implementer' as const,
        lastActive: Date.now()
      }
    };

    const result = evaluateAccess(
      'write', 
      newFilePath, 
      undefined, 
      mockState, 
      WORKTREE_ROOT, 
      'block'
    );

    expect(result.allowed).toBe(false);
    expect(result.rule).toBe('Rule3');
    expect(result.message).toContain('OUTSIDE_WORKTREE');
  });

  test('evaluateAccess denies edit to new file in symlinked dir resolving outside', () => {
    if (!OUTSIDE_DIR) return;

    const linkPath = path.join(INSIDE_DIR, 'link-to-outside-dir-edit');
    const targetPath = OUTSIDE_DIR;
    
    if (!createSymlinkSafe(targetPath, linkPath)) return;

    const newFilePath = path.join(linkPath, 'attack-edit.txt');

    const mockState = {
      status: 'ok' as const,
      state: {
        activeTaskId: 'task-1',
        allowedScopes: ['__tests__/lib/**'], 
        role: 'implementer' as const,
        lastActive: Date.now()
      }
    };

    const result = evaluateAccess(
      'edit', 
      newFilePath, 
      undefined, 
      mockState, 
      WORKTREE_ROOT, 
      'block'
    );

    expect(result.allowed).toBe(false);
    expect(result.rule).toBe('Rule3');
  });

  test('evaluateMultiEdit denies if any file resolves outside', () => {
    if (!OUTSIDE_DIR) return;

    const linkPath = path.join(INSIDE_DIR, 'link-to-outside-dir-multi');
    const targetPath = OUTSIDE_DIR;
    
    if (!createSymlinkSafe(targetPath, linkPath)) return;

    const safeFile = path.join(INSIDE_DIR, 'normal.txt');
    const attackFile = path.join(linkPath, 'attack-multi.txt');

    const mockState = {
      status: 'ok' as const,
      state: {
        activeTaskId: 'task-1',
        allowedScopes: ['__tests__/lib/**'], 
        role: 'implementer' as const,
        lastActive: Date.now()
      }
    };

    const result = evaluateMultiEdit(
      [{ filePath: safeFile }, { filePath: attackFile }],
      mockState,
      WORKTREE_ROOT,
      'block'
    );

    expect(result.allowed).toBe(false);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('OUTSIDE_WORKTREE');
  });
});
