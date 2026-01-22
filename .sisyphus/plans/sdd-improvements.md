# SDD改善: State堅牢化・APIアダプター・Lintツール

## Context

### Original Request
`tasks.md` に記載された4つの改善提案のうち、以下の3つを実装する作業計画を作成:
1. APIアダプター層の導入（保守性・信頼性）
2. `tasks.md` のLint/Fixツール実装（使いやすさ）
3. Stateのバックアップと自動修復（信頼性）

### Interview Summary
**Key Discussions**:
- **優先順位**: State(安全性) → Adapter(構造) → Lint(機能) [Metis推奨採用]
- **テスト戦略**: TDD（RED-GREEN-REFACTOR）
- **バックアップ世代数**: 3世代
- **State修復時**: 自動ロールバック+警告通知（サイレント禁止）
- **Lintツール範囲**: 指摘のみ（自動修正なし）

**Research Findings**:
- **Gatekeeper**: `tool.execute.before` フック、`evaluateAccess` が密結合
- **State**: `proper-lockfile` + `write-file-atomic` 使用、同期読み込み
- **Parser**: `TASK_REGEX` + `BACKTICK_SCOPE_REGEX`、`lenient`/`strict` モード
- **Tools**: `tool` ラッパー + Zod + async execute パターン

### Metis Review
**Identified Gaps** (addressed):
- **優先順位の矛盾**: State→Adapter→Lintの順を採用（基盤の安全性優先）
- **Silent Context Switch リスク**: ロールバック時に必ず警告を出力
- **Parser Strictness**: Lint用の「Loose Regex」を新設し、構文エラー行も検出
- **Circular Dependency**: `evaluateAccess` を `lib/access-policy.ts` に抽出

---

## Work Objectives

### Core Objective
OmO-SDD-Hybridの3つの領域（State管理、アクセス制御、タスクパース）を強化し、信頼性・保守性・使いやすさを向上させる。

### Concrete Deliverables
- `.opencode/lib/state-utils.ts`: バックアップローテーション機能
- `.opencode/lib/access-policy.ts`: アクセス制御ロジックの抽出
- `.opencode/plugins/sdd-gatekeeper.ts`: 薄いラッパーへのリファクタリング
- `.opencode/lib/tasks-parser.ts`: Loose Regex追加
- `.opencode/tools/sdd_lint_tasks.ts`: Lintツール新規作成
- 各機能のユニットテスト

### Definition of Done
- [x] `bun test` → 全テストパス
- [x] Stateバックアップ: 3世代のローテーションが動作
- [x] State破損: 自動ロールバック+警告メッセージ表示
- [x] `sdd_lint_tasks` → フォーマット違反を検出・報告
- [x] Gatekeeper: `lib/access-policy.ts` 経由で判定

### Must Have
- TDDによる実装（テストファースト）
- 既存の全テストがパスし続けること
- 後方互換性の維持

### Must NOT Have (Guardrails)
- Stateのサイレント自動修復（必ず通知）
- `plugins/` から `tools/` への直接依存
- `lib/` から `plugins/` への依存
- Lintツールでの自動修正機能
- Kiro統合の変更

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES
- **User wants tests**: TDD
- **Framework**: Bun Test

### TDD Workflow
各TODOはRED-GREEN-REFACTORで実装:
1. **RED**: 失敗するテストを書く
2. **GREEN**: テストを通す最小限のコードを書く
3. **REFACTOR**: コードを整理（テストは緑のまま）

---

## Task Flow

