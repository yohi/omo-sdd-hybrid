import { describe, test, expect } from 'bun:test';
import path from 'path';

const isWindows = process.platform === 'win32';

describe('Windows Path Compatibility', () => {

  describe('matchesScope (Case Sensitivity)', () => {
    test.skipIf(!isWindows)('ignores case on Windows', async () => {
      const { matchesScope } = await import('../../.opencode/lib/glob-utils');
      expect(matchesScope('src/Auth.ts', ['src/auth.ts'])).toBe(true);
      expect(matchesScope('SRC/AUTH/LOGIN.TS', ['src/auth/**'])).toBe(true);
    });

    test.skipIf(isWindows)('respects case on non-Windows', async () => {
      const { matchesScope } = await import('../../.opencode/lib/glob-utils');
      expect(matchesScope('src/Auth.ts', ['src/auth.ts'])).toBe(false);
      expect(matchesScope('SRC/AUTH/LOGIN.TS', ['src/auth/**'])).toBe(false);
      expect(matchesScope('src/auth/login.ts', ['src/auth/**'])).toBe(true);
    });
  });

  describe('normalizeToRepoRelative', () => {
    test.skipIf(!isWindows)('normalizes backslashes to forward slashes on Windows', async () => {
      const { normalizeToRepoRelative } = await import('../../.opencode/lib/path-utils');
      // This test assumes running on Windows where path.sep is '\'
      // We construct a path that would produce backslashes on Windows
      const worktree = process.cwd();
      const target = path.join(worktree, 'src', 'file.ts');
      
      const result = normalizeToRepoRelative(target, worktree);
      expect(result).toBe('src/file.ts');
      expect(result).not.toContain('\\');
    });
  });

  describe('isOutsideWorktree (UNC Paths)', () => {
    test.skipIf(!isWindows)('treats UNC paths as outside worktree', async () => {
      const { isOutsideWorktree } = await import('../../.opencode/lib/path-utils');
      const worktree = 'C:\\Projects\\Repo';
      const uncPath = '\\\\server\\share\\file.ts';
      expect(isOutsideWorktree(uncPath, worktree)).toBe(true);
    });
  });
});
