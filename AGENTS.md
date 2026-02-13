# AGENTS.md - OmO-SDD-Hybrid Developer Guide

**Context:** OmO-SDD-Hybrid (OpenCode Plugin)
**Stack:** TypeScript, Bun, OpenCode API
**Language:** Code=English, Comments/Docs/Commits=**JAPANESE** (Strict)

## 1. CORE PHILOSOPHY & IDENTITY

**"Vibe Coding" is the Enemy.**
This project implements **Specification-Driven Development (SDD)** with physical enforcement.
We do not "just write code". We define specs, lock the scope, and then implement.

- **Gatekeeper**: Blocks file edits outside the active task's scope.
- **Hybrid Structure**:
  - `.opencode/`: Core logic (Hidden Source).
  - `src/`: User implementation (Userland).
  - `specs/` & `.kiro/`: Source of Truth (Specifications).

## 2. LANGUAGE RULES (CRITICAL)

- **Code Symbols**: English, `camelCase` (e.g., `updateState`).
- **Comments / Docs**: **JAPANESE** (日本語). Mandatory for user understanding.
- **Commit Messages**: **JAPANESE** (e.g., `feat: 排他制御ロジックを修正`).
- **Communication**: **JAPANESE ONLY**. The user is a Japanese speaker. Do NOT explain or ask questions in English.
- **Error Messages**: **JAPANESE** with Error Codes.
  - ✅ `throw new Error("E_TASK_NOT_FOUND: タスクが見つかりません")`
  - ❌ `throw new Error("Task not found")`

## 3. ENVIRONMENT & COMMANDS

Use **Bun** for all operations.

### Global Environment Safety Rules (CRITICAL)

**STRICTLY FORBIDDEN**: Running build/install commands (`bun install`, `npm install`, `make`, etc.) directly on the host machine.

1. **Container Check**: Before running any build or dependency installation command, you **MUST** verify if you are inside a container (e.g., check for the existence of `/.dockerenv`).
2. **Action if on Host**: If you are NOT in a container, you **MUST NOT** proceed with the command. STOP and ask the user for instructions or use `docker exec` to run the command inside the appropriate container.
3. **Environment Isolation**: Always ensure that the development environment is isolated to prevent host pollution.

- **Test**:
  - `bun test`: Run all tests (Parallel).
  - `bun test:seq`: **Recommended**. Runs sequentially to prevent State/Lock race conditions.
  - `bun test <path>`: Run specific test file.
- **Build**: `bun run build` (Outputs to `dist/`).
- **Lint**: Follow Prettier/ESLint (implicit). `markdownlint` for docs.

## 4. ARCHITECTURE & STATE MANAGEMENT

### State Isolation
- **Single Source of Truth**: `.opencode/state/current_context.json`
- **Strict Rule**: **NEVER** write to `.opencode/state/*.json` directly.
- **Correct Access**:
  ```typescript
  import { readState, writeState, lockStateDir } from '../lib/state-utils.js';
  // Use lockStateDir for atomic operations
  ```

### Gatekeeper Mechanism
1. Intercepts `tool.execute.before`.
2. Checks `allowedScopes` (Glob patterns) in State.
3. Throws `E_SCOPE_DENIED` if target file matches NO pattern.
   - **Recovery**: Do not force edit. Update `specs/tasks.md` or `.kiro/specs/**/scope.md`.

## 5. AGENT WORKFLOW (SDD Cycle)

Agents **MUST** follow this cycle. Do not skip steps.

### Phase A: Interview (Role: `architect`, via `/profile`)
**Goal**: Collect requirements through structured interview.
1. **Interview**: Follow `profile.md` protocol. Ask one topic at a time, wait for response.
2. **Output**: Generate EARS-based profile document in Japanese.
3. **STOP**: Present document to user. **DO NOT** proceed to Phase B without explicit user approval.
   - **Forbidden in Phase A**: `sdd_scaffold_specs`, `sdd_sync_kiro`, file/directory creation, validation execution.

