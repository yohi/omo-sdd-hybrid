# OmO-SDD-Hybrid Phase 0 実装計画

## Context

### Original Request
spec.md に定義された OmO-SDD-Hybrid プラグインの Phase 0 実装。
TDD アプローチで、受け入れ基準シナリオ A-I（9シナリオ）をカバー。

### Interview Summary
**Key Discussions**:
- テスト戦略: TDD（テスト先行）
- 実装スコープ: Phase 0 完全実装
- kiro 統合: スタブのみ（将来の統合に備える）

**Research Findings**:
- OpenCode Plugin API: `tool.execute.before` フックで介入可能
- Custom Tools: `tool()` ヘルパー + Zod スキーマ
- Skills: YAML frontmatter + Markdown

### Spec Review Summary
MUST FIX 項目5件を解決済み:
1. kiro 依存を任意統合に降格
2. Glob 仕様固定（picomatch）
3. パス正規化アルゴリズム明文化
4. State 更新の原子性
5. tasks.md Scope 表現の Phase 1 統一

### Primary Reference Document

**仕様書パス**: `/home/y_ohi/program/omo-sdd-hybrid/spec.md`

本計画は上記仕様書に基づく。以下は仕様書の主要セクションと行番号:

| セクション | 行範囲 | 内容 |
|-----------|-------|------|
| 4. tasks.md フォーマット | L99-L210 | TaskID/Scope 文法、Phase 別ルール |
| 5. State ファイル仕様 | L212-L355 | JSON スキーマ、ロック、atomic write |
| 6. Custom Tool 仕様 | L356-L405 | sdd_start_task, sdd_end_task, sdd_show_context |
| 7. Gatekeeper 仕様 | L407-L455 | Rule 0-4、warn/block モード |
| 7.6 パス正規化 | L457-L600 | 6ステップアルゴリズム |
| 7.5 Glob マッチング | L601-L675 | picomatch、パターン仕様 |
| 8. Skills | L677-L777 | sdd-architect, sdd-implementer |
| 10. 受け入れ基準 | L789-L800 | シナリオ A-F テーブル |

---

## Embedded Specifications (Self-Contained)

### パス解決の前提（実行環境）

**OpenCode 実行時の cwd（カレントディレクトリ）**:
- OpenCode はプロジェクトルート（worktree ルート）から実行される前提
- 相対パス（`specs/tasks.md`, `.opencode/state/current_context.json`）はすべて **worktree ルートからの相対パス**

**パス解決の方針**:
```typescript
import { getWorktreeRoot } from '.opencode/lib/path-utils';
import path from 'path';

// 相対パスを絶対パスに変換
const worktreeRoot = getWorktreeRoot();  // git rev-parse --show-toplevel or process.cwd()
const TASKS_PATH = path.join(worktreeRoot, 'specs/tasks.md');
const STATE_PATH = path.join(worktreeRoot, '.opencode/state/current_context.json');
```

**テスト時の前提**:
- テストは `process.cwd()` がプロジェクトルートになる前提で実行（`bun test` のデフォルト動作）
- テスト内で作成する `specs/tasks.md` や State ファイルは相対パスで作成・削除

### State ファイル仕様

**パス**: `.opencode/state/current_context.json`

**JSON スキーマ**:
```json
{
  "version": 1,
  "activeTaskId": "Task-1",
  "activeTaskTitle": "ユーザー認証APIの実装",
  "allowedScopes": ["src/auth/**", "src/users/**", "tests/auth/**"],
  "startedAt": "2026-01-20T00:00:00.000Z",
  "startedBy": "agent-name-or-role",
  "sessionId": "optional",
  "messageId": "optional"
}
```

**不変条件**:
- `activeTaskId` が存在しない場合、`specs/**` と `.opencode/**` 以外の編集は不可
- `allowedScopes` が空の場合、編集不可

**State 破損時のフォールバック（spec.md:L325-L352）**:

| Phase | 動作 | メッセージ |
|-------|------|-----------|
| Phase 0 | WARN + 実行許可（`specs/**`, `.opencode/**` のみ） | `STATE_CORRUPTED: current_context.json が破損しています。再作成が必要です` |
| Phase 1 | BLOCK | `STATE_CORRUPTED: current_context.json が破損しています。sdd_start_task を実行してください` |

**破損判定ロジック**:
```typescript
function loadState(): State | null {
  try {
    if (!fs.existsSync(STATE_PATH)) return null; // ファイルなし = State なし
    
    const content = fs.readFileSync(STATE_PATH, 'utf-8');
    const state = JSON.parse(content);
    
    // 最小限のスキーマ検証
    if (!state.activeTaskId || !Array.isArray(state.allowedScopes)) {
      console.warn('STATE_CORRUPTED: Invalid state schema');
      return null; // 破損扱い
    }
    
    return state;
  } catch (error) {
    console.warn('STATE_CORRUPTED:', error.message);
    return null; // JSON パースエラー = 破損
  }
}
```

**clearState() の仕様決定**:
- 本計画では **ファイル削除方式** を採用（`spec.md:L397` の「削除」オプション）
- 理由: `activeTaskId=null` 方式より実装がシンプルで、State なしの判定が明確

### tasks.md フォーマット

**パス**: `specs/tasks.md`

**Phase 0 パース戦略（Lenient Mode）**:

Phase 0 では以下の2形式の両方をパースする必要がある（`spec.md:L116-L120`）:

1. **バッククォートあり（推奨）**:
   ```markdown
   * [ ] Task-1: Title (Scope: `src/auth/**`, `tests/**`)
   ```

2. **バッククォートなし（レガシー、非推奨だが許容）**:
   ```markdown
   * [ ] Task-1: Title (Scope: src/auth/**, tests/**)
   ```

**TaskID 正規表現**: `[A-Za-z][A-Za-z0-9_-]*-\d+`

**Scope パース正規表現（Lenient）**:
```typescript
// バッククォートあり: `glob` をキャプチャ
const BACKTICK_SCOPE_REGEX = /`([^`]+)`/g;

// バッククォートなし: カンマ区切りでスペースをトリム
const BARE_SCOPE_REGEX = /,\s*/;

function parseScopes(scopeStr: string): string[] {
  // まずバッククォート形式を試す
  const backtickMatches = [...scopeStr.matchAll(BACKTICK_SCOPE_REGEX)];
  if (backtickMatches.length > 0) {
    return backtickMatches.map(m => m[1]);
  }
  
  // バッククォートなし: カンマ区切り
  return scopeStr.split(BARE_SCOPE_REGEX).map(s => s.trim()).filter(Boolean);
}
```

**例**:
```markdown
# バッククォートあり（推奨）
* [ ] Task-1: ユーザー認証APIの実装 (Scope: `src/auth/**`, `src/users/**`)

