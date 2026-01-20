import { tool } from '../lib/plugin-stub';

export default tool({
  description: '仕様とコードの差分を検証（kiro 統合時は自動化）',
  args: {
    taskId: tool.schema.string().describe('検証対象タスクID（必須）')
  },
  async execute({ taskId }) {
    const kiroAvailable = false;
    
    if (kiroAvailable) {
      return 'kiro:validate-gap を実行中...';
    }
    
    return `kiro:validate-gap は利用できません。

タスク ${taskId} の検証を手動で行ってください:

1. lsp_diagnostics で変更ファイルにエラーがないか確認
2. 関連テストが存在すれば実行
3. tasks.md の要件が満たされているか確認
4. 変更したファイルが allowedScopes 内にあるか確認

完了後、sdd_end_task を実行してタスクを終了してください。`;
  }
});
