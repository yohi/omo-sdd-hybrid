# CORE LOGIC & PLUGINS

**Context:** OmO-SDD-Hybrid Core
**Scope:** `.opencode/` Internal

## OVERVIEW
SDD (Specification-Driven Development) を物理的に強制するためのプラグインコア。
ユーザーには隠蔽された "Hidden Source" として機能し、OpenCode環境の挙動を制御する。

## STRUCTURE
```
.opencode/
├── plugins/         # [HOOK] ツール実行への介入 (Gatekeeper)
├── tools/           # [CLI] ユーザーコマンド (start/end task)
├── lib/             # [SHARED] 共通ロジック、状態管理
└── state/           # [DB] 実行時状態とロックファイル (Git管理外)
```

## COMPONENTS

### 1. Plugins (`./plugins`)
OpenCodeのライフサイクルイベント (`tool.execute.before` 等) をフックし、ポリシーを適用する。
- **Gatekeeper**: ファイル操作を監視し、許可されていないスコープへの書き込みをブロック。

### 2. Tools (`./tools`)
`opencode.json` によって動的に読み込まれるCLIコマンド群。
- 標準的な `bin` ではなく、OpenCodeランタイム内で実行されるTypeScript関数。

### 3. Lib (`./lib`)
ステートレスなロジックと、排他制御付きの状態管理。

## CONVENTIONS (Dual package.json)
- **Runtime Isolation**: このディレクトリには独自の `package.json` があり、プラグイン実行に必要な依存 (`@opencode-ai/plugin` 等) を管理する。
- **State Management**: 状態 (`state/`) はJSONファイルとして永続化され、`lib/state-utils.ts` を介してアトミックに読み書きされる。

## DEPENDENCIES
ルートの `package.json` とは独立しているため、ここで `bun install` が必要となる場合がある。
- `cc-sdd`: 仕様書連携用ライブラリ
