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

    const searchStr = `${feature} ${prompt || ''}`.toLowerCase();
    let designContent = `# Design: ${feature}

## アーキテクチャ概要
この機能の技術的な実現方針を記述します。

## コンポーネント設計
### Mermaid Diagram
\`\`\`mermaid
graph TD
    User -->|Action| ComponentA
    ComponentA -->|Call| ServiceB
\`\`\`
`;

    if (['api', 'endpoint', 'backend'].some(k => searchStr.includes(k))) {
      designContent += `
## API Endpoints
- エンドポイントの定義とリクエスト/レスポンス形式
`;
    }

    if (['ui', 'frontend', 'component', 'page'].some(k => searchStr.includes(k))) {
      designContent += `
## Component Structure
- UIコンポーネントの構成と階層構造
`;
    }

    if (['db', 'database', 'schema', 'model'].some(k => searchStr.includes(k))) {
      designContent += `
## Database Schema
- データモデル定義と永続化戦略
`;
    }

    designContent += `
## データ構造
- 主要なインターフェースや型定義

## 依存関係
- 外部APIやライブラリへの依存
`;

    const files = [
      {
        name: 'requirements.md',
        content: `# Requirements: ${feature}

## 概要
${prompt || 'この機能の目的と概要を記述してください。'}

## ユーザーストーリー
- **役割** <ユーザー>
- **やりたいこと** <アクション>
- **理由・メリット** <目的/価値>

## 受入条件 (EARS)
- **前提** <前提条件>
- **もし** <トリガー/操作>
- **ならば** <期待される結果>
`
      },
      {
        name: 'design.md',
        content: designContent
      },
      {
        name: 'tasks.md',
        content: `# Tasks

* [ ] ${feature}-1: 基本実装 (Scope: \`src/...\`)
* [ ] ${feature}-2: テスト実装 (Scope: \`__tests__/...\`)
`
      }
    ];

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
      return `✅ 仕様書の雛形を作成しました: ${feature}\n\n${results.join('\n')}`;
    } else if (skippedCount > 0) {
      return `⚠️ スキップされました: ${feature}\n\n${results.join('\n')}\n\n既存ファイルを上書きするには、引数 'overwrite: true' を指定してください。`;
    } else {
      return `エラー: ファイル生成に失敗しました\n\n${results.join('\n')}`;
    }
  }
});
