# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-21
**Context:** OmO-SDD-Hybrid (OpenCode Plugin)
**Stack:** TypeScript, Bun, OpenCode API

## OVERVIEW
OpenCode環境における「仕様逸脱（Vibe Coding）」を物理的に抑止するためのプラグインプロジェクト。
仕様駆動開発（SDD）を強制するため、タスクベースのファイルアクセス制御（Gatekeeper）を提供する。
**注意:** 一般的なアプリ開発ではなく、OpenCode拡張機能（Plugin + Tools）の開発リポジトリである。

## STRUCTURE
ソースコードが `src/` ではなく `.opencode/` に隠蔽されているのが最大の特徴。

```
omo-sdd-hybrid/
├── .opencode/           # [CORE] ソースコードの実体
│   ├── plugins/         # 監視・制御ロジック (Gatekeeper)
│   ├── tools/           # CLIコマンド (start/end task)
│   ├── lib/             # 共通ロジック (Parser, State)
│   └── state/           # 実行時状態と履歴
├── specs/               # [USER] 仕様・タスク定義 (SDDの起点)
├── __tests__/           # [DEV] テスト (.opencodeと鏡像構成)
└── package.json         # 開発用設定 (bun test等)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| **タスク定義の確認** | `specs/tasks.md` | ユーザーが編集する唯一のエントリーポイント |
| **ファイル監視ロジック** | `.opencode/plugins/sdd-gatekeeper.ts` | `write`, `edit` をフックして検証 |
| **CLIコマンド実装** | `.opencode/tools/` | `sdd_start_task.ts` 等の実装 |
| **状態管理ロジック** | `.opencode/lib/state-utils.ts` | JSON読み書き、ロック制御 |
| **テストハーネス** | `__tests__/helpers/test-harness.ts` | 編集シミュレーション用ユーティリティ |

## CONVENTIONS

### 開発フロー (SDD Cycle)
1. **Architect**: `specs/tasks.md` にタスクとScopeを定義。
2. **Implementer**: `sdd_start_task <ID>` を実行して権限を取得。
3. **Coding**: `allowedScopes` 内のファイルのみ編集。
4. **Validate**: `sdd_validate_gap` で整合性チェック。
5. **End**: `sdd_end_task` で完了。

### 実装ルール
- **言語**: TypeScript (Bunランタイム)。
- **依存管理**: ルート（開発用）と `.opencode/`（プラグイン用）で `package.json` が分離されている。
- **状態更新**: `current_context.json` の更新は必ず `proper-lockfile` と `write-file-atomic` を使用する（`state-utils.ts` 経由）。

## ANTI-PATTERNS (THIS PROJECT)
- **[FORBIDDEN] Vibe Coding**: `sdd_start_task` なしでのコード編集（Gatekeeperにより警告/ブロック）。
- **[FORBIDDEN] Destructive Bash**: `rm`, `git push`, `reset --hard` はプラグインにより物理的に禁止。
- **[Avoid] Manual State Edit**: `.opencode/state/` 内の JSON を手動で書き換えないこと（不整合の原因）。
- **[Avoid] Logic in Root**: ロジックファイルをルートに置かない。必ず `.opencode/` 内に配置する。

## UNIQUE STYLES
- **Hidden Source**: メインロジックは全て隠しディレクトリ `.opencode/` 内にある。
- **Mirror Testing**: テストディレクトリ構造はソースディレクトリ構造を厳密に反映する（`__tests__/lib` ↔ `.opencode/lib`）。
- **Japanese Only**: コミットメッセージ、コメント、ドキュメントは全て日本語。

## COMMANDS
```bash
bun install      # 依存関係インストール
bun test         # 全テスト実行
bun test:watch   # ウォッチモード
```
