import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { readState, writeState } from '../../.opencode/lib/state-utils';

const TOOL_PATH = '../../.opencode/tools/sdd_kiro';

describe('sdd_kiro', () => {
  let tmpDir: string;
  let kiroDir: string;

  beforeEach(() => {
    tmpDir = setupTestState();
    kiroDir = path.join(tmpDir, '.kiro');
    if (!fs.existsSync(path.join(kiroDir, 'specs'))) {
      fs.mkdirSync(path.join(kiroDir, 'specs'), { recursive: true });
    }
  });

  afterEach(() => {
    cleanupTestState();
  });

  async function runTool(args: any) {
    const module = await import(TOOL_PATH);
    return module.default.execute(args, {});
  }

  it('initコマンドで仕様書の雛形を作成する（Architectロールへの切り替えを確認）', async () => {
    // 初期の状態を作成（Implementerロール）
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

    const feature = 'auth-flow';
    const result = await runTool({ command: 'init', feature });

    expect(result).toContain(`✅ 仕様書の雛形を作成しました: ${feature}`);
    
    // ロールが architect に切り替わっているか確認
    const stateResult = await readState();
    expect(stateResult.status).toBe('ok');
    if (stateResult.status === 'ok') {
      expect(stateResult.state.role).toBe('architect');
    }

    const specDir = path.join(kiroDir, 'specs', feature);
    expect(fs.existsSync(path.join(specDir, 'requirements.md'))).toBe(true);
  });

  it('tasksコマンドでtasks.mdを生成する', async () => {
    const feature = 'task-gen';
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '## 受入条件\n- 条件1');
    fs.writeFileSync(path.join(specDir, 'design.md'), '## コンポーネント\n- コンポーネント1');

    const result = await runTool({ command: 'tasks', feature });
    expect(result).toContain(`✅ tasks.md をスマート生成しました: ${feature}`);
    expect(fs.existsSync(path.join(specDir, 'tasks.md'))).toBe(true);
  });

  it('implコマンドでImplementerロールに切り替える', async () => {
    // 初期の状態を作成（Architectロール）
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'architect'
    });

    const result = await runTool({ command: 'impl', feature: 'any' });
    expect(result).toContain('Implementer');

    const stateResult = await readState();
    expect(stateResult.status).toBe('ok');
    if (stateResult.status === 'ok') {
      expect(stateResult.state.role).toBe('implementer');
    }
  });

  it('requirements/designコマンドで個別ファイルを作成する', async () => {
    const feature = 'standalone';
    
    await runTool({ command: 'requirements', feature, prompt: 'Test Req' });
    expect(fs.existsSync(path.join(kiroDir, 'specs', feature, 'requirements.md'))).toBe(true);
    
    await runTool({ command: 'design', feature, prompt: 'Test Design' });
    expect(fs.existsSync(path.join(kiroDir, 'specs', feature, 'design.md'))).toBe(true);
  });

  it('無効な機能名を拒否する', async () => {
    const invalidInputs = [
      { feature: '', expected: 'feature は必須です' },
      { feature: 'Invalid Name', expected: '無効な機能名' },
      { feature: '../traversal', expected: '無効な機能名' },
    ];

    for (const { feature, expected } of invalidInputs) {
      const result = await runTool({ command: 'requirements', feature });
      expect(result).toContain(`エラー`);
      expect(result).toContain(expected);
    }
  });
});
