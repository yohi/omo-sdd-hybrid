import { spawnSync } from 'child_process';
import { tool } from '@opencode-ai/plugin';
import { clearState as defaultClearState, readState as defaultReadState } from '../lib/state-utils';

/**
 * Git の変更（ステージング済み、未ステージング）を取得する
 */
function getGitChanges(): string[] {
  const staged = spawnSync('git', ['diff', '--name-only', '--cached'], { encoding: 'utf-8' });
  if (staged.error) throw new Error(`Git staged error: ${staged.error.message}`);
  if (staged.status !== 0) throw new Error(`Git staged failed: ${staged.stderr}`);

  const unstaged = spawnSync('git', ['diff', '--name-only'], { encoding: 'utf-8' });
  if (unstaged.error) throw new Error(`Git unstaged error: ${unstaged.error.message}`);
  if (unstaged.status !== 0) throw new Error(`Git unstaged failed: ${unstaged.stderr}`);

  const files = new Set<string>();
  staged.stdout.split('\n').filter(Boolean).forEach(f => { files.add(f); });
  unstaged.stdout.split('\n').filter(Boolean).forEach(f => { files.add(f); });

  return Array.from(files).sort();
}

export default tool({
  description: '現在のタスクを終了し、State をクリアします',
  args: {},
  async execute(_args, context: any) {
    const readState = context?.__testDeps?.readState ?? defaultReadState;
    const clearState = context?.__testDeps?.clearState ?? defaultClearState;

    const stateResult = await readState();
    
    if (stateResult.status === 'not_found') {
      return '警告: アクティブなタスクはありません';
    }
    
    if (stateResult.status === 'corrupted') {
      await clearState();
      return `警告: State が破損していました (${stateResult.error})。State をクリアしました。`;
    }
    
    const state = stateResult.state;
    const recoveryNote = stateResult.status === 'recovered'
      ? `\n(注: State はバックアップ ${stateResult.fromBackup} から復元されていました)`
      : '';
    
    // 変更ファイルのサマリーを作成
    let changedFiles: string[] = [];
    let gitError = '';
    try {
      changedFiles = getGitChanges();
    } catch (e: any) {
      gitError = e.message;
    }

    const summary = gitError
      ? `\n変更ファイルの取得に失敗しました: ${gitError}`
      : changedFiles.length > 0
        ? `\n変更されたファイル:\n${changedFiles.map(f => `- ${f}`).join('\n')}`
        : '\n未コミットの変更はありません。';

    await clearState();
    return `タスク終了: ${state.activeTaskId}${recoveryNote}${summary}
State をクリアしました。次のタスクを開始するには sdd_start_task を実行してください。`;
  }
});
