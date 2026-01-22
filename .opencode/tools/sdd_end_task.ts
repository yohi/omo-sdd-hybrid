import { tool } from '../lib/plugin-stub';
import { clearState, readState } from '../lib/state-utils';

export default tool({
  description: '現在のタスクを終了し、State をクリアします',
  args: {},
  async execute() {
    const stateResult = await readState();
    
    if (stateResult.status === 'not_found') {
      return '警告: アクティブなタスクはありません';
    }
    
    if (stateResult.status === 'corrupted') {
      clearState();
      return `警告: State が破損していました (${stateResult.error})。State をクリアしました。`;
    }
    
    const state = stateResult.state;
    clearState();
    return `タスク終了: ${state.activeTaskId}
State をクリアしました。次のタスクを開始するには sdd_start_task を実行してください。`;
  }
});
