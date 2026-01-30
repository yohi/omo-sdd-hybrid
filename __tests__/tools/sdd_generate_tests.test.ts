import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from 'fs';
import * as path from 'path';
import sddGenerateTests from '../../.opencode/tools/sdd_generate_tests';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

describe('sdd_generate_tests', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeEach(() => {
    tmpDir = setupTestState();
    outputDir = path.join(tmpDir, 'tests_output');
    process.env.SDD_TESTS_OUTPUT_DIR = outputDir;
  });

  afterEach(() => {
    cleanupTestState();
    delete process.env.SDD_TESTS_OUTPUT_DIR;
  });

  test('requirements.mdから受入条件を抽出してテストを生成する', async () => {
    const feature = 'auth-flow';
    const specDir = path.join(process.env.SDD_KIRO_DIR!, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });

    const reqContent = `
## 概要
Test

## 受入条件
- ログイン成功時にトークンが返る
* 無効なパスワードで401エラー
- パスワードリセット (メール送信)
`;
    fs.writeFileSync(path.join(specDir, 'requirements.md'), reqContent);

    const result = await sddGenerateTests.execute({ feature });

    expect(result).toContain('✅ テスト雛形を生成しました');
    expect(result).toContain('抽出された受入条件: 3件');

    const expectedOutputPath = path.join(outputDir, `${feature}.acceptance.test.ts`);
    expect(fs.existsSync(expectedOutputPath)).toBe(true);

    const content = fs.readFileSync(expectedOutputPath, 'utf-8');
    expect(content).toContain(`describe('Acceptance: ${feature}'`);
    expect(content).toContain("test.todo('ログイン成功時にトークンが返る')");
    expect(content).toContain("test.todo('無効なパスワードで401エラー')");
    expect(content).toContain("test.todo('パスワードリセット (メール送信)')");
  });

  test('受入条件がない場合は単一のTODOを生成する', async () => {
    const feature = 'empty-req';
    const specDir = path.join(process.env.SDD_KIRO_DIR!, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '# Title\nNo criteria here.');

    const result = await sddGenerateTests.execute({ feature });

    expect(result).toContain('✅ テスト雛形を生成しました');
    expect(result).toContain('抽出された受入条件: 0件');

    const content = fs.readFileSync(path.join(outputDir, `${feature}.acceptance.test.ts`), 'utf-8');
    expect(content).toContain("test.todo('受入条件が requirements.md に見つかりません')");
  });

  test('機能名が無効な場合はエラー', async () => {
    const result = await sddGenerateTests.execute({ feature: '../invalid' });
    expect(result).toContain('エラー: 無効な機能名');
  });

  test('requirements.mdが存在しない場合はエラー', async () => {
    const feature = 'missing-file';
    const specDir = path.join(process.env.SDD_KIRO_DIR!, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });

    const result = await sddGenerateTests.execute({ feature });
    expect(result).toContain('エラー: requirements.md が見つかりません');
  });

  test('既存のテストファイルがある場合はスキップする', async () => {
    const feature = 'skip-existing';
    const specDir = path.join(process.env.SDD_KIRO_DIR!, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '## 受入条件\n- Item 1');

    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${feature}.acceptance.test.ts`);
    fs.writeFileSync(outputPath, 'existing content');

    const result = await sddGenerateTests.execute({ feature });
    expect(result).toContain('スキップ: テストファイルは既に存在します');
    expect(fs.readFileSync(outputPath, 'utf-8')).toBe('existing content');
  });

  test('overwrite=trueで既存ファイルを上書きする', async () => {
    const feature = 'overwrite-existing';
    const specDir = path.join(process.env.SDD_KIRO_DIR!, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '## 受入条件\n- New Item');

    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${feature}.acceptance.test.ts`);
    fs.writeFileSync(outputPath, 'old content');

    const result = await sddGenerateTests.execute({ feature, overwrite: true });
    expect(result).toContain('✅ テスト雛形を生成しました');
    
    const content = fs.readFileSync(outputPath, 'utf-8');
    expect(content).toContain("test.todo('New Item')");
  });
});
