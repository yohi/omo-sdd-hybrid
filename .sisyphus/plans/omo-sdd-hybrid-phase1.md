# OmO-SDD-Hybrid Phase 1 実装計画

## Context

### Original Request
spec.md に定義された OmO-SDD-Hybrid プラグインの Phase 1 実装。
Phase 0（warn モード）から Phase 1（block モード + 自律ループ）への拡張。

### Interview Summary
**Key Discussions**:
- スコープ: 4つの主要機能すべてを実装
- Block 対象: Rule 1-4 すべて
- テスト戦略: TDD
- Orchestrator: 手動トリガー
- validate_gap テスト範囲: スコープ一致テストのみ
- Strict 検証タイミング: タスク単位（sdd_start_task 時）

**Research Findings**:
- Phase 0 は完全に実装済み
- 既存テストは `allowed: true` をアサート（warn モードのテスト）
- sdd-gatekeeper.ts は現在 `allowed: true` を常に返す
- tasks-parser.ts はバッククォートなしも許容（lenient モード）

### Metis Review Summary
**Identified Gaps** (addressed):
- 既存テストの後方互換性 → warn をデフォルトに維持
- block モードテストの分離 → 専用テストファイル作成
- 環境変数デフォルト → warn（明示的に block 指定時のみ block）
- tasks.md 自動変換禁止 → エラーメッセージで対応案内

### Primary Reference Document

**仕様書パス**: `/home/y_ohi/program/omo-sdd-hybrid/spec.md`

| セクション | 行範囲 | 内容 |
|-----------|-------|------|
| 4. tasks.md フォーマット | L99-L266 | Phase 1 Scope 文法（バッククォート必須） |
| 5. State ファイル仕様 | L269-L409 | State 破損時の Phase 1 動作（BLOCK） |
| 6. Custom Tool 仕様 | L412-L462 | sdd_validate_gap 仕様 |
| 7. Gatekeeper 仕様 | L464-L656 | Phase 1: block モード |
| 8.3 sdd-orchestrator | L775-L788 | 自律ループ仕様 |
| 10. 受け入れ基準 | L843-L853 | Phase 1 期待結果 |
| 12. フェーズ計画 | L866-L879 | Phase 1 達成条件 |

---

## Work Objectives

### Core Objective
Phase 1（block モード + 自律ループ）を TDD で実装し、「タスク未選択/Scope外編集が物理的に不可能、validateが自律で回る」状態にする。

### Concrete Deliverables

| ファイル | 操作 | 説明 |
|---------|------|------|
| `.opencode/plugins/sdd-gatekeeper.ts` | **編集** | block モード追加 |
| `.opencode/lib/tasks-parser.ts` | **編集** | strict モード追加 |
| `.opencode/tools/sdd_start_task.ts` | **編集** | strict 検証統合 |
| `.opencode/tools/sdd_validate_gap.ts` | **編集** | 機能強化 |
| `.opencode/skills/sdd-orchestrator/SKILL.md` | **新規作成** | Orchestrator スキル |
| `__tests__/plugins/sdd-gatekeeper.block.test.ts` | **新規作成** | block モードテスト |
| `__tests__/lib/tasks-parser.strict.test.ts` | **新規作成** | strict モードテスト |
| `__tests__/tools/sdd_validate_gap.enhanced.test.ts` | **新規作成** | 強化版テスト |

### Definition of Done
- [x] `bun test` で全テストが pass（既存 + 新規）
- [x] `SDD_GUARD_MODE=block` で Scope 外編集がエラー
- [x] `SDD_SCOPE_FORMAT=strict` でバッククォートなし Scope がエラー
- [x] `sdd_validate_gap` が lsp_diagnostics + テスト + スコープ検証を実行
- [x] `sdd-orchestrator` スキルが利用可能

### Must Have
- Gatekeeper block モード（環境変数制御）
- Scope フォーマット strict モード（環境変数制御）
- sdd_validate_gap 強化（lsp + test + scope）
- sdd-orchestrator スキル

### Must NOT Have (Guardrails)
- warn モードの削除（デフォルトは warn のまま）
- tasks.md の自動変換（手動 or 別ツール）
- 既存テストの breaking change
- 全テスト実行（スコープ一致テストのみ）

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES（Phase 0 で構築済み）
- **User wants tests**: YES (TDD)
- **Framework**: bun test

### TDD ワークフロー
1. **RED**: 失敗するテストを書く
2. **GREEN**: 最小実装でパス
3. **REFACTOR**: リファクタリング

