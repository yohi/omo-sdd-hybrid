import { tool } from '../lib/plugin-stub';
import { readState, writeState } from '../lib/state-utils';
import { updateSteeringDoc, listSteeringDocs } from '../lib/kiro-utils';
import * as fs from 'fs';
import * as path from 'path';

// 既存のツール実装をインポート（内部的に execute を呼ぶため）
import scaffoldSpecs from './sdd_scaffold_specs';
import generateTasks from './sdd_generate_tasks';
import validateDesign from './sdd_validate_design';

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
  description: 'Kiro互換コマンドの統合エントリーポイント。自動で適切なロール（Architect/Implementer）に切り替えて実行します。',
  args: {
    command: tool.schema.enum(['init', 'requirements', 'design', 'tasks', 'impl', 'steering', 'validate-design', 'profile']).describe('実行するKiroコマンド'),
    feature: tool.schema.string().optional().describe('対象の機能名'),
    prompt: tool.schema.string().optional().describe('追加の指示や要件（init等で使用）'),
    promptFile: tool.schema.string().optional().describe('プロンプトとして読み込むファイルのパス'),
    overwrite: tool.schema.boolean().optional().describe('既存ファイルを上書きするかどうか')
  },
  async execute({ command, feature, prompt, promptFile, overwrite }) {
    // 0. プロンプトの準備
    let finalPrompt = prompt || '';
    if (promptFile) {
      const resolvedPromptFile = path.resolve(process.cwd(), promptFile);
      
      // パストラバーサル対策: プロジェクトルート外へのアクセスを禁止
      const rel = path.relative(process.cwd(), resolvedPromptFile);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return `エラー: 不正なファイルパスです。プロジェクトルート内のファイルを指定してください: ${promptFile}`;
      }

      if (!fs.existsSync(resolvedPromptFile)) {
        return `エラー: プロンプトファイルが見つかりません: ${promptFile}`;
      }
      const fileContent = fs.readFileSync(resolvedPromptFile, 'utf-8');
      finalPrompt = (finalPrompt ? finalPrompt + '\n\n' : '') + fileContent;
    }

    // 1. ロールの判定
    const requiredRole = (command === 'impl') ? 'implementer' : 'architect';

    // 2. 現在の状態を確認し、必要ならロールを切り替える
    const stateResult = await readState();
    if (stateResult.status === 'ok' || stateResult.status === 'recovered') {
      const currentState = stateResult.state;
      if (currentState.role !== requiredRole) {
        // ロールを更新して書き戻す
        await writeState({
          ...currentState,
          role: requiredRole
        });
      }
    } else {
      // タスクが開始されていない場合は、ロール切り替えは行わず（状態がないため）
      // そのまま続行するか、エラーにするかはコマンドの性質に依存する
      // ここでは仕様書生成などはタスク外でも許可されるべき（Architectの仕事）
    }

    // 3. コマンドの振り分け実行
    switch (command) {
      case 'steering': {
        if (feature) {
          const baseDir = getKiroSpecsDir();
          try {
            validateFeatureName(feature, baseDir);
          } catch (error: any) {
            return `エラー: ${error.message}`;
          }
        }

        if (!feature) {
          const docs = listSteeringDocs();
          if (docs.length === 0) {
            return 'ステアリングドキュメントは存在しません。';
          }
          return `利用可能なステアリングドキュメント:\n${docs.map(d => `- ${d}`).join('\n')}`;
        }
        
        const content = finalPrompt || `# ${feature}\n\n詳細をここに記述してください。`;
        if (updateSteeringDoc(feature, content)) {
          return `✅ ステアリングドキュメント '${feature}' を更新しました。`;
        } else {
          return `エラー: ステアリングドキュメント '${feature}' の更新に失敗しました。`;
        }
      }

      case 'init':
        if (!feature) return 'エラー: feature は必須です';
        return await scaffoldSpecs.execute({ feature, prompt: finalPrompt, overwrite });
      
      case 'tasks':
        if (!feature) return 'エラー: feature は必須です';
        return await generateTasks.execute({ feature, overwrite });

      case 'requirements':
      case 'design': {
        if (!feature) return 'エラー: feature は必須です';
        const baseDir = getKiroSpecsDir();
        let targetDir: string;
        try {
          targetDir = validateFeatureName(feature, baseDir);
        } catch (error: any) {
          return `エラー: ${error.message}`;
        }

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const fileName = `${command}.md`;
        const filePath = path.join(targetDir, fileName);
        if (fs.existsSync(filePath) && !overwrite) {
          return `スキップ: ${fileName} は既に存在します。`;
        }
        const title = command.charAt(0).toUpperCase() + command.slice(1);
        const docContent = `# ${title}: ${feature}\n\n${finalPrompt || '詳細をここに記述してください。'}\n`;
        fs.writeFileSync(filePath, docContent, 'utf-8');
        return `✅ ${fileName} を作成しました。`;
      }

      case 'impl':
        if (!feature) return 'エラー: feature は必須です';
        return `✅ 実装フェーズ（Implementer）に切り替わりました。機能: ${feature}`;

      case 'validate-design':
        if (!feature) return 'エラー: feature は必須です';
        return await validateDesign.execute({ feature });

      case 'profile': {
        const profilePath = path.resolve('.opencode/prompts/sdd-architect-init.md');
        if (!fs.existsSync(profilePath)) {
          return 'エラー: プロファイルファイルが見つかりません。';
        }
        return fs.readFileSync(profilePath, 'utf-8');
      }

      default:
        return `エラー: 未対応のコマンドです: ${command}`;
    }
  }
});
