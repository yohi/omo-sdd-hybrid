import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeState, clearState, getStatePath } from '../../.opencode/lib/state-utils';
import { simulateEdit, simulateBash, simulateMultiEdit, ensureNoBackups, deleteAllBackups, setupTestState, cleanupTestState } from '../helpers/test-harness';
import fs from 'fs';

describe('Acceptance Criteria A-I', () => {
  beforeEach(async () => {
    setupTestState();
    await clearState();
  });
  
  afterEach(async () => {
    await clearState();
    cleanupTestState();
  });
  
  test('Scenario A: state なし + src/a.ts 編集 → WARN NO_ACTIVE_TASK', async () => {
    await ensureNoBackups();
    const result = await simulateEdit('src/a.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('NO_ACTIVE_TASK');
  });
  
  test('Scenario B: Task-1 (src/auth/**) + src/auth/x.ts 編集 → allow', async () => {
    await ensureNoBackups();
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });
    
    const result = await simulateEdit('src/auth/x.ts');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
  });
  
  test('Scenario C: Task-1 (src/auth/**) + src/pay/y.ts 編集 → WARN SCOPE_DENIED', async () => {
    await ensureNoBackups();
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });
    
    const result = await simulateEdit('src/pay/y.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('SCOPE_DENIED');
  });
  
  test('Scenario D: specs/tasks.md 編集 → allow (Rule 0)', async () => {
    await ensureNoBackups();
    const result = await simulateEdit('specs/tasks.md');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
    expect(result.rule).toBe('Rule0');
  });
  
  test('Scenario E: ../secrets.txt 編集 → WARN OUTSIDE_WORKTREE', async () => {
    await ensureNoBackups();
    const result = await simulateEdit('../secrets.txt');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('OUTSIDE_WORKTREE');
  });
  
  test('Scenario F: bash rm -rf → WARN', async () => {
    await ensureNoBackups();
    const result = await simulateBash('rm -rf /tmp/test');
    expect(result.warned).toBe(true);
    expect(result.rule).toBe('Rule4');
  });
  
  test('Scenario G: multiedit with mixed scope → partial WARN', async () => {
    await ensureNoBackups();
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });
    
    const files = [
      { filePath: 'src/auth/login.ts' },
      { filePath: 'src/pay/checkout.ts' }
    ];
    
    const result = await simulateMultiEdit(files);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('1/2');
  });
  
  test('Scenario H: state corrupted (no backup) + src/a.ts → WARN STATE_CORRUPTED', async () => {
    await ensureNoBackups();
    fs.writeFileSync(getStatePath(), '{ invalid json');
    await deleteAllBackups();
    
    const result = await simulateEdit('src/a.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('STATE_CORRUPTED');
  });
  
  test('Scenario I: state corrupted (no backup) + specs/tasks.md → allow (Rule 0)', async () => {
    await ensureNoBackups();
    fs.writeFileSync(getStatePath(), '{ invalid json');
    await deleteAllBackups();
    
    const result = await simulateEdit('specs/tasks.md');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
    expect(result.rule).toBe('Rule0');
  });
});

describe('Phase 1 Block Mode Acceptance', () => {
  beforeEach(async () => {
    setupTestState();
    await clearState();
  });
  
  afterEach(async () => {
    await clearState();
    cleanupTestState();
  });

  test("Scenario A': block + state なし + src/a.ts 編集 → BLOCK NO_ACTIVE_TASK", async () => {
    await ensureNoBackups();
    const result = await simulateEdit('src/a.ts', undefined, 'block');
    expect(result.allowed).toBe(false);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('NO_ACTIVE_TASK');
    expect(result.rule).toBe('Rule1');
  });

  test("Scenario C': block + Task-1 (src/auth/**) + src/pay/y.ts 編集 → BLOCK SCOPE_DENIED", async () => {
    await ensureNoBackups();
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });
    
    const result = await simulateEdit('src/pay/y.ts', undefined, 'block');
    expect(result.allowed).toBe(false);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('SCOPE_DENIED');
    expect(result.rule).toBe('Rule2');
  });

  test("Scenario E': block + ../secrets.txt 編集 → BLOCK OUTSIDE_WORKTREE", async () => {
    await ensureNoBackups();
    const result = await simulateEdit('../secrets.txt', undefined, 'block');
    expect(result.allowed).toBe(false);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('OUTSIDE_WORKTREE');
    expect(result.rule).toBe('Rule3');
  });

  test("Scenario F': block + bash rm -rf → BLOCK", async () => {
    await ensureNoBackups();
    const result = await simulateBash('rm -rf /tmp/test', undefined, 'block');
    expect(result.allowed).toBe(false);
    expect(result.warned).toBe(true);
    expect(result.rule).toBe('Rule4');
  });

  test("Scenario H': block + state corrupted (no backup) + src/a.ts → BLOCK STATE_CORRUPTED", async () => {
    await ensureNoBackups();
    fs.writeFileSync(getStatePath(), '{ invalid json');
    await deleteAllBackups();
    
    const result = await simulateEdit('src/a.ts', undefined, 'block');
    expect(result.allowed).toBe(false);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('STATE_CORRUPTED');
    expect(result.rule).toBe('StateCorrupted');
  });

  test("Block mode still allows Rule 0 (specs/tasks.md)", async () => {
    await ensureNoBackups();
    const result = await simulateEdit('specs/tasks.md', undefined, 'block');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
    expect(result.rule).toBe('Rule0');
  });

  test("Block mode still allows valid scope access", async () => {
    await ensureNoBackups();
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });
    
    const result = await simulateEdit('src/auth/login.ts', undefined, 'block');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
  });
});
