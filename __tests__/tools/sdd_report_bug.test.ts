import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { writeState } from '../../.opencode/lib/state-utils';
import fs from 'fs';
import path from 'path';

describe('sdd_report_bug', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('creates bug report file with valid content', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'implementer'
    });

    const sddReportBug = await import('../../.opencode/tools/sdd_report_bug');
    const result = await sddReportBug.default.execute({
      title: 'Login fails with 500 error',
      reproSteps: '1. Go to /login\n2. Enter valid credentials',
      expected: 'Redirect to dashboard',
      actual: 'Shows 500 page',
      logs: 'Error: Connection refused',
      impact: 'High',
      suggestion: 'Check DB connection'
    }, {} as any);

    expect(result).toContain('バグ票を作成しました');
    expect(result).toContain('Task-1');
    expect(result).toContain('Login fails with 500 error');

    const bugsDir = path.join(process.env.SDD_KIRO_DIR!, 'bugs');
    expect(fs.existsSync(bugsDir)).toBe(true);

    const files = fs.readdirSync(bugsDir);
    expect(files.length).toBe(1);
    
    // ファイル名チェック: bug-<timestamp>-<slug>.md
    // timestamp部分は可変なので正規表現で簡易チェック
    expect(files[0]).toMatch(/^bug-\d{4}-\d{2}-\d{2}T.*-login-fails-with-500-error\.md$/);

    const content = fs.readFileSync(path.join(bugsDir, files[0]), 'utf-8');
    expect(content).toContain('# Bug: Login fails with 500 error');
    expect(content).toContain('**Task ID**: Task-1');
    expect(content).toContain('## 概要\nLogin fails with 500 error');
    expect(content).toContain('## 再現手順\n1. Go to /login\n2. Enter valid credentials');
    expect(content).toContain('## 期待結果\nRedirect to dashboard');
    expect(content).toContain('## 実結果\nShows 500 page');
    expect(content).toContain('## ログ抜粋\n```text\nError: Connection refused\n```');
    expect(content).toContain('## 影響範囲\nHigh');
    expect(content).toContain('## 推奨修正案（推測）\nCheck DB connection');
  });

  test('handles optional arguments gracefully', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-2',
      activeTaskTitle: 'Another Task',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'architect' // architectも許可
    });

    const sddReportBug = await import('../../.opencode/tools/sdd_report_bug');
    const result = await sddReportBug.default.execute({
      title: 'Minimal bug report'
    }, {} as any);

    expect(result).toContain('バグ票を作成しました');
    
    const bugsDir = path.join(process.env.SDD_KIRO_DIR!, 'bugs');
    const files = fs.readdirSync(bugsDir);
    const content = fs.readFileSync(path.join(bugsDir, files[0]), 'utf-8');

    expect(content).toContain('# Bug: Minimal bug report');
    expect(content).toContain('## 再現手順\n(未記入)');
    expect(content).toContain('## 期待結果\n(未記入)');
    expect(content).toContain('## ログ抜粋\n```text\n(なし)\n```');
  });

  test('sanitizes filename correctly', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-3',
      activeTaskTitle: 'Task 3',
      allowedScopes: [],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: null // role: null も許可
    });

    const sddReportBug = await import('../../.opencode/tools/sdd_report_bug');
    await sddReportBug.default.execute({
      title: 'Unsafe / Name \\ : With @ Special & Chars!'
    }, {} as any);

    const bugsDir = path.join(process.env.SDD_KIRO_DIR!, 'bugs');
    const files = fs.readdirSync(bugsDir);
    
    // unsafe-name-with-special-chars
    expect(files[0]).toMatch(/.*-unsafe-name-with-special-chars\.md$/);
  });

  test('throws E_STATE_INVALID when state is broken', async () => {
    // 壊れたJSONを作成して corrupted 状態をシミュレート
    const statePath = path.join(process.env.SDD_STATE_DIR!, 'current_context.json');
    fs.writeFileSync(statePath, '{ "broken": json }');

    const sddReportBug = await import('../../.opencode/tools/sdd_report_bug');
    await expect(sddReportBug.default.execute({
      title: 'test'
    }, {} as any)).rejects.toThrow('E_STATE_INVALID');
  });
});