---

## Task Flow

```text
Task 0 (Gatekeeper block mode) → Task 1 (Parser strict mode)
                                        ↓
                               Task 2 (sdd_start_task strict)
                                        ↓
                               Task 3 (sdd_validate_gap 強化)
                                        ↓
                               Task 4 (sdd-orchestrator skill)
                                        ↓
                               Task 5 (E2E Integration Tests)
```

## Parallelization

| Task | Depends On | Reason |
|------|------------|--------|
| 0 | - | 独立 |
| 1 | 0 | 同時作業可能だが順序推奨 |
| 2 | 1 | strict パーサー使用 |
| 3 | 0 | State 読み込みが必要 |
| 4 | 3 | validate_gap 使用 |
| 5 | 0-4 | 全機能統合テスト |

---

## TODOs

### Task 0: Gatekeeper block モード実装

**What to do**:
- `evaluateAccess()` に `mode` パラメータ追加
- `mode === 'block'` 時に `allowed: false` を返す
- Plugin ハンドラで `allowed: false` 時にエラースロー
- 環境変数 `SDD_GUARD_MODE` チェック（デフォルト: warn）

**Must NOT do**:
- 既存の warn 動作を変更
- デフォルトを block に変更

**Parallelizable**: NO（基盤タスク）

**References**:

**Spec References**:
- `spec.md:L472-L476` (セクション 7.2) - Phase 1: block モード
- `spec.md:L849-L852` (セクション 10) - Phase 1 期待結果

**Pattern References**:
- `.opencode/plugins/sdd-gatekeeper.ts:17-81` - 既存 `evaluateAccess()` 実装
- `.opencode/plugins/sdd-gatekeeper.ts:107-134` - Plugin ハンドラパターン

**Test References**:
- `__tests__/plugins/sdd-gatekeeper.test.ts` - 既存テスト（warn モード）

**Implementation Details**:
```typescript
// sdd-gatekeeper.ts の変更点

type GuardMode = 'warn' | 'block';

function getGuardMode(): GuardMode {
  const mode = process.env.SDD_GUARD_MODE;
  return mode === 'block' ? 'block' : 'warn';
}

export function evaluateAccess(
  toolName: string,
  filePath: string | undefined,
  command: string | undefined,
  stateResult: StateResult,
  worktreeRoot: string,
  mode: GuardMode = getGuardMode()  // 新規追加
): AccessResult {
  // 既存ロジック...
  
  // Rule 1: NO_ACTIVE_TASK
  if (stateResult.status === 'not_found') {
    return { 
      allowed: mode === 'warn',  // 変更: block モードでは false
      warned: true, 
      message: 'NO_ACTIVE_TASK: 先に sdd_start_task を実行してください', 
      rule: 'Rule1' 
    };
  }
  // 他の Rule も同様に変更
}

// Plugin ハンドラの変更
'tool.execute.before': async (event) => {
  const result = evaluateAccess(...);
  
  if (!result.allowed) {
    throw new Error(`[SDD-GATEKEEPER] ${result.message}`);
  }
  
  if (result.warned) {
    console.warn(`[SDD-GATEKEEPER] ${result.message}`);
  }
}
```

**Acceptance Criteria**:

**TDD (RED → GREEN):**
- [x] テストファイル作成: `__tests__/plugins/sdd-gatekeeper.block.test.ts`
- [x] テスト: `SDD_GUARD_MODE=block` + State なし + `src/a.ts` 編集 → エラースロー
- [x] テスト: `SDD_GUARD_MODE=block` + Scope 外編集 → エラースロー
- [x] テスト: `SDD_GUARD_MODE=block` + worktree 外編集 → エラースロー
- [x] テスト: `SDD_GUARD_MODE=block` + 破壊的 bash → エラースロー
- [x] テスト: `SDD_GUARD_MODE=warn`（デフォルト）→ 既存動作維持
- [x] `bun test __tests__/plugins/sdd-gatekeeper.block.test.ts` → PASS

**Manual Verification:**
- [x] `SDD_GUARD_MODE=block bun test` → 全テスト pass
- [x] 既存テスト `__tests__/plugins/sdd-gatekeeper.test.ts` → pass（後方互換）

**Commit**: YES
- Message: `feat(gatekeeper): add block mode for Phase 1`
- Files: `.opencode/plugins/sdd-gatekeeper.ts`, `__tests__/plugins/sdd-gatekeeper.block.test.ts`
- Pre-commit: `bun test`

