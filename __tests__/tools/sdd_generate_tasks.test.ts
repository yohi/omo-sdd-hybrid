
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
    
    expect(result).toContain(`✅ tasks.md を生成しました: ${feature}`);
    
    const tasksPath = path.join(kiroDir, 'specs', feature, 'tasks.md');
    expect(fs.existsSync(tasksPath)).toBe(true);
    
    const content = fs.readFileSync(tasksPath, 'utf-8');
    expect(content).toContain('# Tasks');
    expect(content).toContain(`(Scope: \`src/...\`)`);
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
    
    expect(result).toContain(`✅ tasks.md を生成しました: ${feature}`);
    
    const content = fs.readFileSync(path.join(specDir, 'tasks.md'), 'utf-8');
    expect(content).not.toBe('OLD');
    expect(content).toContain('# Tasks');
  });

  it('不正なfeature名を拒否する', async () => {
    const result = await runTool({ feature: '../bad-path' });
    expect(result).toContain('無効な機能名');
  });
});
