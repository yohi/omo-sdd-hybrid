# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-27
**Context:** OmO-SDD-Hybrid (OpenCode Plugin)
**Stack:** TypeScript, Bun, OpenCode API

## OVERVIEW
OpenCode環境における「仕様逸脱（Vibe Coding）」を物理的に抑止するプラグイン。
タスクベースのファイルアクセス制御（Gatekeeper）を提供し、仕様駆動開発（SDD）を強制する。

## STRUCTURE
ソースコードが `.opencode/` に隠蔽される "Hybrid" 構成。

```
omo-sdd-hybrid/
├── .opencode/           # [CORE] プラグインの実体
│   ├── plugins/         # Gatekeeper, Context Injector
│   ├── tools/           # CLIコマンド実装 (sdd_start_task等)
│   ├── lib/             # 共通ロジック & 状態管理
│   └── state/           # 実行時状態 (lock, active-task)
├── src/                 # [USER] SDD管理対象のコード領域
├── specs/               # [USER] タスク・仕様定義
├── __tests__/           # [DEV] テスト (.opencodeと鏡像)
└── package.json         # 開発用 (テスト, ビルド)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| **Core Logic** | `.opencode/` | プラグインの全機能はこの中にある |
| **Task Defs** | `specs/tasks.md` | ユーザーが編集する唯一のエントリーポイント |
| **Gatekeeper** | `.opencode/plugins/sdd-gatekeeper.ts` | ファイル書き込み監視・ブロックロジック |
| **State Mgr** | `.opencode/lib/state-utils.ts` | 排他制御付き状態管理 (Manual edit禁止) |
| **CLI Tools** | `.opencode/tools/*.ts` | 各コマンドの実装 |

## CONVENTIONS

### Hybrid Package Structure
| File | Role |
|------|------|
| `./package.json` | プロジェクト開発用 (Bun, Test, DevDeps) |
| `.opencode/package.json` | プラグイン実行用 (Runtime Deps) |

### SDD Cycle
1. **Define**: `specs/tasks.md` にタスクとScopeを記述
2. **Start**: `sdd_start_task <ID>` で権限取得
3. **Code**: Scope内のみ編集可能
4. **Validate**: `sdd_validate_gap` で整合性確認
5. **End**: `sdd_end_task` で完了

## ANTI-PATTERNS (THIS PROJECT)
- **[FORBIDDEN] Vibe Coding**: `sdd_start_task` なしでのコード編集（Gatekeeperがブロック）。
- **[FORBIDDEN] Manual State Edit**: `.opencode/state/` 内のJSONを直接編集しない。
- **[FORBIDDEN] Destructive Bash**: `rm`, `git push` 等は物理的に禁止。

## UNIQUE STYLES
- **Hidden Source**: コアロジックは `.opencode/` に配置。`src/` は管理対象。
- **Mirror Testing**: `__tests__` は `.opencode` の構造を厳密に反映。
- **Japanese Only**: コミットメッセージ、ドキュメント、コメントは全て日本語。

## COMMANDS
```bash
bun test         # 全テスト実行
bun test:seq     # 直列実行（ステート依存テスト用）
```
