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

  test('validates correct task format', async () => {
    fs.writeFileSync(tasksPath, '# Tasks\n\n* [ ] Task-1: Test (Scope: `src/**`)\n');

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('✅ バリデーション完了');
    expect(result).toContain('すべてのタスクが正常です');
  });

  test('detects invalid task format', async () => {
    fs.writeFileSync(tasksPath, '# Tasks\n\n* [ ] Invalid format without scope\n');

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('❌ バリデーションエラー');
    expect(result).toContain('フォーマットエラー');
  });

  test('detects invalid TaskID format', async () => {
    fs.writeFileSync(tasksPath, '# Tasks\n\n* [ ] invalid-1: Test (Scope: `src/**`)\n');

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('❌ バリデーションエラー');
    expect(result).toContain('TaskID のフォーマットエラー');
  });

  test('detects empty scope', async () => {
    fs.writeFileSync(tasksPath, '# Tasks\n\n* [ ] Task-1: Test (Scope: ``)\n');

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('❌ バリデーションエラー');
    expect(result).toContain('Scope が空です');
  });

  test('validates multiple tasks', async () => {
    fs.writeFileSync(tasksPath, 
      '# Tasks\n\n' +
      '* [ ] Task-1: First (Scope: `src/**`)\n' +
      '* [x] KIRO-2: Second (Scope: `lib/**`)\n'
    );

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('✅ バリデーション完了');
  });

  test('returns error when tasks.md does not exist', async () => {
    if (fs.existsSync(tasksPath)) {
      fs.unlinkSync(tasksPath);
    }
    
    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('見つかりません');
  });

  test('ignores empty lines and headers', async () => {
    fs.writeFileSync(tasksPath,
      '# Tasks\n' +
      '\n' +
      '## Active\n' +
      '\n' +
      '* [ ] Task-1: Test (Scope: `src/**`)\n' +
      '\n' +
      '## Done\n' +
      '\n' +
      '* [x] Task-2: Done (Scope: `lib/**`)\n'
    );

    const sddLintTasks = await import('../../.opencode/tools/sdd_lint_tasks');
    const result = await sddLintTasks.default.execute({}, {} as any);

    expect(result).toContain('✅ バリデーション完了');
  });
});
