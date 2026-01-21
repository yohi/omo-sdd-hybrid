import { describe, test, expect, beforeEach, afterEach, beforeAll } from 'bun:test';
import { writeState, clearState } from '../../.opencode/lib/state-utils';
import { simulateEdit, simulateBash, simulateMultiEdit } from '../helpers/test-harness';
import fs from 'fs';

describe('Acceptance Criteria A-I', () => {
  beforeAll(() => {
    if (!fs.existsSync('.opencode/state')) {
      fs.mkdirSync('.opencode/state', { recursive: true });
    }
  });
  
  beforeEach(() => {
    clearState();
  });
  
  afterEach(() => {
    clearState();
  });
  
  test('Scenario A: state なし + src/a.ts 編集 → WARN NO_ACTIVE_TASK', () => {
    const result = simulateEdit('src/a.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('NO_ACTIVE_TASK');
  });
  
  test('Scenario B: Task-1 (src/auth/**) + src/auth/x.ts 編集 → allow', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });
    
    const result = simulateEdit('src/auth/x.ts');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
  });
  
  test('Scenario C: Task-1 (src/auth/**) + src/pay/y.ts 編集 → WARN SCOPE_DENIED', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/auth/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });
    
    const result = simulateEdit('src/pay/y.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('SCOPE_DENIED');
  });
  
  test('Scenario D: specs/tasks.md 編集 → allow (Rule 0)', () => {
    const result = simulateEdit('specs/tasks.md');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
    expect(result.rule).toBe('Rule0');
  });
  
  test('Scenario E: ../secrets.txt 編集 → WARN OUTSIDE_WORKTREE', () => {
    const result = simulateEdit('../secrets.txt');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('OUTSIDE_WORKTREE');
  });
  
  test('Scenario F: bash rm -rf → WARN', () => {
    const result = simulateBash('rm -rf /tmp/test');
    expect(result.warned).toBe(true);
    expect(result.rule).toBe('Rule4');
  });
  
  test('Scenario G: multiedit with mixed scope → partial WARN', async () => {
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
    
    const result = simulateMultiEdit(files);
    expect(result.warned).toBe(true);
    expect(result.message).toContain('1/2');
  });
  
  test('Scenario H: state corrupted + src/a.ts → WARN STATE_CORRUPTED', () => {
    fs.writeFileSync('.opencode/state/current_context.json', '{ invalid json');
    
    const result = simulateEdit('src/a.ts');
    expect(result.warned).toBe(true);
    expect(result.message).toContain('STATE_CORRUPTED');
  });
  
  test('Scenario I: state corrupted + specs/tasks.md → allow (Rule 0)', () => {
    fs.writeFileSync('.opencode/state/current_context.json', '{ invalid json');
    
    const result = simulateEdit('specs/tasks.md');
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(false);
    expect(result.rule).toBe('Rule0');
  });
});
