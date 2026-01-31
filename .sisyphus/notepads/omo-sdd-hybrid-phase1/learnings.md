# Phase 1 Implementation Learnings

## 2026-01-21: Phase 1 Complete

### Conventions Discovered
- Test files follow pattern: `__tests__/{module}/{name}.test.ts`
- Block mode tests in separate file: `*.block.test.ts`
- Strict mode tests in separate file: `*.strict.test.ts`
- Enhanced tests in separate file: `*.enhanced.test.ts`
- Environment variables for mode switching: `SDD_GUARD_MODE`, `SDD_SCOPE_FORMAT`

### Successful Approaches
- TDD RED→GREEN approach worked well
- Adding mode parameter with default value preserves backward compatibility
- Using `allowedOnViolation = mode === 'warn'` pattern for clean conditional
- Separate test files for new modes avoid modifying existing tests
- `SDD_SKIP_TEST_EXECUTION=true` env var to prevent infinite test loops

### Technical Patterns
```typescript
// Mode type pattern
export type GuardMode = 'warn' | 'block';

export function getGuardMode(): GuardMode {
  const mode = process.env.SDD_GUARD_MODE;
  return mode === 'block' ? 'block' : 'warn';
}

// Violation handling pattern
const allowedOnViolation = mode === 'warn';
return { allowed: allowedOnViolation, warned: true, message: '...', rule: '...' };
```

### Files Created
- `__tests__/plugins/sdd-gatekeeper.block.test.ts` - 13 tests
- `__tests__/lib/tasks-parser.strict.test.ts` - 13 tests
- `__tests__/tools/sdd_validate_gap.enhanced.test.ts` - 5 tests
- `.opencode/skills/sdd-orchestrator/SKILL.md` - Orchestrator skill

### Files Modified
- `.opencode/plugins/sdd-gatekeeper.ts` - Added GuardMode, getGuardMode(), mode parameter
- `.opencode/lib/tasks-parser.ts` - Added ScopeFormat, getScopeFormat(), ScopeFormatError
- `.opencode/tools/sdd_start_task.ts` - Added ScopeFormatError handling
- `.opencode/tools/sdd_validate_gap.ts` - Full rewrite with scope/test/diagnostics
- `__tests__/helpers/test-harness.ts` - Added mode parameter
- `__tests__/e2e/acceptance.test.ts` - Added 7 block mode tests
- `__tests__/tools/sdd_validate_gap.test.ts` - Updated for new implementation

### Commits (6 total)
1. `8ace3b3` feat(gatekeeper): add block mode for Phase 1
2. `644925e` feat(parser): add strict scope format for Phase 1
3. `412c59e` feat(start_task): integrate strict scope validation
4. `a496c1b` feat(validate_gap): add scope verification, diagnostics, and test execution
5. `bfc5558` feat(skills): add sdd-orchestrator for autonomous validation loop
6. `008db61` test(e2e): add Phase 1 block mode acceptance tests

### Test Results
- 111 tests passing
- 238 expect() calls
- 13 test files

## [SDD-CONTEXT-INJECTOR]
- `experimental.chat.system.transform` hook allows dynamic injection of system prompt context.
- Useful for providing "always-on" context like active task ID and guard mode to the AI agent.
- Must handle state read errors gracefully to avoid crashing the chat interface.

## Test Concurrency Issues
- **Observation**: `__tests__/lib/state-utils.test.ts` fails with "Disk error" when run in parallel (default `bun test`).
- **Cause**: Shared temporary directory usage or race conditions on file system resources during parallel execution.
- **Solution**: Use `bun test:seq` (defined in package.json) to run tests sequentially. This eliminates the race conditions and ensures reliable test execution.