---

### Task 1: tasks-parser strict モード実装

**What to do**:
- `parseScopes()` に `strict` モード追加
- strict モードでバッククォートなし Scope → `E_SCOPE_FORMAT` エラー
- 環境変数 `SDD_SCOPE_FORMAT` チェック（デフォルト: lenient）

**Must NOT do**:
- lenient モードの削除
- 既存パース動作の変更

**Parallelizable**: YES（Task 0 と並列可能）

**References**:

**Spec References**:
- `spec.md:L122-L128` (セクション 4.1) - Phase 1 Scope ルール
- `spec.md:L209-L216` (セクション 4.3) - 移行ポリシー

**Pattern References**:
- `.opencode/lib/tasks-parser.ts:11-23` - 既存 `parseScopes()` 実装

**Implementation Details**:
```typescript
// tasks-parser.ts の変更点

type ScopeFormat = 'lenient' | 'strict';

function getScopeFormat(): ScopeFormat {
  const format = process.env.SDD_SCOPE_FORMAT;
  return format === 'strict' ? 'strict' : 'lenient';
}

export class ScopeFormatError extends Error {
  constructor(scopeStr: string) {
    super(`E_SCOPE_FORMAT: Scope はバッククォートで囲む必要があります。例: \`${scopeStr}\``);
    this.name = 'ScopeFormatError';
  }
}

function parseScopes(scopeStr: string, format: ScopeFormat = getScopeFormat()): string[] {
  const backtickMatches = [...scopeStr.matchAll(BACKTICK_SCOPE_REGEX)];
  
  if (backtickMatches.length > 0) {
    return backtickMatches.map(m => m[1]).filter(Boolean);
  }
  
  // strict モード: バッククォートなしはエラー
  if (format === 'strict') {
    throw new ScopeFormatError(scopeStr.trim());
  }
  
  // lenient モード: カンマ区切りフォールバック
  return scopeStr.split(/,\s*/).map(s => s.trim()).filter(Boolean);
}
```

**Acceptance Criteria**:

**TDD (RED → GREEN):**
- [x] テストファイル作成: `__tests__/lib/tasks-parser.strict.test.ts`
- [x] テスト: strict + `(Scope: \`src/**\`)` → 正常パース
- [x] テスト: strict + `(Scope: src/**)` → ScopeFormatError
- [x] テスト: lenient + `(Scope: src/**)` → 正常パース（後方互換）
- [x] `bun test __tests__/lib/tasks-parser.strict.test.ts` → PASS

**Commit**: YES
- Message: `feat(parser): add strict scope format for Phase 1`
- Files: `.opencode/lib/tasks-parser.ts`, `__tests__/lib/tasks-parser.strict.test.ts`
- Pre-commit: `bun test`

---

### Task 2: sdd_start_task に strict 検証統合

**What to do**:
- `sdd_start_task` でタスク開始時に Scope フォーマット検証
- strict モードで `ScopeFormatError` をキャッチし、ユーザーフレンドリーなエラーメッセージ

**Must NOT do**:
- tasks.md の自動修正
- ファイル全体の事前検証

**Parallelizable**: NO（Task 1 に依存）

**References**:

**Pattern References**:
- `.opencode/tools/sdd_start_task.ts` - 既存実装

**Implementation Details**:
```typescript
// sdd_start_task.ts の変更点

import { parseTasksFile, ScopeFormatError } from '../lib/tasks-parser';

async execute({ taskId }, context) {
  try {
    const tasks = parseTasksFile(content);
    const task = tasks.find(t => t.id === taskId);
    // ...
  } catch (error) {
    if (error instanceof ScopeFormatError) {
      throw new Error(`E_SCOPE_FORMAT: ${taskId} の Scope 形式が不正です。
バッククォートで囲んでください: (Scope: \`path/**\`)
現在の環境: SDD_SCOPE_FORMAT=${process.env.SDD_SCOPE_FORMAT || 'lenient'}`);
    }
    throw error;
  }
}
```

**Acceptance Criteria**:

**TDD (RED → GREEN):**
- [x] テスト: strict + 不正 Scope タスク開始 → E_SCOPE_FORMAT エラー
- [x] テスト: strict + 正常 Scope タスク開始 → 成功
- [x] 既存テスト → pass

**Commit**: YES
- Message: `feat(start_task): integrate strict scope validation`
- Files: `.opencode/tools/sdd_start_task.ts`, `__tests__/tools/sdd_start_task.test.ts`
- Pre-commit: `bun test`

---

### Task 3: sdd_validate_gap 強化

**What to do**:
- lsp_diagnostics 実行（変更ファイルのエラーチェック）
- スコープ一致テスト実行（`bun test` + フィルタ）
- スコープ検証（変更ファイルが allowedScopes 内か）

**Must NOT do**:
- 全テスト実行（スコープ一致のみ）
- 自動修正

**Parallelizable**: YES（Task 0 完了後、Task 1-2 と並列可能）

**References**:

**Spec References**:
- `spec.md:L765-L770` (セクション 8.2) - 検証ステップ（sdd_validate_gap 使用箇所）
- `spec.md:L785-L786` (セクション 8.3) - orchestrator での validate_gap 使用
- `spec.md:L806` - sdd_validate_gap スタブ提供仕様

**Pattern References**:
- `.opencode/tools/sdd_validate_gap.ts` - 既存スタブ
- `.opencode/lib/state-utils.ts:readState()` - State 読み込み
- `.opencode/lib/glob-utils.ts:matchesScope()` - Scope マッチング

**Implementation Details**:
```typescript
// sdd_validate_gap.ts の強化版

