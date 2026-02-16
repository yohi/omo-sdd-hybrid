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

### Build & Test Commands

| Command | Description |
|---------|-------------|
| `bun run build` | Builds the project to `dist/`. |
| `bun test` | Runs all tests in parallel (fast, but risky for state). |
| `bun test:seq` | **RECOMMENDED**. Runs tests sequentially to prevent State/Lock race conditions. |
| `bun test <path>` | Runs a single test file (e.g., `bun test __tests__/tools/foo.test.ts`). |
| `bun run lint:md` | Lints Markdown files using `markdownlint-cli2`. |
| `bun run ci:validate` | Runs CI validation script (Scope & Changeset check). |
| `bun run verify:flow` | Runs integration tests for SDD flow. |

### Global Environment Safety Rules (CRITICAL)

**STRICTLY FORBIDDEN**: Running build/install commands (`bun install`, `npm install`, `make`, etc.) directly on the host machine.

1. **Container Check**: Before running any build or dependency installation command, you **MUST** verify if you are inside a container using `systemd-detect-virt --container` or checking `/run/systemd/container`.
2. **Action if on Host**: STOP IMMEDIATELY. Throw `E_HOST_COMMAND_BLOCKED`. Instruct user to execute inside the container.

## 4. CODING STANDARDS

### Naming Conventions
- **Files**:
  - Tools (`.opencode/tools/`): `snake_case.ts` (must match CLI command).
  - Source (`src/`, `lib/`): `kebab-case.ts` (e.g., `string-helpers.ts`).
  - Classes/Interfaces: `PascalCase` (e.g., `TaskManager`).
  - Variables/Functions: `camelCase` (e.g., `updateState`).
  - Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_TIMEOUT`).
- **Types**:
  - `strict: true` (tsconfig). **NO `any`**.
  - Use `zod` for runtime validation (e.g., API inputs, file parsing).
  - Prefer `type` over `interface` for simple structures.
  - Use `import type` for type-only imports to avoid runtime overhead.

### Formatting & Style
- **Async/Await**: Prefer `async/await` over `.then()` chains.
- **Imports**:
  - Internal: Relative paths (e.g., `../lib/state-utils.js`).
  - External: Standard imports.
  - Node Builtins: `import fs from 'fs'` (preferred over `import * as fs`).
- **Error Handling**:
  - Use `throw new Error` for business logic failures.
  - Prefix with `E_CODE` (e.g., `E_SCOPE_DENIED`).
  - Fail Fast: Check preconditions at the start of functions.

### Testing Guidelines
- **Structure**: `__tests__/tools/foo.test.ts` mirrors `.opencode/tools/foo.ts`.
- **Mocking**: ALWAYS mock `fs` and `state-utils` when testing State operations to avoid polluting the environment.
- **Cleanup**: Use `afterEach` to clean up `.opencode/state` artifacts.
- **Single Test**: Use `bun test <path>` to verify fixes quickly.

## 5. ARCHITECTURE & STATE MANAGEMENT

### State Isolation
- **Single Source of Truth**: `.opencode/state/current_context.json`
- **Strict Rule**: **NEVER** write to `.opencode/state/*.json` directly.
- **Correct Access**: Use `readState`, `writeState`, `lockStateDir` from `../lib/state-utils.js`.

### Gatekeeper Mechanism (Safety)
1. Intercepts `tool.execute.before`.
2. Checks `allowedScopes` (Glob patterns) in State.
3. Throws `E_SCOPE_DENIED` if target file matches NO pattern.
   - **Recovery**: Do not force edit. Report to user and suggest `sdd_kiro tasks` update.

### Gatekeeper Error Handling (NO SELF-RECOVERY)
Gatekeeper errors (`NO_ACTIVE_TASK`, `E_SCOPE_DENIED`, `OUTSIDE_WORKTREE`, `STATE_CORRUPTED`) are **safety mechanisms**. Do NOT attempt to auto-recover or bypass them. Report the error and wait for user instruction.

## 6. AGENT WORKFLOW (SDD Cycle)

Agents **MUST** follow this cycle. Do not skip steps.

### Phase A: Interview (Role: `architect`, via `/profile`)
1. **Interview**: Collect requirements (EARS).
2. **Output**: Generate profile document (Japanese).
3. **STOP**: Present to user. Wait for approval.
   - **Forbidden in Phase A**: `sdd_scaffold_specs`, `sdd_sync_kiro`, `sdd_kiro init`, `sdd_start_task`, file/directory creation, validation execution.

### Phase B: Specification (Role: `architect`, via `sdd_kiro`)
**Goal**: Define "What to build" with validated specs.
1. **Steering**: `sdd_kiro steering` (Review direction).
2. **Init**: `sdd_kiro init --feature <name>`.
3. **Requirements**: `sdd_kiro requirements --feature <name>` (Auto-validates gap).
4. **Design**: `sdd_kiro design --feature <name>` (Auto-validates design).
5. **Tasks**: `sdd_kiro tasks --feature <name>` (Auto-lints tasks).
6. **Scope**: Define `(Scope: \`path/**\`)` in `specs/tasks.md`.

**STRICT RULES**:
- **NO Manual Edits**: Use `sdd_kiro` for ALL spec changes.
- **Report Validation Logs**: Always show `validate-gap/design/lint` output to user.
- **Re-run on Fail**: Use `--prompt` to fix issues. Max 3 retries.

### Phase C: PR Creation (Role: `architect`)
1. Branch: `feature/<name>`.
2. Commit: Stage specs (Japanese message).
3. PR: `gh pr create`.

### Phase D: Finalize (Role: `architect`)
1. User runs `sdd_kiro finalize` after PR approval.
2. Verify consistency.
3. Rename specs to `*_ja.md` and prep for translation.

### Phase E: Implementer (Role: `implementer`, via `/impl`)
**Goal**: Build within Scope. **1 Task = 1 PR.**
1. **Start**: `sdd_start_task <TaskId>`.
2. **Implement**: Edit ONLY files in `allowedScopes`.
3. **Verify**: Run `sdd_validate_gap` frequently.
4. **Complete**: Run `sdd_kiro validate-impl` BEFORE `sdd_end_task`.

### Phase F: Reviewer (Role: `validate`)
1. **Validate**: `sdd_validate_gap --deep`.
2. **Test**: Ensure `bun test:seq` passes.
3. **Close**: `sdd_end_task` only after success.

## 7. ANTI-PATTERNS (Forbidden)
- ❌ **Manual SDD**: Creating specs without Kiro Integration.
- ❌ **English Commits**: "Update README" -> "docs: READMEを更新"
- ❌ **Direct State Edit**: Modifying `.opencode/state/*.json` manually.
- ❌ **Zombie Locks**: If `ELOCKED` persists >1min, use `sdd_force_unlock`.
- ❌ **Scope Bypass**: Editing outside scope without updating `tasks.md`.
- ❌ **Vibe Coding**: Coding without Task/Spec.
- ❌ **Jailbreak**: Auto-creating tasks after `NO_ACTIVE_TASK` error without user approval.

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
