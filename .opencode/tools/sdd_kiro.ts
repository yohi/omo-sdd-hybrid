import { tool } from '@opencode-ai/plugin';
import { readState, writeState } from '../lib/state-utils';
import { updateSteeringDoc, listSteeringDocs, analyzeKiroGap, loadKiroSpec, analyzeDocConsistency, loadSpecTemplate } from '../lib/kiro-utils';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 既存のツール実装をインポート（内部的に execute を呼ぶため）
import scaffoldSpecs from './sdd_scaffold_specs';
import generateTasks from './sdd_generate_tasks';
import validateDesign from './sdd_validate_design';
import validateGap from './sdd_validate_gap';
import { validateGapInternal } from './sdd_validate_gap';
import lintTasks from './sdd_lint_tasks';
import { State } from '../lib/state-utils';

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

const currentFile = fileURLToPath(import.meta.url);
let realCurrentFile: string;
try {
  realCurrentFile = fs.realpathSync(currentFile);
} catch (e) {
  realCurrentFile = currentFile;
}
const packageRoot = path.resolve(path.dirname(realCurrentFile), '../..');

const checkIsFromPackage = (p: string) => {
  try {
    const resolved = fs.realpathSync(p);
    const relative = path.relative(packageRoot, resolved);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch (e) {
    return false;
  }
};

export default tool({
  description: 'Kiro互換コマンドの統合エントリーポイント。自動で適切なロール（Architect/Implementer）に切り替えて実行します。',
  args: {
    command: tool.schema.enum(['init', 'requirements', 'design', 'tasks', 'impl', 'finalize', 'steering', 'validate-design', 'validate-gap', 'validate-impl', 'validate', 'profile']).describe('実行するKiroコマンド'),
    feature: tool.schema.string().optional().describe('対象の機能名'),
    prompt: tool.schema.string().optional().describe('追加の指示や要件（init等で使用）'),
    promptFile: tool.schema.string().optional().describe('プロンプトとして読み込むファイルのパス'),
    overwrite: tool.schema.boolean().optional().describe('既存ファイルを上書きするかどうか'),
    skipValidation: tool.schema.boolean().optional().describe('自動検証をスキップするか（validate-gapのみ有効）')
  },
  async execute({ command, feature, prompt, promptFile, overwrite, skipValidation }, context) {
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
    // finalize, validate-impl の場合は現状維持とする
    if (command === 'finalize' || command === 'validate-impl') {
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

      case 'tasks': {
        if (!feature) return 'エラー: feature は必須です';
        const tasksResult = await generateTasks.execute({ feature, overwrite }, context);

        // lint_tasks を連鎖実行してフォーマット検証
        let tasksOutput = `${tasksResult}\n\n`;
        tasksOutput += `🔍 **lint_tasks を自動実行中...**\n\n`;
        try {
          const lintResult = await lintTasks.execute({ feature }, context);
          tasksOutput += `### lint_tasks 結果\n\n${lintResult}\n`;
        } catch (error: any) {
          tasksOutput += `⚠️ lint_tasks の実行に失敗しました: ${error.message}\n`;
        }
        
        try {
          const baseDir = getKiroSpecsDir();
          const targetDir = validateFeatureName(feature, baseDir);
          const tasksPath = path.join(targetDir, 'tasks.md');
          if (fs.existsSync(tasksPath)) {
            const content = fs.readFileSync(tasksPath, 'utf-8');
            tasksOutput += `\n---\n\n### 作成されたドキュメント (tasks.md)\n\n${content}`;
          }
        } catch (e) {
          // 読み込みエラーは無視
        }
        
        return tasksOutput;
      }

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

        const replacements = {
          FEATURE: feature,
          PROMPT: finalPrompt || '詳細をここに記述してください。'
        };
        const docContent = loadSpecTemplate(fileName, replacements);
        fs.writeFileSync(filePath, docContent, 'utf-8');

          // バリデーション確認プロンプト
        if (command === 'requirements') {
          let result = `✅ ${fileName} を作成しました。\n\n`;
          let validationPerformed = false;
          let validationFailed = false;

          if (skipValidation) {
            result += `⚠️ **ユーザー指定により validate-gap をスキップしました。**\n`;
            result += `注意: 仕様と実装の乖離を防ぐため、可能な限り検証を実施することを強く推奨します。\n`;
          } else {
            // Greenfield 判定: src/ 配下にソースファイルが存在しない場合はスキップ
            const srcDir = path.resolve('src');
            let isGreenfield = true;
            try {
              if (fs.existsSync(srcDir)) {
                const entries = fs.readdirSync(srcDir);
                isGreenfield = entries.length === 0;
              }
            } catch {
              isGreenfield = true;
            }

            if (isGreenfield) {
              result += `ℹ️ **Greenfield プロジェクト検出**: \`src/\` 配下にソースファイルが存在しないため、validate-gap をスキップしました。\n`;
            } else {
              result += `🔍 **validate-gap を自動実行中...**\n\n`;
              try {
                // Phase B ではタスク未開始のため、State チェックをバイパスして validateGapInternal を直接呼び出す
                const syntheticState: State = {
                  version: 1,
                  activeTaskId: feature,
                  activeTaskTitle: `Phase B: ${feature}`,
                  allowedScopes: [],
                  startedAt: new Date().toISOString(),
                  startedBy: 'sdd_kiro',
                  validationAttempts: 0,
                  role: 'architect',
                  tasksMdHash: '',
                  stateHash: '',
                };
                const gapResult = await validateGapInternal(syntheticState, {
                  kiroSpec: feature,
                  skipTests: true,
                  currentAttempts: 0,
                });
                result += `### validate-gap 結果\n\n${gapResult}\n`;
                validationPerformed = true;
              } catch (error: any) {
                result += `⚠️ validate-gap の実行に失敗しました: ${error.message}\n`;
                validationFailed = true;
              }
            }
          }

          result += `\n---\n\n**次のステップ (MUST):** `;
          if (validationPerformed) {
            result += `ユーザーに requirements の内容と validate-gap の結果を報告し、確認を得てください。\n`;
          } else if (validationFailed) {
            result += `validate-gap の実行中にエラーが発生しました。上記のエラー内容を確認して修正し、再度 \`sdd_kiro requirements\` を実行してください。\n`;
          } else {
            result += `ユーザーに requirements の内容を報告し、確認を得てください。また、今回は自動検証（validate-gap）がスキップされたため、内容の妥当性を手動で入念に確認してください。\n`;
          }
          result += `結果に問題がある場合は requirements.md を修正し、再度 \`sdd_kiro requirements\` を実行してください（最大3回まで）。\n\n---\n\n⚠️ **AGENT INSTRUCTION**: If the user prompt conflicts with the template structure, you MUST overwrite the template completely. Do not leave placeholder text like 'ComponentA' if the user specified a different architecture.\n\n---\n\n### 作成されたドキュメント (requirements.md)\n\n${docContent}`;
          return result;
        } else if (command === 'design') {
          let result = `✅ ${fileName} を作成しました。\n\n`;

          if (skipValidation) {
            result += `🚫 **警告: validate-design はスキップできません（必須要件）。**\n`;
            result += `新規製造・改修・機能追加など、いかなる場合でも設計の整合性検証は必須です。\n\n`;
          }

          result += `🔍 **validate-design を自動実行中...**\n\n`;
          let validationPassed = false;
          try {
            const designValidateResult = await validateDesign.execute({ feature }, context);
            result += `### validate-design 結果\n\n${designValidateResult}\n`;
            
            // 結果文字列に不備やエラーが含まれているかチェック
            const failureMarkers = ['❌', 'Error', '⚠️'];
            if (!failureMarkers.some(marker => designValidateResult.includes(marker))) {
              validationPassed = true;
            }
          } catch (error: any) {
            result += `❌ **validate-design 実行エラー**: ${error.message}\n`;
          }

          if (!validationPassed) {
             result += `\n🛑 **検証失敗: design.md の修正が必須です**\n`;
             result += `検証エラーを解消するまで、次のステップ（tasks作成やPR）に進むことは **禁止** されています。\n`;
          }

          result += `\n---\n\n**次のステップ (MUST):** ユーザーに design の内容と validate-design の結果を報告し、確認を得てください。\n結果に問題がある場合は design.md を修正し、再度 \`sdd_kiro design\` を実行してください（最大3回まで）。\n\n---\n\n⚠️ **AGENT INSTRUCTION**: If the user prompt conflicts with the template structure, you MUST overwrite the template completely. Do not leave placeholder text like 'ComponentA' if the user specified a different architecture.\n\n---\n\n### 作成されたドキュメント (design.md)\n\n${docContent}`;
          return result;
        } else {
          return `✅ ${fileName} を作成しました。\n\n---\n\n### 作成されたドキュメント (${fileName})\n\n${docContent}`;
        }
      }

      case 'impl':
        if (!feature) return 'エラー: feature は必須です';
        return `✅ 実装フェーズ（Implementer）に切り替わりました。機能: ${feature}\n\n---\n\n実装が完了したら、品質証明（Definition of Done）のために **必ず** \`sdd_kiro validate-impl ${feature}\` を実行してください。\nユーザーへの完了報告にはこの検証結果が必要です。`;

      case 'finalize': {
        if (!feature) return 'エラー: feature は必須です';

        const baseDir = getKiroSpecsDir();
        let targetDir: string;
        try {
          // パストラバーサル等のチェックを先に行う
          targetDir = validateFeatureName(feature, baseDir);
        } catch (error: any) {
          return `エラー: ${error.message}`;
        }

        // 1. ギャップ分析（必須ファイルの存在とタスク完了状況）
        // finalize 時は全ての仕様ファイルが揃っていることを前提とする
        // 第2引数の changedFiles は空配列でOK（ファイル存在チェックとタスク完了チェックのみしたい）
        const spec = loadKiroSpec(feature);
        if (spec) {
          const consistencyResult = await analyzeDocConsistency(spec);
          if (consistencyResult.status === 'issues') {
            const issuesList = consistencyResult.issues.map(i => `- ${i}`).join('\n');
            return `❌ エラー: 仕様書の整合性に問題が見つかりました。\n\n${issuesList}\n\nこれらの問題を修正してから再度 finalize を実行してください。`;
          }
        } else {
          return `❌ エラー: 指定された機能 '${feature}' の仕様が見つかりません。`;
        }

        const gapResult = analyzeKiroGap(feature, []);

        if (gapResult.status === 'not_found') {
          return `❌ エラー: 指定された機能 '${feature}' の仕様が見つかりません。`;
        }

        if (gapResult.status === 'partial') {
          const missingFiles = gapResult.gaps.map(g => `- ${g}`).join('\n');
          return `❌ エラー: 仕様ファイルが不足しています（ギャップあり）。\n\n${missingFiles}\n\n不足しているファイルを作成し、ユーザーにレビューを求めてください。`;
        }

        // 2. 未完了タスクのチェック
        // finalize は仕様確定フェーズなので、実装タスクが未完了でもブロックすべきではない
        // 警告として表示する程度に留める
        const hasIncompleteTasks = gapResult.suggestions.some(s => s.includes('未完了のタスクがあります'));
        if (hasIncompleteTasks) {
          // const msg = gapResult.suggestions.find(s => s.includes('未完了のタスクがあります')) || '未完了のタスクがあります';
          // ブロックはせず、警告としてログに出す
          // console.warn(`警告: ${msg}`);
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

      case 'validate-impl':
        if (!feature) return 'エラー: feature は必須です';
        // validate-impl は validate-gap と同様に実装状態を検証するものだが、
        // 現時点では validateGap (テスト実行 + 診断) を再利用して実装検証とする
        // 将来的には cc-sdd 準拠の専用ロジック (Requirements Traceability など) に差し替える
        return await validateGap.execute({ kiroSpec: feature, taskId: feature }, context);

      case 'validate':
        if (!feature) return 'エラー: feature は必須です';
        
        let validateOutput = `🔍 **総合検証 (Reviewer Mode) を開始します: ${feature}**\n\n`;

        // 1. Validate Gap (実装 vs 仕様)
        validateOutput += `## 1. Validate Gap (Implementation Check)\n\n`;
        try {
          const gapResult = await validateGap.execute({ kiroSpec: feature, deep: true }, context);
          validateOutput += gapResult + '\n\n';
        } catch (error: any) {
          validateOutput += `❌ validate-gap 実行エラー: ${error.message}\n\n`;
        }

        // 2. Validate Design (設計整合性)
        validateOutput += `## 2. Validate Design (Consistency Check)\n\n`;
        try {
          const designResult = await validateDesign.execute({ feature }, context);
          validateOutput += designResult + '\n\n';
        } catch (error: any) {
          validateOutput += `❌ validate-design 実行エラー: ${error.message}\n\n`;
        }

        validateOutput += `---\n✅ 総合検証完了`;
        return validateOutput;

      case 'profile': {
        // 優先順位:
        // 1. カレントディレクトリの .opencode/prompts/profile.md (ユーザーによる上書き/ローカル開発)
        // 2. パッケージ内の .opencode/prompts/profile.md (npmパッケージとしてインストール時)

        const localPath = path.resolve('.opencode/prompts/profile.md');
        let profilePath = localPath;
        let isFromPackage = false;

        if (!fs.existsSync(profilePath)) {
          try {
            let searchDir = path.dirname(realCurrentFile);
            const root = path.parse(searchDir).root;

            for (let i = 0; i < 5; i++) {
              const candidate = path.join(searchDir, '.opencode/prompts/profile.md');
              if (fs.existsSync(candidate)) {
                profilePath = candidate;
                isFromPackage = checkIsFromPackage(candidate);
                break;
              }

              const parent = path.dirname(searchDir);
              if (parent === searchDir || parent === root) break;
              searchDir = parent;
            }
          } catch (e) {
            // エラー時はデフォルト(localPath)のまま
          }
        } else {
          isFromPackage = checkIsFromPackage(localPath);
        }

        if (!fs.existsSync(profilePath)) {
          return 'エラー: プロファイルファイルが見つかりません: .opencode/prompts/profile.md';
        }

        // セキュリティチェック:
        // - パッケージ外のファイル（ユーザー作成）のみプロジェクトルート外・シンボリックリンクをチェック
        // - パッケージ内ファイルは信頼できるためスキップ
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

        // プロファイル完了後の暴走防止ガード
        // profile.md 内にも制約セクションがあるが、ツール返却値としても重ねて注入することで多層防御を実現する
        const stopGuard = [
          '',
          '---',
          '',
          '⚠️ **STOP INSTRUCTION (MUST OBEY)**:',
          'プロファイルのインタビューと最終ドキュメント生成が完了したら、ドキュメントをユーザーに提示して **即座に停止** してください。',
          '',
          '以下の行為は **禁止** です:',
          '- `sdd_scaffold_specs` の自動実行',
          '- `sdd_sync_kiro` の自動実行',
          '- ファイル/ディレクトリの作成',
          '- 仕様書の自動生成・編集',
          '',
          'ユーザーが明示的に次のコマンドを指示するまで、一切のツール呼び出しを行わないでください。'
        ].join('\n');

        if (finalPrompt) {
          return `${profileContent}\n\n=== 追加コンテキスト (prompt/promptFile) ===\n${finalPrompt}\n\n${stopGuard}`;
        }
        return `${profileContent}\n\n${stopGuard}`;
      }

      default:
        return `エラー: 未対応のコマンドです: ${command}`;
    }
  }
});
