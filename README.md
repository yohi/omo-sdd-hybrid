# OmO-SDD-Hybrid

タスク単位のファイルアクセス制御で「Vibe Coding（仕様逸脱）」を物理的に抑止する OpenCode プラグイン。

## クイックスタート

1. **タスクを定義する**
   `specs/tasks.md` にタスクを追加:
   ```markdown
   * [ ] Task-1: ユーザー認証の実装 (Scope: `src/auth/**`, `tests/auth/**`)
   ```

2. **タスクを開始する**
   ```bash
   sdd_start_task Task-1
   ```

3. **実装する**
   - `allowedScopes` 内のファイルのみ編集可能
   - Scope 外の編集は警告される（Phase 0）

4. **タスクを終了する**
   ```bash
   sdd_end_task
   ```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `sdd_start_task <TaskID>` | タスクを開始し、編集スコープを設定 |
| `sdd_end_task` | 現在のタスクを終了 |
| `sdd_show_context` | 現在のタスク情報を表示 |
| `sdd_validate_gap` | 仕様とコードの差分を検証 |

## 環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `SDD_GUARD_MODE` | `warn` (default) | Phase 0 では warn のみ実装。Phase 1 で `block` を追加予定 |

## ファイル構成

```text
.opencode/
├── plugins/
│   └── sdd-gatekeeper.ts    # ファイル編集の監視
├── tools/
│   ├── sdd_start_task.ts    # タスク開始
│   ├── sdd_end_task.ts      # タスク終了
│   ├── sdd_show_context.ts  # コンテキスト表示
│   └── sdd_validate_gap.ts  # 差分検証
├── skills/
│   ├── sdd-architect/       # 設計者向けスキル
│   └── sdd-implementer/     # 実装者向けスキル
└── state/
    └── current_context.json # 現在のタスク状態
```

## 開発

```bash
# 依存インストール
bun install

# テスト実行
bun test
```

## Phase 0 の制限

- **warn モードのみ**: Scope 外の編集は警告されるが、ブロックされない
- **kiro 統合なし**: `sdd_validate_gap` は手動確認手順を返すスタブ実装

Phase 1 で `block` モードと kiro 統合を追加予定。
