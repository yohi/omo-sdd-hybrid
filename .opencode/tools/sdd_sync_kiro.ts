import { tool } from '../lib/plugin-stub';

export default tool({
  description: 'Kiro仕様とRoot tasks.md を同期します（Step 2 で cc-sdd CLI と統合予定）',
  args: {},
  async execute() {
    return `ℹ️ このツールは Step 2 で cc-sdd CLI と統合される予定です。
現在は仮実装です。

Kiro統合を有効にするには:
  npx cc-sdd@latest --claude

手動で同期する場合:
1. .kiro/specs/<feature-name>/tasks.md を確認
2. specs/tasks.md にタスクを追加
3. Scope を適切に設定`;
  }
});
