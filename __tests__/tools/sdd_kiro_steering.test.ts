import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { writeState } from '../../.opencode/lib/state-utils';

const TOOL_PATH = '../../.opencode/tools/sdd_kiro';

describe('sdd_kiro steering validation', () => {
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

  it('機能名が指定されていない場合はドキュメント一覧を表示する（既存動作）', async () => {
    const result = await runTool({ command: 'steering' });
    expect(result).toContain('ステアリングドキュメントは存在しません。');
  });

  it('有効な機能名の場合は更新を行う（既存動作）', async () => {
    const feature = 'valid-feature';
    const result = await runTool({ command: 'steering', feature, prompt: 'content' });
    
    expect(result).not.toContain('無効な機能名');
    expect(result).not.toContain('feature は必須です');
  });

  it('無効な機能名（スペース入り）を拒否する（新規動作）', async () => {
    const feature = 'Invalid Name';
    const result = await runTool({ command: 'steering', feature });
    expect(result).toContain('エラー: 無効な機能名');
  });

  it('無効な機能名（パストラバーサル）を拒否する（新規動作）', async () => {
    const feature = '../traversal';
    const result = await runTool({ command: 'steering', feature });
    expect(result).toContain('エラー: 無効な機能名');
  });
});
