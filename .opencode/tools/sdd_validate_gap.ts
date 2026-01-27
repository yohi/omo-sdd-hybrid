import { tool } from '../lib/plugin-stub';
import { readState, State } from '../lib/state-utils';

export async function validateGapInternal(stateResult: unknown, options: unknown): Promise<string> {
  // Runtime type narrowing
  const r = stateResult as Partial<{ status: string; state: State }>;
  
  if (!r || typeof r !== 'object') {
    throw new Error('Invalid input: stateResult must be an object');
  }

  // Verify status fields (existing guard logic)
  if (r.status !== 'ok' && r.status !== 'recovered') {
    throw new Error(`Invalid state status: ${r.status}`);
  }

  // Assert/cast to State
  // ensure state property exists (it should if status is ok/recovered based on StateResult type, but checking for safety)
  if (!r.state) {
    throw new Error('Invalid state: missing state property');
  }

  const state = r.state as State;
  const _opts = options as Record<string, unknown>;

  if (_opts && _opts.skipTests === true) {
    return 'SKIP: テスト実行はスキップされました';
  }

  // Now access to allowedScopes is safe
  // (Stub implementation)
  return 'ℹ️ validateGapInternal は Step 2 で実装予定です（現在は仮実装）';
}

export default tool({
  description: '仕様とコードの差分を検証（Step 2 で cc-sdd CLI と統合予定）',
  args: {
    taskId: tool.schema.string().optional().describe('検証するタスクID（省略時は現在アクティブなタスク）'),
    kiroSpec: tool.schema.string().optional().describe('Kiro仕様名（.kiro/specs/配下のディレクトリ名）'),
    deep: tool.schema.boolean().optional().describe('深度分析を有効にする（カバレッジ分析・意味的検証プロンプト生成）')
  },
  async execute({ taskId, kiroSpec, deep }) {
    const stateResult = await readState();
    
    if (stateResult.status !== 'ok' && stateResult.status !== 'recovered') {
      return `エラー: アクティブなタスクがありません。sdd_start_task を実行してください。

状態: ${stateResult.status}`;
    }
    
    const state = stateResult.state;
    const effectiveTaskId = taskId || state.activeTaskId;

    return `ℹ️ このツールは Step 2 で cc-sdd CLI と統合される予定です。
現在は仮実装です。

タスク: ${effectiveTaskId}
許可スコープ: ${state.allowedScopes.join(', ')}

手動で以下を確認してください:
1. スコープ外の変更がないか (git diff --name-only HEAD)
2. TypeScript エラーがないか (lsp_diagnostics)
3. テストが通るか (bun test)
4. Kiro 仕様との整合性${kiroSpec ? ` (仕様: ${kiroSpec})` : ''}`;
  }
});
