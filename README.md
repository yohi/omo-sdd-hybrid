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
   - Scope 外の編集は警告される（Phase 0）またはブロックされる（Phase 1, `block` モード）

4. **検証する**
   ```bash
   sdd_validate_gap
   ```

5. **タスクを終了する**
   ```bash
   sdd_end_task
   ```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `sdd_start_task <TaskID>` | タスクを開始し、編集スコープを設定 |
| `sdd_end_task` | 現在のタスクを終了 |
| `sdd_show_context` | 現在のタスク情報を表示 |
| `sdd_validate_gap` | 仕様とコードの差分を検証（Kiro統合対応） |

### sdd_validate_gap の詳細

Phase 1 で強化された検証コマンド:

```bash
sdd_validate_gap                    # 現在のタスクを検証
sdd_validate_gap --taskId Task-2    # 特定のタスクを検証
sdd_validate_gap --kiroSpec my-feature  # 特定のKiro仕様と照合
```

**検証内容:**
- **スコープ検証**: git diff でスコープ外の変更を検出
- **Diagnostics**: TypeScriptファイルの診断対象をリストアップ
- **テスト実行**: スコープ内のテストを自動実行
- **Kiro統合**: `.kiro/specs/` の仕様ファイルとのギャップ分析

## Kiro統合 (Phase 1)

[cc-sdd](https://github.com/gotalab/cc-sdd) との統合をサポート。

### セットアップ

```bash
npx cc-sdd@latest --claude
```

### 仕様駆動ワークフロー

1. **仕様を作成**
   ```bash
   /kiro:spec-init ユーザー認証機能
   /kiro:spec-requirements user-auth
   /kiro:spec-design user-auth -y
   /kiro:spec-tasks user-auth -y
   ```

2. **SDDタスクと連携**
   - タスクIDをKiro仕様名と一致させると自動でギャップ分析
   - または `--kiroSpec` オプションで明示的に指定

3. **ギャップ分析**
   `sdd_validate_gap` が以下を検出:
   - requirements.md の有無
   - design.md の有無
   - tasks.md の進捗状況

## 環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `SDD_GUARD_MODE` | `warn` (default) / `block` | スコープ外編集時の動作 |
| `SDD_SKIP_TEST_EXECUTION` | `true` / `false` | テスト実行のスキップ |

## ナレッジベース (AGENTS.md)

本プロジェクトは階層的なナレッジベース（`AGENTS.md`）を採用しています。
AIエージェントや開発者は、各ディレクトリの `AGENTS.md` を参照することで、そのコンテキストにおける規約やアンチパターンを確認できます。

| パス | 内容 |
|------|------|
| **`./AGENTS.md`** | プロジェクト全体の概要、構造、共通規約 |
| **`.opencode/AGENTS.md`** | プラグインのコアロジック、ツール実装の規約 |
| **`specs/AGENTS.md`** | 仕様策定フロー、タスク定義（Globパターン等）のルール |
| **`__tests__/AGENTS.md`** | テストハーネスの使用法、テスト記述の規約 |

## ファイル構成

```text
omo-sdd-hybrid/
├── AGENTS.md            # [Root] プロジェクト知識ベース
├── .opencode/
│   ├── AGENTS.md        # [Src] 実装ルール
│   ├── plugins/
│   │   └── sdd-gatekeeper.ts
│   ├── tools/
│   │   ├── sdd_start_task.ts
│   │   ├── sdd_validate_gap.ts  # Phase 1 強化版
│   │   └── ...
│   ├── lib/
│   │   ├── kiro-utils.ts        # Kiro統合ユーティリティ
│   │   └── ...
│   └── state/
├── specs/
│   ├── AGENTS.md        # [Spec] 仕様ルール
│   └── tasks.md
├── .kiro/               # [Optional] Kiro仕様ディレクトリ
│   └── specs/
│       └── <feature>/
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
└── __tests__/
    └── AGENTS.md        # [Test] テストルール
```

## 開発

```bash
# 依存インストール
bun install

# テスト実行
bun test

# 特定のテストのみ実行
bun test __tests__/lib/kiro-utils.test.ts
```

## Phase 1 の機能

- ✅ **検証ロジック強化**: Diagnostics対象ファイルの明示
- ✅ **Kiro統合**: `.kiro/specs/` からの仕様読み込みとギャップ分析
- ✅ **タスク進捗追跡**: tasks.md のチェックボックス状態を検出

### Phase 0 との違い

| 機能 | Phase 0 | Phase 1 |
|------|---------|---------|
| スコープ検証 | ✅ | ✅ |
| テスト実行 | ✅ | ✅ |
| Diagnostics | スタブ | ✅ ファイルリスト表示 |
| Kiro統合 | ❌ | ✅ |
| エスカレーション | ✅ | ✅ |

## ライセンス

MIT
