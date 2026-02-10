import { tool } from '@opencode-ai/plugin';
import { readState, writeState } from '../lib/state-utils';
import { updateSteeringDoc, listSteeringDocs } from '../lib/kiro-utils';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 既存のツール実装をインポート（内部的に execute を呼ぶため）
import scaffoldSpecs from './sdd_scaffold_specs';
import generateTasks from './sdd_generate_tasks';
import validateDesign from './sdd_validate_design';
import validateGap from './sdd_validate_gap';

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
    command: tool.schema.enum(['init', 'requirements', 'design', 'tasks', 'impl', 'finalize', 'steering', 'validate-design', 'validate-gap', 'validate', 'profile']).describe('実行するKiroコマンド'),
    feature: tool.schema.string().optional().describe('対象の機能名'),
    prompt: tool.schema.string().optional().describe('追加の指示や要件（init等で使用）'),
    promptFile: tool.schema.string().optional().describe('プロンプトとして読み込むファイルのパス'),
    overwrite: tool.schema.boolean().optional().describe('既存ファイルを上書きするかどうか')
  },
  async execute({ command, feature, prompt, promptFile, overwrite }, context) {
    // 0. プロンプトの準備
    let finalPrompt = prompt || '';
    if (promptFile) {
      let projectRoot: string;
      try {
        projectRoot = fs.realpathSync(process.cwd());
      } catch (error: any) {
        return `エラー: プロジェクトルートの解決に失敗しました: ${error.message}`;
      }

      const resolvedPromptFile = path.resolve(projectRoot, promptFile);

      // パストラバーサル対策: プロジェクトルート外へのアクセスを禁止
      // 1. プロジェクトルートとの相対パスをチェック（基本的なトラバーサル検出）
      const rel = path.relative(projectRoot, resolvedPromptFile);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return `エラー: 不正なファイルパスです。プロジェクトルート内のファイルを指定してください: ${promptFile}`;
      }

      try {
        if (!fs.existsSync(resolvedPromptFile)) {
          return `エラー: プロンプトファイルが見つかりません: ${promptFile}`;
        }

        // 2. シンボリックリンクの検出と拒否（lstatを使用）
        // fs.exists はリンク先を見るが、lstat はリンクそのものを見る
        const stats = fs.lstatSync(resolvedPromptFile);
        if (stats.isSymbolicLink()) {
          return `エラー: シンボリックリンクは許可されていません: ${promptFile}`;
        }

        // 3. リアルパスでの解決と再検証（シンボリックリンク攻撃やジャンクション回避）
        // realpathSync はリンクを解決した最終的なパスを返す
        const realPath = fs.realpathSync(resolvedPromptFile);
        const realRel = path.relative(projectRoot, realPath);
        if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
          return `エラー: ファイルの実体がプロジェクトルート外に存在します: ${promptFile}`;
        }

        const fileContent = fs.readFileSync(realPath, 'utf-8');
        finalPrompt = (finalPrompt ? finalPrompt + '\n\n' : '') + fileContent;
      } catch (error: any) {
        return `エラー: プロンプトファイルの読み込みに失敗しました: ${error.message}`;
      }
    }

    // 1. ロールの判定
    // finalize の場合は現状維持とする（Implementer作業の最後に行うことが多いため）
    if (command === 'finalize') {
      // no-op: ロール変更なし
    } else {
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
        if (!feature) {
          return 'エラー: feature は必須です\n使用法: sdd_kiro init <feature>';
        }
        return await scaffoldSpecs.execute({ feature, prompt: finalPrompt, overwrite }, context);

      case 'tasks':
        if (!feature) return 'エラー: feature は必須です';
        return await generateTasks.execute({ feature, overwrite }, context);

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

        // バリデーション確認プロンプト
        if (command === 'requirements') {
          return `✅ ${fileName} を作成しました。\n\n---\n\n**次のステップ:** \`validate-gap\` を実行して既存実装とのギャップ分析を行います。\n\n\`sdd_kiro validate-gap ${feature}\` を実行してください。`;
        } else if (command === 'design') {
          return `✅ ${fileName} を作成しました。\n\n---\n\n**次のステップ:** \`validate-design\` を実行して設計の品質レビューを行います。\n\n\`sdd_kiro validate-design ${feature}\` を実行してください。`;
        } else {
          return `✅ ${fileName} を作成しました。`;
        }
      }

      case 'impl':
        if (!feature) return 'エラー: feature は必須です';
        return `✅ 実装フェーズ（Implementer）に切り替わりました。機能: ${feature}\n\n---\n\n実装完了後に sdd_kiro validate ${feature} を実行してください`;

      case 'finalize': {
        if (!feature) return 'エラー: feature は必須です';

        const baseDir = getKiroSpecsDir();
        let targetDir: string;
        try {
          targetDir = validateFeatureName(feature, baseDir);
        } catch (error: any) {
          return `エラー: ${error.message}`;
        }

        if (!fs.existsSync(targetDir)) {
          return `エラー: 機能ディレクトリが存在しません: ${feature}`;
        }

        const specFiles = ['requirements', 'design', 'tasks'];
        const renamedFiles: string[] = [];
        const missingFiles: string[] = [];
        const errors: string[] = [];
        const jaContents: { name: string; content: string }[] = [];

        for (const name of specFiles) {
          const srcPath = path.join(targetDir, `${name}.md`);
          const destPath = path.join(targetDir, `${name}_ja.md`);

          if (fs.existsSync(srcPath)) {
            // 既に _ja.md が存在する場合はスキップ
            if (!fs.existsSync(destPath)) {
              try {
                fs.renameSync(srcPath, destPath);
                renamedFiles.push(`${name}.md → ${name}_ja.md`);
              } catch (error: any) {
                errors.push(`リネーム失敗 (${name}.md → ${name}_ja.md): ${error.message}`);
              }
            }
          } else if (!fs.existsSync(destPath)) {
            missingFiles.push(`${name}.md`);
          }

          // _ja.md の内容を読み込み
          if (fs.existsSync(destPath)) {
            try {
              const content = fs.readFileSync(destPath, 'utf-8');
              jaContents.push({ name, content });
            } catch (error: any) {
              errors.push(`読み込み失敗 (${name}_ja.md): ${error.message}`);
            }
          }
        }

        // 翻訳プロンプト生成
        let result = `✅ ファイナライズ完了: ${feature}\n\n`;

        if (errors.length > 0) {
          result += `❌ **エラー:**\n${errors.map(e => `- ${e}`).join('\n')}\n\n`;
        }

        if (renamedFiles.length > 0) {
          result += `**リネーム済み:**\n${renamedFiles.map(f => `- ${f}`).join('\n')}\n\n`;
        }

        if (missingFiles.length > 0) {
          result += `⚠️ **見つからないファイル:** ${missingFiles.join(', ')}\n\n`;
        }

        result += `---\n\n**次のステップ:** 以下の日本語ファイルを英語に翻訳し、同名のファイル（_jaなし）を作成してください:\n\n`;

        const safeDir = path.relative(process.cwd(), targetDir).replace(/\\/g, '/');

        for (const { name, content } of jaContents) {
          result += `### ${name}.md\n`;
          result += `> ⚠️ **警告:** \`${safeDir}/${name}.md\` が既に存在する場合、以下の内容で上書きされます。必要に応じてバックアップを取得してください。\n\n`;
          result += `\`${safeDir}/${name}_ja.md\` の内容を英語に翻訳して \`${safeDir}/${name}.md\` を作成してください。\n\n`;
          
          // プロンプト注入対策: コードブロックを使用し、コンテンツ内のバッククォートに応じてフェンス長を調整
          const maxTicks = (content.match(/`{3,}/g) || [])
            .map(match => match.length)
            .reduce((a, b) => Math.max(a, b), 0);
          const fence = '`'.repeat(Math.max(3, maxTicks + 1));

          result += `${fence}markdown:${name}_ja\n${content}\n${fence}\n\n`;
        }

        return result;
      }

      case 'validate-design':
        if (!feature) return 'エラー: feature は必須です';
        return await validateDesign.execute({ feature }, context);

      case 'validate-gap':
        if (!feature) return 'エラー: feature は必須です';
        return await validateGap.execute({ kiroSpec: feature }, context);

      case 'validate':
        if (!feature) return 'エラー: feature は必須です';
        return await validateDesign.execute({ feature }, context);

      case 'profile': {
        // 優先順位:
        // 1. カレントディレクトリの .opencode/prompts/profile.md (ユーザーによる上書き/ローカル開発)
        // 2. パッケージ内の .opencode/prompts/profile.md (npmパッケージとしてインストール時)

        const localPath = path.resolve('.opencode/prompts/profile.md');
        let profilePath = localPath;
        let isFromPackage = false; // パッケージ内から解決されたかどうか

        // npmパッケージとして実行されている場合のパス解決
        // dist/tools/sdd_kiro.js から見て、../../.opencode/prompts/profile.md
        // または、バンドル構成によって位置が変わる可能性があるため、上層を探索する
        if (!fs.existsSync(profilePath)) {
          try {
            const currentFile = fileURLToPath(import.meta.url);
            let searchDir = path.dirname(currentFile);
            const root = path.parse(searchDir).root;

            // 最大5階層、またはルートに到達するまで探索
            for (let i = 0; i < 5; i++) {
              const candidate = path.join(searchDir, '.opencode/prompts/profile.md');
              if (fs.existsSync(candidate)) {
                // node_modules内にある場合のみパッケージファイルとして扱う
                const resolvedCandidate = path.resolve(candidate);
                const nodeModulesPattern = path.sep + 'node_modules' + path.sep;
                if (resolvedCandidate.includes(nodeModulesPattern)) {
                  profilePath = candidate;
                  isFromPackage = true;
                  break;
                }
                // node_modules外のファイルは通常のセキュリティチェック対象
                profilePath = candidate;
                isFromPackage = false;
                break;
              }

              // .opencodeディレクトリ自体を探して、その中のpromptsを見る
              const opencodeDir = path.join(searchDir, '.opencode');
              if (fs.existsSync(opencodeDir) && fs.statSync(opencodeDir).isDirectory()) {
                const p = path.join(opencodeDir, 'prompts/profile.md');
                if (fs.existsSync(p)) {
                  // node_modules内にある場合のみパッケージファイルとして扱う
                  const resolvedP = path.resolve(p);
                  const nodeModulesPattern = path.sep + 'node_modules' + path.sep;
                  if (resolvedP.includes(nodeModulesPattern)) {
                    profilePath = p;
                    isFromPackage = true;
                    break;
                  }
                  // node_modules外のファイルは通常のセキュリティチェック対象
                  profilePath = p;
                  isFromPackage = false;
                  break;
                }
              }

              const parent = path.dirname(searchDir);
              if (parent === searchDir || parent === root) break;
              searchDir = parent;
            }
          } catch (e) {
            // import.meta.url アクセスエラー等の場合
          }
        }

        if (!fs.existsSync(profilePath)) {
          return 'エラー: プロファイルファイルが見つかりません: .opencode/prompts/profile.md';
        }

        // セキュリティチェック:
        // - ローカルファイル使用時のみプロジェクトルート外・シンボリックリンクをチェック
        // - パッケージ内ファイルはパッケージの一部として信頼できるためスキップ
        if (!isFromPackage) {
          try {
            const projectRoot = fs.realpathSync(process.cwd());
            const stats = fs.lstatSync(profilePath);
            if (stats.isSymbolicLink()) {
              return `エラー: シンボリックリンクは許可されていません: ${profilePath}`;
            }

            const realPath = fs.realpathSync(profilePath);
            const realRel = path.relative(projectRoot, realPath);

            if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
              return `エラー: ファイルの実体がプロジェクトルート外に存在します: ${profilePath}`;
            }
            profilePath = realPath;
          } catch (error: any) {
            return `エラー: プロファイルのパス検証に失敗しました: ${error.message}`;
          }
        }

        let profileContent: string;
        try {
          profileContent = fs.readFileSync(profilePath, 'utf-8');
        } catch (error: any) {
          return `エラー: プロファイルの読み込みに失敗しました: ${error.message}`;
        }

        if (finalPrompt) {
          return `${profileContent}\n\n=== 追加コンテキスト (prompt/promptFile) ===\n${finalPrompt}`;
        }
        return profileContent;
      }

      default:
        return `エラー: 未対応のコマンドです: ${command}`;
    }
  }
});
