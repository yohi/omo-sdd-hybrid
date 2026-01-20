import { tool } from '../lib/plugin-stub';
import { readState } from '../lib/state-utils';

export default tool({
  description: '現在のタスクコンテキストを表示します',
  args: {},
  async execute() {
    const stateResult = readState();
    
    if (stateResult.status === 'not_found') {
      return 'タスク未開始: sdd_start_task でタスクを開始してください';
    }
    
    if (stateResult.status === 'corrupted') {
      return `エラー: State が破損しています (${stateResult.error})
sdd_end_task でクリアするか、.opencode/state/current_context.json を削除してください。`;
    }
    
    const state = stateResult.state;
    return `現在のタスク: ${state.activeTaskId}
タイトル: ${state.activeTaskTitle}
許可スコープ:
${state.allowedScopes.map(s => `  - ${s}`).join('\n')}
開始時刻: ${state.startedAt}`;
  }
});
