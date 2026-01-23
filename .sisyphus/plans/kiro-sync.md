# Kiro-Tasks 同期機能 実装 (Issue #44)

## Context

### Original Request
GitHub Issue #44: `.kiro/specs/*/tasks.md`（機能ごとのタスク定義）と、プロジェクトルートの `tasks.md`（全体の実装進捗）の状態を同期させる `sdd_sync_kiro` コマンドの実装。

### Interview Summary
**Key Discussions**:
- TDDで進める（テスト先行）
- Root `tasks.md` を Source of Truth として Kiro 側のチェックボックスを同期
- 既存パターン（`tool()` 関数、`state-utils.ts`）を踏襲

**Research Findings**:
- `tasks-parser.ts`: 読み取り専用。`updateTaskStatusInContent`, `extractTaskIdFromLine` は存在しない
- `kiro-utils.ts`: 読み取り専用。`updateKiroSpecTasks` は存在しない
- `.kiro/` ディレクトリは現在存在しない（テスト時にモック作成が必要）
- 既存ツール: `lib/plugin-stub.ts` の `tool()` パターンを使用
- テスト基盤: Bun test が完璧に整備

### Metis Review
**Identified Gaps** (addressed):
- コンフリクト解決: Root を正とする（Issue記載の仕様に準拠）
- Import位置: 末尾追加（Issue記載のコードに準拠）
- IDなしタスク: スキップ（Issue記載の運用注意に準拠）
- エラーハンドリング: パースエラー時は該当featureをスキップ

---

## Work Objectives

### Core Objective
Kiro仕様（`.kiro/specs/*/tasks.md`）とRoot `tasks.md` 間でタスク状態を同期する `sdd_sync_kiro` コマンドを実装し、二重管理の手間を排除する。

### Concrete Deliverables
- `.opencode/lib/tasks-parser.ts` に2関数追加
- `.opencode/lib/kiro-utils.ts` に1関数追加
- `.opencode/tools/sdd_sync_kiro.ts` 新規作成
- `__tests__/lib/tasks-parser.test.ts` にテスト追加
- `__tests__/lib/kiro-utils.test.ts` にテスト追加
- `__tests__/tools/sdd_sync_kiro.test.ts` 新規作成

### Definition of Done
- [x] `bun test` が全てパス
- [x] `sdd_sync_kiro` コマンドがOpenCodeから呼び出し可能
- [x] Root→Kiro 方向のステータス同期が動作
- [x] Kiro→Root 方向のImportが動作

### Must Have
- `updateTaskStatusInContent()`: タスク状態を更新する関数
- `extractTaskIdFromLine()`: 行からタスクIDを抽出する関数
- `updateKiroSpecTasks()`: Kiro tasks.md を更新する関数
- `sdd_sync_kiro` ツール: 同期の実行

### Must NOT Have (Guardrails)
- バックアップファイル（`.bak`）の作成
- Git コミットの自動実行
- 複雑なログフォーマット（`console.log` の簡潔な要約のみ）
- 設定ファイル（`.kirorc.json` 等）の導入
- UI/対話的な確認プロンプト（全て自動実行）
- クラスベースの抽象化（`class TaskSynchronizer` 等）
- 既存タスクの順序変更

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES
- **User wants tests**: TDD
- **Framework**: bun test

### TDD Workflow
各TODOは RED-GREEN-REFACTOR で進行:
1. **RED**: 失敗するテストを先に書く
2. **GREEN**: テストをパスする最小限の実装
3. **REFACTOR**: コードを整理（テストは緑のまま）

---

## Task Flow

```
Task 1 (updateTaskStatusInContent テスト+実装)
    ↓
Task 2 (extractTaskIdFromLine テスト+実装)
    ↓
Task 3 (updateKiroSpecTasks テスト+実装)
    ↓
Task 4 (sdd_sync_kiro ツール テスト+実装)
    ↓
Task 5 (統合テスト・動作確認)
```

## Parallelization

| Task | Depends On | Reason |
|------|------------|--------|
| 1 | - | 独立 |
| 2 | - | 独立 |
| 3 | - | 独立 |
| 4 | 1, 2, 3 | 全ユーティリティ関数を使用 |
| 5 | 4 | 統合確認 |

**Note**: Task 1, 2, 3 は並列実行可能

---

## TODOs

