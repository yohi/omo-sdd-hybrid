import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

describe('sdd_lint_tasks', () => {
  let tasksPath: string;

  beforeEach(() => {
    setupTestState();
    tasksPath = process.env.SDD_TASKS_PATH!;
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('reports issues for malformed tasks', async () => {
    fs.writeFileSync(tasksPath, `# Tasks

* [ ] Task-1: Valid task (Scope: \`src/**\`)
* [ ] Task-2: Missing scope
* [ ] invalid: Bad ID (Scope: \`src/**\`)
* [ ] Task-3: No backticks (Scope: src/**)
`);

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('Task-2');
    expect(result).toContain('missing-scope');
    expect(result).toContain('invalid-id');
    expect(result).toContain('missing-backticks');
  });

  test('reports success for valid tasks', async () => {
    fs.writeFileSync(tasksPath, `# Tasks

* [ ] Task-1: First (Scope: \`src/a/**\`)
* [x] Task-2: Second (Scope: \`src/b/**\`)
`);

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('All tasks are valid');
  });

  test('returns error when tasks.md does not exist', async () => {
    
    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('見つかりません');
  });

  test('includes line numbers in report', async () => {
    fs.writeFileSync(tasksPath, `# Tasks

* [ ] Task-1: Missing scope
`);

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toMatch(/行 \d+:/);
  });
});
