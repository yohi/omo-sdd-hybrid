import { tool } from '../lib/plugin-stub';
import { readState as defaultReadState } from '../lib/state-utils';
import { countMarkdownTasks } from '../lib/tasks_markdown';
import fs from 'fs';
import path from 'path';

export default tool({
  description: 'プロジェクトの進捗状況とステータスを表示します',
  args: {},
  async execute(_args, context: any) {
    const readState = context?.__testDeps?.readState ?? defaultReadState;
    const worktreeRoot = process.cwd();

    // 1. 環境変数の解決 (テスト用環境変数を優先)
    const tasksPath = process.env.SDD_TASKS_PATH
      ? (path.isAbsolute(process.env.SDD_TASKS_PATH) ? process.env.SDD_TASKS_PATH : path.join(worktreeRoot, process.env.SDD_TASKS_PATH))
      : path.join(worktreeRoot, 'specs/tasks.md');

    const kiroDir = process.env.SDD_KIRO_DIR
      ? (path.isAbsolute(process.env.SDD_KIRO_DIR) ? process.env.SDD_KIRO_DIR : path.join(worktreeRoot, process.env.SDD_KIRO_DIR))
      : path.join(worktreeRoot, '.kiro');

    // 2. Stateの取得
    let activeTaskInfo = 'なし';
    try {
      const stateResult = await readState();
      if (stateResult.status === 'ok' || stateResult.status === 'recovered') {
        const state = stateResult.state;
        activeTaskInfo = `${state.activeTaskId} (${state.activeTaskTitle})`;
        if (stateResult.status === 'recovered') {
          activeTaskInfo += ` [復元: ${path.basename(stateResult.fromBackup)}]`;
        }
      } else if (stateResult.status === 'corrupted') {
        activeTaskInfo = `エラー (State破損: ${stateResult.error})`;
      }
    } catch (e) {
      activeTaskInfo = `エラー (${(e as Error).message})`;
    }

    // 3. Root tasks.md の集計
    let rootProgress = { total: 0, completed: 0 };
    if (fs.existsSync(tasksPath)) {
      try {
        const content = fs.readFileSync(tasksPath, 'utf-8');
        rootProgress = countMarkdownTasks(content);
      } catch (e) {
        // 読み込みエラーは無視
      }
    }

    // 4. Pending Changes の集計
    let pendingCount = 0;
    const pendingDir = path.join(kiroDir, 'pending-changes');
    if (fs.existsSync(pendingDir)) {
      try {
        const files = fs.readdirSync(pendingDir);
        pendingCount = files.filter(f => f.endsWith('.md')).length;
      } catch (e) {
        // エラー無視
      }
    }

    // 5. レポート生成
    const rootPercent = rootProgress.total > 0
      ? Math.round((rootProgress.completed / rootProgress.total) * 100)
      : 0;

    const reportLines = [
      '# プロジェクトステータス',
      '',
      '## 概要',
      `- **進捗 (Root)**: ${rootProgress.completed}/${rootProgress.total} (${rootPercent}%)`,
      `- **未処理の変更提案**: ${pendingCount}件`,
      `- **現在のアクティブタスク**: ${activeTaskInfo}`,
    ];

    // 6. Feature specs の集計
    const specsDir = path.join(kiroDir, 'specs');
    reportLines.push('', '## 機能別進捗');

    let featureFound = false;

    if (fs.existsSync(specsDir)) {
      try {
        const features = fs.readdirSync(specsDir).filter(f => {
          try {
            return fs.statSync(path.join(specsDir, f)).isDirectory();
          } catch {
            return false;
          }
        });

        for (const feature of features) {
          const featTasksPath = path.join(specsDir, feature, 'tasks.md');
          if (fs.existsSync(featTasksPath)) {
            try {
              const content = fs.readFileSync(featTasksPath, 'utf-8');
              const prog = countMarkdownTasks(content);
              const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
              reportLines.push(`- **${feature}**: ${prog.completed}/${prog.total} (${pct}%)`);
              featureFound = true;
            } catch (e) {
              reportLines.push(`- **${feature}**: tasks.md の読み込みに失敗 (${(e as Error).message})`);
              featureFound = true;
            }
          }
        }
      } catch (e) {
        reportLines.push(`- エラー: 機能一覧の取得に失敗 (${(e as Error).message})`);
        featureFound = true; // エラー時はフォールバックメッセージを抑制
      }
    }

    if (!featureFound) {
      reportLines.push('- 機能定義なし (または tasks.md なし)');
    }

    return reportLines.join('\n');
  }
});