- [x] 1. `updateTaskStatusInContent` 関数の実装 (TDD)

  **What to do**:
  - RED: `__tests__/lib/tasks-parser.test.ts` に以下のテストケースを追加:
    - タスクIDに一致する行の `[ ]` → `[x]` 変換
    - タスクIDに一致する行の `[x]` → `[ ]` 変換
    - 存在しないタスクIDの場合は元のコンテンツを返す
    - 複数行コンテンツで正しい行のみ更新
  - GREEN: `.opencode/lib/tasks-parser.ts` に関数を実装
  - REFACTOR: 必要に応じて整理

  **実装仕様** (Issue #44 より):
  ```typescript
  export function updateTaskStatusInContent(
    content: string, 
    taskId: string, 
    isDone: boolean
  ): string
  ```
  - 正規表現で `* [ ]` または `* [x]` を検出
  - `parseTask` を利用してタスクIDを照合
  - マッチした行のチェックボックスのみ置換

  **Must NOT do**:
  - 他の行を変更しない
  - タスクの順序を変更しない
  - フォーマットを変更しない（インデント等維持）

  **Parallelizable**: YES (with 2, 3)

  **References**:
  
  **Pattern References**:
  - `.opencode/lib/tasks-parser.ts:94-108` - `parseTask` 関数の実装。タスク行のパースロジックを再利用
  - `.opencode/lib/tasks-parser.ts:1-4` - 正規表現定義（`TASK_REGEX`, `LOOSE_TASK_REGEX`）
  
  **Test References**:
  - `__tests__/lib/tasks-parser.test.ts` - 既存のテストパターンを参照
  
  **WHY Each Reference Matters**:
  - `parseTask`: タスクIDの抽出に使用。同じ正規表現ロジックを再利用することで一貫性を保つ
  - `TASK_REGEX`: 行のマッチングに使用。チェックボックス部分の置換対象を特定

  **Acceptance Criteria**:
  
  **TDD**:
  - [x] テストファイル: `__tests__/lib/tasks-parser.test.ts` に追記
  - [x] `bun test __tests__/lib/tasks-parser.test.ts` → PASS

  **Manual Verification**:
  - [x] Node REPL で動作確認:
    ```
    > import { updateTaskStatusInContent } from './.opencode/lib/tasks-parser'
    > updateTaskStatusInContent('* [ ] Task-1: Test (Scope: `src/*`)', 'Task-1', true)
    Expected: '* [x] Task-1: Test (Scope: `src/*`)'
    ```

  **Commit**: YES
  - Message: `feat(tasks-parser): updateTaskStatusInContent 関数を追加`
  - Files: `.opencode/lib/tasks-parser.ts`, `__tests__/lib/tasks-parser.test.ts`
  - Pre-commit: `bun test __tests__/lib/tasks-parser.test.ts`

---

- [x] 2. `extractTaskIdFromLine` 関数の実装 (TDD)

  **What to do**:
  - RED: `__tests__/lib/tasks-parser.test.ts` に以下のテストケースを追加:
    - SDD形式 (`* [ ] Task-1: ...`) からID抽出
    - Kiro形式 (`- [ ] Task-1: ...`) からID抽出
    - IDがない行（`- [ ] 単なるチェックボックス`）は `null` を返す
    - 空行や見出し行は `null` を返す
  - GREEN: `.opencode/lib/tasks-parser.ts` に関数を実装
  - REFACTOR: 必要に応じて整理

  **実装仕様** (Issue #44 より):
  ```typescript
  export function extractTaskIdFromLine(line: string): string | null
  ```
  - `*` と `-` 両方のプレフィックスに対応
  - IDパターン: `[A-Za-z][A-Za-z0-9_-]*-\d+`

  **Must NOT do**:
  - 厳密なフォーマット検証（lenient に抽出）

  **Parallelizable**: YES (with 1, 3)

  **References**:
  
  **Pattern References**:
  - `.opencode/lib/tasks-parser.ts:4` - `VALID_ID_REGEX` の定義
  - `.opencode/lib/tasks-parser.ts:1` - `TASK_REGEX` のID抽出部分
  
  **WHY Each Reference Matters**:
  - `VALID_ID_REGEX`: IDの形式検証に使用。一貫したID形式を保証
  - `TASK_REGEX`: SDD形式のパターン。Kiro形式への拡張の基礎

  **Acceptance Criteria**:
  
  **TDD**:
  - [x] テストファイル: `__tests__/lib/tasks-parser.test.ts` に追記
  - [x] `bun test __tests__/lib/tasks-parser.test.ts` → PASS

  **Manual Verification**:
  - [x] Node REPL で動作確認:
    ```
    > import { extractTaskIdFromLine } from './.opencode/lib/tasks-parser'
    > extractTaskIdFromLine('- [ ] Feature-42: タスク名')
    Expected: 'Feature-42'
    > extractTaskIdFromLine('- [ ] IDなしタスク')
    Expected: null
    ```

  **Commit**: YES
  - Message: `feat(tasks-parser): extractTaskIdFromLine 関数を追加`
  - Files: `.opencode/lib/tasks-parser.ts`, `__tests__/lib/tasks-parser.test.ts`
  - Pre-commit: `bun test __tests__/lib/tasks-parser.test.ts`

---

- [x] 3. `updateKiroSpecTasks` 関数の実装 (TDD)

  **What to do**:
  - RED: `__tests__/lib/kiro-utils.test.ts` に以下のテストケースを追加:
    - 指定されたfeatureの `tasks.md` を更新
    - 存在しないfeatureの場合は `false` を返す
    - 書き込み成功時は `true` を返す
  - GREEN: `.opencode/lib/kiro-utils.ts` に関数を実装
  - REFACTOR: 必要に応じて整理

  **実装仕様** (Issue #44 より):
  ```typescript
  export function updateKiroSpecTasks(
    featureName: string, 
    newContent: string
  ): boolean
  ```

  **Must NOT do**:
  - バックアップファイルの作成
  - 存在しないディレクトリの自動作成

  **Parallelizable**: YES (with 1, 2)

  **References**:
  
  **Pattern References**:
  - `.opencode/lib/kiro-utils.ts:22-28` - `getKiroDir()`, `getSpecsDir()` の実装
  - `.opencode/lib/kiro-utils.ts:46-84` - `loadKiroSpec()` のファイル読み込みパターン
  
  **Test References**:
  - `__tests__/lib/kiro-utils.test.ts` - 既存のテストパターン（一時ディレクトリ使用）
  
  **WHY Each Reference Matters**:
  - `getSpecsDir()`: Kiro仕様ディレクトリのパス取得。同じロジックを再利用
  - `loadKiroSpec()`: ファイル存在チェックのパターン。同様のエラーハンドリングを適用

  **Acceptance Criteria**:
  
  **TDD**:
  - [x] テストファイル: `__tests__/lib/kiro-utils.test.ts` に追記
  - [x] `bun test __tests__/lib/kiro-utils.test.ts` → PASS

  **Manual Verification**:
  - [x] テスト用の `.kiro/specs/test-feature/tasks.md` を作成して動作確認

  **Commit**: YES
  - Message: `feat(kiro-utils): updateKiroSpecTasks 関数を追加`
  - Files: `.opencode/lib/kiro-utils.ts`, `__tests__/lib/kiro-utils.test.ts`
  - Pre-commit: `bun test __tests__/lib/kiro-utils.test.ts`

---

- [x] 4. `sdd_sync_kiro` ツールの実装 (TDD)

  **What to do**:
  - RED: `__tests__/tools/sdd_sync_kiro.test.ts` を新規作成:
    - Kiro→Root のImport（新規タスク追加）
    - Root→Kiro のステータス同期（`[x]` 伝播）
    - `.kiro/specs/` が存在しない場合のエラーハンドリング
    - Root `tasks.md` が存在しない場合のエラーハンドリング
  - GREEN: `.opencode/tools/sdd_sync_kiro.ts` を新規作成
  - REFACTOR: 必要に応じて整理

  **実装仕様** (Issue #44 より):
  - Discovery: `findKiroSpecs()` で仕様一覧取得
  - Import: KiroにあってRootにないタスクを末尾追加
  - Status Sync: Rootの状態をKiroに反映（Root優先）

  **Must NOT do**:
  - 対話的なプロンプト
  - 複雑なログ出力（シンプルなconsole.logのみ）
  - 設定ファイルの読み込み

  **Parallelizable**: NO (depends on 1, 2, 3)

  **References**:
  
  **Pattern References**:
  - `.opencode/tools/sdd_show_context.ts:1-30` - ツールの基本構造（`tool()` 関数の使用パターン）
  - `.opencode/lib/plugin-stub.ts` - `tool()` 関数とzodスキーマ定義
  - `.opencode/lib/kiro-utils.ts:30-44` - `findKiroSpecs()`, `loadKiroSpec()` の使用方法
  
  **API/Type References**:
  - `.opencode/lib/tasks-parser.ts:70-75` - `ParsedTask` インターフェース
  - `.opencode/lib/kiro-utils.ts:7-13` - `KiroSpec` インターフェース
  
  **Test References**:
  - `__tests__/tools/sdd_start_task.test.ts` - ツールテストの構造（`execute` メソッド呼び出し）
  - `__tests__/helpers/test-harness.ts` - テスト用ユーティリティ（一時ディレクトリ作成等）
  
  **WHY Each Reference Matters**:
  - `sdd_show_context.ts`: 最もシンプルなツールの実装例。引数なしツールのテンプレート
  - `findKiroSpecs()`, `loadKiroSpec()`: Kiro仕様の読み込みに使用
  - `test-harness.ts`: テスト用の一時ディレクトリ作成パターン

  **Acceptance Criteria**:
  
  **TDD**:
  - [x] テストファイル: `__tests__/tools/sdd_sync_kiro.test.ts` 新規作成
  - [x] `bun test __tests__/tools/sdd_sync_kiro.test.ts` → PASS

  **Manual Verification**:
  - [x] テスト用ディレクトリ構造を作成:
    ```bash
    mkdir -p .kiro/specs/test-feature
    echo "- [ ] Test-1: テストタスク" > .kiro/specs/test-feature/tasks.md
    echo "* [x] Test-1: テストタスク (Scope: \`src/*\`)" > tasks.md
    ```
  - [x] コマンド実行:
    ```bash
    bun .opencode/tools/sdd_sync_kiro.ts
    ```
  - [x] 結果確認:
    ```bash
    cat .kiro/specs/test-feature/tasks.md
    # Expected: - [x] Test-1: テストタスク
    ```

  **Commit**: YES
  - Message: `feat(tools): sdd_sync_kiro コマンドを追加`
  - Files: `.opencode/tools/sdd_sync_kiro.ts`, `__tests__/tools/sdd_sync_kiro.test.ts`
  - Pre-commit: `bun test __tests__/tools/sdd_sync_kiro.test.ts`

---

- [x] 5. 統合テスト・動作確認

  **What to do**:
  - 全テスト実行: `bun test:seq`
  - 手動での統合動作確認
  - エッジケースの確認（空ファイル、不正フォーマット等）

  **Must NOT do**:
  - 新機能の追加（テストとバグ修正のみ）

  **Parallelizable**: NO (depends on 4)

  **References**:
  
  **Documentation References**:
  - `AGENTS.md` - プロジェクトの規約確認
  - `package.json` - テストスクリプト確認

  **Acceptance Criteria**:
  
  **TDD**:
  - [x] `bun test:seq` → 全テストPASS

  **Manual Verification**:
  - [x] OpenCode環境で `sdd_sync_kiro` が呼び出し可能であることを確認
  - [x] 実際の `.kiro/specs/` がある場合の動作確認（オプション）

  **Commit**: YES (if fixes needed)
  - Message: `fix(sync): 統合テストで発見した問題を修正`
  - Files: (修正があれば)
  - Pre-commit: `bun test:seq`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(tasks-parser): updateTaskStatusInContent 関数を追加` | tasks-parser.ts, test | `bun test` |
| 2 | `feat(tasks-parser): extractTaskIdFromLine 関数を追加` | tasks-parser.ts, test | `bun test` |
| 3 | `feat(kiro-utils): updateKiroSpecTasks 関数を追加` | kiro-utils.ts, test | `bun test` |
| 4 | `feat(tools): sdd_sync_kiro コマンドを追加` | sdd_sync_kiro.ts, test | `bun test` |
| 5 | `fix: 統合テストで発見した問題を修正` (if needed) | (varies) | `bun test:seq` |

---

## Success Criteria

### Verification Commands
```bash
bun test:seq                    # 全テストパス
bun .opencode/tools/sdd_sync_kiro.ts  # コマンド実行可能
```

### Final Checklist
- [x] 全 "Must Have" 機能が実装済み
- [x] 全 "Must NOT Have" 項目が遵守されている
- [x] `bun test:seq` が全てパス
- [x] Issue #44 の仕様を満たしている
