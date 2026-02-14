import { tool } from '@opencode-ai/plugin';
import * as fs from 'fs';
import * as path from 'path';
import { loadSpecTemplate } from '../lib/kiro-utils';

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

export default tool({
  description: '機能仕様書の雛形（requirements.md, design.md, tasks.md）を生成します',
  args: {
    feature: tool.schema.string().describe('機能名（ディレクトリ名として使用。英字開始の英数字記号のみ）'),
    prompt: tool.schema.string().optional().describe('要件の概要や指示（requirements.mdに追記されます）'),
    overwrite: tool.schema.boolean().optional().describe('既存のファイルを上書きするかどうか（デフォルト: false）')
  },
  async execute({ feature, prompt, overwrite }) {
    const baseDir = getKiroSpecsDir();
    
    let targetDir: string;
    try {
      targetDir = validateFeatureName(feature, baseDir);
    } catch (error: any) {
      return `エラー: ${error.message}`;
    }

    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (error: any) {
        return `エラー: ディレクトリ作成に失敗しました (${error.message})`;
      }
    }

    const replacements = {
      FEATURE: feature,
      PROMPT: prompt || 'この機能の目的と概要を記述してください。'
    };

    function cleanupSpecContent(content: string): string {
      const earsPattern = /## 受入条件 \(EARS\)\n\n- \*\*前提\*\* <前提条件>\n- \*\*もし\*\* <[^>]+>\n- \*\*ならば\*\* <[^>]+> \n/g;
      return content.replace(earsPattern, '');
    }

    let files: { name: string; content: string }[];
    try {
      files = [
        {
          name: 'requirements.md',
          content: cleanupSpecContent(loadSpecTemplate('requirements.md', replacements))
        },
        {
          name: 'design.md',
          content: loadSpecTemplate('design.md', replacements)
        },
        {
          name: 'tasks.md',
          content: loadSpecTemplate('tasks.md', replacements)
        }
      ];
    } catch (error: any) {
      return `エラー: テンプレートの読み込みに失敗しました (${error.message})`;
    }

    const results: string[] = [];
    let skippedCount = 0;
    let createdCount = 0;

    for (const file of files) {
      const filePath = path.join(targetDir, file.name);
      
      if (fs.existsSync(filePath) && !overwrite) {
        results.push(`スキップ: ${file.name} (既に存在します)`);
        skippedCount++;
        continue;
      }

      try {
        fs.writeFileSync(filePath, file.content, 'utf-8');
        results.push(`作成: ${file.name}`);
        createdCount++;
      } catch (error: any) {
        results.push(`エラー: ${file.name} (${error.message})`);
      }
    }

    if (createdCount > 0) {
      return `✅ 仕様書の雛形を作成しました: ${feature}\n\n${results.join('\n')}\n\n---\n\n⚠️ **STOP & REVIEW (MUST)**:\n各仕様書を以下の順序で **個別に** ユーザーへ提示し、承認を得てください:\n1. \`requirements.md\` → ユーザーに内容を提示 → 承認を待つ → **STOP**\n2. \`design.md\` → ユーザーに内容を提示 → 承認を待つ → **STOP**\n3. \`tasks.md\` → ユーザーに内容を提示 → 承認を待つ → **STOP**\n\n**禁止**: ユーザーの承認なしに仕様書を編集・加工してはいけません。`;
    } else if (skippedCount > 0) {
      return `⚠️ スキップされました: ${feature}\n\n${results.join('\n')}\n\n既存ファイルを上書きするには、引数 'overwrite: true' を指定してください。`;
    } else {
      return `エラー: ファイル生成に失敗しました\n\n${results.join('\n')}`;
    }
  }
});

