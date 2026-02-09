# AGENTS.md - OmO-SDD-Hybrid Developer Guide

**Context:** OmO-SDD-Hybrid (OpenCode Plugin)
**Stack:** TypeScript, Bun, OpenCode API
**Language:** Code=English, Comments/Docs/Commits=**JAPANESE** (Strict)

## 1. ENVIRONMENT & COMMANDS

This project uses **Bun**. Please use `bun` commands instead of `npm` or `yarn`.

- **Test**:
  - `bun test`: Run all tests.
  - `bun test:seq`: **Recommended**. Runs tests sequentially to prevent state/lock races.
  - `bun test <path>`: Run specific test file.
- **Build**: `bun run build` (Outputs to `dist/`).
- **Lint**: No explicit command. Follow existing Prettier style.

## 2. CODE STYLE & CONVENTIONS

- **Language Rules**:
  - **Code (Variables, Functions, Classes)**: English, `camelCase`.
  - **Comments / Documentation**: **JAPANESE** (Required for user readability).
  - **Commit Messages**: **JAPANESE** (e.g., `feat: 認証機能を追加`).
  - **Error Messages**: **JAPANESE** with Error Codes.
    - Good: `throw new Error("E_TASK_NOT_FOUND: タスクが見つかりません")`

- **Implementation Rules**:
  - **Imports**: Use relative paths for internal modules (e.g., `../lib/state-utils`).
  - **State Management**: **NEVER** write to `.opencode/state/*.json` directly. Use `lib/state-utils` (`writeState`, `lockStateDir`) for atomic operations.
  - **Tool Implementation**: Located in `.opencode/tools/`. Must be **Stateless** and **Idempotent**. No binary dependencies.

## 3. ARCHITECTURE (Hybrid Structure)

- **`.opencode/plugins`**: Event hooks (e.g., `sdd-gatekeeper.ts` checks file access).
- **`.opencode/tools`**: CLI commands loaded dynamically.
- **`.opencode/lib`**: Shared logic and State Manager.
- **`.opencode/state`**: Runtime state (Gitignored).
- **`src/`**: User land (Subject to Scope restrictions).

## 4. AGENT WORKFLOW (SDD Cycle)

Agents MUST follow this cycle. Do not skip steps.

### Phase 1: Architect (Role: `architect`)
**Goal**: Define "What to build" and "Where to allow edits".
1. **Design**: Create/Update `.kiro/specs/*.md` (Requirements/Design).
2. **Task Definition**: Update `specs/tasks.md`.
3. **Scope Definition**: Define `(Scope: \`path/to/allow/**\`)` in `tasks.md`.
   - **Critical**: Gatekeeper uses this to PHYSICALLY BLOCK edits outside scope.

### Phase 2: Implementer (Role: `implementer`)
**Goal**: Build "How it works" within Scope.
1. **Start**: `sdd_start_task <TaskId>`. Activates the Scope.
2. **Implement**: Edit ONLY files in `allowedScopes`.
   - **Error**: `E_SCOPE_DENIED` means you touched a file outside scope.
   - **Fix**: Ask Architect to update `specs/tasks.md` -> `sdd_end_task` -> `sdd_start_task`.
3. **Verify**: Run `sdd_validate_gap` frequently.

### Phase 3: Reviewer (Role: `validate`)
**Goal**: Verify "Does it match specs?".
1. **Validate**: `sdd_validate_gap --deep` (if enabled).
2. **Test**: Ensure `bun test` passes.
3. **Close**: `sdd_end_task` only after success.

## 5. TESTING GUIDELINES
- **Mirror Structure**: `__tests__/tools/foo.test.ts` tests `.opencode/tools/foo.ts`.
- **Mocking**: Mock `fs` and `state-utils` to avoid side effects.
- **Cleanup**: Tests MUST clean up generated `.opencode/state` artifacts (use `afterEach`).

## 6. ANTI-PATTERNS (Forbidden)
- ❌ **English Comments/Commits**: Always use Japanese.
- ❌ **Direct State Edit**: Modifying JSON in `.opencode/state` manually.
- ❌ **Zombie Locks**: If `ELOCKED` occurs, use `sdd_force_unlock`.
- ❌ **Reverse Dependency**: Core plugins depending on `src/` code.

## 7. ARCHITECTURE DEEP DIVE

### State Schema (`.opencode/state/current_context.json`)
Single source of truth.
- `activeTaskId`: Current Task ID.
- `allowedScopes`: Array of Glob patterns (picomatch).
- `role`: 'architect' or 'implementer'.
- `stateHash`: HMAC-SHA256 signature for tampering detection.

### Gatekeeper Logic
Intercepts `tool.execute.before`.
1. Loads State.
2. Checks if target file matches `allowedScopes`.
3. Throws `E_SCOPE_DENIED` if not matched.

## 8. TROUBLESHOOTING

### "ELOCKED" Error
- **Cause**: Previous process crashed leaving `.opencode/state/.lock`.
- **Resolution**: Run `sdd_force_unlock` (or `sdd_force_unlock --force true`).

### "Scope Denied" Error
- **Cause**: Editing file outside `allowedScopes`.
- **Resolution**:
  1. Check `sdd_show_context`.
  2. Update `specs/tasks.md` Scope.
  3. Restart task (`sdd_end_task` -> `sdd_start_task`).

## 9. CI/CD & RELEASE
- **Trigger**: Push to `master`.
- **Versioning**: Automatic patch increment. **DO NOT** manually bump version.
- **CI Check**: `scripts/sdd_ci_validate.ts` enforces Scope rules.
