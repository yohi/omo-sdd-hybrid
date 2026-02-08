import { tool } from '@opencode-ai/plugin';
import { readState as defaultReadState } from '../lib/state-utils';

export default tool({
  description: '現在のタスクコンテキストを表示します',
  args: {},
  async execute(_args, context: any) {
    const readState = context?.__testDeps?.readState ?? defaultReadState;

    const stateResult = await readState();
    
    if (stateResult.status === 'not_found') {
      return 'タスク未開始: sdd_start_task でタスクを開始してください';
    }
    
    if (stateResult.status === 'corrupted') {
      return `エラー: State が破損しています (${stateResult.error})
sdd_end_task でクリアするか、.opencode/state/current_context.json を削除してください。`;
    }
    
    const state = stateResult.state;
    const recoveryNote = stateResult.status === 'recovered' 
      ? `\n⚠️  注意: State はバックアップから復元されました (${stateResult.fromBackup})`
      : '';
    
    return `現在のタスク: ${state.activeTaskId}
タイトル: ${state.activeTaskTitle}
ロール: ${state.role ?? 'implementer'}
許可スコープ:
${state.allowedScopes.map(s => `  - ${s}`).join('\n')}
開始時刻: ${state.startedAt}${recoveryNote}`;
  }
});
