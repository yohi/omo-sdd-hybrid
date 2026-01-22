import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';

const TASKS_PATH = 'specs/tasks.md';
const ORIGINAL_CONTENT = fs.existsSync(TASKS_PATH) ? fs.readFileSync(TASKS_PATH, 'utf-8') : null;

describe('sdd_lint_tasks', () => {
  beforeEach(() => {
    if (!fs.existsSync('specs')) {
      fs.mkdirSync('specs', { recursive: true });
    }
  });

  afterEach(() => {
    if (ORIGINAL_CONTENT !== null) {
      fs.writeFileSync(TASKS_PATH, ORIGINAL_CONTENT);
    } else if (fs.existsSync(TASKS_PATH)) {
      fs.unlinkSync(TASKS_PATH);
    }
  });

  test('reports issues for malformed tasks', async () => {
    fs.writeFileSync(TASKS_PATH, `# Tasks

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
    fs.writeFileSync(TASKS_PATH, `# Tasks

* [ ] Task-1: First (Scope: \`src/a/**\`)
* [x] Task-2: Second (Scope: \`src/b/**\`)
`);

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('All tasks are valid');
  });

  test('returns error when tasks.md does not exist', async () => {
    if (fs.existsSync(TASKS_PATH)) {
      fs.unlinkSync(TASKS_PATH);
    }

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('見つかりません');
  });

  test('includes line numbers in report', async () => {
    fs.writeFileSync(TASKS_PATH, `# Tasks

* [ ] Task-1: Missing scope
`);

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toMatch(/行 \d+:/);
  });
});
