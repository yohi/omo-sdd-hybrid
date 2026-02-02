# Issue #88 Guard-mode fail-closed 作業計画

## ゴール
- `.opencode/state/guard-mode.json` が欠損/破損しても、ガードが `warn` に降格せず **常に `block`** になる（fail-closed）
- 既存の「file=block は env=warn を拒否」等の仕様は維持
- 変更に合わせてテスト/ドキュメントを更新し、`bun test` が通る

## タスク

- [x] P0-1 調査: 現状実装とテスト観点を確認する
- [x] P0-2 実装: `determineEffectiveGuardMode` を fail-closed 化し、監査ログを追加する
- [x] P0-3 テスト: `__tests__/lib/access-policy.test.ts` の期待値を更新し、欠損/破損ケースを追加する
- [x] P0-4 テスト: Gatekeeper で `readGuardModeState()` が `null` の時に `block` が適用されることを追加検証する
- [ ] P0-5 ドキュメント: `README.md` と `spec.md` の guard-mode 欠損/破損時の挙動を更新する
- [ ] P0-6 検証: `bun test` / `bun test:seq` / `bun run build` / `lsp_diagnostics` を通す

## 影響範囲（想定）
- `.opencode/lib/access-policy.ts`
- `__tests__/lib/access-policy.test.ts`
- `__tests__/plugins/sdd-gatekeeper.guard-mode.test.ts`
- `README.md`
- `spec.md`
