import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { writeState } from '../../.opencode/lib/state-utils';
import fs from 'fs';
import path from 'path';

describe('sdd_request_spec_change', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('creates change request file for implementer', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'implementer'
    });

    const sddRequestSpecChange = await import('../../.opencode/tools/sdd_request_spec_change');
    const result = await sddRequestSpecChange.default.execute({
      reason: 'Need refactoring',
      proposal: 'Split module X'
    }, {} as any);

    expect(result).toContain('仕様変更リクエストを作成しました');
    expect(result).toContain('Task-1');
    expect(result).toContain('Need refactoring');

    const pendingChangesDir = path.join(process.env.SDD_KIRO_DIR!, 'pending-changes');
    expect(fs.existsSync(pendingChangesDir)).toBe(true);

    const files = fs.readdirSync(pendingChangesDir);
    expect(files.length).toBe(1);
    
    const content = fs.readFileSync(path.join(pendingChangesDir, files[0]), 'utf-8');
    expect(content).toContain('Task ID**: Task-1');
    expect(content).toContain('## Reason\nNeed refactoring');
    expect(content).toContain('## Proposal\nSplit module X');
  });

  test('throws E_PERMISSION_DENIED for architect', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0,
      role: 'architect'
    });

    const sddRequestSpecChange = await import('../../.opencode/tools/sdd_request_spec_change');
    
    await expect(sddRequestSpecChange.default.execute({
      reason: 'test',
      proposal: 'test'
    }, {} as any)).rejects.toThrow('E_PERMISSION_DENIED');
  });

  test('throws E_STATE_INVALID when no state exists', async () => {
    const sddRequestSpecChange = await import('../../.opencode/tools/sdd_request_spec_change');
    
    await expect(sddRequestSpecChange.default.execute({
      reason: 'test',
      proposal: 'test'
    }, {} as any)).rejects.toThrow('E_STATE_INVALID');
  });
});
