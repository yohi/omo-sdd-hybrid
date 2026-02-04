# PROJECT KNOWLEDGE BASE

**Context:** OmO-SDD-Hybrid (OpenCode Plugin)
**Stack:** TypeScript, Bun, OpenCode API
**Language:** Code=English, Comments/Docs=Japanese

## 1. OVERVIEW & STRUCTURE
OpenCode環境における「仕様逸脱（Vibe Coding）」を物理的に抑止するプラグイン。
ソースコードが `.opencode/` に隠蔽される "Hybrid" 構成を採用している。

### Directory Structure
```
omo-sdd-hybrid/
├── .opencode/           # [CORE] プラグインの実体 (Hidden Source)
│   ├── plugins/         # Event Hooks (Gatekeeper, etc.)
│   ├── tools/           # CLI Tools (sdd_start_task, etc.)
│   ├── lib/             # Shared Logic & State Manager
│   └── state/           # Runtime State (Gitignored)
├── src/                 # [USER] SDD管理対象のコード領域
├── specs/               # [USER] タスク・仕様定義 (Source of Truth)
├── __tests__/           # [DEV] テスト (.opencodeと鏡像構成)
└── package.json         # 開発用 (Bun, Test, DevDeps)
```

## 2. COMMANDS (Build & Test)

このプロジェクトは **Bun** を使用しています。`npm` や `yarn` ではなく `bun` コマンドを使用してください。

### Test Execution
```bash
# 全テスト実行
bun test

# 特定ファイルのテスト実行
bun test __tests__/tools/sdd_start_task.test.ts

# ステート依存テストの直列実行 (推奨)
# ファイルロックやシングルトン状態に依存するテストが含まれるため
bun test:seq
```

### Lint / Format
明示的なLintコマンドはありませんが、既存コードのスタイル（Prettier準拠）に従ってください。

## 3. CODE STYLE GUIDELINES

### Language & naming
- **Code**: TypeScript (Strict mode)
- **Comments/Docs**: **ALL JAPANESE** (必須)。
  - 理由: 開発チームおよびユーザー（日本国内想定）の可読性最大化のため。
  - 例外: 変数名、関数名は英語 (camelCase)。
- **File Names**: kebab-case (例: `state-utils.ts`, `sdd-gatekeeper.ts`)。

### Imports
- **Relative Paths**: 内部モジュールは相対パスでインポートする (`../lib/state-utils` 等)。
- **Extensions**: `.ts` は省略するが、ESM互換性のため `.js` を付ける場合がある（既存コードに合わせる）。
- **Grouping**: 標準ライブラリ (`fs`, `path`) -> 外部ライブラリ -> 内部モジュールの順。

### Error Handling
- **Fail Fast**: 無効な状態や引数は即座に例外を投げる。
- **Messages**: エラーメッセージは **日本語** で記述する。ユーザーに表示されるため、明確な理由を含めること。
  - Bad: `throw new Error("Error")`
  - Good: `throw new Error("E_TASK_NOT_FOUND: 指定されたタスクIDが見つかりません")`
- **Prefix**: エラーコード風のプレフィックス（`E_XXX:`）を推奨。

### State Management (Critical)
- **Stateless Logic**: ツールやプラグインはステートレスに保つ。
- **Persistence**: 状態は `.opencode/state/*.json` に保存される。
- **Atomic Writes**: 状態の保存は必ず「一時ファイル書き込み -> リネーム」の順で行うこと（`writeState` 関数を利用すれば自動的に処理される）。
- **Locking**: 競合を防ぐため、`lockStateDir` を使用して排他制御を行う。

## 4. IMPLEMENTATION RULES

### Tool Implementation (`.opencode/tools/`)
- **Dynamic Load**: 起動時に動的に読み込まれるため、トップレベルでの副作用（即時実行コード）は禁止。
- **No Binaries**: バイナリ依存を含めない。純粋な TypeScript/JavaScript で完結させる。
- **Idempotency**: 可能な限り冪等性を保つ。

### Plugin Implementation (`.opencode/plugins/`)
- **Performance**: すべてのツール実行にフックされるため、処理は軽量に保つ。
- **Fail Closed**: セキュリティ（Gatekeeper）関連のチェックは、失敗した場合に「許可」ではなく「拒否（例外）」すること。