```
Task 1 (State基盤) → Task 2 (バックアップ) → Task 3 (自動修復)
                                                    ↓
Task 4 (Policy抽出) → Task 5 (Gatekeeper薄化)
                                   ↓
Task 6 (Loose Regex) → Task 7 (Lintツール)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| - | なし | 依存関係が線形 |

| Task | Depends On | Reason |
|------|------------|--------|
| 2 | 1 | バックアップはローテーション基盤が必要 |
| 3 | 2 | 自動修復はバックアップ読み込みが必要 |
| 4 | 3 | State安定後にPolicy抽出 |
| 5 | 4 | Policyが抽出された後にGatekeeper変更 |
| 6 | 5 | 構造安定後にParser拡張 |
| 7 | 6 | Loose Regexを使ってLintツール実装 |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> Specify parallelizability for EVERY task.

---

### Phase 1: State堅牢化

- [x] 1. Stateバックアップ: ローテーション基盤の実装

  **What to do**:
  - `rotateBackup(filePath, generations)` 関数を作成
  - 既存ファイルを `.bak` → `.bak.1` → `.bak.2` とシフト
  - 最古のバックアップを削除

  **Must NOT do**:
  - `writeState` の変更（次のタスクで行う）
  - バックアップ読み込みロジック

  **Parallelizable**: NO (基盤タスク)

  **References**:
  - **Pattern References**:
    - `.opencode/lib/state-utils.ts:writeState` - 現在の書き込みロジック、ロックファイルの使い方
  - **Test References**:
    - `__tests__/lib/state-utils.test.ts` - 既存のState関連テストパターン

  **Acceptance Criteria**:
  - [ ] テストファイル作成: `__tests__/lib/backup-utils.test.ts`
  - [ ] テストケース:
    - `rotateBackup` で既存ファイルがシフトされる
    - 3世代を超えるバックアップは削除される
    - ファイルが存在しない場合は何もしない
  - [ ] `bun test __tests__/lib/backup-utils.test.ts` → PASS

  **Commit**: YES
  - Message: `feat(state): バックアップローテーション基盤を追加`
  - Files: `.opencode/lib/backup-utils.ts`, `__tests__/lib/backup-utils.test.ts`
  - Pre-commit: `bun test __tests__/lib/backup-utils.test.ts`

---

- [x] 2. Stateバックアップ: `writeState` への統合

  **What to do**:
  - `writeState` 内でロック取得後、書き込み前に `rotateBackup` を呼び出す
  - バックアップはロックのクリティカルセクション内で実行

  **Must NOT do**:
  - バックアップ読み込み・修復ロジック
  - `readState` の変更

  **Parallelizable**: NO (Task 1 に依存)

  **References**:
  - **Pattern References**:
    - `.opencode/lib/state-utils.ts:writeState` - ロック取得のタイミング、`writeFileAtomic` の使い方
    - `.opencode/lib/backup-utils.ts:rotateBackup` - Task 1 で作成した関数
  - **Test References**:
    - `__tests__/lib/state-utils.test.ts` - 既存のwriteStateテスト

  **Acceptance Criteria**:
  - [ ] テストケース追加: `__tests__/lib/state-utils.test.ts`
    - `writeState` 呼び出し後にバックアップファイルが作成される
    - 複数回 `writeState` でローテーションが動作
  - [ ] `bun test __tests__/lib/state-utils.test.ts` → PASS

  **Commit**: YES
  - Message: `feat(state): writeState にバックアップローテーションを統合`
  - Files: `.opencode/lib/state-utils.ts`, `__tests__/lib/state-utils.test.ts`
  - Pre-commit: `bun test`

---

- [x] 3. State自動修復: 破損検知とロールバック

  **What to do**:
  - `readState` で破損検知時（JSONパースエラー、スキーマ不一致）にバックアップから復元
  - 復元時に警告メッセージを標準エラー出力に表示
  - `restoreFromBackup(filePath)` 関数を作成

  **Must NOT do**:
  - サイレント修復（警告なし）
  - バックアップが全て破損している場合の自動クリア（エラーをスローする）

  **Parallelizable**: NO (Task 2 に依存)

  **References**:
  - **Pattern References**:
    - `.opencode/lib/state-utils.ts:readState` - 現在の読み込みロジック、スキーマ検証
    - `.opencode/lib/backup-utils.ts` - バックアップ関連関数
  - **Test References**:
    - `__tests__/lib/state-utils.test.ts` - 既存のreadStateテスト

  **Acceptance Criteria**:
  - [ ] テストケース追加:
    - 破損したStateファイルからバックアップへのロールバック
    - ロールバック時に `console.warn` が呼ばれる
    - 全バックアップ破損時はエラーをスロー
  - [ ] `bun test __tests__/lib/state-utils.test.ts` → PASS
  - [ ] 手動検証: 破損JSONを作成し、readState呼び出しで警告が出力されることを確認

  **Commit**: YES
  - Message: `feat(state): 破損検知時の自動ロールバック機能を追加`
  - Files: `.opencode/lib/state-utils.ts`, `.opencode/lib/backup-utils.ts`, `__tests__/lib/state-utils.test.ts`
  - Pre-commit: `bun test`

---

### Phase 2: APIアダプター層

- [x] 4. Access Policy: Gatekeeperからロジック抽出

  **What to do**:
  - `.opencode/lib/access-policy.ts` を新規作成
  - `evaluateAccess(filePath, allowedScopes)` 関数を移動
  - `ALWAYS_ALLOW` パターンも移動
  - 既存の型定義を適切にエクスポート

  **Must NOT do**:
  - Gatekeeperの変更（次のタスクで行う）
  - ロジックの変更（移動のみ）

  **Parallelizable**: NO (Phase 1 完了後)

  **References**:
  - **Pattern References**:
    - `.opencode/plugins/sdd-gatekeeper.ts:evaluateAccess` - 抽出対象のロジック
    - `.opencode/plugins/sdd-gatekeeper.ts:ALWAYS_ALLOW` - 抽出対象の定数
  - **Test References**:
    - `__tests__/plugins/sdd-gatekeeper.test.ts` - 既存のGatekeeperテスト（参考）

  **Acceptance Criteria**:
  - [ ] テストファイル作成: `__tests__/lib/access-policy.test.ts`
  - [ ] テストケース:
    - `evaluateAccess` が正しいスコープ判定を行う
    - `ALWAYS_ALLOW` パターンは常に許可
    - 複数スコープの評価
  - [ ] `bun test __tests__/lib/access-policy.test.ts` → PASS

  **Commit**: YES
  - Message: `refactor(gatekeeper): アクセス制御ロジックを lib/access-policy.ts に抽出`
  - Files: `.opencode/lib/access-policy.ts`, `__tests__/lib/access-policy.test.ts`
  - Pre-commit: `bun test __tests__/lib/access-policy.test.ts`

---

- [x] 5. Gatekeeper薄化: lib/access-policyへの委譲

  **What to do**:
  - Gatekeeperから `evaluateAccess` と `ALWAYS_ALLOW` を削除
  - `lib/access-policy.ts` からインポートして使用
  - 既存の全テストがパスすることを確認

  **Must NOT do**:
  - ロジックの変更（委譲のみ）
  - 新機能の追加

  **Parallelizable**: NO (Task 4 に依存)

  **References**:
  - **Pattern References**:
    - `.opencode/plugins/sdd-gatekeeper.ts` - リファクタリング対象
    - `.opencode/lib/access-policy.ts` - Task 4 で作成したモジュール
  - **Test References**:
    - `__tests__/plugins/sdd-gatekeeper.test.ts` - 既存テスト（変更なし）

  **Acceptance Criteria**:
  - [ ] `__tests__/plugins/sdd-gatekeeper.test.ts` → 既存テスト全PASS
  - [ ] Gatekeeper内に `evaluateAccess` 定義がないことを確認
  - [ ] `bun test` → 全テストPASS

  **Commit**: YES
  - Message: `refactor(gatekeeper): access-policyへの委譲を完了`
  - Files: `.opencode/plugins/sdd-gatekeeper.ts`
  - Pre-commit: `bun test`

---

### Phase 3: Lintツール

- [x] 6. Parser拡張: Loose Regex追加

  **What to do**:
  - Lint用の「Loose Regex」を追加（`* [x]` で始まるが正しいフォーマットでない行を検出）
  - `lintTaskLine(line)` 関数を追加: 問題の種類を返す
  - 問題種類: `missing-scope`, `invalid-id`, `missing-backticks`, `invalid-format`

  **Must NOT do**:
  - 既存の `parseTask` の変更
  - 自動修正ロジック

  **Parallelizable**: NO (Phase 2 完了後)

  **References**:
  - **Pattern References**:
    - `.opencode/lib/tasks-parser.ts:TASK_REGEX` - 正式な正規表現
    - `.opencode/lib/tasks-parser.ts:parseTask` - 既存のパース関数
  - **Test References**:
    - `__tests__/lib/tasks-parser.test.ts` - 既存のParserテスト

  **Acceptance Criteria**:
  - [ ] テストケース追加: `__tests__/lib/tasks-parser.test.ts`
    - `* [ ] Task-1: Title` (Scope欠落) → `missing-scope`
    - `* [ ] invalid: Title (Scope: src/**)` (無効なID) → `invalid-id`
    - `* [ ] Task-1: Title (Scope: src/**)` (バッククォート欠落) → `missing-backticks`
    - `* [ ]Task-1` (不正フォーマット) → `invalid-format`
    - 正しいフォーマット → `null` (問題なし)
  - [ ] `bun test __tests__/lib/tasks-parser.test.ts` → PASS

  **Commit**: YES
  - Message: `feat(parser): Lint用のLoose Regexと問題検出関数を追加`
  - Files: `.opencode/lib/tasks-parser.ts`, `__tests__/lib/tasks-parser.test.ts`
  - Pre-commit: `bun test __tests__/lib/tasks-parser.test.ts`

---

- [x] 7. Lintツール: sdd_lint_tasks 実装

  **What to do**:
  - `.opencode/tools/sdd_lint_tasks.ts` を新規作成
  - `specs/tasks.md` を読み込み、全行を `lintTaskLine` でチェック
  - 問題がある行を行番号付きでレポート
  - 問題がなければ「All tasks are valid」メッセージ

  **Must NOT do**:
  - 自動修正（`--fix` オプションなし）
  - `specs/tasks.md` 以外のファイルの検査

  **Parallelizable**: NO (Task 6 に依存)

  **References**:
  - **Pattern References**:
    - `.opencode/tools/sdd_start_task.ts` - ツール実装パターン（`tool` ラッパー、Zodスキーマ）
    - `.opencode/lib/tasks-parser.ts:lintTaskLine` - Task 6 で作成した関数
  - **Test References**:
    - `__tests__/tools/sdd_start_task.test.ts` - ツールのテストパターン

  **Acceptance Criteria**:
  - [ ] テストファイル作成: `__tests__/tools/sdd_lint_tasks.test.ts`
  - [ ] テストケース:
    - 問題のあるtasks.mdでエラーレポートが返る
    - 問題のないtasks.mdで「All tasks are valid」
    - ファイルが存在しない場合のエラーハンドリング
  - [ ] `bun test __tests__/tools/sdd_lint_tasks.test.ts` → PASS
  - [ ] 手動検証: `sdd_lint_tasks` を実行し、レポートが表示されることを確認

  **Commit**: YES
  - Message: `feat(tools): sdd_lint_tasks ツールを追加`
  - Files: `.opencode/tools/sdd_lint_tasks.ts`, `__tests__/tools/sdd_lint_tasks.test.ts`
  - Pre-commit: `bun test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(state): バックアップローテーション基盤を追加` | backup-utils.ts, test | bun test |
| 2 | `feat(state): writeState にバックアップローテーションを統合` | state-utils.ts, test | bun test |
| 3 | `feat(state): 破損検知時の自動ロールバック機能を追加` | state-utils.ts, backup-utils.ts, test | bun test |
| 4 | `refactor(gatekeeper): アクセス制御ロジックを lib/access-policy.ts に抽出` | access-policy.ts, test | bun test |
| 5 | `refactor(gatekeeper): access-policyへの委譲を完了` | sdd-gatekeeper.ts | bun test |
| 6 | `feat(parser): Lint用のLoose Regexと問題検出関数を追加` | tasks-parser.ts, test | bun test |
| 7 | `feat(tools): sdd_lint_tasks ツールを追加` | sdd_lint_tasks.ts, test | bun test |

---

## Success Criteria

### Verification Commands
```bash
# 全テスト実行
bun test  # Expected: All tests pass

# State関連テスト
bun test __tests__/lib/state-utils.test.ts  # Expected: PASS

# Lintツールテスト
bun test __tests__/tools/sdd_lint_tasks.test.ts  # Expected: PASS
```

### Final Checklist
- [x] 全7タスク完了
- [x] `bun test` → 全テストパス
- [x] サイレント修復がないこと（警告出力を確認）
- [x] `plugins/` から `tools/` への依存がないこと
- [x] Kiro統合に変更がないこと
