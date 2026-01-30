import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import fs from 'fs';
import path from 'path';
import sdd_reject_change from '../../.opencode/tools/sdd_reject_change';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { writeState } from '../../.opencode/lib/state-utils';

describe('sdd_reject_change', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = setupTestState();
  });

  afterAll(() => {
    cleanupTestState();
  });

  beforeEach(async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test-user',
      validationAttempts: 0,
      role: 'architect'
    });
  });

  test('should reject change and create feedback', async () => {
    const kiroDir = process.env.SDD_KIRO_DIR!;
    const pendingDir = path.join(kiroDir, 'pending-changes');
    fs.mkdirSync(pendingDir, { recursive: true });
    
    const changeId = 'test-change.md';
    const pendingPath = path.join(pendingDir, changeId);
    fs.writeFileSync(pendingPath, '# Request\nReason: ...');

    const result = await sdd_reject_change.execute({
      changeId,
      reason: 'Not good enough'
    });

    expect(result).toContain('仕様変更を却下しました');
    expect(result).toContain('Reason: Not good enough');

    const archivePath = path.join(kiroDir, 'archive', 'pending-changes', 'rejected', changeId);
    expect(fs.existsSync(pendingPath)).toBe(false);
    expect(fs.existsSync(archivePath)).toBe(true);

    const feedbackPath = path.join(kiroDir, 'feedback', `FB-${changeId}`);
    expect(fs.existsSync(feedbackPath)).toBe(true);
    const feedbackContent = fs.readFileSync(feedbackPath, 'utf-8');
    expect(feedbackContent).toContain('Not good enough');
    expect(feedbackContent).toContain('却下されました');
  });

  test('should throw E_PERMISSION_DENIED if not architect', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: [],
      startedAt: new Date().toISOString(),
      startedBy: 'test-user',
      validationAttempts: 0,
      role: 'implementer'
    });

    await expect(sdd_reject_change.execute({
      changeId: 'any.md',
      reason: 'reason'
    })).rejects.toThrow('E_PERMISSION_DENIED');
  });

  test('should return error if pending file not found', async () => {
    const result = await sdd_reject_change.execute({
      changeId: 'missing.md',
      reason: 'reason'
    });
    expect(result).toContain('エラー: 指定された変更リクエストファイルが見つかりません');
  });

  test('should throw E_INVALID_ARG for path traversal', async () => {
    await expect(sdd_reject_change.execute({
      changeId: '../secret.txt',
      reason: 'reason'
    })).rejects.toThrow('E_INVALID_ARG');
  });

  test('should throw E_STATE_INVALID if no active task (or no state)', async () => {
    const statePath = path.join(process.env.SDD_STATE_DIR!, 'current_context.json');
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);

    await expect(sdd_reject_change.execute({
      changeId: 'test.md',
      reason: 'reason'
    })).rejects.toThrow('E_STATE_INVALID');
  });
});
