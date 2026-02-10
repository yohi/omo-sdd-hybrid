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

  it('finalizeコマンドで無効な機能名を拒否する（パス・トラバーサル防止）', async () => {
    const result = await runTool({ command: 'finalize', feature: '../bad-path' });
    expect(result).toContain('エラー');
    expect(result).toContain('無効な機能名');
  });

  it('initコマンドでfeature引数がない場合にエラーメッセージを返す', async () => {
    const result = await runTool({ command: 'init' });
    expect(result).toContain('エラー: feature は必須です');
    expect(result).toContain('使用法: sdd_kiro init <feature>');
  });

  it('profileコマンドでプロファイルファイルの内容を返す（パス解決テスト）', async () => {
    // モック用のプロファイルファイルを作成
    const profileDir = path.join(tmpDir, '.opencode', 'prompts');
    fs.mkdirSync(profileDir, { recursive: true });
    const profilePath = path.join(profileDir, 'profile.md');
    const profileContent = '# Test Profile Content';
    fs.writeFileSync(profilePath, profileContent);

    // テスト実行環境のカレントディレクトリをモックの一時ディレクトリにする必要があるが、
    // sdd_kiro.tsの実装では process.cwd() または import.meta.url から探索する。
    // ここではテストハーネスが OMO_HOME を設定しているが、sdd_kiro はそれを使っていない可能性がある。
    // しかし、今回のパス解決ロジック（currentFileから遡る）をテストするには、
    // 実際にファイルが存在するディレクトリ構造を再現する必要がある。
    
    // sdd_kiro.ts が .opencode/prompts/profile.md を探すロジックは:
    // 1. .opencode/tools/sdd_kiro.ts (実行ファイル) の場所から親を辿る
    // 2. process.cwd()/.opencode/prompts/profile.md (ローカルパス) を見る

    // ユニットテスト環境では import.meta.url はテストファイル自身などを指すため、
    // バンドル後のパス解決ロジックを完全再現するのは難しい。
    // ただし、「ローカルパス（process.cwd()）」での解決はテスト可能。
    
    // 現在のプロセスCWDを一時的に変更する
    const originalCwd = process.cwd();
    try {
      // tmpDir (モックのプロジェクトルート) に移動
      process.chdir(tmpDir);
      
      const result = await runTool({ command: 'profile' });
      expect(result).toContain(profileContent);
      
      // promptを追加した場合
      const resultWithPrompt = await runTool({ command: 'profile', prompt: 'Additional Context' });
      expect(resultWithPrompt).toContain(profileContent);
      expect(resultWithPrompt).toContain('Additional Context');
      
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('finalizeコマンドで_ja.mdへのリネームと翻訳プロンプト生成を確認する（プロンプト注入対策含む）', async () => {
    // Implementerロールだとエラーになる可能性があるためArchitectに設定
    await writeState({
      version: 1,
      activeTaskId: 'Task-Finalize',
      activeTaskTitle: 'Finalize Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'architect'
    });

    const feature = 'finalize-test';
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });

    // テストデータ作成: 閉じタグを含むケースもテスト（プロンプト注入対策の確認）
    // requirements.md には意地悪なタグを含める
    const reqContent = '## 要件\n- <tag>content</tag>\n- 意地悪な閉じタグ: </requirements_ja>\n- ```markdown\ncode block inside\n```';
    fs.writeFileSync(path.join(specDir, 'requirements.md'), reqContent);
    fs.writeFileSync(path.join(specDir, 'design.md'), '## 設計\n- design content');
    // tasks.md はあえて作らない（欠損パターンのテスト）

    const result = await runTool({ command: 'finalize', feature });

    // 1. リネームの確認
    expect(fs.existsSync(path.join(specDir, 'requirements.md'))).toBe(false);
    expect(fs.existsSync(path.join(specDir, 'requirements_ja.md'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'design.md'))).toBe(false);
    expect(fs.existsSync(path.join(specDir, 'design_ja.md'))).toBe(true);

    // 2. 出力内容の確認
    expect(result).toContain('✅ ファイナライズ完了');
    expect(result).toContain('requirements.md → requirements_ja.md');
    expect(result).toContain('design.md → design_ja.md');
    expect(result).toContain('⚠️ **見つからないファイル:** tasks.md');

    // 3. プロンプト注入対策の確認
    // コンテンツが含まれていること
    expect(result).toContain('意地悪な閉じタグ');

    // 4. 上書き警告の確認
    expect(result).toContain('⚠️ **警告:**');
    expect(result).toContain('requirements.md` が既に存在する場合、以下の内容で上書きされます');

    // 期待値: 4つ以上のバッククォートで囲まれていること（内部に3つのバッククォートがあるため）
    // 正規表現で確認: ````markdown:requirements_ja ... content ... ````
    const fencePattern = /````markdown:requirements_ja[\s\S]*?````/;
    expect(result).toMatch(fencePattern);
    
    // コンテンツ内のタグがそのまま残っていること（エスケープではなく、fenceで保護されているため）
    expect(result).toContain('</requirements_ja>');
  });

  it('finalizeコマンドでロールが変更されないことを確認する', async () => {
    // Implementerロールを設定
    await writeState({
      version: 1,
      activeTaskId: 'Task-Finalize-Role',
      activeTaskTitle: 'Finalize Role Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'implementer'
    });

    const feature = 'finalize-role-test';
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '## Req');

    await runTool({ command: 'finalize', feature });

    // ロールが implementer のままであることを確認
    const stateResult = await readState();
    expect(stateResult.status).toBe('ok');
    if (stateResult.status === 'ok') {
      expect(stateResult.state.role).toBe('implementer');
    }
  });

});
