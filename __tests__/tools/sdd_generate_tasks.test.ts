
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

const TOOL_PATH = '../../.opencode/tools/sdd_generate_tasks';

describe('sdd_generate_tasks', () => {
  let tmpDir: string;
  let kiroDir: string;

  beforeEach(() => {
    tmpDir = setupTestState();
    kiroDir = path.join(tmpDir, '.kiro');
    // setupTestState sets SDD_KIRO_DIR env var
  });

  afterEach(() => {
    cleanupTestState();
  });

  async function runTool(args: any) {
    const module = await import(TOOL_PATH);
    return module.default.execute(args, {});
  }

  function createSpecs(feature: string, reqContent: string | null = '', designContent: string | null = '') {
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    
    if (reqContent !== null) {
      fs.writeFileSync(path.join(specDir, 'requirements.md'), reqContent || '# Requirements\nSpec content');
    }
    if (designContent !== null) {
      fs.writeFileSync(path.join(specDir, 'design.md'), designContent || '# Design\nDesign content');
    }
    return specDir;
  }

  it('requirements.md と design.md から tasks.md を生成する', async () => {
    const feature = 'new-feature';
    createSpecs(feature);
    
    const result = await runTool({ feature });
    
    expect(result).toContain(`✅ tasks.md をスマート生成しました: ${feature}`);
    
    const tasksPath = path.join(kiroDir, 'specs', feature, 'tasks.md');
    expect(fs.existsSync(tasksPath)).toBe(true);
    
    const content = fs.readFileSync(tasksPath, 'utf-8');
    expect(content).toContain('# Tasks');
    expect(content).toContain(`${feature}-1: .gitignore の作成・更新`);
    expect(content).toContain('(Scope: `.gitignore`)');
    expect(content).toContain(`基本実装 (Scope: \`src/...\`)`);
  });

  it('requirements.md が欠落している場合はエラーになる', async () => {
    const feature = 'missing-req';
    createSpecs(feature, null, 'Design'); // req is null
    
    const result = await runTool({ feature });
    
    expect(result).toContain('エラー: 必要なファイルが見つかりません');
    expect(result).toContain('requirements.md');
  });

  it('design.md が欠落している場合はエラーになる', async () => {
    const feature = 'missing-design';
    createSpecs(feature, 'Req', null); // design is null
    
    const result = await runTool({ feature });
    
    expect(result).toContain('エラー: 必要なファイルが見つかりません');
    expect(result).toContain('design.md');
  });

  it('既存の tasks.md がある場合、overwrite=false なら上書きしない', async () => {
    const feature = 'existing-tasks';
    const specDir = createSpecs(feature);
    const oldContent = '# Tasks\nExisting';
    fs.writeFileSync(path.join(specDir, 'tasks.md'), oldContent);
    
    const result = await runTool({ feature }); // default overwrite=false
    
    expect(result).toContain('スキップ: tasks.md (既に存在します)');
    
    const content = fs.readFileSync(path.join(specDir, 'tasks.md'), 'utf-8');
    expect(content).toBe(oldContent);
  });

  it('overwrite=true なら既存の tasks.md を上書きする', async () => {
    const feature = 'overwrite-tasks';
    const specDir = createSpecs(feature);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), 'OLD');
    
    const result = await runTool({ feature, overwrite: true });
    
    expect(result).toContain(`✅ tasks.md をスマート生成しました: ${feature}`);
    
    const content = fs.readFileSync(path.join(specDir, 'tasks.md'), 'utf-8');
    expect(content).not.toBe('OLD');
    expect(content).toContain('# Tasks');
  });

  it('不正なfeature名を拒否する', async () => {
    const result = await runTool({ feature: '../bad-path' });
    expect(result).toContain('無効な機能名');
  });

  it('受入条件とコンポーネントからタスクを抽出する', async () => {
    const feature = 'smart-feature';
    const req = `## 受入条件
- ログインができること
- ログアウトができること
`;
    const design = `## コンポーネント
- LoginForm
- LogoutButton
`;
    createSpecs(feature, req, design);

    const result = await runTool({ feature });
    expect(result).toContain('✅ tasks.md をスマート生成しました: smart-feature (2 criteria, 2 components)');

    const tasksPath = path.join(kiroDir, 'specs', feature, 'tasks.md');
    const content = fs.readFileSync(tasksPath, 'utf-8');

    expect(content).toContain(`smart-feature-1: .gitignore の作成・更新`);
    expect(content).toContain(`(Scope: \`.gitignore\`)`);
    expect(content).toContain(`smart-feature-2: 実装: ログインができること (Scope: \`src/**\`, \`__tests__/**\`)`);
    expect(content).toContain(`smart-feature-3: 実装: ログアウトができること (Scope: \`src/**\`, \`__tests__/**\`)`);
    expect(content).toContain(`smart-feature-4: コンポーネント実装: LoginForm (Scope: \`src/**\`)`);
    expect(content).toContain(`smart-feature-5: コンポーネント実装: LogoutButton (Scope: \`src/**\`)`);
    expect(content).toContain(`smart-feature-6: ドキュメント更新 (Scope: \`.kiro/specs/smart-feature/**\`)`);
  });

  it('content が指定された場合、requirements.md なしでも tasks.md を生成する', async () => {
    const feature = 'custom-content';
    const customContent = '# Custom Tasks\n- Task 1';
    
    // requirements.md を作成しない
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });

    const result = await runTool({ feature, content: customContent });
    
    expect(result).toContain(`✅ tasks.md を生成しました: ${feature} (Custom content)`);
    
    const tasksPath = path.join(specDir, 'tasks.md');
    expect(fs.existsSync(tasksPath)).toBe(true);
    
    const content = fs.readFileSync(tasksPath, 'utf-8');
    expect(content).toBe(customContent);
  });

  it('content 指定 + overwrite=false + 既存ファイルあり → スキップ', async () => {
    const feature = 'custom-skip';
    const customContent = '# Custom Content';
    const oldContent = '# Old Content';
    
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'tasks.md'), oldContent);

    const result = await runTool({ feature, content: customContent, overwrite: false });
    
    expect(result).toContain('スキップ: tasks.md (既に存在します)');
    
    const content = fs.readFileSync(path.join(specDir, 'tasks.md'), 'utf-8');
    expect(content).toBe(oldContent);
  });

  it('content 指定 + overwrite=true + 既存ファイルあり → 上書き', async () => {
    const feature = 'custom-overwrite';
    const customContent = '# New Custom Content';
    const oldContent = '# Old Content';
    
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'tasks.md'), oldContent);

    const result = await runTool({ feature, content: customContent, overwrite: true });
    
    expect(result).toContain(`✅ tasks.md を生成しました: ${feature} (Custom content)`);
    
    const content = fs.readFileSync(path.join(specDir, 'tasks.md'), 'utf-8');
    expect(content).toBe(customContent);
  });
});