# バッククォートなし（レガシー、Phase 0 で許容）
* [ ] Task-2: 決済機能 (Scope: src/pay/**, tests/pay/**)
```

### Gatekeeper Rule 仕様

| Rule | 条件 | 動作 (Phase 0) |
|------|------|---------------|
| Rule 0 | パスが `specs/**` または `.opencode/**` | 常に allow |
| Rule 1 | State なし or activeTaskId なし or allowedScopes 空 | warn (NO_ACTIVE_TASK) |
| Rule 2 | パスが allowedScopes にマッチしない | warn (SCOPE_DENIED) |
| Rule 3 | パスが worktree 外 (`../` 等) | warn (OUTSIDE_WORKTREE) |
| Rule 4 | bash が破壊的コマンド (`rm`, `git push` 等) | warn (補助) |

### 受け入れ基準シナリオ A-I（9シナリオ）

| ID | 事前状態 | 操作 | 操作対象パス | 期待結果 (Phase 0) |
|----|---------|------|-------------|-------------------|
| A | state なし | edit | `src/a.ts` | WARN (NO_ACTIVE_TASK) |
| B | Task-1, Scope=`src/auth/**` | edit | `src/auth/x.ts` | allow |
| C | Task-1, Scope=`src/auth/**` | edit | `src/pay/y.ts` | WARN (SCOPE_DENIED) |
| D | 任意 | edit | `specs/tasks.md` | allow (Rule 0) |
| E | 任意 | edit | `../secrets.txt` | WARN (OUTSIDE_WORKTREE) |
| F | 任意 | bash | `rm -rf /tmp` | WARN (Rule 4) |
| G | Task-1, Scope=`src/auth/**` | multiedit | `src/auth/x.ts`, `src/pay/y.ts` | WARN (1/2 ファイルで警告) |
| H | state 破損 | edit | `src/a.ts` | WARN (STATE_CORRUPTED) |
| I | state 破損 | edit | `specs/tasks.md` | allow (Rule 0) |

---

## Work Objectives

### Core Objective
OmO-SDD-Hybrid プラグインの Phase 0（warn モード）を TDD で実装し、「タスク単位の最小権限で仕様逸脱を警告できる」状態にする。

### Concrete Deliverables

**ファイル作成/編集の区別:**

| ファイル | 操作 | 説明 |
|---------|------|------|
| `.opencode/tools/sdd_start_task.ts` | **新規作成** | タスク開始 → State 生成 |
| `.opencode/tools/sdd_end_task.ts` | **新規作成** | State クリア |
| `.opencode/tools/sdd_show_context.ts` | **新規作成** | 現在の State 表示 |
| `.opencode/tools/sdd_validate_gap.ts` | **新規作成** | kiro 統合スタブ |
| `.opencode/plugins/sdd-gatekeeper.ts` | **新規作成** | warn モード Gatekeeper |
| `.opencode/plugins.json` | **新規作成** | プラグイン登録設定 |
| `.opencode/skills/sdd-architect/SKILL.md` | **新規作成** | Architect スキル |
| `.opencode/skills/sdd-implementer/SKILL.md` | **新規作成** | Implementer スキル |
| `.opencode/lib/path-utils.ts` | **新規作成** | パス正規化ユーティリティ |
| `.opencode/lib/glob-utils.ts` | **新規作成** | Scope マッチング |
| `.opencode/lib/state-utils.ts` | **新規作成** | State 読み書き |
| `.opencode/lib/tasks-parser.ts` | **新規作成** | tasks.md パーサー |
| `.opencode/lib/plugin-stub.ts` | **条件付き新規作成** | Plugin API スタブ（Task -1 結果に依存） |
| `specs/tasks.md` | **新規作成** | タスク定義テンプレート |
| `__tests__/**/*.test.ts` | **新規作成** | テストスイート |
| `package.json` | **新規作成** | プロジェクト設定 |
| `README.md` | **新規作成** | 使用方法ドキュメント |

> **注**: このプロジェクトは新規プロジェクトのため、すべてのファイルは新規作成です。既存ファイルの編集はありません。

### OpenCode Plugin API 参照元

**重要**: OpenCode Plugin API は執筆時点で公式ドキュメントが限定的です。

**参照先（具体的なリポジトリ/ファイルパス）**:

1. **OpenCode ソースコード** (https://github.com/anomalyco/opencode)
   - **バージョン/タグ**: `v1.1.25`（固定、Task -1 と同じ）
   - **Plugin 型定義（推定）**: `packages/opencode/src/plugin/` ディレクトリ
   - **Tool 登録形式（推定）**: `packages/opencode/src/tool/` ディレクトリ
   - **.opencode ディレクトリ**: リポジトリルートに `.opencode/` ディレクトリが存在（参考になる可能性）

2. **プラグイン登録の検証手順（実装時に必須）**:
   ```bash
   # 1. OpenCode リポジトリをクローン
   git clone https://github.com/anomalyco/opencode.git /tmp/opencode-verify
   cd /tmp/opencode-verify
   
   # 2. 検証時のコミットハッシュを記録
   git rev-parse HEAD > /tmp/opencode-commit.txt
   echo "検証コミット: $(cat /tmp/opencode-commit.txt)"
   
   # 3. packages ディレクトリ構造を確認
   ls -la packages/
   
   # 4. Plugin 関連ファイルを検索
   find . -name "*.ts" | xargs grep -l "plugin" | head -20
   
   # 5. Tool 登録形式を検索
   grep -r "tool(" packages/ --include="*.ts" | head -10
   
   # 6. .opencode ディレクトリの構造を確認
   ls -la .opencode/
   ```

3. **本計画での仮定（検証が必要）**:
   - `.opencode/plugins.json` でプラグインを登録
   - `.opencode/tools/*.ts` は自動検出
   - `.opencode/skills/*/SKILL.md` は自動検出
   - `tool.execute.before` フックが存在する

**Plugin 登録設定** (`.opencode/plugins.json` - 仮定):
```json
{
  "plugins": [
    {
      "name": "sdd-gatekeeper",
      "path": "./plugins/sdd-gatekeeper.ts",
      "enabled": true
    }
  ]
}
```

> **⚠️ 実装時の最初のタスク**: OpenCode リポジトリを確認し、上記の仮定が正しいか検証すること。異なる場合は設定形式を調整する。これは Task 0 の前に行う必須確認事項。

### Definition of Done
- [x] `bun test` で全テストが pass
- [x] シナリオ A-I がすべて手動で再現可能（9シナリオ）
- [x] `sdd_start_task Task-1` でタスク開始 → State 生成
- [x] Scope 外ファイル編集時に WARN ログ出力
- [x] `specs/**`, `.opencode/**` は常に編集可能

### Must Have
- sdd_start_task: tasks.md パース → State 生成
- sdd-gatekeeper: warn モードで Rule 0-4 実装
- テストスイート: 9シナリオカバー（A-I）
- Skills: sdd-architect, sdd-implementer

### Must NOT Have (Guardrails)
- Phase 1 の block モード実装（今回スコープ外）
- kiro との実際の統合（スタブのみ）
- sdd-orchestrator（Phase 1 推奨）
- migration script（Phase 1 準備で実装）
- `src/**` のような広すぎる Scope の許可（テスト時も最小権限）

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO（新規プロジェクト）
- **User wants tests**: YES (TDD)
- **Framework**: bun test（Bun ネイティブ）

### Test Infrastructure Setup (Task 0)

**設定ファイル作成:**
- `package.json` に test script 追加、**すべての依存はここに追加**
- `.opencode/package.json` 作成（OpenCode 設定ファイル、依存は含まない）

**TDD ワークフロー:**
1. **RED**: 失敗するテストを書く
2. **GREEN**: 最小実装でパス
3. **REFACTOR**: リファクタリング

---

## Task Flow

```
Task -1 (OpenCode API 検証) ← 最初に実行必須
    ↓
Task 0 (Test Infra)
    ↓
Task 1 (Utilities) ──→ Task 2 (sdd_start_task) ──→ Task 4 (Gatekeeper)
                             ↓
                       Task 3 (sdd_end_task, sdd_show_context)
                             ↓
                       Task 5 (sdd_validate_gap stub)
                             ↓
                       Task 6 (Skills)
                             ↓
                       Task 7 (E2E Tests)
                             ↓
                       Task 8 (Templates)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 2, 3 | sdd_start_task と sdd_end_task は独立して実装可能 |
| B | 6 | Skills は他タスク完了後に並列作成可能 |

| Task | Depends On | Reason |
|------|------------|--------|
| 0 | -1 | テストインフラは API 検証後 |
| 1 | 0 | Utilities はテストインフラ後 |
| 2 | 1 | sdd_start_task は Utilities 使用 |
| 3 | 1 | sdd_end_task は Utilities 使用 |
| 4 | 2 | Gatekeeper は State 読み込みが必要 |
| 5 | 2 | validate_gap は State 参照 |
| 7 | 4 | E2E は Gatekeeper 完成後 |

---

## TODOs

### Task -1: OpenCode Plugin API 検証（必須事前タスク）

**What to do**:
- OpenCode リポジトリをクローンし、Plugin API の仕様を確認
- `.opencode/plugins.json` の形式を特定
- `tool.execute.before` フックの存在と引数形式を確認
- 仕様が本計画の仮定と異なる場合、調整点を記録

**参照先（固定）**:
- **リポジトリ**: https://github.com/anomalyco/opencode
- **コミット/タグ**: `v1.1.25`（固定、これ以外のバージョンは使用しない）
- **確認対象ディレクトリ/ファイル**:
  - `packages/` - パッケージ構造
  - `.opencode/` - プラグイン/ツール/スキルの実際の配置例
  - `*.ts` ファイル内の `plugin`, `tool`, `skill` キーワード

**検証手順**:
```bash
# 1. OpenCode リポジトリをクローン（タグ固定）
git clone --depth 1 --branch v1.1.25 https://github.com/anomalyco/opencode.git /tmp/opencode-verify
cd /tmp/opencode-verify

# 2. 検証時のコミットハッシュを記録
git rev-parse HEAD > /tmp/opencode-commit.txt
echo "検証コミット: $(cat /tmp/opencode-commit.txt)"

# 3. packages ディレクトリ構造を確認
ls -la packages/ 2>/dev/null || echo "packages/ ディレクトリなし"

# 4. .opencode ディレクトリの構造を確認（重要）
ls -laR .opencode/ 2>/dev/null || echo ".opencode/ ディレクトリなし"

# 5. Plugin 関連の型定義を検索
find . -name "*.ts" -type f | xargs grep -l "Plugin\|plugin" 2>/dev/null | head -20

# 6. Tool 登録形式を検索
grep -r "tool(" . --include="*.ts" 2>/dev/null | head -10

# 7. tool.execute.before または同等のフックを検索
grep -r "execute\.before\|beforeExecute\|onToolExecute" . --include="*.ts" 2>/dev/null | head -10
```

**リポジトリが見つからない場合の分岐条件**:

| 状況 | 対応 |
|------|------|
| リポジトリ clone 失敗 | 公式ドキュメント (https://opencode.ai) を参照、代替情報源を探す |
| packages/ ディレクトリなし | .opencode/ ディレクトリの構造を優先参照 |
| Plugin 型定義が見つからない | スタブ実装を作成し、後で正式な型に置き換え |
| tool.execute.before フックなし | 代替フック（`beforeToolExecute` 等）を探す、なければカスタムラッパーを検討 |

**Acceptance Criteria**:

**確認項目:**
- [x] `tool.execute.before` フックが存在するか → YES/NO
- [x] `.opencode/plugins.json` 形式が正しいか → YES/NO/別形式
- [x] Tools 自動検出が機能するか → YES/NO
- [x] Skills 自動検出が機能するか → YES/NO

**調整記録（仕様が異なる場合）:**
```markdown
## 検証結果

検証日時: YYYY-MM-DD HH:MM
検証コミット: <hash>

### 確認結果
- tool.execute.before: [存在する/存在しない/別名で存在]
- plugins.json 形式: [一致/要調整: 正しい形式は ...]
- Tools 自動検出: [動作する/動作しない: 必要な設定は ...]
- Skills 自動検出: [動作する/動作しない: 必要な設定は ...]

### 調整点
1. [調整内容]
2. [調整内容]
```

**`@opencode-ai/plugin` の依存解決**:

OpenCode Plugin API は独立した npm パッケージとして提供されていない可能性があります。
Task -1 で以下を確認し、結果に応じて対応します:

| 状況 | 対応 | 依存追加先 |
|------|------|-----------|
| `@opencode-ai/plugin` が npm に存在 | `package.json` に追加 | **ルート `package.json`** のみ |
| OpenCode 本体からエクスポート | `opencode` パッケージを追加 | **ルート `package.json`** のみ |
| 独立パッケージなし | `.opencode/lib/plugin-stub.ts` を作成 | 依存追加不要、スタブ使用 |

> **依存追加先の明確化**: すべての依存は **ルート `package.json`** に追加します。`.opencode/package.json` は OpenCode が読み込む設定ファイルであり、依存管理には使用しません。

**計画更新の反映先（Task -1 完了時）**:

検証結果に基づき、以下のセクションを更新すること:

| 検証結果 | 更新対象セクション | 更新内容 |
|---------|------------------|---------|
| plugins.json 形式が異なる | Task 0「Created Files」内の `plugins.json` | 正しい形式に書き換え |
| tool.execute.before が存在しない | Task 4「Implementation Details」内のフック部分 | 発見したフック名に置換 |
| Tools 自動検出が動作しない | Task 0「Created Files」に登録設定を追加 | tools 登録方法を追記 |
| Skills 自動検出が動作しない | Task 6「Implementation Details」 | skills 登録方法を追記 |
| @opencode-ai/plugin が存在しない | Task 0「Created Files」 | `.opencode/lib/plugin-stub.ts` を追加 |
| ToolExecuteBeforeEvent 構造が異なる | Task 4「Implementation Details」の `evaluateAccess()` 呼び出し部分、および `.opencode/lib/plugin-stub.ts` の `ToolExecuteBeforeEvent` 定義 | 引数マッピング（`filePath`/`path`/`files`/`command`）を実際の構造に合わせて修正 |

**スタブ作成例**（npm パッケージが存在しない場合）:
```typescript
// .opencode/lib/plugin-stub.ts
// OpenCode Plugin API のスタブ（テスト用）

import { z } from 'zod';

export function tool<T extends z.ZodRawShape>(config: {
  description: string;
  args: T;
  execute: (args: z.infer<z.ZodObject<T>>, context: any) => Promise<string>;
}) {
  return config;
}

tool.schema = z;

export interface Plugin {
  (opts: { client: any }): Promise<{
    'tool.execute.before'?: (event: any) => Promise<void>;
  }>;
}
```

> **⚠️ 実装時の確認事項**: Task -1 で `@opencode-ai/plugin` の存在を確認し、存在しない場合は上記スタブを `.opencode/lib/plugin-stub.ts` に作成し、各ツールのインポートを調整すること。

**Must NOT do**:
- 検証せずに実装を開始すること

**Parallelizable**: NO（最初に実行必須）

**Commit**: NO（検証のみ、コード変更なし）

**検証結果の後続タスクへの影響（分岐条件）:**

| 検証項目 | 結果 | 後続タスクへの影響 |
|---------|------|------------------|
| **`tool.execute.before` フック** | 存在する | Task 4: 標準的なフック実装を使用 |
| | 存在しない or 別名 | Task 4: 発見した API 形式に合わせて実装変更、計画を更新 |
| **`.opencode/plugins.json` 形式** | 計画通り | Task 4: 計画の `plugins.json` をそのまま使用 |
| | 形式が異なる | Task 0/4: 正しい形式で `plugins.json` を作成、計画を更新 |
| **Tools 自動検出** | 動作する | Task 2/3/5: `.opencode/tools/*.ts` に配置 |
| | 動作しない | 別の登録方法を計画に追記（例: plugins.json に tools 登録） |
| **Skills 自動検出** | 動作する | Task 6: `.opencode/skills/*/SKILL.md` に配置 |
| | 動作しない | 別の登録方法を計画に追記 |
| **`@opencode-ai/plugin`** | npm に存在 | Task 0: `package.json` に依存追加 |
| | 存在しない | Task 0: `.opencode/lib/plugin-stub.ts` を作成、インポートパスを調整 |

> **重要**: Task -1 で上記のいずれかが計画と異なる場合、**即座に計画ファイルを更新**してから Task 0 に進むこと。

**API 形状が変わった場合の調整手順**:

Task -1 で `tool()` や Plugin API の形状が計画と異なることが判明した場合、以下の手順で調整する:

1. **`tool()` の引数形式が異なる場合**:
   - `.opencode/lib/plugin-stub.ts` の `tool()` 関数シグネチャを修正
   - Task 2/3/5 の実装詳細コードを修正
   - テストの `execute()` 呼び出し方法を修正（例: `context` の必須プロパティが増えた場合）

2. **`execute()` の呼び出し署名が異なる場合**:
   - 各ツールのテストファイルで、正しい署名で呼び出すように修正
   - 例: `execute({ taskId }, context)` → `execute(args, ctx)` など

3. **Plugin フックの名前が異なる場合**:
   - Task 4 の `'tool.execute.before'` を発見したフック名に置換
   - `.opencode/lib/plugin-stub.ts` の `ToolExecuteBeforeEvent` 型を修正

4. **調整の記録**:
   - 変更点は計画ファイルの該当セクションに直接反映
   - コミットメッセージに `(API調整)` を付記

---

### Task 0: テストインフラのセットアップ

**What to do**:
- プロジェクトルートに `package.json` 作成（**すべての依存はここで管理**）
- `.opencode/package.json` 作成（OpenCode 設定ファイル、依存は含まない）
- 依存パッケージ（ルート `package.json` に追加）: picomatch, proper-lockfile, write-file-atomic, zod
- テストフレームワーク: bun test（ネイティブ）
- `@opencode-ai/plugin` スタブ作成（Task -1 の結果に依存）
- `bun install` で依存パッケージをインストール
- 例題テストで動作確認

**依存インストール手順**:
```bash
# 1. package.json 作成後、依存パッケージをインストール
bun install

# 2. インストール確認
ls node_modules | grep picomatch  # picomatch が表示される

# 3. テスト実行
bun test

# 注: `bun test` は自動で依存をインストールしない
# 必ず事前に `bun install` を実行すること
```

**Must NOT do**:
- Jest や Vitest のインストール（bun test で十分）
- 複雑な設定ファイル

**Parallelizable**: NO（最初に実行必須）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L603-L608` (セクション 7.5.1) - picomatch ライブラリ指定: `picomatch@^2.3.1`
- `spec.md:L247-L280` (セクション 5.4.2) - proper-lockfile 使用例
- `spec.md:L282-L323` (セクション 5.4.3) - write-file-atomic 使用例

**External References**:
- Bun Test: `bun test --help` で利用可能なオプションを確認
- Bun Test 概要: テストファイルは `*.test.ts`, `*.spec.ts` または `__tests__/` 以下を自動検出
- picomatch: https://github.com/micromatch/picomatch
- proper-lockfile: https://github.com/moxystudio/node-proper-lockfile

**Created Files**:

_package.json (プロジェクトルート):_
```json
{
  "name": "omo-sdd-hybrid",
  "type": "module",
  "scripts": {
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest"
  },
  "dependencies": {
    "picomatch": "^2.3.1",
    "proper-lockfile": "^4.1.2",
    "write-file-atomic": "^5.0.1",
    "zod": "^3.22.0"
  }
}
```

_.opencode/package.json (OpenCode が読み込む設定ファイル、依存管理には使用しない):_
```json
{
  "name": "omo-sdd-hybrid-plugin",
  "type": "module"
}
```

> **注**: すべての依存はルート `package.json` で管理します。`.opencode/package.json` は OpenCode の設定ファイルであり、`dependencies` は記載しません。

_.opencode/lib/plugin-stub.ts (Task -1 で @opencode-ai/plugin が存在しない場合に作成):_
```typescript
/**
 * OpenCode Plugin API スタブ
 * 
 * このファイルは @opencode-ai/plugin パッケージが npm に存在しない場合のフォールバック。
 * Task -1 の検証結果に基づき、必要に応じて作成する。
 * 
 * 実際の OpenCode との統合時は、正式な API に置き換える。
 */
import { z } from 'zod';

export function tool<T extends z.ZodRawShape>(config: {
  description: string;
  args: T;
  execute: (args: z.infer<z.ZodObject<T>>, context: any) => Promise<string>;
}) {
  return {
    ...config,
    schema: z.object(config.args),
  };
}

// Zod スキーマビルダーを公開
tool.schema = z;

// Plugin 型定義
export interface Plugin {
  (opts: { client: any }): Promise<{
    'tool.execute.before'?: (event: ToolExecuteBeforeEvent) => Promise<void>;
  }>;
}

export interface ToolExecuteBeforeEvent {
  tool: {
    name: string;
    args: Record<string, any>;
  };
}
```

**Acceptance Criteria**:

**Setup:**
- [x] `package.json` 作成（zod 含む、すべての依存はここに）
- [x] `.opencode/package.json` 作成（設定ファイル、依存なし）
- [x] `bun install` 実行 → `node_modules/` 作成
- [x] Task -1 の結果に基づき:
  - `@opencode-ai/plugin` が存在 → ルート `package.json` に依存追加
  - 存在しない → `.opencode/lib/plugin-stub.ts` 作成

**TDD (RED):**
- [x] `__tests__/example.test.ts` 作成
- [x] テストコマンド: `bun test`
- [x] 期待: テストが実行される（pass または fail）

**Manual Verification:**
- [x] `bun install` → 成功（exit code 0）
- [x] `ls node_modules | grep picomatch` → `picomatch` 表示
- [x] `bun test` → テスト結果が表示される

**Commit**: YES
- Message: `chore: setup test infrastructure with bun`
- Files: `package.json`, `.opencode/package.json`, `__tests__/example.test.ts`
- Pre-commit: `bun install && bun test`

---

### Task 1: ユーティリティモジュール実装

**What to do**:
- `.opencode/lib/path-utils.ts`: パス正規化、worktree 判定
- `.opencode/lib/glob-utils.ts`: Scope マッチング（picomatch ラッパー）
- `.opencode/lib/state-utils.ts`: State 読み書き（ロック + atomic write）
- `.opencode/lib/tasks-parser.ts`: tasks.md パーサー
- 各モジュールの単体テスト

**Must NOT do**:
- Gatekeeper ロジックの実装（Task 4）
- 複雑な抽象化（YAGNI）

**Parallelizable**: NO（他タスクの基盤）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L457-L600` (セクション 7.6) - パス正規化アルゴリズム（6ステップ）
  - Step 1: 絶対パス化 `path.resolve(filePath)`
  - Step 2: Symlink 解決しない（`fs.realpath` 使わない）
  - Step 3: Worktree ルート取得 `git rev-parse --show-toplevel`
  - Step 4: 相対パス化 `path.relative(worktreeRoot, absolutePath)`
  - Step 5: Worktree 外判定 `relativePath.startsWith('..')`
  - Step 6: POSIX 形式正規化 `relativePath.split(path.sep).join('/')`
- `spec.md:L601-L675` (セクション 7.5) - Glob マッチング仕様
  - ライブラリ: picomatch
  - `**` は再帰マッチ
  - Dotfile はデフォルトでマッチしない (`{ dot: false }`)
  - パスセパレータは常に `/`
- `spec.md:L212-L355` (セクション 5) - State ファイル仕様
  - パス: `.opencode/state/current_context.json`
  - ロック: proper-lockfile
  - Atomic write: write-file-atomic
- `spec.md:L99-L210` (セクション 4) - tasks.md フォーマット
  - TaskID 正規表現: `[A-Za-z][A-Za-z0-9_-]*-\d+`
  - Scope: `(Scope: \`glob1\`, \`glob2\`)`

**External References**:
- picomatch API: https://github.com/micromatch/picomatch
- proper-lockfile API: https://github.com/moxystudio/node-proper-lockfile

**Implementation Details**:

_path-utils.ts 実装ロジック:_
```typescript
// spec.md:L457-L600 のパス正規化アルゴリズム実装
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

/**
 * Git worktree のルートディレクトリを取得
 * 
 * 取得方法: `git rev-parse --show-toplevel`
 * 
 * git 非存在時の fallback:
 * - git コマンドが失敗した場合は process.cwd() を返す
 * - これにより非 git 環境でもプラグインが動作する（ただし worktree 外判定は無効）
 * 
 * 戻り値: 絶対パス（末尾スラッシュなし）
 * 例: '/home/user/my-project'
 */
export function getWorktreeRoot(): string {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']  // stderr を抑制
    });
    return result.trim();
  } catch {
    // git コマンド失敗時は cwd をフォールバック
    return process.cwd();
  }
}

/**
 * Symlink かどうかを判定（spec.md:L475-L488 に準拠）
 * 
 * 注意: Symlink は解決しない（fs.realpath を使わない）
 * 理由: Symlink で worktree 外を指すことで迂回されるリスクを防ぐ
 * 
 * @param filePath 判定対象のパス
 * @returns Symlink なら true
 */
export function isSymlink(filePath: string): boolean {
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isSymbolicLink();
  } catch {
    // ファイルが存在しない場合は false
    return false;
  }
}

export function isOutsideWorktree(filePath: string, worktreeRoot: string): boolean {
  // Step 1: 絶対パス化（Symlink は解決しない）
  const absolutePath = path.resolve(filePath);
  
  // Step 4-5: Worktree ルートからの相対パスを計算し、外部判定
  const relativePath = path.relative(worktreeRoot, absolutePath);
  return relativePath.startsWith('..') || relativePath === '';
}

export function normalizeToRepoRelative(filePath: string, worktreeRoot: string): string {
  // Step 1: 絶対パス化
  const absolutePath = path.resolve(filePath);
  
  // Step 4: 相対パス化
  const relativePath = path.relative(worktreeRoot, absolutePath);
  
  // Step 6: POSIX 形式正規化
  return relativePath.split(path.sep).join('/');
}
```

_glob-utils.ts 実装ロジック:_
```typescript
// spec.md:L430-L450 のマッチング仕様
import picomatch from 'picomatch';

export function matchesScope(normalizedPath: string, allowedScopes: string[]): boolean {
  return allowedScopes.some(glob => 
    picomatch.isMatch(normalizedPath, glob, { dot: false })
  );
}
```

_state-utils.ts 実装ロジック:_
```typescript
// spec.md:L220-L270 のロック + atomic write
import lockfile from 'proper-lockfile';
import writeFileAtomic from 'write-file-atomic';
import fs from 'fs';
import path from 'path';

const STATE_DIR = '.opencode/state';
const STATE_PATH = `${STATE_DIR}/current_context.json`;

export interface State {
  version: number;
  activeTaskId: string;
  activeTaskTitle: string;
  allowedScopes: string[];
  startedAt: string;
  startedBy: string;
}

/**
 * State ファイルの書き込み（ロック + atomic write）
 * 
 * proper-lockfile の初回作成時の挙動:
 * - proper-lockfile は対象ファイルが存在しない場合に失敗する
 * - 解決策: ディレクトリをロック対象にする（`lockfile.lock(STATE_DIR)`）
 * - これにより、ファイルの有無に関わらずロックが取得可能
 */
export async function writeState(state: State): Promise<void> {
  // State ディレクトリが存在しない場合は作成
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  
  // ディレクトリをロック対象にすることで、ファイル未存在時も動作
  const release = await lockfile.lock(STATE_DIR, { 
    retries: 5,
    stale: 10000  // 10秒でロックを古いと見なす
  });
  try {
    await writeFileAtomic(STATE_PATH, JSON.stringify(state, null, 2));
  } finally {
    await release();
  }
}

/**
 * State 読み込み結果の型
 * 
 * 設計: 「State なし」と「State 破損」を区別するため、戻り値を拡張
 */
export type StateResult = 
  | { status: 'ok'; state: State }
  | { status: 'not_found' }          // ファイルが存在しない（正常な初期状態）
  | { status: 'corrupted'; error: string };  // ファイルが破損している

/**
 * State ファイルの読み込み（同期関数）
 * 
 * 設計決定: readState() は同期関数とする
 * 理由:
 * - Gatekeeper の evaluateAccess() は純粋関数として設計
 * - テストハーネスでの呼び出しが簡潔になる
 * - ファイル読み込みは高速で、非同期のメリットが少ない
 * 
 * 注意: writeState() は非同期のまま（ロック処理が必要なため）
 */
export function readState(): StateResult {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return { status: 'not_found' };
    }
    
    const content = fs.readFileSync(STATE_PATH, 'utf-8');
    const state = JSON.parse(content);
    
    // 最小限のスキーマ検証
    if (!state.activeTaskId || !Array.isArray(state.allowedScopes)) {
      return { status: 'corrupted', error: 'Invalid state schema' };
    }
    
    return { status: 'ok', state };
  } catch (error) {
    return { status: 'corrupted', error: (error as Error).message };
  }
}

/**
 * State ファイルの削除（同期関数）
 * 
 * 設計決定: ファイル削除方式（spec.md:L397）
 */
export function clearState(): void {
  try {
    if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  } catch (error) {
    console.warn('clearState failed:', (error as Error).message);
  }
}
```

_tasks-parser.ts 実装ロジック:_
```typescript
// spec.md:L100-L110 の文法 + Phase 0 Lenient Mode (L109-L143)
const TASK_REGEX = /^\* \[([ x])\] ([A-Za-z][A-Za-z0-9_-]*-\d+): (.+?) \(Scope: (.+)\)$/;
const BACKTICK_SCOPE_REGEX = /`([^`]+)`/g;
const BARE_SCOPE_REGEX = /,\s*/;

export interface ParsedTask {
  id: string;
  title: string;
  scopes: string[];
  done: boolean;
}

/**
 * Phase 0 Lenient Scope パース
 * - バッククォートあり: `glob1`, `glob2` → ['glob1', 'glob2']
 * - バッククォートなし: glob1, glob2 → ['glob1', 'glob2']
 */
function parseScopes(scopeStr: string): string[] {
  // まずバッククォート形式を試す
  const backtickMatches = [...scopeStr.matchAll(BACKTICK_SCOPE_REGEX)];
  if (backtickMatches.length > 0) {
    return backtickMatches.map(m => m[1]);
  }
  
  // バッククォートなし: カンマ区切り
  return scopeStr.split(BARE_SCOPE_REGEX).map(s => s.trim()).filter(Boolean);
}

export function parseTask(line: string): ParsedTask | null {
  const match = line.match(TASK_REGEX);
  if (!match) return null;
  
  const [, checkbox, id, title, scopeStr] = match;
  const scopes = parseScopes(scopeStr);
  
  return { id, title, scopes, done: checkbox === 'x' };
}

/**
 * tasks.md ファイル全体をパース
 * 
 * 仕様:
 * - 空行: スキップ
 * - コメント行 (# で始まる): スキップ
 * - パース失敗行: スキップ（警告なし、lenient モード）
 * - 順序保持: ファイル内の出現順を維持
 * 
 * @param content tasks.md ファイルの内容
 * @returns パースされたタスクの配列（順序保持）
 */
export function parseTasksFile(content: string): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 空行をスキップ
    if (trimmed === '') continue;
    
    // コメント行をスキップ（# で始まる行）
    if (trimmed.startsWith('#')) continue;
    
    // タスク行をパース
    const task = parseTask(trimmed);
    if (task) {
      tasks.push(task);
    }
    // パース失敗行は警告なしでスキップ（lenient モード）
  }
  
  return tasks;
}
```

**Acceptance Criteria**:

**TDD (RED → GREEN):**

_path-utils.ts:_
- [x] テスト: `normalizeToRepoRelative('/home/user/repo/src/a.ts', '/home/user/repo')` → `'src/a.ts'`
- [x] テスト: `isOutsideWorktree('../secret', '/home/user/repo')` → `true`
- [x] テスト: `isOutsideWorktree('src/a.ts', '/home/user/repo')` → `false`
- [x] テスト: `isSymlink('/path/to/symlink')` → Symlink なら `true`（spec.md:L475-L488 準拠）
- [x] テスト: `isSymlink('/path/to/regular-file')` → 通常ファイルなら `false`
- [x] `bun test __tests__/lib/path-utils.test.ts` → PASS

_glob-utils.ts:_
- [x] テスト: `matchesScope('src/auth/login.ts', ['src/auth/**'])` → `true`
- [x] テスト: `matchesScope('src/pay/x.ts', ['src/auth/**'])` → `false`
- [x] テスト: `matchesScope('specs/a.md', [])` → `false`（空配列）
- [x] `bun test __tests__/lib/glob-utils.test.ts` → PASS

_state-utils.ts:_
- [x] テスト: `writeState(state)` → `.opencode/state/current_context.json` 作成
- [x] テスト: `readState()` (正常) → `{ status: 'ok', state: {...} }`
- [x] テスト: `readState()` (ファイルなし) → `{ status: 'not_found' }`
- [x] テスト: `readState()` (破損JSON) → `{ status: 'corrupted', error: '...' }`
- [x] テスト: `clearState()` → ファイル削除
- [x] `bun test __tests__/lib/state-utils.test.ts` → PASS

_tasks-parser.ts:_
- [x] テスト: `parseTask('* [ ] Task-1: Title (Scope: \`src/**\`)')` → `{ id: 'Task-1', scopes: ['src/**'], done: false }` (バッククォートあり)
- [x] テスト: `parseTask('* [ ] Task-2: Title (Scope: src/auth/**, tests/**)')` → `{ id: 'Task-2', scopes: ['src/auth/**', 'tests/**'], done: false }` (バッククォートなし、Phase 0 lenient)
- [x] テスト: `parseTask('* [x] Task-3: Done (Scope: \`a/**\`)')` → `{ done: true }`
- [x] テスト: `parseTasksFile(content)` → タスク配列
- [x] `bun test __tests__/lib/tasks-parser.test.ts` → PASS

**Commit**: YES
- Message: `feat(lib): add utility modules for path, glob, state, and tasks parsing`
- Files: `.opencode/lib/*.ts`, `__tests__/lib/*.test.ts`
- Pre-commit: `bun test`

---

### Task 2: sdd_start_task Custom Tool 実装

**What to do**:
- `.opencode/tools/sdd_start_task.ts` 作成
- tasks.md からタスクをパース
- State ファイル生成（ロック + atomic write）
- エラーハンドリング: E_TASKS_NOT_FOUND, E_TASK_NOT_FOUND, E_TASK_ALREADY_DONE, E_SCOPE_MISSING
- 人間可読な出力メッセージ

**Must NOT do**:
- 複数タスクの同時開始（仕様で禁止）
- タスク完了チェック以外のバリデーション

**Parallelizable**: YES（Task 3 と並列可能）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L358-L386` (セクション 6.1) - sdd_start_task 仕様
  - 入力: `taskId: string`
  - 手順: tasks.md 読み込み → taskId 検索 → `[ ]` 確認 → Scope パース → State 書き込み
  - 出力: 開始タスクID、許可スコープ一覧、state ファイル位置
  - エラー: E_TASKS_NOT_FOUND, E_TASK_NOT_FOUND, E_TASK_ALREADY_DONE, E_SCOPE_MISSING

**Internal References (Task 1 で作成)**:
- `.opencode/lib/tasks-parser.ts` - `parseTask()`, `parseTasksFile()`
- `.opencode/lib/state-utils.ts` - `writeState()`

**Implementation Details**:

```typescript
// OpenCode Custom Tool 形式
import { tool } from '@opencode-ai/plugin';
import { parseTasksFile } from '../lib/tasks-parser';
import { writeState } from '../lib/state-utils';
import fs from 'fs';

export default tool({
  description: 'タスクを開始し、編集可能なスコープを設定します',
  args: {
    taskId: tool.schema.string().describe('開始するタスクID (例: Task-1)')
  },
  async execute({ taskId }, context) {
    const tasksPath = 'specs/tasks.md';
    
    // E_TASKS_NOT_FOUND
    if (!fs.existsSync(tasksPath)) {
      throw new Error(`E_TASKS_NOT_FOUND: ${tasksPath} が見つかりません`);
    }
    
    const content = fs.readFileSync(tasksPath, 'utf-8');
    const tasks = parseTasksFile(content);
    const task = tasks.find(t => t.id === taskId);
    
    // E_TASK_NOT_FOUND
    if (!task) {
      throw new Error(`E_TASK_NOT_FOUND: ${taskId} が見つかりません`);
    }
    
    // E_TASK_ALREADY_DONE
    if (task.done) {
      throw new Error(`E_TASK_ALREADY_DONE: ${taskId} は既に完了しています`);
    }
    
    // E_SCOPE_MISSING
    if (task.scopes.length === 0) {
      throw new Error(`E_SCOPE_MISSING: ${taskId} に Scope が定義されていません`);
    }
    
    // State 書き込み
    await writeState({
      version: 1,
      activeTaskId: task.id,
      activeTaskTitle: task.title,
      allowedScopes: task.scopes,
      startedAt: new Date().toISOString(),
      startedBy: 'sdd_start_task'
    });
    
    return `タスク開始: ${task.id}
タイトル: ${task.title}
許可スコープ: ${task.scopes.join(', ')}
State: .opencode/state/current_context.json`;
  }
});
```

**Acceptance Criteria**:

**テスト実行のディレクトリ前提**:

> **重要**: テストは `process.cwd()` がプロジェクトルート（worktree ルート）になる前提で実行。
> `bun test` はデフォルトでプロジェクトルートから実行されるため、相対パスはすべてプロジェクトルートからの相対パスとして解決される。

**Custom Tool テスト実行方式**:

> `tool()` で生成したオブジェクトは `execute` 関数を持つ。テストでは以下の方式で実行する:

```typescript
// テストでの Custom Tool 実行例
import sddStartTask from '../.opencode/tools/sdd_start_task';

describe('sdd_start_task', () => {
  beforeEach(() => {
    // テスト用 specs/tasks.md を作成
    fs.mkdirSync('specs', { recursive: true });
    fs.writeFileSync('specs/tasks.md', '* [ ] Task-1: Test (Scope: `src/**`)');
  });
  
  afterEach(() => {
    // テスト後のクリーンアップ
    if (fs.existsSync('specs/tasks.md')) fs.unlinkSync('specs/tasks.md');
    if (fs.existsSync('.opencode/state/current_context.json')) {
      fs.unlinkSync('.opencode/state/current_context.json');
    }
  });
  
  test('正常系 - タスク開始', async () => {
    // execute は async 関数、context は空オブジェクトで代用
    const result = await sddStartTask.execute({ taskId: 'Task-1' }, {});
    expect(result).toContain('Task-1');
    // State ファイルの検証
    expect(fs.existsSync('.opencode/state/current_context.json')).toBe(true);
  });
});
```

**テスト用フィクスチャ管理**:
- 各テストの `beforeEach` で `specs/tasks.md` を作成
- 各テストの `afterEach` で State ファイルと `specs/tasks.md` を削除
- これにより各テストが独立して実行可能

**TDD (RED → GREEN):**
- [x] テスト: 正常系 - タスク開始 → State 生成、正しい JSON 形式
- [x] テスト: E_TASKS_NOT_FOUND - `specs/tasks.md` が存在しない → エラー
- [x] テスト: E_TASK_NOT_FOUND - 存在しない taskId → エラー
- [x] テスト: E_TASK_ALREADY_DONE - `[x]` タスク → エラー
- [x] テスト: E_SCOPE_MISSING - Scope なし → エラー
- [x] `bun test __tests__/tools/sdd_start_task.test.ts` → PASS

**Manual Verification:**
- [x] `specs/tasks.md` に `* [ ] Task-1: Test (Scope: \`src/**\`)` を追加
- [x] `sdd_start_task Task-1` 実行
- [x] `.opencode/state/current_context.json` が以下の形式で生成:
  ```json
  {
    "version": 1,
    "activeTaskId": "Task-1",
    "activeTaskTitle": "Test",
    "allowedScopes": ["src/**"],
    "startedAt": "2026-01-20T...",
    "startedBy": "sdd_start_task"
  }
  ```

**Commit**: YES
- Message: `feat(tools): implement sdd_start_task for task activation`
- Files: `.opencode/tools/sdd_start_task.ts`, `__tests__/tools/sdd_start_task.test.ts`
- Pre-commit: `bun test`

---

### Task 3: sdd_end_task, sdd_show_context 実装

**What to do**:
- `.opencode/tools/sdd_end_task.ts`: State クリア
- `.opencode/tools/sdd_show_context.ts`: 現在の State 表示
- 両ツールの単体テスト

**Must NOT do**:
- タスク完了時の自動チェック更新（Skills で規定）

**Parallelizable**: YES（Task 2 と並列可能）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L389-L398` (セクション 6.2) - sdd_end_task 仕様
  - 目的: State をクリアし、次タスク選択を強制
  - 手順: `current_context.json` 削除 or `activeTaskId=null`
- `spec.md:L401-L404` (セクション 6.3) - sdd_show_context 仕様
  - 目的: 現在の activeTaskId と allowedScopes を表示

**Internal References**:
- `.opencode/lib/state-utils.ts` - `readState()`, `clearState()`

**Implementation Details**:

_sdd_end_task.ts:_
```typescript
import { tool } from '@opencode-ai/plugin';
import { clearState, readState } from '../lib/state-utils';

export default tool({
  description: '現在のタスクを終了し、State をクリアします',
  args: {},
  async execute(_, context) {
    const stateResult = readState();  // StateResult を返す（同期）
    
    if (stateResult.status === 'not_found') {
      return '警告: アクティブなタスクはありません';
    }
    
    if (stateResult.status === 'corrupted') {
      // 破損状態でもクリアを試みる
      clearState();
      return `警告: State が破損していました (${stateResult.error})。State をクリアしました。`;
    }
    
    // stateResult.status === 'ok'
    const state = stateResult.state;
    clearState();
    return `タスク終了: ${state.activeTaskId}
State をクリアしました。次のタスクを開始するには sdd_start_task を実行してください。`;
  }
});
```

_sdd_show_context.ts:_
```typescript
import { tool } from '@opencode-ai/plugin';
import { readState } from '../lib/state-utils';

export default tool({
  description: '現在のタスクコンテキストを表示します',
  args: {},
  async execute(_, context) {
    const stateResult = readState();  // StateResult を返す（同期）
    
    if (stateResult.status === 'not_found') {
      return 'タスク未開始: sdd_start_task でタスクを開始してください';
    }
    
    if (stateResult.status === 'corrupted') {
      return `エラー: State が破損しています (${stateResult.error})
sdd_end_task でクリアするか、.opencode/state/current_context.json を削除してください。`;
    }
    
    // stateResult.status === 'ok'
    const state = stateResult.state;
    return `現在のタスク: ${state.activeTaskId}
タイトル: ${state.activeTaskTitle}
許可スコープ:
${state.allowedScopes.map(s => `  - ${s}`).join('\n')}
開始時刻: ${state.startedAt}`;
  }
});
```

**Acceptance Criteria**:

**Custom Tool テスト実行方式**:

> Task 2 と同様の方式。`tool()` オブジェクトの `execute` を直接呼び出し、context は `{}` で代用。

```typescript
// テスト例
import sddEndTask from '../.opencode/tools/sdd_end_task';
import sddShowContext from '../.opencode/tools/sdd_show_context';
import { writeState, clearState } from '../.opencode/lib/state-utils';

describe('sdd_end_task / sdd_show_context', () => {
  beforeEach(async () => {
    // テスト用 State を作成
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test'
    });
  });
  
  afterEach(() => {
    clearState();  // クリーンアップ
  });
  
  test('sdd_show_context - State 存在時', async () => {
    const result = await sddShowContext.execute({}, {});
    expect(result).toContain('Task-1');
  });
  
  test('sdd_end_task - State 存在時', async () => {
    const result = await sddEndTask.execute({}, {});
    expect(result).toContain('タスク終了');
  });
});
```

**TDD (RED → GREEN):**

_sdd_end_task:_
- [x] テスト: State 存在時 (status: 'ok') → ファイル削除、完了メッセージ
- [x] テスト: State 不在時 (status: 'not_found') → 「アクティブなタスクはありません」
- [x] テスト: State 破損時 (status: 'corrupted') → クリア + 警告メッセージ
- [x] `bun test __tests__/tools/sdd_end_task.test.ts` → PASS

_sdd_show_context:_
- [x] テスト: State 存在時 (status: 'ok') → activeTaskId, allowedScopes 含む出力
- [x] テスト: State 不在時 (status: 'not_found') → 「タスク未開始」メッセージ
- [x] テスト: State 破損時 (status: 'corrupted') → エラーメッセージ + 対処法
- [x] `bun test __tests__/tools/sdd_show_context.test.ts` → PASS

**Manual Verification:**
- [x] `sdd_start_task Task-1` 実行後
- [x] `sdd_show_context` → `現在のタスク: Task-1 ...` 表示
- [x] `sdd_end_task` → `タスク終了: Task-1 ...` 表示
- [x] `sdd_show_context` → `タスク未開始 ...` 表示

**Commit**: YES
- Message: `feat(tools): implement sdd_end_task and sdd_show_context`
- Files: `.opencode/tools/sdd_end_task.ts`, `.opencode/tools/sdd_show_context.ts`, `__tests__/tools/*.test.ts`
- Pre-commit: `bun test`

---

### Task 4: sdd-gatekeeper Plugin 実装

**What to do**:
- `.opencode/plugins/sdd-gatekeeper.ts` 作成
- `tool.execute.before` フックで書き込み系ツールをインターセプト
- Rule 0-4 実装
- Phase 0: warn モード（ログ出力 + 実行許可）
- 環境変数 `SDD_GUARD_MODE` 対応（Phase 0 では `warn` のみ実装、`block` は無視）

**Must NOT do**:
- block モードの分岐実装（Phase 1 で追加、Phase 0 では環境変数を読んでも常に warn 動作）
- bash コマンドの完全解析（Permissions 主導）

**Parallelizable**: NO（Task 2 の State 機能に依存）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L407-L455` (セクション 7) - Gatekeeper 仕様
  - 対象ツール: edit, write, patch, multiedit
  - モード: warn (Phase 0), block (Phase 1)
  - 環境変数: `SDD_GUARD_MODE=warn|block`
- `spec.md:L422-L447` (セクション 7.3) - Decision Rules
  - Rule 0: `specs/**` or `.opencode/**` → always allow
  - Rule 1: State 必須チェック
  - Rule 2: Scope マッチ
  - Rule 3: Worktree 外拒否
  - Rule 4: 破壊的 bash 警告
- `spec.md:L449-L454` (セクション 7.4) - エラーメッセージ
  - NO_ACTIVE_TASK: 「先に sdd_start_task を実行してください」
  - SCOPE_DENIED: 「Task-X は path への書き込み権限を持ちません」
  - OUTSIDE_WORKTREE: 「worktree 外のパスは編集できません」

**Internal References**:
- `.opencode/lib/path-utils.ts` - `normalizeToRepoRelative()`, `isOutsideWorktree()`
- `.opencode/lib/glob-utils.ts` - `matchesScope()`
- `.opencode/lib/state-utils.ts` - `readState()`

**OpenCode Plugin API: tool.execute.before イベント形式**:

```typescript
// OpenCode Plugin API の tool.execute.before イベント形式
interface ToolExecuteBeforeEvent {
  tool: {
    name: string;  // 'edit', 'write', 'patch', 'multiedit', 'bash'
    args: {
      // edit/write/patch の場合
      filePath?: string;
      path?: string;
      content?: string;
      // multiedit の場合
      files?: Array<{ filePath: string; content: string }>;
      // bash の場合
      command?: string;
    };
  };
}

// 各ツールの引数キー
// - edit: args.filePath
// - write: args.filePath
// - patch: args.filePath
// - multiedit: args.files (配列、各要素に filePath)
// - bash: args.command
```

**テスト可能な evaluateAccess() 関数のエクスポート**:

```typescript
// Gatekeeper ロジックをテスト可能な純粋関数として分離
// sdd-gatekeeper.ts から以下をエクスポート

export interface AccessResult {
  allowed: boolean;
  warned: boolean;
  message?: string;
  rule?: 'Rule0' | 'Rule1' | 'Rule2' | 'Rule3' | 'Rule4' | 'StateCorrupted';
}

// readState() の戻り値型を使用
import { StateResult } from '../lib/state-utils';

export function evaluateAccess(
  toolName: string,
  filePath: string | undefined,
  command: string | undefined,
  stateResult: StateResult,  // State | null ではなく StateResult を受け取る
  worktreeRoot: string
): AccessResult {
  // 純粋関数: 副作用なし、テスト容易
  // 戻り値で allowed/warned/message を返す
}
```

**multiedit の複数ファイル処理**:

```typescript
// multiedit ツールの処理
// 各ファイルに対して Rule 0-3 を適用し、結果を集約

export function evaluateMultiEdit(
  files: Array<{ filePath: string }>,
  stateResult: StateResult,
  worktreeRoot: string
): AccessResult {
  const results: AccessResult[] = files.map(f => 
    evaluateAccess('edit', f.filePath, undefined, stateResult, worktreeRoot)
  );
  
  // 警告があるファイルを集約
  const warnings = results.filter(r => r.warned);
  
  if (warnings.length === 0) {
    return { allowed: true, warned: false };
  }
  
  // 複数ファイルの警告をまとめる
  const messages = warnings.map(w => w.message).filter(Boolean);
  return {
    allowed: true,  // Phase 0 は常に許可
    warned: true,
    message: `multiedit: ${warnings.length}/${files.length} ファイルで警告\n${messages.join('\n')}`,
    rule: warnings[0].rule  // 最初の警告の rule を採用
  };
}
```

**Implementation Details**:

```typescript
import type { Plugin } from '@opencode-ai/plugin';
import { readState, StateResult, State } from '../lib/state-utils';
import { normalizeToRepoRelative, isOutsideWorktree, getWorktreeRoot } from '../lib/path-utils';
import { matchesScope } from '../lib/glob-utils';

const WRITE_TOOLS = ['edit', 'write', 'patch', 'multiedit'];
const ALWAYS_ALLOW = ['specs/', '.opencode/'];
const DESTRUCTIVE_BASH = ['rm ', 'rm -', 'git push', 'reset --hard', 'git apply'];

// テスト用にエクスポート: 純粋関数として Gatekeeper ロジックを分離
export interface AccessResult {
  allowed: boolean;
  warned: boolean;
  message?: string;
  rule?: 'Rule0' | 'Rule1' | 'Rule2' | 'Rule3' | 'Rule4' | 'StateCorrupted';
}

/**
 * 単一ファイルに対するアクセス評価
 * 
 * STATE_CORRUPTED の扱い（Phase 0）:
 * - State 破損時は specs/** と .opencode/** のみ許可
 * - それ以外のパスは警告を出す（NO_ACTIVE_TASK とは別メッセージ）
 */
export function evaluateAccess(
  toolName: string,
  filePath: string | undefined,
  command: string | undefined,
  stateResult: StateResult,
  worktreeRoot: string
): AccessResult {
  // 非書き込み系ツール
  if (!WRITE_TOOLS.includes(toolName)) {
    // Rule 4: 破壊的 bash チェック
    if (toolName === 'bash' && command) {
      if (DESTRUCTIVE_BASH.some(d => command.includes(d))) {
        return { allowed: true, warned: true, message: `破壊的コマンド検出: ${command}`, rule: 'Rule4' };
      }
    }
    return { allowed: true, warned: false };
  }
  
  if (!filePath) return { allowed: true, warned: false };
  
  const normalizedPath = normalizeToRepoRelative(filePath, worktreeRoot);
  
  // Rule 0: Always Allow (specs/** と .opencode/**)
  if (ALWAYS_ALLOW.some(prefix => normalizedPath.startsWith(prefix))) {
    return { allowed: true, warned: false, rule: 'Rule0' };
  }
  
  // Rule 3: Worktree 外拒否
  if (isOutsideWorktree(filePath, worktreeRoot)) {
    return { allowed: true, warned: true, message: `OUTSIDE_WORKTREE: ${normalizedPath}`, rule: 'Rule3' };
  }
  
  // State 状態による分岐
  if (stateResult.status === 'corrupted') {
    // STATE_CORRUPTED: specs/** と .opencode/** 以外は警告（Phase 0）
    // Rule 0 を通過していないのでこのパスは specs//.opencode// 以外
    return { 
      allowed: true,  // Phase 0 は常に許可
      warned: true, 
      message: `STATE_CORRUPTED: current_context.json が破損しています。再作成が必要です。(${stateResult.error})`,
      rule: 'StateCorrupted'
    };
  }
  
  if (stateResult.status === 'not_found') {
    // Rule 1: State なし
    return { allowed: true, warned: true, message: 'NO_ACTIVE_TASK: 先に sdd_start_task を実行してください', rule: 'Rule1' };
  }
  
  // stateResult.status === 'ok'
  const state = stateResult.state;
  
  if (!state.activeTaskId || state.allowedScopes.length === 0) {
    return { allowed: true, warned: true, message: 'NO_ACTIVE_TASK: 先に sdd_start_task を実行してください', rule: 'Rule1' };
  }
  
  // Rule 2: Scope マッチ
  if (!matchesScope(normalizedPath, state.allowedScopes)) {
    return { 
      allowed: true, 
      warned: true, 
      message: `SCOPE_DENIED: ${state.activeTaskId} は ${normalizedPath} への書き込み権限を持ちません。allowedScopes=${state.allowedScopes.join(', ')}`,
      rule: 'Rule2'
    };
  }
  
  return { allowed: true, warned: false };
}

export const SddGatekeeper: Plugin = async ({ client }) => {
  // Phase 0: warn モードのみ（SDD_GUARD_MODE 環境変数は読み取るが block は実装しない）
  const worktreeRoot = getWorktreeRoot();  // 同期関数
  
  return {
    'tool.execute.before': async (event) => {
      const { name, args } = event.tool;
      
      // multiedit の場合は複数ファイルを評価
      if (name === 'multiedit' && args.files) {
        const stateResult = readState();  // 同期関数、StateResult を返す
        const result = evaluateMultiEdit(args.files, stateResult, worktreeRoot);
        if (result.warned) {
          console.warn(`[SDD-GATEKEEPER] ${result.message}`);
          // Phase 0: 常に許可（block は実装しない）
        }
        return;
      }
      
      // 単一ファイルまたは bash の場合
      const filePath = args.filePath || args.path;
      const command = args.command;
      
      const stateResult = readState();  // 同期関数、StateResult を返す
      const result = evaluateAccess(name, filePath, command, stateResult, worktreeRoot);
      
      if (result.warned) {
        console.warn(`[SDD-GATEKEEPER] ${result.message}`);
        // Phase 0: 常に許可（block は実装しない）
      }
      // allow
    }
  };
};
```

**Acceptance Criteria**:

**TDD (RED → GREEN):**

_Rule 0 テスト:_
- [x] `specs/a.md` 編集 → allow（State 不問）
- [x] `.opencode/state/x.json` 編集 → allow

_Rule 1 テスト:_
- [x] State なし + `src/a.ts` 編集 → warn ログ出力 + 実行許可

_Rule 2 テスト:_
- [x] State あり (Scope: `src/auth/**`) + `src/auth/x.ts` → allow
- [x] State あり (Scope: `src/auth/**`) + `src/pay/y.ts` → warn ログ出力

_Rule 3 テスト:_
- [x] `../secrets.txt` 編集 → warn ログ出力

_Rule 4 テスト:_
- [x] bash `rm -rf /` → warn ログ出力
- [x] bash `ls` → allow（ログなし）

- [x] `bun test __tests__/plugins/sdd-gatekeeper.test.ts` → PASS

**Manual Verification:**
- [x] `sdd_start_task Task-1` (Scope: `src/auth/**`) 実行
- [x] `src/auth/login.ts` に対して edit → 成功（ログなし）
- [x] `src/pay/checkout.ts` に対して edit → WARN ログ出力、実行は許可

**Commit**: YES
- Message: `feat(plugins): implement sdd-gatekeeper with warn mode`
- Files: `.opencode/plugins/sdd-gatekeeper.ts`, `__tests__/plugins/sdd-gatekeeper.test.ts`
- Pre-commit: `bun test`

---

### Task 5: sdd_validate_gap スタブ実装

**What to do**:
- `.opencode/tools/sdd_validate_gap.ts` 作成
- kiro 利用不可時のフォールバックメッセージ
- 将来の kiro 統合に備えた構造

**Must NOT do**:
- kiro との実際の統合
- 自動バリデーション実装

**Parallelizable**: YES（Task 2 完了後）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L736-L777` (セクション 8.4) - kiro/cc-sdd 統合に関する補足
  - スタブ実装例が提供されている
  - kiro 不在時は手動確認手順を返す

**Implementation Details**:

```typescript
import { tool } from '@opencode-ai/plugin';

export default tool({
  description: '仕様とコードの差分を検証（kiro 統合時は自動化）',
  args: {
    // spec.md:L752-L776 に合わせて taskId は必須
    taskId: tool.schema.string().describe('検証対象タスクID（必須）')
  },
  async execute({ taskId }, context) {
    // kiro 統合チェック（将来実装）
    const kiroAvailable = false; // TODO: kiro 検出ロジック
    
    if (kiroAvailable) {
      // TODO: kiro:validate-gap を実行
      return 'kiro:validate-gap を実行中...';
    }
    
    // フォールバック: 手動確認手順
    return `kiro:validate-gap は利用できません。

タスク ${taskId} の検証を手動で行ってください:

1. lsp_diagnostics で変更ファイルにエラーがないか確認
2. 関連テストが存在すれば実行
3. tasks.md の要件が満たされているか確認
4. 変更したファイルが allowedScopes 内にあるか確認

すべて確認できたら、tasks.md で [x] をマークしてください。`;
  }
});
```

> **仕様整合性に関する注記**: `spec.md:L752-L776` のスタブ実装例では `taskId: tool.schema.string()` となっており、必須です。本計画もそれに従います。

**Acceptance Criteria**:

**Custom Tool テスト実行方式**:

> Task 2/3 と同様。`tool()` オブジェクトの `execute` を直接呼び出す。

```typescript
import sddValidateGap from '../.opencode/tools/sdd_validate_gap';

describe('sdd_validate_gap', () => {
  test('フォールバックメッセージ', async () => {
    const result = await sddValidateGap.execute({ taskId: 'Task-1' }, {});
    expect(result).toContain('kiro:validate-gap は利用できません');
    expect(result).toContain('手動で行ってください');
  });
});
```

**TDD (RED → GREEN):**
- [x] テスト: `sdd_validate_gap Task-1` → フォールバックメッセージ（手動確認手順含む）
- [x] テスト: taskId 未指定 → Zod バリデーションエラー（必須パラメータ）
- [x] `bun test __tests__/tools/sdd_validate_gap.test.ts` → PASS

**Manual Verification:**
- [x] `sdd_validate_gap Task-1` 実行
- [x] 出力に「kiro:validate-gap は利用できません」+ 4ステップの手動確認手順

**Commit**: YES
- Message: `feat(tools): add sdd_validate_gap stub for future kiro integration`
- Files: `.opencode/tools/sdd_validate_gap.ts`, `__tests__/tools/sdd_validate_gap.test.ts`
- Pre-commit: `bun test`

---

### Task 6: Skills 作成

**What to do**:
- `.opencode/skills/sdd-architect/SKILL.md` 作成
- `.opencode/skills/sdd-implementer/SKILL.md` 作成
- YAML frontmatter + Markdown 形式
- spec.md のセクション 8 の内容を反映

**Must NOT do**:
- sdd-orchestrator（Phase 1 推奨）
- 過度に詳細な手順（LLM が迷わない程度）

**Parallelizable**: YES（他タスク完了後）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L679-L698` (セクション 8.1) - sdd-architect の MUST/MAY
  - 新機能開始時は `specs/<feature>/` ディレクトリを作成
  - Requirements → Design → Tasks の順に作成
  - 各タスク行に `(Scope: ...)` を必ず付ける
- `spec.md:L700-L716` (セクション 8.2) - sdd-implementer の MUST
  - 実装開始前に必ず `sdd_start_task` を実行
  - Scope 外変更 → tasks.md 更新 → 再 sdd_start_task
  - 実装後は検証ステップを実行

**Implementation Details**:

_sdd-architect/SKILL.md:_
```markdown
---
name: sdd-architect
description: 新機能の仕様設計を行う（Requirements → Design → Tasks）
priority: 10
---

# SDD Architect スキル

## このスキルを使うタイミング
- 新機能の開発を開始するとき
- 仕様書を作成・更新するとき

## 手順（MUST）

1. **specs ディレクトリ作成**
   - `specs/<feature>/` ディレクトリを作成

2. **Requirements 作成**
   - `specs/<feature>/requirements.md` を作成
   - ユーザーと対話しながら要件を明確化

3. **Design 作成**
   - `specs/<feature>/design.md` を作成
   - 影響ファイル（Impacted Files）を明記

4. **Tasks 作成**
   - `specs/tasks.md` にタスクを追加
   - 各タスクに `(Scope: ...)` を **必ず** 付ける
   - 形式: `* [ ] Task-N: タイトル (Scope: \`glob1\`, \`glob2\`)`

## 重要なルール
- Scope は最小権限で設定する（`src/**` のような広い範囲は避ける）
- ユーザー承認を得るまで次のステップに進まない
```

_sdd-implementer/SKILL.md:_
```markdown
---
name: sdd-implementer
description: タスクに基づいて実装を行う
priority: 10
---

# SDD Implementer スキル

## このスキルを使うタイミング
- タスクを実装するとき

## 手順（MUST）

1. **タスク開始**
   - 実装前に必ず `sdd_start_task <TaskID>` を実行
   - State が生成され、編集可能スコープが設定される

2. **実装**
   - allowedScopes 内のファイルのみ編集可能
   - Scope 外の変更が必要な場合:
     1. コードを書かずに停止
     2. `specs/tasks.md` の Scope を更新
     3. 再度 `sdd_start_task` を実行

3. **検証**
   - `sdd_validate_gap` を実行
   - エラーがないことを確認

4. **完了**
   - 検証通過後、`specs/tasks.md` で `[x]` をマーク
   - `sdd_end_task` を実行

## 重要なルール
- Scope 外のファイルを編集しない（Gatekeeper が警告）
- 検証をスキップしない
```

**Acceptance Criteria**:

**Manual Verification:**
- [x] `.opencode/skills/sdd-architect/SKILL.md` 存在
- [x] `.opencode/skills/sdd-implementer/SKILL.md` 存在
- [x] YAML frontmatter が正しくパース可能
- [x] 内容が spec.md セクション 8 と一致

**Commit**: YES
- Message: `feat(skills): add sdd-architect and sdd-implementer skills`
- Files: `.opencode/skills/sdd-architect/SKILL.md`, `.opencode/skills/sdd-implementer/SKILL.md`
- Pre-commit: `bun test`

---

### Task 7: E2E テスト（受け入れ基準シナリオ A-I）

**What to do**:
- `__tests__/e2e/acceptance.test.ts` 作成
- シナリオ A-I（9シナリオ）を統合テストとして実装
- `__tests__/helpers/test-harness.ts` テストハーネス作成

**テスト方針の明確化**:

本タスクでは「E2E テスト」と称しているが、以下の理由から **Gatekeeper ロジックの純粋関数テスト** を採用する:

| 方式 | 説明 | 採用 |
|------|------|------|
| プラグインフックテスト | OpenCode の `tool.execute.before` をモックして呼び出し | ❌ OpenCode Plugin API のモックが複雑 |
| 純粋関数テスト | `evaluateAccess()` を直接呼び出し、戻り値を検証 | ✅ 採用 |

**ファイルシステム操作の範囲**:
- State ファイル (`current_context.json`) の読み書き: **実 FS 使用**
- 編集対象ファイル (`src/a.ts` 等): **実 FS 使用しない**（パス文字列のみ評価）

**Must NOT do**:
- OpenCode Plugin API のモック実装
- パフォーマンステスト

**Parallelizable**: NO（全コンポーネント完成後）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L789-L800` (セクション 10) - 受け入れ基準
  - 6シナリオのテーブル定義

**Embedded Acceptance Criteria (from spec.md + 追加シナリオ)**:

| シナリオ | 事前状態 | 操作 | 操作対象パス | 期待結果 (Phase 0) |
|---------|---------|------|-------------|-------------------|
| A | state なし | edit | `src/a.ts` | WARN (NO_ACTIVE_TASK) |
| B | Task-1, Scope=`src/auth/**` | edit | `src/auth/x.ts` | allow |
| C | Task-1, Scope=`src/auth/**` | edit | `src/pay/y.ts` | WARN (SCOPE_DENIED) |
| D | 任意 | edit | `specs/tasks.md` | allow (Rule 0) |
| E | 任意 | edit | `../secrets.txt` | WARN (OUTSIDE_WORKTREE) |
| F | 任意 | bash | `rm -rf /tmp` | WARN (Rule 4) |
| G | Task-1, Scope=`src/auth/**` | multiedit | `src/auth/x.ts`, `src/pay/y.ts` | WARN (1/2 ファイルで警告) |
| H | state 破損 | edit | `src/a.ts` | WARN (STATE_CORRUPTED) |
| I | state 破損 | edit | `specs/tasks.md` | allow (Rule 0) |

**テストハーネス設計**:

Gatekeeper のプラグインフックを直接呼び出すのではなく、Task 4 でエクスポートした `evaluateAccess()` 純粋関数を直接呼び出してテストする。

**理由**:
- OpenCode Plugin API のモックが不要
- 純粋関数なので副作用なし、テスト容易
- ログ出力は `console.warn` をモックして捕捉

**テストヘルパー**:

**パス整合性の設計決定**:

テストでは以下の整合条件を維持すること:

| 要素 | 値 | 説明 |
|------|-----|------|
| `TEST_WORKTREE` | `process.cwd()` | テスト実行時のカレントディレクトリをworktreeRootとする |
| `STATE_DIR` | `.opencode/state` | プロジェクトルートからの相対パス |
| `filePath` | 相対パス (`src/a.ts`) | `evaluateAccess()` 内で `path.resolve()` により絶対パス化 |

**なぜ `process.cwd()` を使うか**:
- `readState()` は `.opencode/state/current_context.json` を読む（`process.cwd()` からの相対パス）
- `evaluateAccess()` の `worktreeRoot` も同じディレクトリを指す必要がある
- `/tmp/sdd-test-worktree` のような固定値を使うと、State ファイルの場所と不整合になる

**テストセットアップ**:
```typescript
// beforeAll で State ディレクトリを作成
beforeAll(() => {
  // テストは `bun test` をプロジェクトルートで実行する前提
  // process.cwd() はプロジェクトルートを指す
  if (!fs.existsSync('.opencode/state')) {
    fs.mkdirSync('.opencode/state', { recursive: true });
  }
});
```

```typescript
// __tests__/helpers/test-harness.ts
import path from 'path';
import { evaluateAccess, evaluateMultiEdit, AccessResult } from '../../.opencode/plugins/sdd-gatekeeper';
import { StateResult, readState } from '../../.opencode/lib/state-utils';

// テスト用 worktree root: process.cwd() を使用（実行時のカレントディレクトリ）
// これにより State ファイルのパスと整合性が取れる
export function getTestWorktreeRoot(): string {
  return process.cwd();
}

/**
 * edit ツールのシミュレーション
 * @param relativePath 編集対象の相対パス（例: 'src/a.ts'）
 * @param stateResult StateResult を明示的に渡す場合。省略時は readState() で自動取得
 */
export function simulateEdit(relativePath: string, stateResult?: StateResult): AccessResult {
  const resolvedStateResult = stateResult ?? readState();
  const worktreeRoot = getTestWorktreeRoot();
  
  // relativePath は worktreeRoot からの相対パス
  // evaluateAccess() 内で path.resolve(relativePath) → 絶対パス化
  // path.relative(worktreeRoot, absolutePath) → 元の相対パスに戻る
  return evaluateAccess('edit', relativePath, undefined, resolvedStateResult, worktreeRoot);
}

/**
 * bash ツールのシミュレーション
 * @param command 実行コマンド
 * @param stateResult StateResult を明示的に渡す場合。省略時は readState() で自動取得
 */
export function simulateBash(command: string, stateResult?: StateResult): AccessResult {
  const resolvedStateResult = stateResult ?? readState();
  const worktreeRoot = getTestWorktreeRoot();
  return evaluateAccess('bash', undefined, command, resolvedStateResult, worktreeRoot);
}

/**
 * multiedit ツールのシミュレーション
 */
export function simulateMultiEdit(
  files: Array<{ filePath: string }>,
  stateResult?: StateResult
): AccessResult {
  const resolvedStateResult = stateResult ?? readState();
  const worktreeRoot = getTestWorktreeRoot();
  return evaluateMultiEdit(files, resolvedStateResult, worktreeRoot);
}

// ログ捕捉ヘルパー
export function captureWarnings(fn: () => void): string[] {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}
```

**Implementation Details**:

```typescript
import { describe, test, expect, beforeEach, afterEach, beforeAll } from 'bun:test';
import { evaluateAccess, evaluateMultiEdit } from '../../.opencode/plugins/sdd-gatekeeper';
import { writeState, clearState, readState, State } from '../../.opencode/lib/state-utils';
import { simulateEdit, simulateBash, simulateMultiEdit, getTestWorktreeRoot } from '../helpers/test-harness';
import fs from 'fs';

describe('Acceptance Criteria A-I', () => {
  beforeAll(() => {
    // State ディレクトリを作成（存在しない場合）
    if (!fs.existsSync('.opencode/state')) {
      fs.mkdirSync('.opencode/state', { recursive: true });
    }
  });
  
  beforeEach(() => {
    // テスト用 State クリア
    clearState();
  });
  
  afterEach(() => {
    clearState();
  });
  
  test('Scenario A: state なし + src/a.ts 編集 → WARN NO_ACTIVE_TASK', () => {
    // State なし（clearState() 済み）
    const result = simulateEdit('src/a.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('NO_ACTIVE_TASK');
  });
  
  test('Scenario B: Task-1 (src/auth/**) + src/auth/x.ts 編集 → allow', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test'
    });
    
    const result = await simulateEdit('src/auth/x.ts');
    expect(result.allowed).toBe(true);
  });
  
  test('Scenario C: Task-1 (src/auth/**) + src/pay/y.ts 編集 → WARN SCOPE_DENIED', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test'
    });
    
    const result = await simulateEdit('src/pay/y.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('SCOPE_DENIED');
  });
  
  test('Scenario D: specs/tasks.md 編集 → allow (Rule 0)', async () => {
    const result = await simulateEdit('specs/tasks.md');
    expect(result.allowed).toBe(true);
  });
  
  test('Scenario E: ../secrets.txt 編集 → WARN OUTSIDE_WORKTREE', async () => {
    const result = await simulateEdit('../secrets.txt');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('OUTSIDE_WORKTREE');
  });
  
  test('Scenario F: bash rm -rf → WARN', async () => {
    const result = await simulateBash('rm -rf /tmp/test');
    expect(result.warned).toBe(true);
  });
  
  // 追加シナリオ: multiedit
  test('Scenario G: multiedit with mixed scope → partial WARN', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test'
    });
    
    const files = [
      { filePath: 'src/auth/login.ts' },  // OK
      { filePath: 'src/pay/checkout.ts' } // SCOPE_DENIED
    ];
    
    const result = simulateMultiEdit(files);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('1/2 ファイルで警告');
  });
  
  // 追加シナリオ: STATE_CORRUPTED
  test('Scenario H: state corrupted + src/a.ts → WARN STATE_CORRUPTED', () => {
    // 破損した State を作成
    fs.writeFileSync('.opencode/state/current_context.json', '{ invalid json');
    
    const result = simulateEdit('src/a.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('STATE_CORRUPTED');
  });
  
  // STATE_CORRUPTED でも specs/** は許可
  test('Scenario I: state corrupted + specs/tasks.md → allow (Rule 0)', () => {
    fs.writeFileSync('.opencode/state/current_context.json', '{ invalid json');
    
    const result = simulateEdit('specs/tasks.md');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);  // Rule 0 で許可、警告なし
  });
});
```

**Acceptance Criteria**:

**TDD (全シナリオ):**
- [x] Scenario A: state なし → WARN NO_ACTIVE_TASK
- [x] Scenario B: Scope 内 → allow
- [x] Scenario C: Scope 外 → WARN SCOPE_DENIED
- [x] Scenario D: specs/** → allow (Rule 0)
- [x] Scenario E: worktree 外 → WARN OUTSIDE_WORKTREE
- [x] Scenario F: 破壊的 bash → WARN
- [x] Scenario G: multiedit with mixed scope → partial WARN
- [x] Scenario H: state corrupted → WARN STATE_CORRUPTED
- [x] Scenario I: state corrupted + specs/** → allow (Rule 0)

- [x] `bun test __tests__/e2e/acceptance.test.ts` → 9/9 PASS

**Commit**: YES
- Message: `test(e2e): add acceptance test scenarios A-I (including multiedit and state corruption)`
- Files: `__tests__/e2e/acceptance.test.ts`, `__tests__/helpers/test-harness.ts`
- Pre-commit: `bun test`

---

### Task 8: テンプレートと初期化

**What to do**:
- `specs/tasks.md` テンプレート作成
- `.opencode/state/.gitkeep` 作成
- `README.md` の更新（使用方法）

**Must NOT do**:
- 詳細なドキュメント（MVP後）

**Parallelizable**: YES（他タスクと並列可能）

**References**:

**Spec References (with line numbers)**:
- `spec.md:L142-L149` (セクション 4.2) - tasks.md 例

**Implementation Details**:

_README.md に追加する内容（最低限）:_
```markdown
## OmO-SDD-Hybrid プラグイン

