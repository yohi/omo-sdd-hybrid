import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';
import fs from 'fs';

const WORKTREE_ROOT = process.cwd();

describe('path-utils', () => {
  describe('normalizeToRepoRelative', () => {
    test('converts absolute path to repo-relative path', async () => {
      const { normalizeToRepoRelative } = await import('../../.opencode/lib/path-utils');
      const absolutePath = path.join(WORKTREE_ROOT, 'src', 'a.ts');
      const result = normalizeToRepoRelative(absolutePath, WORKTREE_ROOT);
      expect(result).toBe('src/a.ts');
    });

    test('handles relative path input', async () => {
      const { normalizeToRepoRelative } = await import('../../.opencode/lib/path-utils');
      const result = normalizeToRepoRelative('src/auth/login.ts', WORKTREE_ROOT);
      expect(result).toBe('src/auth/login.ts');
    });

    test('normalizes path separators to POSIX', async () => {
      const { normalizeToRepoRelative } = await import('../../.opencode/lib/path-utils');
      const result = normalizeToRepoRelative(path.join('src', 'auth', 'login.ts'), WORKTREE_ROOT);
      expect(result).toBe('src/auth/login.ts');
    });
  });

  describe('isOutsideWorktree', () => {
    test('returns true for parent directory traversal', async () => {
      const { isOutsideWorktree } = await import('../../.opencode/lib/path-utils');
      const result = isOutsideWorktree('../secret.txt', WORKTREE_ROOT);
      expect(result).toBe(true);
    });

    test('returns false for path inside worktree', async () => {
      const { isOutsideWorktree } = await import('../../.opencode/lib/path-utils');
      const result = isOutsideWorktree('src/a.ts', WORKTREE_ROOT);
      expect(result).toBe(false);
    });

    test('returns false for nested path inside worktree', async () => {
      const { isOutsideWorktree } = await import('../../.opencode/lib/path-utils');
      const result = isOutsideWorktree('src/auth/deep/file.ts', WORKTREE_ROOT);
      expect(result).toBe(false);
    });
  });

  describe('getWorktreeRoot', () => {
    test('returns current directory for git repo', async () => {
      const { getWorktreeRoot } = await import('../../.opencode/lib/path-utils');
      const result = getWorktreeRoot();
      expect(result).toBe(WORKTREE_ROOT);
    });

    test('respects SDD_WORKTREE_ROOT environment variable', async () => {
      const { getWorktreeRoot } = await import('../../.opencode/lib/path-utils');
      const originalEnv = process.env.SDD_WORKTREE_ROOT;
      const mockRoot = '/tmp/mock-root';
      process.env.SDD_WORKTREE_ROOT = mockRoot;
      
      try {
        const result = getWorktreeRoot();
        expect(result).toBe(mockRoot);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.SDD_WORKTREE_ROOT;
        } else {
          process.env.SDD_WORKTREE_ROOT = originalEnv;
        }
      }
    });

    test('falls back to git logic if SDD_WORKTREE_ROOT is whitespace', async () => {
      const { getWorktreeRoot } = await import('../../.opencode/lib/path-utils');
      const originalEnv = process.env.SDD_WORKTREE_ROOT;
      process.env.SDD_WORKTREE_ROOT = '   ';
      
      try {
        const result = getWorktreeRoot();
        expect(result).toBe(WORKTREE_ROOT);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.SDD_WORKTREE_ROOT;
        } else {
          process.env.SDD_WORKTREE_ROOT = originalEnv;
        }
      }
    });
  });

  describe('isSymlink', () => {
    const symlinkPath = path.join(WORKTREE_ROOT, '__tests__', 'test-symlink');
    const regularFile = path.join(WORKTREE_ROOT, 'package.json');

    beforeAll(() => {
      try { fs.symlinkSync(regularFile, symlinkPath); } catch { /* noop */ }
    });

    afterAll(() => {
      try { fs.unlinkSync(symlinkPath); } catch { /* noop */ }
    });

    test('returns true for symlink', async () => {
      const { isSymlink } = await import('../../.opencode/lib/path-utils');
      if (fs.existsSync(symlinkPath)) {
        expect(isSymlink(symlinkPath)).toBe(true);
      }
    });

    test('returns false for regular file', async () => {
      const { isSymlink } = await import('../../.opencode/lib/path-utils');
      expect(isSymlink(regularFile)).toBe(false);
    });

    test('returns false for non-existent file', async () => {
      const { isSymlink } = await import('../../.opencode/lib/path-utils');
      expect(isSymlink('/nonexistent/path')).toBe(false);
    });
  });
});
