# PROJECT KNOWLEDGE BASE

**Context:** OmO-SDD-Hybrid (OpenCode Plugin)
**Stack:** TypeScript, Bun, OpenCode API
**Language:** Code=English, Comments/Docs=Japanese

## 1. OVERVIEW & STRUCTURE
A plugin that physically prevents "Vibe Coding" (deviating from specifications) in the OpenCode environment.
It adopts a "Hybrid" configuration where the source code is hidden within `.opencode/`.

### Directory Structure
```text
omo-sdd-hybrid/
├── .opencode/           # [CORE] Plugin implementation (Hidden Source)
│   ├── plugins/         # Event Hooks (Gatekeeper, etc.)
│   ├── tools/           # CLI Tools (sdd_start_task, etc.)
│   ├── lib/             # Shared Logic & State Manager
│   └── state/           # Runtime State (Gitignored)
├── src/                 # [USER] SDD-managed code area
├── specs/               # [USER] Task and specification definitions (Source of Truth)
├── __tests__/           # [DEV] Tests (Mirrors the .opencode structure)
└── package.json         # For development (Bun, Test, DevDeps)
```

## 2. COMMANDS (Build & Test)

This project uses **Bun**. Please use `bun` commands instead of `npm` or `yarn`.

### Test Execution
```bash
# Run all tests
bun test

# Run tests for a specific file
bun test __tests__/tools/sdd_start_task.test.ts

# Sequential test execution (Recommended)
# Since tests may depend on file locks or singleton states
bun test:seq
```

### Lint / Format
There is no explicit Lint command, but please follow the existing code style (Prettier-compliant).

## 3. CODE STYLE GUIDELINES

### Language & naming
- **Code**: TypeScript (Strict mode)
- **Comments/Docs**: **ALL JAPANESE** (Required).
  - **Reason**: To maximize readability for the development team and users (assumed to be in Japan).
  - **Exception 1**: Variable and function names must be in English (camelCase).
  - **Exception 2**: `AGENTS.md` (this file) and system prompts for LLMs must be in **English** (to optimize LLM understanding accuracy and context efficiency).
- **File Names**: kebab-case (e.g., `state-utils.ts`, `sdd-gatekeeper.ts`).

### Imports
- **Relative Paths**: Import internal modules using relative paths (e.g., `../lib/state-utils`).
- **Extensions**: Omit `.ts` extensions, but `.js` may be used for ESM compatibility (follow existing code).
- **Grouping**: Standard libraries (`fs`, `path`) -> External libraries -> Internal modules.

### Error Handling
- **Fail Fast**: Throw exceptions immediately for invalid states or arguments.
- **Messages**: Error messages must be written in **Japanese**. Include clear reasons as they are displayed to the user.
  - Bad: `throw new Error("Error")`
  - Good: `throw new Error("E_TASK_NOT_FOUND: 指定されたタスクIDが見つかりません")`
- **Prefix**: Recommended to use error code-like prefixes (e.g., `E_XXX:`).

### State Management (Critical)
- **Stateless Logic**: Keep tools and plugins stateless.
- **Persistence**: State is saved in `.opencode/state/*.json`.
- **Atomic Writes**: State saving must always follow the "Write to temporary file -> Rename" sequence (automatically handled if `writeState` function is used).
- **Locking**: Use `lockStateDir` for exclusive control to prevent race conditions.

## 4. IMPLEMENTATION RULES

### Tool Implementation (`.opencode/tools/`)
- **Dynamic Load**: Tools are loaded dynamically at startup; therefore, side effects at the top level (immediate execution code) are prohibited.
- **No Binaries**: Do not include binary dependencies. Complete implementation using pure TypeScript/JavaScript.
- **Idempotency**: Maintain idempotency as much as possible.

### Plugin Implementation (`.opencode/plugins/`)
- **Performance**: Keep processing lightweight as it hooks into every tool execution.
- **Fail Closed**: Security-related checks (Gatekeeper) must "Deny (Exception)" if they fail, rather than "Allow."

### SDD Cycle Integration
1. **Scope Check**: Always verify `activeTask` and `allowedScopes` before performing file operations.
2. **Kiro Support**: File structures under `specs/` should consider compatibility with Kiro (cc-sdd).

## 5. TESTING GUIDELINES
- **Mirror Testing**: Place test files in `__tests__` using the same directory structure as the source code.
  - `.opencode/tools/foo.ts` -> `__tests__/tools/foo.test.ts`
- **Mocking**: Mock file system operations (`fs`) and state management (`state-utils`) as needed, but integration tests may generate actual files.
- **Cleanup**: Always clean up temporary files (e.g., `.opencode/state`) generated during tests.

## 6. ANTI-PATTERNS
- **[FORBIDDEN]** Implementing core plugin functionality within code logic under `src/` (Reverse dependency).
- **[FORBIDDEN]** Leaving `console.log` in the library layer (`lib/`). Use the `logger` module or leave it to the caller (tool layer).
- **[FORBIDDEN]** English commit messages. Always write them in Japanese.
- **[FORBIDDEN]** Overuse of `as any`. Maintain strict type safety.

## 7. AI AGENT BEHAVIOR
- **Response Language**: Responses to users must be in **Japanese**.
- **Thinking**: Thinking processes can be in English, but the final output must be in Japanese.
- **Proactive Fix**: If style violations in existing code (e.g., English comments) are found, convert them to Japanese during modification.
- **Check AGENTS.md**: If specialized `AGENTS.md` files exist in subdirectories (e.g., `.opencode/tools`), refer to their specific rules as well.

## 8. ARCHITECTURE DEEP DIVE

### State Schema (`.opencode/state/current_context.json`)
This state file is the single source of truth for the current session.
- `activeTaskId`: The ID of the task currently in progress.
- `allowedScopes`: An array of Glob patterns for which write access is permitted.
- `role`: 'architect' or 'implementer'. Controls the permission level.
- `stateHash`: HMAC-SHA256 signature for manual tampering detection.

### Gatekeeper Logic (`sdd-gatekeeper.ts`)
The Gatekeeper intercepts tool executions (`tool.execute.before`) and controls access with the following logic:
1.  **Read State**: Loads the current context and guard mode settings.
2.  **Check Tool**: Targets only modification tools such as `write`, `edit`, and `multiedit`.
3.  **Validate Path**: Verifies if the target file path matches the `allowedScopes` (using picomatch).
4.  **Enforce**: If there is no match, it blocks execution by throwing an `E_SCOPE_DENIED` exception.

### Glob Patterns
Uses the `picomatch` library.
- `**`: Matches zero or more directories.
- `src/**`: Allows all files under `src`.
- `specs/tasks.md`: Allows only a specific file.

## 9. TROUBLESHOOTING FOR AGENTS

### "ELOCKED" Error
- **Situation**: A `Failed to acquire lock` error occurs during test or tool execution.
- **Cause**: A previous process crashed, leaving a residual lock file (`.opencode/state/.lock`).
- **Resolution**:
  1.  Run `sdd_force_unlock` to release the lock.
  2.  Check for missing cleanup in `afterEach` within the test code.

### "Scope Denied" Error
- **Situation**: Blocked by the Gatekeeper during code editing.
- **Resolution**:
  1.  Check the current scope with `sdd_show_context`.
  2.  If necessary, correct the Scope definition in `specs/tasks.md`.
  3.  To reflect changes, run `sdd_end_task` once, then run `sdd_start_task` again.