タスク単位のファイルアクセス制御で「Vibe Coding（仕様逸脱）」を物理的に抑止する OpenCode プラグイン。

### クイックスタート

1. **タスクを定義する**
   `specs/tasks.md` にタスクを追加:
   ```markdown
   * [ ] Task-1: ユーザー認証の実装 (Scope: `src/auth/**`, `tests/auth/**`)
   ```

2. **タスクを開始する**
   ```
   sdd_start_task Task-1
   ```

3. **実装する**
   - `allowedScopes` 内のファイルのみ編集可能
   - Scope 外の編集は警告される（Phase 0）

4. **タスクを終了する**
   ```
   sdd_end_task
   ```

### コマンド一覧

| コマンド | 説明 |
|---------|------|
| `sdd_start_task <TaskID>` | タスクを開始し、編集スコープを設定 |
| `sdd_end_task` | 現在のタスクを終了 |
| `sdd_show_context` | 現在のタスク情報を表示 |
| `sdd_validate_gap` | 仕様とコードの差分を検証 |

### 環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `SDD_GUARD_MODE` | `warn` (default) | Phase 0 では warn のみ実装。Phase 1 で `block` を追加予定 |

### ファイル構成

```
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
```

_specs/tasks.md:_
```markdown
# Tasks

このファイルはプロジェクトのタスクを管理します。
各タスクには `(Scope: ...)` で編集可能なファイルパターンを指定してください。

## 例

* [ ] Task-1: ユーザー認証APIの実装 (Scope: `src/auth/**`, `tests/auth/**`)
* [ ] Task-2: 決済機能の追加 (Scope: `src/payment/**`, `tests/payment/**`)

## フォーマット

```
* [ ] <TaskID>: <タイトル> (Scope: `<glob1>`, `<glob2>`, ...)
```

- TaskID: `[A-Za-z][A-Za-z0-9_-]*-\d+` 形式（例: Task-1, PAY-12）
- Scope: バッククォートで囲んだ glob パターン
- 完了時: `[ ]` を `[x]` に変更
```

**Acceptance Criteria**:

**Manual Verification:**
- [x] `specs/tasks.md` が存在
- [x] サンプルタスクが含まれる
- [x] フォーマットが spec.md 準拠
- [x] `.opencode/state/.gitkeep` が存在
- [x] `README.md` に以下のセクションが存在:
  - [x] クイックスタート（4ステップ）
  - [x] コマンド一覧テーブル
  - [x] 環境変数テーブル（`SDD_GUARD_MODE`）
  - [x] ファイル構成

**Commit**: YES
- Message: `chore: add tasks.md template, README, and initial structure`
- Files: `specs/tasks.md`, `.opencode/state/.gitkeep`, `README.md`
- Pre-commit: `bun test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | `chore: setup test infrastructure with bun` | package.json, .opencode/package.json | bun test |
| 1 | `feat(lib): add utility modules for path, glob, state, and tasks parsing` | .opencode/lib/*.ts | bun test |
| 2 | `feat(tools): implement sdd_start_task for task activation` | .opencode/tools/sdd_start_task.ts | bun test |
| 3 | `feat(tools): implement sdd_end_task and sdd_show_context` | .opencode/tools/*.ts | bun test |
| 4 | `feat(plugins): implement sdd-gatekeeper with warn mode` | .opencode/plugins/*.ts | bun test |
| 5 | `feat(tools): add sdd_validate_gap stub for future kiro integration` | .opencode/tools/*.ts | bun test |
| 6 | `feat(skills): add sdd-architect and sdd-implementer skills` | .opencode/skills/**/*.md | bun test |
| 7 | `test(e2e): add acceptance test scenarios A-I (including multiedit and state corruption)` | __tests__/e2e/*.ts, __tests__/helpers/*.ts | bun test |
| 8 | `chore: add tasks.md template, README, and initial structure` | specs/tasks.md, .opencode/state/.gitkeep, README.md | bun test |

---

## Success Criteria

### Verification Commands
```bash
# 全テスト実行
bun test

# 期待: All tests pass (X tests, 0 failures)

# 手動確認
sdd_start_task Task-1
sdd_show_context
# → activeTaskId: Task-1, allowedScopes: [...]

# Scope外編集（warn確認）
# → console に WARN: SCOPE_DENIED が出力される
```

### Final Checklist
- [x] 全テスト pass (`bun test`)
- [x] sdd_start_task が動作する
- [x] sdd-gatekeeper が warn モードで動作する
- [x] Skills が読み込める
- [x] specs/tasks.md テンプレートが存在する
- [x] 受け入れ基準シナリオ A-I すべて pass（9シナリオ）
