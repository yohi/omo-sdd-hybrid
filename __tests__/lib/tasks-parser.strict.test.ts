import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

describe('tasks-parser strict mode', () => {
  const originalEnv = process.env.SDD_SCOPE_FORMAT;
  
  beforeEach(() => {
    process.env.SDD_SCOPE_FORMAT = 'strict';
  });
  
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SDD_SCOPE_FORMAT;
    } else {
      process.env.SDD_SCOPE_FORMAT = originalEnv;
    }
  });

  describe('parseScopes in strict mode', () => {
    test('parses backtick scopes normally', async () => {
      const { parseScopes } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseScopes('`src/**`', 'strict');
      expect(result).toEqual(['src/**']);
    });

    test('parses multiple backtick scopes', async () => {
      const { parseScopes } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseScopes('`src/auth/**`, `tests/auth/**`', 'strict');
      expect(result).toEqual(['src/auth/**', 'tests/auth/**']);
    });

    test('throws ScopeFormatError for non-backtick scope', async () => {
      const { parseScopes, ScopeFormatError } = await import('../../.opencode/lib/tasks-parser');
      
      expect(() => parseScopes('src/**', 'strict')).toThrow(ScopeFormatError);
    });

    test('throws ScopeFormatError with helpful message', async () => {
      const { parseScopes, ScopeFormatError } = await import('../../.opencode/lib/tasks-parser');
      
      try {
        parseScopes('src/pay/**', 'strict');
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(ScopeFormatError);
        expect((e as Error).message).toContain('E_SCOPE_FORMAT');
        expect((e as Error).message).toContain('src/pay/**');
      }
    });

    test('throws for comma-separated non-backtick scopes', async () => {
      const { parseScopes, ScopeFormatError } = await import('../../.opencode/lib/tasks-parser');
      
      expect(() => parseScopes('src/a/**, src/b/**', 'strict')).toThrow(ScopeFormatError);
    });
  });

  describe('parseScopes in lenient mode (default)', () => {
    test('allows non-backtick scopes with lenient', async () => {
      const { parseScopes } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseScopes('src/**', 'lenient');
      expect(result).toEqual(['src/**']);
    });

    test('parses comma-separated scopes in lenient mode', async () => {
      const { parseScopes } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseScopes('src/a/**, src/b/**', 'lenient');
      expect(result).toEqual(['src/a/**', 'src/b/**']);
    });

    test('defaults to lenient when no mode specified', async () => {
      delete process.env.SDD_SCOPE_FORMAT;
      const { parseScopes } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseScopes('src/**');
      expect(result).toEqual(['src/**']);
    });
  });

  describe('parseTask with strict mode', () => {
    test('parses task with backtick scopes in strict mode', async () => {
      const { parseTask } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseTask('* [ ] Task-1: Title (Scope: `src/**`)', 'strict');
      expect(result).not.toBeNull();
      expect(result!.scopes).toEqual(['src/**']);
    });

    test('throws for task without backtick scopes in strict mode', async () => {
      const { parseTask, ScopeFormatError } = await import('../../.opencode/lib/tasks-parser');
      
      expect(() => parseTask('* [ ] Task-1: Title (Scope: src/**)', 'strict')).toThrow(ScopeFormatError);
    });
  });

  describe('environment variable SDD_SCOPE_FORMAT', () => {
    test('getScopeFormat returns strict when env is strict', async () => {
      process.env.SDD_SCOPE_FORMAT = 'strict';
      const { getScopeFormat } = await import('../../.opencode/lib/tasks-parser');
      
      expect(getScopeFormat()).toBe('strict');
    });

    test('getScopeFormat returns lenient when env is not strict', async () => {
      process.env.SDD_SCOPE_FORMAT = 'lenient';
      const { getScopeFormat } = await import('../../.opencode/lib/tasks-parser');
      
      expect(getScopeFormat()).toBe('lenient');
    });

    test('getScopeFormat defaults to lenient when env not set', async () => {
      delete process.env.SDD_SCOPE_FORMAT;
      const { getScopeFormat } = await import('../../.opencode/lib/tasks-parser');
      
      expect(getScopeFormat()).toBe('lenient');
    });
  });
});