import { readState } from '../lib/state-utils';
import { matchesScope } from '../lib/glob-utils';
import { execSync } from 'child_process';

export default tool({
  description: '仕様とコードの差分を検証（lsp_diagnostics + テスト + スコープ）',
  args: {
    taskId: tool.schema.string().optional().describe('検証対象タスクID（省略時は現在のタスク）')
  },
  async execute({ taskId }, context) {
    const stateResult = readState();
    
    if (stateResult.status !== 'ok') {
      return 'エラー: アクティブなタスクがありません。sdd_start_task を実行してください。';
    }
    
    const state = stateResult.state;
    const results: string[] = [];
    
    // 1. スコープ検証
    const scopeCheck = await validateScopes(state);
    results.push(`## スコープ検証\n${scopeCheck}`);
    
    // 2. LSP Diagnostics（context.tools.lsp_diagnostics が利用可能な場合）
    const lspCheck = await runLspDiagnostics(state);
    results.push(`## LSP Diagnostics\n${lspCheck}`);
    
    // 3. テスト実行（スコープ一致のみ）
    const testCheck = await runScopedTests(state);
    results.push(`## テスト結果\n${testCheck}`);
    
    return results.join('\n\n');
  }
});

async function validateScopes(state: State): string {
  // git diff --name-only で変更ファイル取得
  // matchesScope で各ファイルをチェック
}

async function runLspDiagnostics(state: State): string {
  // 各 allowedScope のファイルに対して lsp_diagnostics 実行
  // エラーがあれば報告
}

async function runScopedTests(state: State): string {
  // allowedScopes に一致するテストファイルを特定
  // bun test <files> を実行
}
```

**Acceptance Criteria**:

**TDD (RED → GREEN):**
- [x] テストファイル作成: `__tests__/tools/sdd_validate_gap.enhanced.test.ts`
- [x] テスト: State あり → スコープ検証結果を含む出力
- [x] テスト: 変更ファイルが Scope 外 → 警告出力
- [x] テスト: テストファイルが存在 → テスト結果を含む出力
- [x] `bun test __tests__/tools/sdd_validate_gap.enhanced.test.ts` → PASS

**Commit**: YES
- Message: `feat(validate_gap): add lsp diagnostics, test execution, scope verification`
- Files: `.opencode/tools/sdd_validate_gap.ts`, `__tests__/tools/sdd_validate_gap.enhanced.test.ts`
- Pre-commit: `bun test`

---

### Task 4: sdd-orchestrator スキル作成

**What to do**:
- `.opencode/skills/sdd-orchestrator/SKILL.md` 作成
- validate-gap → 修正 → 再検証のループ手順
- pass 後のみ tasks.md チェック更新許可

**Must NOT do**:
- 自動実行（手動トリガーのみ）
- 無限ループ

**Parallelizable**: NO（Task 3 に依存）

**References**:

**Spec References**:
- `spec.md:L775-L788` (セクション 8.3) - sdd-orchestrator 仕様

**Pattern References**:
- `.opencode/skills/sdd-architect/SKILL.md` - SKILL.md フォーマット
- `.opencode/skills/sdd-implementer/SKILL.md` - 実装者スキルパターン

**Implementation Details**:
```markdown
---
name: sdd-orchestrator
description: タスク完了を自律的に検証し、pass まで修正ループを回す
priority: 15
---

