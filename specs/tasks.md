# Tasks

## Active Tasks

* [ ] Task-2-1: `sdd_scaffold_specs` ツールとテストの実装 (Scope: `.opencode/tools/sdd_scaffold_specs.ts`, `.opencode/lib/**`, `__tests__/tools/sdd_scaffold_specs.test.ts`, `README.md`)
* [ ] Task-2-2: `sdd_generate_tasks` ツールとテストの実装 (Scope: `.opencode/tools/sdd_generate_tasks.ts`, `.opencode/lib/**`, `__tests__/tools/sdd_generate_tasks.test.ts`, `README.md`)
* [x] Task-2-3: `sdd_review_pending` ツールとテストの実装 (Scope: `.opencode/tools/sdd_review_pending.ts`, `.opencode/lib/**`, `__tests__/tools/sdd_review_pending.test.ts`, `README.md`)
* [x] Task-2-4: `sdd_merge_change` / `sdd_reject_change` ツールとテストの実装 (Scope: `.opencode/tools/sdd_merge_change.ts`, `.opencode/tools/sdd_reject_change.ts`, `.opencode/lib/**`, `__tests__/tools/sdd_merge_change.test.ts`, `__tests__/tools/sdd_reject_change.test.ts`, `README.md`)
* [x] Task-2-5: `sdd_project_status` ツールとテストの実装 (Scope: `.opencode/tools/sdd_project_status.ts`, `.opencode/lib/**`, `__tests__/tools/sdd_project_status.test.ts`, `README.md`)
* [x] Task-3-1: `QA Engineer` スキル定義の追加 (Scope: `.opencode/skills/sdd-qa-engineer/SKILL.md`, `README.md`)
* [x] Task-3-2: `sdd_generate_tests` ツールとテストの実装 (Scope: `.opencode/tools/sdd_generate_tests.ts`, `.opencode/lib/**`, `__tests__/tools/sdd_generate_tests.test.ts`, `README.md`)
* [x] Task-3-3: `sdd_report_bug` ツールとテストの実装（QAがバグ票を起票する） (Scope: `.opencode/tools/sdd_report_bug.ts`, `.opencode/lib/**`, `__tests__/tools/sdd_report_bug.test.ts`, `.opencode/skills/sdd-qa-engineer/SKILL.md`, `README.md`, `.opencode/plugins/sdd-feedback-loop.ts`, `__tests__/plugins/sdd-feedback-loop.test.ts`)
* [x] Task-3-4: Pre-commit Hook / CI Integration（検証強制） (Scope: `.github/workflows/ci.yml`, `.github/workflows/ci.yaml`, `scripts/sdd_ci_validate.ts`, `.opencode/tools/sdd_ci_runner.ts`, `README.md`)
* [ ] Task-3-5: Issue #87 対応: CIでのScope検証機能の実装 (Scope: `.opencode/tools/sdd_ci_runner.ts`, `scripts/sdd_ci_validate.ts`, `__tests__/tools/sdd_ci_runner.test.ts`, `README.md`)
* [x] Task-3-6: Loggerの循環参照修正 (Scope: `.opencode/lib/logger.ts`, `__tests__/lib/logger_circular.test.ts`)
* [x] Task-3-7: Loggerの短いシークレットのマスキング漏れ再現テスト (Scope: `__tests__/lib/logger_short_secret.test.ts`)
* [ ] Task-90: Issue #90 対応: テストマトリクスの拡充（symlink・rename・Windows対応） (Scope: `__tests__/lib/**`, `__tests__/plugins/**`, `.opencode/lib/**`, `.sisyphus/notepads/issue-90/**`)
* [ ] Task-95: Issue #95 対応: worktree外判定で realpath 失敗時(新規作成)の symlink 迂回を防ぐ (Scope: `.opencode/lib/path-utils.ts`, `__tests__/lib/path-utils.symlink.test.ts`)
* [ ] Task-96: Issue #96 対応: isOutsideWorktree の realpath フォールバック強化 (Scope: `.opencode/lib/path-utils.ts`, `__tests__/lib/path-utils.symlink.test.ts`, `__tests__/lib/path-utils.test.ts`)
* [ ] Task-97: Issue #97 作業用タスク (Scope: `.opencode/lib/path-utils.ts`, `__tests__/lib/path-utils.symlink.test.ts`, `__tests__/lib/path-utils.test.ts`, `.sisyphus/notepads/issue-97/**`, `specs/tasks.md`)
* [x] Task-98: Issue #98 対応: 危険なポリシーパスの拒否と fail-closed 実装 (Scope: `.opencode/lib/policy-loader.ts`, `.opencode/lib/access-policy.ts`, `__tests__/lib/policy-loader.test.ts`, `.sisyphus/notepads/issue-98/**`, `specs/tasks.md`)
* [ ] Task-99: Issue #99 対応: state改ざん検知/監査ログの追加 (Scope: `.opencode/lib/state-utils.ts`, `.opencode/lib/access-policy.ts`, `.opencode/tools/sdd_start_task.ts`, `__tests__/helpers/test-harness.ts`, `__tests__/lib/state-utils*.test.ts`, `__tests__/lib/access-policy.test.ts`, `__tests__/plugins/sdd-gatekeeper*.test.ts`, `__tests__/tools/sdd_start_task.test.ts`, `__tests__/tools/sdd_show_context.test.ts`, `__tests__/tools/sdd_project_status.test.ts`, `__tests__/tools/sdd_validate_gap*.test.ts`, `__tests__/e2e/acceptance.test.ts`, `README.md`, `specs/tasks.md`)


## Completed Tasks

* [x] Task-1: 機能実装のサンプル (Scope: `src/**`, `tests/**`)
* [x] Task-2: Phase 1 実装: 検証ロジックの強化とKiro統合 (Scope: `.opencode/tools/sdd_validate_gap.ts`, `README.md`, `specs/tasks.md`)