### SDD Cycle Integration
1. **Scope Check**: ファイル操作を行う際は必ず `activeTask` と `allowedScopes` を確認する。
2. **Kiro Support**: `specs/` 以下のファイル構造は Kiro (cc-sdd) との互換性を考慮する。

## 5. TESTING GUIDELINES
- **Mirror Testing**: テストファイルは `__tests__` 内に、ソースコードと同じディレクトリ構造で配置する。
  - `.opencode/tools/foo.ts` -> `__tests__/tools/foo.test.ts`
- **Mocking**: ファイルシステム操作 (`fs`) や状態管理 (`state-utils`) は必要に応じてモック化するが、結合テストでは実際のファイル生成を行う場合がある。
- **Cleanup**: テスト内で生成した一時ファイル（`.opencode/state` 等）は必ずクリーンアップする。

## 6. ANTI-PATTERNS
- **[FORBIDDEN]** `src/` 以下のコードロジックにプラグインのコア機能を実装すること（逆依存）。
- **[FORBIDDEN]** `console.log` をライブラリ層 (`lib/`) に残すこと。`logger` モジュールを使用するか、呼び出し元（ツール層）に任せる。
- **[FORBIDDEN]** 英語でのコミットメッセージ。必ず日本語で記述する。
- **[FORBIDDEN]** `as any` の乱用。型安全性は厳密に維持する。

## 7. AI AGENT BEHAVIOR
- **Response Language**: ユーザーへの回答は **日本語** で行う。
- **Thinking**: 思考プロセスは英語でも良いが、最終的な出力は日本語。
- **Proactive Fix**: 既存コードのスタイル違反（英語コメントなど）を見つけた場合は、修正時に日本語化する。
- **Check AGENTS.md**: 各サブディレクトリ（`.opencode/tools` 等）にも `AGENTS.md` がある場合、そちらの特化したルールも参照する。

## 8. ARCHITECTURE DEEP DIVE

### State Schema (`.opencode/state/current_context.json`)
The state file acts as the single source of truth for the current session.
- `activeTaskId`: 現在進行中のタスクID。
- `allowedScopes`: 書き込み許可されたGlobパターンの配列。
- `role`: 'architect' または 'implementer'。権限レベルを制御する。
- `stateHash`: 手動改ざん検知用のHMAC-SHA256署名。

### Gatekeeper Logic (`sdd-gatekeeper.ts`)
Gatekeeperはツール実行 (`tool.execute.before`) をインターセプトし、以下のロジックでアクセスを制御する。
1.  **Read State**: 現在のコンテキストとガードモード設定をロード。
2.  **Check Tool**: `write`, `edit`, `multiedit` などの変更系ツールのみ対象。
3.  **Validate Path**: 対象ファイルパスが `allowedScopes` (picomatch) にマッチするか検証。
4.  **Enforce**: マッチしない場合、`E_SCOPE_DENIED` 例外を投げて実行をブロックする。

### Glob Patterns
`picomatch` ライブラリを使用。
- `**`: 0個以上のディレクトリにマッチ。
- `src/**`: `src` 以下の全ファイルを許可。
- `specs/tasks.md`: 特定ファイルのみ許可。

## 9. TROUBLESHOOTING FOR AGENTS

### "ELOCKED" Error
- **状況**: テストやツール実行時に `Failed to acquire lock` エラーが発生する。
- **原因**: 前のプロセスがクラッシュし、ロックファイル (`.opencode/state/.lock`) が残留している。
- **対処**:
  1.  `sdd_force_unlock` を実行してロックを解除する。
  2.  テストコード内の `afterEach` でクリーンアップ漏れがないか確認する。

### "Scope Denied" Error
- **状況**: コード編集時に Gatekeeper にブロックされる。
- **対処**:
  1.  `sdd_show_context` で現在のスコープを確認。
  2.  必要であれば `specs/tasks.md` の Scope 定義を修正。
  3.  変更を反映するため、一度 `sdd_end_task` してから再度 `sdd_start_task` する。
