import { tool } from '../lib/plugin-stub';

export default tool({
  description: 'specs/tasks.md のフォーマットを検証し、問題を報告します（Step 2 で本格実装予定）',
  args: {},
  async execute() {
    return `ℹ️ このツールは Step 2 で cc-sdd CLI と統合される予定です。
現在は仮実装です。

手動でフォーマットを確認してください:
- タスクID: TaskName-123 形式
- Scope: バッククォートで囲む \`path/**\`
- 形式: * [ ] TaskId: Title (Scope: \`path/**\`)`;
  }
});
