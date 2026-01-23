# Issue39 ガードモード設定強化 作業計画

## 背景
- Issue #39: `SDD_GUARD_MODE` の環境変数依存により、warn への弱体化が容易というセキュリティリスク
- 方針: 環境変数による弱体化は拒否、強化は許可
- 信頼ソース: `.opencode/state/guard-mode.json`（専用状態ファイル）
- 監査ログ: `.opencode/state/guard-mode.log` に追記
- テスト方針: 既存 Bun テスト基盤で「テスト後付け」

## 目的
環境変数に依存せず安全側へ固定できるガードモード管理を導入し、弱体化試行を検知・拒否しつつ監査可能にする。

## スコープ
### IN
- ガードモードの信頼ソース（状態ファイル）導入と優先順位の確立
- 弱体化試行の拒否と監査ログ出力
- 既存 `access-policy` / `sdd-gatekeeper` への組み込み
- CLI からのガードモード設定更新（状態ファイル更新）
- テスト追加とドキュメント更新

### OUT
- ルール（Rule2/Rule4 等）の仕様変更
- Gatekeeper の根本的な挙動変更（warn/block の概念変更）

## 仕様方針
- 既定値は現行互換（`warn`）を維持
- 優先順位: 状態ファイル > 環境変数（強化のみ許可）
- 例: 状態ファイルが `block` の場合、`SDD_GUARD_MODE=warn` は拒否し `block` を維持
- 監査ログ: 弱体化拒否/設定ファイル不正/未設定時の判断を記録

## 参照ポイント
- ガードモード読み取り: `.opencode/lib/access-policy.ts` の `getGuardMode()`
- 判定ロジック: `.opencode/lib/access-policy.ts` の `evaluateAccess()`
- 遮断処理: `.opencode/plugins/sdd-gatekeeper.ts`
- 状態管理: `.opencode/lib/state-utils.ts` と `.opencode/state/current_context.json`
- ポリシー管理: `.opencode/lib/policy-loader.ts`
- CLI: `.opencode/tools/sdd_start_task.ts` / `sdd_end_task` / `sdd_show_context` / `sdd_validate_gap`
- テスト基盤: `__tests__/**/*.test.ts`、`tests/**/*.test.ts`、`bun test` / `bun test:seq`
- ドキュメント: `README.md`

## 作業タスク

### 1. ガードモードの解決ロジック拡張
**内容**
- `.opencode/state/guard-mode.json` を読み込み、値の正規化と妥当性検証を追加
- 環境変数は強化のみ許可する優先順位に変更
- 弱体化試行を検出し、監査ログと警告を出す

**参照**
- `.opencode/lib/access-policy.ts`
- `.opencode/lib/state-utils.ts`（状態ファイルの読み書きパターン）

**受け入れ基準**
- 状態ファイル `block` + 環境変数 `warn` で `block` 維持
- 状態ファイル `warn` + 環境変数 `block` で `block` へ強化
- 状態ファイル不在で既定値 `warn` を維持

### 2. 監査ログ出力の追加
**内容**
- `.opencode/state/guard-mode.log` に追記形式でログを出力
- 弱体化拒否・不正値・未設定の判断理由を記録

**参照**
- `.opencode/lib/access-policy.ts`

**受け入れ基準**
- 弱体化拒否時にログが追記される
- 不正値検知時にログが追記される

### 3. Gatekeeper 連携確認
**内容**
- `evaluateAccess()` の結果が `sdd-gatekeeper` で正しく遮断されることを確認
- 必要なら警告メッセージを明確化

**参照**
- `.opencode/plugins/sdd-gatekeeper.ts`

**受け入れ基準**
- 弱体化拒否時、warn モードに落ちず block が維持される

### 4. ガードモード更新 CLI の追加
**内容**
- 新規 CLI（例: `sdd_set_guard_mode`）で `guard-mode.json` を更新
- 入力値を `warn|block` に限定し、監査ログとセットで更新

**参照**
- `.opencode/tools/sdd_start_task.ts`
- `.opencode/lib/state-utils.ts`

**受け入れ基準**
- CLI で `block` / `warn` を設定でき、ファイルが更新される
- 不正値は拒否される

### 5. テスト追加（後付け）
**内容**
- `access-policy` のユニットテストに、優先順位・弱体化拒否・強化許可を追加
- `sdd-gatekeeper` に弱体化拒否の統合ケースを追加

**参照**
- `__tests__/lib/access-policy.test.ts`
- `__tests__/plugins/sdd-gatekeeper.block.test.ts`

**受け入れ基準**
- `bun test` がパス
- 状態依存のケースがある場合 `bun test:seq` でもパス

### 6. ドキュメント更新
**内容**
- `README.md` に新しいガードモード管理方法と弱体化拒否の挙動を追記
- 監査ログの位置と目的を明記

**参照**
- `README.md`

**受け入れ基準**
- ガードモードの設定手順と優先順位が明確に記載されている

## 検証
- `bun test` を実行し成功する
- 状態依存が疑われる場合は `bun test:seq` も実行し成功する
- 手動確認: `guard-mode.json=block` + `SDD_GUARD_MODE=warn` でスコープ外編集を試み、遮断されること
- 手動確認: 監査ログに弱体化拒否が記録されること
