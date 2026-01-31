# Kiro統合および意味的検証 (実装検証・修正計画)

## Context

### Original Request
`20260125_spec.md` に基づく作業計画の作成。
当該仕様は、既存の `omo-sdd-hybrid` に対する「Kiro統合」および「意味的検証」拡張を定義している。

### Interview Summary
**現状分析 (Findings)**:
- 実装コード (`sdd_sync_kiro.ts`, `sdd_validate_gap.ts`, `lib/semantic-search.ts` 等) は既に存在している。
- しかし、仕様書 (`20260125_spec.md`) と実装の間に **乖離 (Discrepancy)** が見つかった。

**乖離と課題**:
1.  **パスの不整合**: `sdd_sync_kiro.ts` がデフォルトで `tasks.md` (ルート) を参照しているが、仕様および他のツールは `specs/tasks.md` を正としている。
2.  **テストの網羅性不足**: 既存のテストは「ツールが起動すること」を確認しているのみで、「意味的検証が正しく行われるか」や「デフォルトパスの挙動」を検証できていない。
3.  **UXの不備**: `--deep` オプションを指定しても API Key がない場合にサイレントにスキップされる（警告が出ない）。

### Metis Review
**Identified Gaps**:
- **E2Eテストの欠如**: Kiro仕様作成 → 同期 → 検証 という一連のフローを保証するテストがない。
- **環境変数のマスキング**: 既存テストハーネスが環境変数を強制設定しているため、デフォルト値のバグが見逃されている。

**Guardrails**:
- `fetch` のモック化必須（テスト実行時に外部APIを叩かないこと）。
- 既存の Gatekeeper ロジック (`plugins/sdd-gatekeeper.ts`) には手を加えないこと。

---

## Work Objectives

### Core Objective
Kiro統合機能の実装を修正し、仕様 (`20260125_spec.md`) と完全に整合させる。また、E2Eテストを追加して品質を保証する。

### Concrete Deliverables
1.  **修正**: `.opencode/tools/sdd_sync_kiro.ts` (デフォルトパスの修正)
2.  **改善**: `.opencode/tools/sdd_validate_gap.ts` (API Key欠落時の警告追加)
3.  **テスト**: `__tests__/e2e/kiro_flow.test.ts` (新規作成)

### Definition of Done
- [x] `sdd_sync_kiro` を引数なしで実行した際、`specs/tasks.md` が生成/更新されること。
- [x] `sdd_validate_gap --deep` を API Key なしで実行した際、警告が表示されること。
- [x] 新規 E2E テストが PASS すること。

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Bun test)
- **User wants tests**: YES (TDD)
- **Framework**: `bun test`

### TDD Workflow
1.  **RED**: `__tests__/e2e/kiro_flow.test.ts` を作成し、期待する挙動（パス生成、警告出力）を記述して FAIL させる。
2.  **GREEN**: 実装を修正して PASS させる。
3.  **REFACTOR**: コードを整理する。

---

## Task Flow

```text
Task 1 (Setup E2E) → Task 2 (Fix Sync) → Task 3 (Fix Gap UX)
```

## TODOs

- [x] 1. E2Eテストの作成 (`__tests__/e2e/kiro_flow.test.ts`)

  **What to do**:
  - Kiro仕様 (`.kiro/specs/test-feat/tasks.md`) のモックを作成。
  - `sdd_sync_kiro` を実行し、`specs/tasks.md` が生成されることを検証（現在は `tasks.md` に作られるため FAIL するはず）。
  - `global.fetch` をモックし、Embeddings API のレスポンスを偽装する。
  - `sdd_validate_gap --deep` を実行し、レポートに "意味的ギャップ" が含まれることを検証。

  **Reference**:
  - `__tests__/helpers/test-harness.ts`: テスト用の環境セットアップヘルパー。
  - `20260125_spec.md`: セクション 3.1 (同期ルール)。

  **Acceptance Criteria**:
  - [x] `bun test __tests__/e2e/kiro_flow.test.ts` が実行可能であること（最初はFAIL）。

- [x] 2. `sdd_sync_kiro.ts` のデフォルトパス修正

  **What to do**:
  - デフォルトパスを `tasks.md` から `specs/tasks.md` に変更。
  - 必要に応じてディレクトリ (`specs/`) の作成ロジックを追加。

  **Reference**:
  - `.opencode/tools/sdd_sync_kiro.ts:11`: 修正箇所。

  **Acceptance Criteria**:
  - [x] Task 1 の E2E テストの "Sync" パートが PASS すること。
  - [x] 手動検証: `SDD_TASKS_PATH` 未設定状態でツールを実行し、`specs/tasks.md` が更新されること。

- [x] 3. `sdd_validate_gap.ts` の警告追加

  **What to do**:
  - `--deep` オプションが有効かつ `SDD_EMBEDDINGS_API_KEY` が未設定の場合、レポートに `WARN: Embeddings API Key not found...` を追加するロジックを実装。

  **Reference**:
  - `.opencode/tools/sdd_validate_gap.ts`: `checkKiroIntegration` 呼び出し前後。
  - `.opencode/lib/embeddings-provider.ts`: `isEmbeddingsEnabled()` の活用。

  **Acceptance Criteria**:
  - [x] Task 1 の E2E テストで、API Key 未設定ケースを追加し、警告が出ることを検証。
  - [x] `bun test` 全体が PASS すること。

---

## Success Criteria

### Verification Commands
```bash
# 全テストの実行
bun test

# 新規E2Eテストのみ実行
bun test __tests__/e2e/kiro_flow.test.ts
```

### Final Checklist
- [x] `specs/tasks.md` が正しく同期先のデフォルトになっている。
- [x] 意味的検証の設定不備がユーザーに通知される。
- [x] 既存のテスト (`test:seq`) に回帰がない。
