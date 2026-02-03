# Issue #96 対応 作業計画

## ゴール
- Issue #96 の期待挙動を満たす
- `bun test` / `bun run build` / `lsp_diagnostics` が通る

## タスク
- [ ] P1-0a 調査: Issue #96 の内容（背景/期待/受入条件）を整理する
- [ ] P1-0b 調査: コードベースの該当箇所と変更スコープ候補を洗い出す
- [ ] P1-1 Specs: Issue #96 作業用タスクを `specs/tasks.md` に追加（Scope定義）
- [ ] P1-2 実装: Issue #96 の修正を実装する
- [ ] P1-3 テスト: 再現テスト/回帰テストを追加する
- [ ] P1-4 検証: `bun test` / `bun run build` / `lsp_diagnostics` を通す

## 影響範囲（想定）
- `specs/tasks.md`
- `.opencode/**`
- `__tests__/**`
- `README.md`（必要な場合のみ）
