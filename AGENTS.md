# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-23
**Context:** OmO-SDD-Hybrid (OpenCode Plugin)
**Stack:** TypeScript, Bun, OpenCode API

## OVERVIEW
OpenCode環境における「仕様逸脱（Vibe Coding）」を物理的に抑止するためのプラグインプロジェクト。
仕様駆動開発（SDD）を強制するため、タスクベースのファイルアクセス制御（Gatekeeper）を提供する。

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
└── package.json         # 開発用設定
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| **タスク定義の確認** | `specs/tasks.md` | ユーザーが編集する唯一のエントリーポイント |
| **ファイル監視ロジック** | `.opencode/plugins/sdd-gatekeeper.ts` | `tool.execute.before` をフックして検証 |
| **CLIコマンド実装** | `.opencode/tools/` | `sdd_start_task.ts` 等の実装 |
| **状態管理ロジック** | `.opencode/lib/state-utils.ts` | JSON読み書き、アトミック操作 |

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
- **状態更新**: 必ず `lib/state-utils.ts` を経由する（`proper-lockfile` 対応）。

## ANTI-PATTERNS (THIS PROJECT)
- **[FORBIDDEN] Vibe Coding**: `sdd_start_task` なしでのコード編集（Gatekeeperによりブロック）。
- **[FORBIDDEN] Destructive Bash**: `rm`, `git push` 等はプラグインにより物理的に禁止。
- **[Avoid] Manual State Edit**: `.opencode/state/` 内の JSON を手動で書き換えない。

## UNIQUE STYLES
- **Hidden Source**: メインロジックは `.opencode/` 内に隠蔽。
- **Mirror Testing**: `__tests__` は `.opencode` の構造を厳密に反映。
- **Japanese Only**: コミットメッセージ、ドキュメントは全て日本語。

## COMMANDS
```bash
bun install      # 依存関係インストール
bun test         # 全テスト実行
bun test:seq     # 直列実行（ステート依存テスト用）
```
