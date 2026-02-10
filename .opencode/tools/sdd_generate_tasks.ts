import { tool } from '@opencode-ai/plugin';
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
  const relative = path.relative(baseDir, resolvedPath);
  
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
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
        const c = trimmed.substring(2).trim();
        if (c) criteria.push(c);
      }
    }
  }
  return criteria;
}

function extractComponents(content: string): string[] {
  const lines = content.split('\n');
  const components: string[] = [];
  let inSection = false;

  const sectionHeaderRegex = /^##\s+コンポーネント/;
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
        const c = trimmed.substring(2).trim();
        if (c) components.push(c);
      }
    }
  }
  return components;
}

export default tool({
  description: 'requirements.md と design.md から tasks.md を生成します',
  args: {
    feature: tool.schema.string().describe('機能名'),
    overwrite: tool.schema.boolean().optional().describe('既存の tasks.md を上書きするかどうか（デフォルト: false）'),
    content: tool.schema.string().optional().describe('タスクファイルの内容（指定された場合は自動生成をスキップしてこの内容を書き込みます）')
  },
  async execute({ feature, overwrite, content }) {
    const baseDir = getKiroSpecsDir();
    
    let targetDir: string;
    try {
      targetDir = validateFeatureName(feature, baseDir);
    } catch (error: any) {
      return `エラー: ${error.message}`;
    }

    const tasksPath = path.join(targetDir, 'tasks.md');

    // content が提供されている場合は、requirements.md/design.md のチェックをスキップして直接書き込む
    if (content && content.trim() !== '') {
      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
      } catch (error: any) {
        return `エラー: ディレクトリ作成に失敗しました (${error.message})`;
      }

      if (fs.existsSync(tasksPath) && !overwrite) {
        return `スキップ: tasks.md (既に存在します)\n\n既存ファイルを上書きするには、引数 'overwrite: true' を指定してください。`;
      }

      try {
        fs.writeFileSync(tasksPath, content, 'utf-8');
        return `✅ tasks.md を生成しました: ${feature} (Custom content)`;
      } catch (error: any) {
        return `エラー: tasks.md の書き込みに失敗しました (${error.message})`;
      }
    }

    if (!fs.existsSync(targetDir)) {
       return `エラー: 機能ディレクトリが見つかりません (${targetDir})`;
    }

    const reqPath = path.join(targetDir, 'requirements.md');
    const designPath = path.join(targetDir, 'design.md');

    const missingFiles: string[] = [];
    if (!fs.existsSync(reqPath)) missingFiles.push('requirements.md');
    if (!fs.existsSync(designPath)) missingFiles.push('design.md');

    if (missingFiles.length > 0) {
      return `エラー: 必要なファイルが見つかりません: ${missingFiles.join(', ')}`;
    }

    if (fs.existsSync(tasksPath) && !overwrite) {
      return `スキップ: tasks.md (既に存在します)\n\n既存ファイルを上書きするには、引数 'overwrite: true' を指定してください。`;
    }

    let reqContent = '';
    let designContent = '';
    try {
      reqContent = fs.readFileSync(reqPath, 'utf-8');
      designContent = fs.readFileSync(designPath, 'utf-8');
    } catch (error: any) {
      return `エラー: ファイルの読み込みに失敗しました (${error.message})`;
    }

    const criteria = extractAcceptanceCriteria(reqContent);
    const components = extractComponents(designContent);

    let tasksContent = `# Tasks\n\n`;
    let taskCount = 1;

    // プロジェクト初期化タスク: .gitignore の作成・更新を常に最初に配置
    tasksContent += `* [ ] ${feature}-${taskCount++}: .gitignore の作成・更新 (Scope: \`.gitignore\`)\n`;

    if (criteria.length > 0) {
      for (const c of criteria) {
        tasksContent += `* [ ] ${feature}-${taskCount++}: 実装: ${c} (Scope: \`src/**\`, \`__tests__/**\`)\n`;
      }
    }

    if (components.length > 0) {
      for (const comp of components) {
        tasksContent += `* [ ] ${feature}-${taskCount++}: コンポーネント実装: ${comp} (Scope: \`src/**\`)\n`;
      }
    }

    if (criteria.length === 0 && components.length === 0) {
      tasksContent += `* [ ] ${feature}-${taskCount++}: 基本実装 (Scope: \`src/...\`)\n`;
      tasksContent += `* [ ] ${feature}-${taskCount++}: テスト実装 (Scope: \`__tests__/...\`)\n`;
    }

    tasksContent += `* [ ] ${feature}-${taskCount++}: ドキュメント更新 (Scope: \`.kiro/specs/${feature}/**\`)\n`;

    try {
      fs.writeFileSync(tasksPath, tasksContent, 'utf-8');
      return `✅ tasks.md をスマート生成しました: ${feature} (${criteria.length} criteria, ${components.length} components)`;
    } catch (error: any) {
      return `エラー: tasks.md の書き込みに失敗しました (${error.message})`;
    }
  }
});
