
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

const TOOL_PATH = '../../.opencode/tools/sdd_scaffold_specs';

describe('sdd_scaffold_specs', () => {
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
    return module.default.execute(args, {
    });
  }

  it('指定されたfeature名のディレクトリと仕様書テンプレートを作成する', async () => {
    const feature = 'auth-flow';
    const result = await runTool({ feature });

    expect(result).toContain(`✅ 仕様書の雛形を作成しました: ${feature}`);

    const specDir = path.join(kiroDir, 'specs', feature);
    expect(fs.existsSync(specDir)).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'design.md'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'tasks.md'))).toBe(true);

    const reqContent = fs.readFileSync(path.join(specDir, 'requirements.md'), 'utf-8');
    expect(reqContent).toContain('# Requirements: auth-flow');
  });

  it('prompt引数が指定された場合、requirements.mdに反映される', async () => {
    const feature = 'user-profile';
    const prompt = 'ユーザーがアバター画像をアップロードできる機能';
    
    await runTool({ feature, prompt });

    const specDir = path.join(kiroDir, 'specs', feature);
    const reqContent = fs.readFileSync(path.join(specDir, 'requirements.md'), 'utf-8');
    
    expect(reqContent).toContain(prompt);
  });

  it('既存のファイルがある場合、デフォルトでは上書きしない', async () => {
    const feature = 'existing-feat';
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    
    const existingContent = 'Existing Content';
    fs.writeFileSync(path.join(specDir, 'requirements.md'), existingContent);
    fs.writeFileSync(path.join(specDir, 'design.md'), existingContent);
    fs.writeFileSync(path.join(specDir, 'tasks.md'), existingContent);

    const result = await runTool({ feature });

    expect(result).toContain('スキップ'); 
    
    const content = fs.readFileSync(path.join(specDir, 'requirements.md'), 'utf-8');
    expect(content).toBe(existingContent);
  });

  it('overwrite=true の場合、既存ファイルを上書きする', async () => {
    const feature = 'overwrite-feat';
    const specDir = path.join(kiroDir, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    
    fs.writeFileSync(path.join(specDir, 'requirements.md'), 'OLD');

    await runTool({ feature, overwrite: true });
    
    const content = fs.readFileSync(path.join(specDir, 'requirements.md'), 'utf-8');
    expect(content).not.toBe('OLD');
    expect(content).toContain('# Requirements');
  });

  it('パス・トラバーサル文字が含まれるfeature名を拒否する', async () => {
    const badFeatures = [
      '../hacker',
      'foo/../../bar',
      '/etc/passwd',
      'null\0byte'
    ];

    for (const feature of badFeatures) {
      const result = await runTool({ feature });
      expect(result).toContain('エラー');
      expect(result).toContain('無効な機能名');
    }
  });

  it('feature名に許可されない文字が含まれる場合を拒否する', async () => {
    const invalidFeatures = [
      'nested/feature',
      'back\\slash',
      '123numberstart',
      'space name',
      '日本語',
      '!',
    ];

    for (const feature of invalidFeatures) {
      const result = await runTool({ feature });
      expect(result).toContain('エラー');
      expect(result).toContain('無効な機能名');
    }
  });

  describe('Smart Template Selection', () => {
    it('API関連のキーワードが含まれる場合、API Endpointsセクションが追加される', async () => {
      const feature = 'user-api';
      await runTool({ feature });

      const specDir = path.join(kiroDir, 'specs', feature);
      const designContent = fs.readFileSync(path.join(specDir, 'design.md'), 'utf-8');
      
      expect(designContent).toContain('## API Endpoints');
      expect(designContent).toContain('- エンドポイントの定義とリクエスト/レスポンス形式');
    });

    it('UI関連のキーワードが含まれる場合、Component Structureセクションが追加される', async () => {
      const feature = 'login-page';
      await runTool({ feature });

      const specDir = path.join(kiroDir, 'specs', feature);
      const designContent = fs.readFileSync(path.join(specDir, 'design.md'), 'utf-8');
      
      expect(designContent).toContain('## Component Structure');
      expect(designContent).toContain('- UIコンポーネントの構成と階層構造');
    });

    it('DB関連のキーワードが含まれる場合、Database Schemaセクションが追加される', async () => {
      const feature = 'user-db';
      await runTool({ feature });

      const specDir = path.join(kiroDir, 'specs', feature);
      const designContent = fs.readFileSync(path.join(specDir, 'design.md'), 'utf-8');
      
      expect(designContent).toContain('## Database Schema');
      expect(designContent).toContain('- データモデル定義と永続化戦略');
    });

    it('promptに含まれるキーワードも考慮される', async () => {
      const feature = 'auth';
      const prompt = 'Implement backend for authentication';
      await runTool({ feature, prompt });

      const specDir = path.join(kiroDir, 'specs', feature);
      const designContent = fs.readFileSync(path.join(specDir, 'design.md'), 'utf-8');
      
      expect(designContent).toContain('## API Endpoints');
    });

    it('複数のキーワードが含まれる場合、複数のセクションが追加される', async () => {
      const feature = 'user-management';
      const prompt = 'Create UI and database schema for users';
      await runTool({ feature, prompt });

      const specDir = path.join(kiroDir, 'specs', feature);
      const designContent = fs.readFileSync(path.join(specDir, 'design.md'), 'utf-8');
      
      expect(designContent).toContain('## Component Structure');
      expect(designContent).toContain('## Database Schema');
    });
  });
});
