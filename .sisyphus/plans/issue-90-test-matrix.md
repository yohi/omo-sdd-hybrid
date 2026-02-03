# Issue #90 テストマトリクス拡充（symlink・rename・Windows対応） 作業計画

## ゴール
- レビュー指摘のエッジケース（symlink/rename/一時ファイル/Windows/高速連続書き込み）をテストでカバーする
- `bun test` / `bun run build` / `lsp_diagnostics` が通る

## タスク
- [ ] P1-0 Specs: Issue #90 作業用タスクを `specs/tasks.md` に追加（Scope定義）
- [ ] P1-1 調査: 既存の path/access 判定とテスト構造を把握する
- [ ] P1-2 テスト: symlink 経由のスコープ判定テストを追加する
- [ ] P1-3 テスト: rename/move/エディタ一時ファイル→rename パターンのテストを追加する
- [ ] P1-4 テスト: Windows パス（大小文字/区切り/UNC）関連のテストを追加する
- [ ] P1-5 テスト: 高速連続書き込み（複数ファイル/短時間連続）の挙動テストを追加する
- [ ] P1-6 検証: `bun test` / `bun run build` / `lsp_diagnostics` を通す

## 影響範囲（想定）
- `specs/tasks.md`
- `__tests__/lib/path-utils.symlink.test.ts`（新規）
- `__tests__/lib/access-policy.rename.test.ts`（新規）
- `__tests__/lib/access-policy.windows.test.ts`（新規）
- （必要に応じて）既存テストの更新、`.opencode/lib/path-utils.ts` / `.opencode/lib/access-policy.ts`
