import { spawnSync } from 'child_process';
import { tool } from '../lib/plugin-stub';
import { clearState as defaultClearState, readState as defaultReadState } from '../lib/state-utils';

/**
 * Git の変更（ステージング済み、未ステージング）を取得する
 */
function getGitChanges(): string[] {
  try {
    const staged = spawnSync('git', ['diff', '--name-only', '--cached'], { encoding: 'utf-8' });
    const unstaged = spawnSync('git', ['diff', '--name-only'], { encoding: 'utf-8' });

    const files = new Set<string>();
    if (staged.status === 0) {
      staged.stdout.split('\n').filter(Boolean).forEach(f => files.add(f));
    }
    if (unstaged.status === 0) {
      unstaged.stdout.split('\n').filter(Boolean).forEach(f => files.add(f));
    }

    return Array.from(files).sort();
  } catch (e) {
    return [];
  }
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
    const changedFiles = getGitChanges();
    const summary = changedFiles.length > 0
      ? `\n変更されたファイル:\n${changedFiles.map(f => `- ${f}`).join('\n')}`
      : '\n未コミットの変更はありません。';

    await clearState();
    return `タスク終了: ${state.activeTaskId}${recoveryNote}${summary}
State をクリアしました。次のタスクを開始するには sdd_start_task を実行してください。`;
  }
});
