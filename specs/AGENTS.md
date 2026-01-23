# specs 知識ベース

## OVERVIEW
仕様駆動開発（SDD）の中心であり、タスク定義および機能仕様（Feature Spec）を管理するディレクトリです。

## STRUCTURE
- `tasks.md`: 現在進行中および完了したタスクの管理リスト（Active）。
- `<feature>/requirements.md`: 個別の機能に関する要件・設計ドキュメント。

## CONVENTIONS
- **タスク記述形式**:
  `* [ ] ID: タイトル (Scope: \`glob\`)`
  （例: `* [ ] Task-1: 認証の実装 (Scope: \`src/auth/**\`)`）
- **スコープ指定**:
  有効な glob パターンを **バッククォート** で囲むことが必須です。
  Gatekeeper プラグインはこのスコープに基づきファイルアクセスを制御します。

## ANTI-PATTERNS
- **不適切なスコープ定義**: `Scope: **` や `Scope: src/**` のように広すぎるスコープ。
- **実行中のタスク修正**: `in_progress` 状態での `tasks.md` 直接修正。変更時はタスクを終了させること。
