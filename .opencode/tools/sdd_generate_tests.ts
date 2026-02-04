import { tool } from '../lib/plugin-stub';
import * as fs from 'fs';
import * as path from 'path';

function getKiroSpecsDir() {
  const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
  return path.resolve(kiroDir, 'specs');
}

function validateFeatureName(feature: string, baseDir: string) {
  if (!feature || feature.trim() === '') {
    throw new Error('無効な機能名: feature は必須です');
  }

  const validPattern = /^[A-Za-z][A-Za-z0-9._-]*$/;
  if (!validPattern.test(feature)) {
    throw new Error('無効な機能名: 半角英字で始まり、英数字・ドット・アンダースコア・ハイフンのみ使用可能です');
  }

  const resolvedPath = path.resolve(baseDir, feature);

  if (!resolvedPath.startsWith(baseDir)) {
    throw new Error('無効な機能名: パストラバーサルが検出されました');
  }

  return resolvedPath;
}

function extractAcceptanceCriteria(content: string): string[] {
  const lines = content.split('\n');
  const criteria: string[] = [];
  let inSection = false;

  const sectionHeaderRegex = /^##\s+受入条件/;
  const nextSectionRegex = /^##\s+/;

  for (const line of lines) {
    if (sectionHeaderRegex.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection) {
      if (nextSectionRegex.test(line)) {
        break;
      }
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        criteria.push(trimmed.substring(2).trim());
      }
    }
  }
  return criteria;
}

export default tool({
  description: 'requirements.md の受入条件からテストコードの雛形を生成します',
  args: {
    feature: tool.schema.string().describe('機能名（ディレクトリ名として使用）'),
    overwrite: tool.schema.boolean().optional().describe('既存のファイルを上書きするかどうか（デフォルト: false）')
  },
  async execute({ feature, overwrite }) {
    const baseDir = getKiroSpecsDir();

    let specDir: string;
    try {
      specDir = validateFeatureName(feature, baseDir);
    } catch (error: any) {
      return `エラー: ${error.message}`;
    }

    if (!fs.existsSync(specDir)) {
      return `エラー: 機能ディレクトリが見つかりません (${specDir})`;
    }

    const reqPath = path.join(specDir, 'requirements.md');
    if (!fs.existsSync(reqPath)) {
      return `エラー: requirements.md が見つかりません (${reqPath})`;
    }

    let outputDir: string;
    if (process.env.SDD_TESTS_OUTPUT_DIR) {
      outputDir = process.env.SDD_TESTS_OUTPUT_DIR;
    } else {
      outputDir = path.resolve(process.cwd(), '__tests__', 'generated');
    }

    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch (error: any) {
        return `エラー: 出力ディレクトリの作成に失敗しました (${error.message})`;
      }
    }

    const outputFilePath = path.join(outputDir, `${feature}.acceptance.test.ts`);

    if (fs.existsSync(outputFilePath) && !overwrite) {
      return `スキップ: テストファイルは既に存在します (${outputFilePath})\n\n上書きするには、引数 'overwrite: true' を指定してください。`;
    }

    let reqContent = '';
    try {
      reqContent = fs.readFileSync(reqPath, 'utf-8');
    } catch (error: any) {
      return `エラー: requirements.md の読み込みに失敗しました (${error.message})`;
    }

    const criteria = extractAcceptanceCriteria(reqContent);
    const hasCriteria = criteria.length > 0;

    // package.json からテストフレームワークを検出
    let testFramework = 'bun:test';
    try {
      const packageJsonPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
        if (deps['vitest']) {
          testFramework = 'vitest';
        } else if (deps['jest']) {
          testFramework = 'jest';
        }
      }
    } catch (e) {
      // 読み込み失敗時はデフォルト (bun:test) を使用
    }

    const testContent = `import { describe, test } from "${testFramework}";

describe('Acceptance: ${JSON.stringify(feature).slice(1, -1)}', () => {
${hasCriteria
        ? criteria.map(c => `  test.todo(${JSON.stringify(c)});`).join('\n')
        : "  test.todo('受入条件が requirements.md に見つかりません');"
      }
});
`;

    try {
      fs.writeFileSync(outputFilePath, testContent, 'utf-8');
      return `✅ テスト雛形を生成しました: ${outputFilePath}\n\n抽出された受入条件: ${criteria.length}件`;
    } catch (error: any) {
      return `エラー: テストファイルの書き込みに失敗しました (${error.message})`;
    }
  }
});
