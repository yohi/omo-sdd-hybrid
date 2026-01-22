import { describe, test, expect } from 'bun:test';

describe('tasks-parser', () => {
  describe('parseTask', () => {
    test('parses task with backtick scopes', async () => {
      const { parseTask } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseTask('* [ ] Task-1: Title (Scope: `src/**`)');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('Task-1');
      expect(result!.title).toBe('Title');
      expect(result!.scopes).toEqual(['src/**']);
      expect(result!.done).toBe(false);
    });

    test('parses task with multiple backtick scopes', async () => {
      const { parseTask } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseTask('* [ ] Task-2: Auth (Scope: `src/auth/**`, `tests/auth/**`)');
      expect(result).not.toBeNull();
      expect(result!.scopes).toEqual(['src/auth/**', 'tests/auth/**']);
    });

    test('parses task without backticks (lenient mode)', async () => {
      const { parseTask } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseTask('* [ ] Task-3: Pay (Scope: src/pay/**, tests/pay/**)');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('Task-3');
      expect(result!.scopes).toEqual(['src/pay/**', 'tests/pay/**']);
    });

    test('parses completed task', async () => {
      const { parseTask } = await import('../../.opencode/lib/tasks-parser');
      
      const result = parseTask('* [x] Task-4: Done (Scope: `a/**`)');
      expect(result).not.toBeNull();
      expect(result!.done).toBe(true);
    });

    test('returns null for invalid format', async () => {
      const { parseTask } = await import('../../.opencode/lib/tasks-parser');
      
      expect(parseTask('not a task')).toBeNull();
      expect(parseTask('# Header')).toBeNull();
      expect(parseTask('')).toBeNull();
    });

    test('handles various TaskID formats', async () => {
      const { parseTask } = await import('../../.opencode/lib/tasks-parser');
      
      expect(parseTask('* [ ] PAY-12: Payment (Scope: `src/**`)')!.id).toBe('PAY-12');
      expect(parseTask('* [ ] Auth-1: Auth (Scope: `src/**`)')!.id).toBe('Auth-1');
      expect(parseTask('* [ ] T_ask-99: Test (Scope: `src/**`)')!.id).toBe('T_ask-99');
    });
  });

  describe('lintTaskLine', () => {
    test('returns null for valid task line', async () => {
      const { lintTaskLine } = await import('../../.opencode/lib/tasks-parser');
      
      expect(lintTaskLine('* [ ] Task-1: Title (Scope: `src/**`)')).toBeNull();
      expect(lintTaskLine('* [x] Task-2: Done (Scope: `a/**`, `b/**`)')).toBeNull();
    });

    test('detects missing-scope', async () => {
      const { lintTaskLine } = await import('../../.opencode/lib/tasks-parser');
      
      const result = lintTaskLine('* [ ] Task-1: Title');
      expect(result).toBe('missing-scope');
    });

    test('detects invalid-id', async () => {
      const { lintTaskLine } = await import('../../.opencode/lib/tasks-parser');
      
      const result = lintTaskLine('* [ ] invalid: Title (Scope: `src/**`)');
      expect(result).toBe('invalid-id');
    });

    test('detects missing-backticks', async () => {
      const { lintTaskLine } = await import('../../.opencode/lib/tasks-parser');
      
      const result = lintTaskLine('* [ ] Task-1: Title (Scope: src/**)');
      expect(result).toBe('missing-backticks');
    });

    test('detects invalid-format for malformed lines', async () => {
      const { lintTaskLine } = await import('../../.opencode/lib/tasks-parser');
      
      expect(lintTaskLine('* [ ]Task-1')).toBe('invalid-format');
      expect(lintTaskLine('*[ ] Task-1: Title (Scope: `src/**`)')).toBe('invalid-format');
    });

    test('returns null for non-task lines', async () => {
      const { lintTaskLine } = await import('../../.opencode/lib/tasks-parser');
      
      expect(lintTaskLine('# Header')).toBeNull();
      expect(lintTaskLine('')).toBeNull();
      expect(lintTaskLine('Some regular text')).toBeNull();
    });
  });

  describe('parseTasksFile', () => {
    test('parses multiple tasks from content', async () => {
      const { parseTasksFile } = await import('../../.opencode/lib/tasks-parser');
      
      const content = `# Tasks

* [ ] Task-1: First (Scope: \`src/a/**\`)
* [x] Task-2: Second (Scope: \`src/b/**\`)
* [ ] Task-3: Third (Scope: \`src/c/**\`)`;
      
      const tasks = parseTasksFile(content);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe('Task-1');
      expect(tasks[1].done).toBe(true);
      expect(tasks[2].id).toBe('Task-3');
    });

    test('skips empty lines and comments', async () => {
      const { parseTasksFile } = await import('../../.opencode/lib/tasks-parser');
      
      const content = `
# Header comment

* [ ] Task-1: Only (Scope: \`src/**\`)

# Another comment
`;
      
      const tasks = parseTasksFile(content);
      expect(tasks).toHaveLength(1);
    });

    test('preserves order', async () => {
      const { parseTasksFile } = await import('../../.opencode/lib/tasks-parser');
      
      const content = `* [ ] Z-1: Last (Scope: \`z/**\`)
* [ ] A-2: First (Scope: \`a/**\`)`;
      
      const tasks = parseTasksFile(content);
      expect(tasks[0].id).toBe('Z-1');
      expect(tasks[1].id).toBe('A-2');
    });
  });
});
