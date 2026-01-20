import { describe, test, expect } from 'bun:test';

describe('glob-utils', () => {
  describe('matchesScope', () => {
    test('matches file in glob pattern', async () => {
      const { matchesScope } = await import('../../.opencode/lib/glob-utils');
      expect(matchesScope('src/auth/login.ts', ['src/auth/**'])).toBe(true);
    });

    test('does not match file outside glob pattern', async () => {
      const { matchesScope } = await import('../../.opencode/lib/glob-utils');
      expect(matchesScope('src/pay/x.ts', ['src/auth/**'])).toBe(false);
    });

    test('matches against multiple patterns', async () => {
      const { matchesScope } = await import('../../.opencode/lib/glob-utils');
      expect(matchesScope('tests/auth/test.ts', ['src/auth/**', 'tests/**'])).toBe(true);
    });

    test('returns false for empty scopes array', async () => {
      const { matchesScope } = await import('../../.opencode/lib/glob-utils');
      expect(matchesScope('specs/a.md', [])).toBe(false);
    });

    test('matches exact file pattern', async () => {
      const { matchesScope } = await import('../../.opencode/lib/glob-utils');
      expect(matchesScope('README.md', ['README.md'])).toBe(true);
    });

    test('handles dotfiles based on picomatch defaults', async () => {
      const { matchesScope } = await import('../../.opencode/lib/glob-utils');
      expect(matchesScope('.gitignore', ['*'])).toBe(false);
    });
  });
});