# SDD Orchestrator スキル

## このスキルを使うタイミング
- タスク実装後、完了を検証したいとき
- 検証エラーを自動修正したいとき

## 手順（MUST）

### 1. 検証ループ
1. `sdd_validate_gap` を実行
2. エラーがあれば修正
3. エラーがなくなるまで 1-2 を繰り返し（最大 5 回）

### 2. 完了条件
- `sdd_validate_gap` が全項目 PASS
- lsp_diagnostics でエラーなし
- テストが全て pass

### 3. タスク完了
- 検証通過後のみ `specs/tasks.md` で `[x]` をマーク可能
- `sdd_end_task` を実行

## 禁止事項
- 検証なしでのタスク完了
- 5 回以上のループ（人間にエスカレーション）
- Scope 外ファイルの修正
```

**Acceptance Criteria**:

**Manual Verification:**
- [x] `.opencode/skills/sdd-orchestrator/SKILL.md` が存在
- [x] YAML frontmatter が正しい形式
- [x] 手順が明確に記載

**Commit**: YES
- Message: `feat(skills): add sdd-orchestrator for autonomous validation loop`
- Files: `.opencode/skills/sdd-orchestrator/SKILL.md`
- Pre-commit: N/A（Markdown のみ）

---

### Task 5: E2E 統合テスト

**What to do**:
- Phase 1 受け入れ基準シナリオのテスト追加
- 既存 E2E テストの拡張

**Must NOT do**:
- 既存テストの破壊

**Parallelizable**: NO（Task 0-4 完了後）

**References**:

**Spec References**:
- `spec.md:L843-L853` (セクション 10) - Phase 1 期待結果

**Pattern References**:
- `__tests__/e2e/acceptance.test.ts` - 既存 E2E テスト

**Acceptance Criteria (Phase 1 追加シナリオ)**:

| ID | 事前状態 | 操作 | 期待結果 (Phase 1) |
|----|---------|------|-------------------|
| A' | state なし + block | `src/a.ts` 編集 | BLOCK (NO_ACTIVE_TASK) |
| C' | Task-1 + block | Scope 外編集 | BLOCK (SCOPE_DENIED) |
| E' | block | worktree 外編集 | BLOCK (OUTSIDE_WORKTREE) |
| H' | state 破損 + block | 編集 | BLOCK (STATE_CORRUPTED) |

**TDD (RED → GREEN):**
- [x] テスト: シナリオ A' → エラースロー
- [x] テスト: シナリオ C' → エラースロー
- [x] テスト: シナリオ E' → エラースロー
- [x] テスト: シナリオ H' → エラースロー
- [x] `bun test __tests__/e2e/acceptance.test.ts` → PASS

**Commit**: YES
- Message: `test(e2e): add Phase 1 block mode acceptance tests`
- Files: `__tests__/e2e/acceptance.test.ts`
- Pre-commit: `bun test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | `feat(gatekeeper): add block mode for Phase 1` | sdd-gatekeeper.ts, *.test.ts | `bun test` |
| 1 | `feat(parser): add strict scope format for Phase 1` | tasks-parser.ts, *.test.ts | `bun test` |
| 2 | `feat(start_task): integrate strict scope validation` | sdd_start_task.ts | `bun test` |
| 3 | `feat(validate_gap): add lsp diagnostics, test execution, scope verification` | sdd_validate_gap.ts, *.test.ts | `bun test` |
| 4 | `feat(skills): add sdd-orchestrator for autonomous validation loop` | SKILL.md | N/A |
| 5 | `test(e2e): add Phase 1 block mode acceptance tests` | acceptance.test.ts | `bun test` |

---

## Success Criteria

### Verification Commands
```bash
# 全テスト実行
bun test

# block モードでテスト
SDD_GUARD_MODE=block bun test

# strict モードでテスト
SDD_SCOPE_FORMAT=strict bun test
```

### Final Checklist
- [x] `bun test` → 全 pass
- [x] `SDD_GUARD_MODE=block` で Scope 外編集 → エラー
- [x] `SDD_SCOPE_FORMAT=strict` でバッククォートなし → エラー
- [x] `sdd_validate_gap` が 3 つの検証を実行
- [x] `sdd-orchestrator` スキルが利用可能
- [x] 既存テストが全て pass（後方互換性）
