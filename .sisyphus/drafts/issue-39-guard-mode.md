# Draft: Issue39 ガードモード設定強化

## Requirements (confirmed)
- 環境変数だけに依存しない堅牢な設定管理、または変更検知の導入
- 優先度: High (Security)
- 方針: 環境変数による弱体化は拒否、強化は許可

## Technical Decisions
- SDD_GUARD_MODE の弱体化は拒否、強化は許可（安全側固定のため）
- 信頼ソース: `.opencode/state/guard-mode.json`（専用状態ファイル）
- 監査ログ: 専用ログファイルに追記（`.opencode/state/guard-mode.log` 想定）

## Test Strategy Decision
- テスト基盤: あり（Bun）
- フレームワーク: bun test（test:seq あり）
- ユーザー方針: テスト後付け

## Research Findings
- Issue #39 にてリスクと提案が明記
- SDD_GUARD_MODE の読み取り: `.opencode/lib/access-policy.ts` の `getGuardMode()` が `process.env.SDD_GUARD_MODE` を参照
- 判定ロジック: `.opencode/lib/access-policy.ts` の `evaluateAccess()` が warn/block を返し、`.opencode/plugins/sdd-gatekeeper.ts` が warn は警告、block はエラーで遮断
- 状態: `.opencode/state/current_context.json` が allowedScopes を保持
- ポリシー: `.opencode/lib/policy-loader.ts` が `DEFAULT_POLICY` / `.opencode/policy.json` を読み込み
- CLI: `.opencode/tools/sdd_start_task.ts` / `sdd_end_task` / `sdd_show_context` / `sdd_validate_gap`
- テスト基盤: `package.json` の `bun test` / `bun test:seq`、`__tests__/**/*.test.ts` と `tests/**/*.test.ts`

## Open Questions
- 設定変更の監査ログの形式

## Scope Boundaries
- INCLUDE: ガードモード設定の堅牢化と変更検知
- EXCLUDE: ガード機構本体の大幅な仕様変更（未確認）
