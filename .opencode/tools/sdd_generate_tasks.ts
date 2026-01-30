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

export default tool({
  description: 'requirements.md と design.md から tasks.md を生成します',
  args: {
    feature: tool.schema.string().describe('機能名'),
    overwrite: tool.schema.boolean().optional().describe('既存の tasks.md を上書きするかどうか（デフォルト: false）')
  },
  async execute({ feature, overwrite }) {
    const baseDir = getKiroSpecsDir();
    
    let targetDir: string;
    try {
      targetDir = validateFeatureName(feature, baseDir);
    } catch (error: any) {
      return `エラー: ${error.message}`;
    }

    if (!fs.existsSync(targetDir)) {
       return `エラー: 機能ディレクトリが見つかりません (${targetDir})`;
    }

    const reqPath = path.join(targetDir, 'requirements.md');
    const designPath = path.join(targetDir, 'design.md');
    const tasksPath = path.join(targetDir, 'tasks.md');

    const missingFiles = [];
    if (!fs.existsSync(reqPath)) missingFiles.push('requirements.md');
    if (!fs.existsSync(designPath)) missingFiles.push('design.md');

    if (missingFiles.length > 0) {
      return `エラー: 必要なファイルが見つかりません: ${missingFiles.join(', ')}`;
    }

    if (fs.existsSync(tasksPath) && !overwrite) {
      return `スキップ: tasks.md (既に存在します)\n\n既存ファイルを上書きするには、引数 'overwrite: true' を指定してください。`;
    }

    // 簡易的な生成ロジック: テンプレートを使用
    // 将来的にはここで requirements.md や design.md を解析してタスクを抽出する可能性あり
    const tasksContent = `# Tasks

* [ ] ${feature}-1: 基本実装 (Scope: \`src/...\`)
* [ ] ${feature}-2: テスト実装 (Scope: \`__tests__/...\`)
* [ ] ${feature}-3: ドキュメント更新 (Scope: \`.kiro/specs/${feature}/**\`)
`;

    try {
      fs.writeFileSync(tasksPath, tasksContent, 'utf-8');
      return `✅ tasks.md を生成しました: ${feature}`;
    } catch (error: any) {
      return `エラー: tasks.md の書き込みに失敗しました (${error.message})`;
    }
  }
});