### Phase B: Specification (Role: `architect`, after user approval)
**Goal**: Define "What to build" with validated specs. `validate-gap` / `validate-design` / `lint_tasks` are **programmatically auto-chained** within each command.
1. **Steering**: `sdd_kiro steering` — Review/Update project direction. **REPORT** to user.
2. **Init**: `sdd_kiro init --feature <name>` — Create specs directory.
3. **Requirements + validate-gap (auto-chained)**:
   - `sdd_kiro requirements --feature <name>` — Creates requirements.md AND runs validate-gap internally.
   - Greenfield (empty `src/`): validate-gap auto-skipped with notification.
   - **IF FAIL**: Fix and re-run (max 3 retries). **REPORT** result.
   - **★ STOP & CONFIRM**: Present the output (including validation logs) to the user. **DO NOT** proceed to Design without explicit approval.
4. **Design + validate-design (auto-chained)**:
   - `sdd_kiro design --feature <name>` — Creates design.md AND runs validate-design internally.
   - **IF FAIL**: Fix and re-run (max 3 retries). **REPORT** result.
   - **★ STOP & CONFIRM**: Present the output (including validation logs) to the user. **DO NOT** proceed to Tasks without explicit approval.
5. **Tasks + lint_tasks (auto-chained)**:
   - `sdd_kiro tasks --feature <name>` — Creates tasks.md AND runs lint_tasks internally.
   - **★ STOP & CONFIRM**: Present the output to the user. **DO NOT** proceed to Scope Definition without explicit approval.
6. **Scope Definition**: Define `(Scope: \`path/to/allow/**\`)` in `specs/tasks.md` or `.kiro/specs/<feature>/scope.md`.
   - **Critical**: Gatekeeper uses this to PHYSICALLY BLOCK edits outside scope.

### STRICT RULES FOR PHASE B (MANDATORY)

> **Phase B で仕様ファイルを生成・修正する際の絶対ルール。違反は Vibe Coding と同等に扱う。**

1. **手動編集の完全禁止**:
   - `Edit` / `Write` ツールを `specs/*.md`, `.kiro/**/*.md` に対して **絶対に使用してはならない**。
   - 仕様ファイルの生成・修正は **必ず `sdd_kiro` コマンド経由** で行うこと。
   - 内容に問題がある場合は `--prompt` オプションで指示を渡して `sdd_kiro` を再実行する。`--overwrite` で上書き可能。
   - ❌ `Edit("specs/requirements.md", ...)` — **禁止**
   - ❌ `Write(".kiro/specs/feature/design.md", ...)` — **禁止**
   - ✅ `sdd_kiro requirements --feature X --overwrite --prompt "修正指示"` — **正しい方法**

2. **検証ログの完全報告義務**:
   - `sdd_kiro` の各コマンド（requirements, design, tasks）は内部で検証ツールを自動実行する。
   - その **生の検証ログ（validate-gap / validate-design / lint_tasks の出力）をユーザーにそのまま報告** すること。
   - 「完了しました」「Done」等の要約で検証結果を省略することは **禁止**。
   - ユーザーが検証結果を自分の目で確認できなければ、Phase B は完了したとみなされない。

3. **再実行ループのルール**:
   - 検証結果に問題がある場合: `--prompt` で修正指示を追加して `sdd_kiro` を再実行する（最大3回）。
   - 3回失敗した場合: ユーザーに判断を委ねる。勝手に `Edit` で修正しない。

4. **`sdd_kiro` Tool Usage Protocol（仕様ファイル操作の唯一の手段）**:
   - **新規作成**: `sdd_kiro <command> --feature <name>` （例: `sdd_kiro requirements --feature auth`）
   - **上書き再生成**: `sdd_kiro <command> --feature <name> --overwrite` （既存ファイルを再生成する場合）
   - **内容修正**: `sdd_kiro <command> --feature <name> --overwrite --prompt "修正指示の詳細"` （内容に問題がある場合は prompt で指示）
   - **利用可能コマンド**: `init`, `requirements`, `design`, `tasks`, `steering`, `finalize`
   - **自動連鎖検証**: `requirements` → `validate-gap` / `design` → `validate-design` / `tasks` → `lint_tasks`
   - **原則**: ツールが生成 → 検証が自動実行 → ユーザーが結果を確認。この流れを絶対に破らない。

