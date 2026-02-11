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
- **Error Messages**: **JAPANESE** with Error Codes.
  - ✅ `throw new Error("E_TASK_NOT_FOUND: タスクが見つかりません")`
  - ❌ `throw new Error("Task not found")`

## 3. ENVIRONMENT & COMMANDS

Use **Bun** for all operations.

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

### Phase 1: Architect (Role: `architect`)
**Goal**: Define "What to build" and "Where to allow edits".
1. **Design**: Create/Update `.kiro/specs/*.md` (Requirements/Design).
2. **Task Definition**: Update `specs/tasks.md` or `.kiro/specs/<feature>/tasks.md`.
3. **Scope Definition**: Define `(Scope: \`path/to/allow/**\`)` in `specs/tasks.md` or `.kiro/specs/<feature>/scope.md`.
   - **Critical**: Gatekeeper uses this to PHYSICALLY BLOCK edits outside scope.

### Phase 2: Implementer (Role: `implementer`)
**Goal**: Build "How it works" within Scope.
1. **Start**: `sdd_start_task <TaskId>`. Activates the Scope.
2. **Implement**: Edit ONLY files in `allowedScopes`.
   - **Error**: `E_SCOPE_DENIED` means you touched a file outside scope.
   - **Fix**: Ask Architect to update the scope -> `sdd_end_task` -> `sdd_start_task`.
3. **Verify**: Run `sdd_validate_gap` frequently.

### Phase 3: Reviewer (Role: `validate`)
**Goal**: Verify "Does it match specs?".
1. **Validate**: `sdd_validate_gap --deep` (if enabled).
2. **Test**: Ensure `bun test:seq` passes.
3. **Close**: `sdd_end_task` only after success.

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

## 9. CI/CD & RELEASE
- **Trigger**: Push to `master`.
- **Versioning**: Automatic patch increment. **DO NOT** manually bump version.
- **CI Check**: `scripts/sdd_ci_validate.ts` enforces Scope rules.