### Phase C: PR Creation (Role: `architect`)
**Goal**: Create PR with spec documents for review.
1. **Branch**: Create `feature/<name>` branch.
2. **Commit**: Stage and commit spec files (Japanese commit message).
3. **PR**: `gh pr create` and report URL to user.
4. Session ends. Review handling is out of scope for this session.

### Phase D: Finalize (Role: `architect`, user-initiated)
**Goal**: Prepare for implementation after PR approval.
1. **User runs**: `sdd_kiro finalize --feature <name>` (manual trigger after PR approval).
2. **Consistency check**: Validates 3-document consistency (requirements, design, tasks).
3. **Translation prep**: Renames Japanese specs to `*_ja.md`, prompts for English translation.

### Phase E: Implementer (Role: `implementer`)
**Goal**: Build "How it works" within Scope.
**Strict Rule: 1 Task = 1 PR.** Do NOT execute multiple tasks in a row.

1. **Start**: `sdd_start_task <TaskId>`. Activates the Scope.
2. **Implement**: Edit ONLY files in `allowedScopes`.
   - **Error**: `E_SCOPE_DENIED` means you touched a file outside scope.
   - **Fix**: Ask Architect to update the scope -> `sdd_end_task` -> `sdd_start_task`.
3. **Verify**: Run `sdd_validate_gap` frequently.
4. **Completion**:
   - Run `sdd_kiro validate-impl` (or `sdd_validate_gap`) **BEFORE** `sdd_end_task`.
   - **STOP** after one task is complete. Create a PR/Commit.
   - **DO NOT** start the next task until the current one is merged or approved.

### Phase F: Reviewer (Role: `validate`)
**Goal**: Verify "Does it match specs?".
1. **Validate**: `sdd_validate_gap --deep` (if enabled).
2. **Test**: Ensure `bun test:seq` passes.
3. **Close**: `sdd_end_task` only after success. **Once closed, validation context is lost.**

## 6. CODING STANDARDS

### Error Handling
- Use `throw new Error` for business logic failures.
- Prefix with `E_CODE`.
- Fail Fast: Check preconditions at the start of functions.

### Imports
- **Internal**: Relative paths (e.g., `../lib/state-utils.js`).
- **External**: Standard imports.
- **Node Builtins**: `import fs from 'fs'` (preferred over `import * as fs`).

### Testing
- **Mirror Structure**: `__tests__/tools/foo.test.ts` tests `.opencode/tools/foo.ts`.
- **Mocking**: ALWAYS mock `fs` and `state-utils` when testing State operations.
- **Cleanup**: Use `afterEach` to clean up `.opencode/state` artifacts.

## 7. ANTI-PATTERNS (Forbidden)

- ❌ **English Commits**: "Update README" -> "docs: READMEを更新"
- ❌ **Direct State Edit**: Modifying `.opencode/state/*.json` manually.
- ❌ **Zombie Locks**: If `ELOCKED` persists >1min, use `sdd_force_unlock`.
- ❌ **Scope Bypass**: Trying to edit file outside scope without updating `tasks.md`.
- ❌ **Vibe Coding**: Writing code without a corresponding Task or Spec.
- ❌ **Missing .gitignore**: Always include a task to create or update `.gitignore` during project setup.

## 8. AGENT OPERATIONAL PROTOCOL

1. **Check Context First**: Run `sdd_show_context` to see active task/scope.
2. **Respect Locks**: If `ELOCKED`, wait 5s and retry. Do not force unlock immediately.
3. **Validation**: Before `sdd_end_task`, run `sdd_validate_gap` to ensure clean state.
4. **Communication**: Report progress in **Japanese**.
5. **Interaction**: Check if `question` tool is available. If YES, use it. If NO, use text input.

## 9. CI/CD & RELEASE
- **Trigger**: Push to `master`.
- **Versioning**: Automatic patch increment. **DO NOT** manually bump version.
- **CI Check**: `scripts/sdd_ci_validate.ts` enforces Scope rules.
