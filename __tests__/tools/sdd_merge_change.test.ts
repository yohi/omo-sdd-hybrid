import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'path';
import fs from 'fs';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { writeState, type StateInput } from '../../.opencode/lib/state-utils';
import sddMergeChange from '../../.opencode/tools/sdd_merge_change';

const mockContext: any = {
  sessionID: 'test-session',
  messageID: 'test-message',
  agent: 'test-agent',
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {}
};

describe('sdd_merge_change', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = setupTestState();

    const initialState: StateInput = {
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'tester',
      validationAttempts: 0,
      role: 'architect'
    };
    await writeState(initialState);

    const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
    
    const pendingDir = path.join(kiroDir, 'pending-changes');
    fs.mkdirSync(pendingDir, { recursive: true });
    
    const pendingFile = path.join(pendingDir, 'change-123.md');
    fs.writeFileSync(pendingFile, `# Change Request
## Reason
Bug found in auth flow.

## Proposal
Update requirements to include 2FA.
`);

    const specsDir = path.join(kiroDir, 'specs', 'auth-feature');
    fs.mkdirSync(specsDir, { recursive: true });
    
    const reqFile = path.join(specsDir, 'requirements.md');
    fs.writeFileSync(reqFile, '# Requirements\n- Req-1: Basic Auth\n');
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('should merge pending change into requirements.md', async () => {
    const result = await sddMergeChange.execute({
      changeId: 'change-123.md',
      feature: 'auth-feature',
      target: 'requirements'
    }, mockContext);

    expect(result).toContain('仕様変更をマージしました');
    expect(result).toContain('Source: change-123.md (Archived)');
    expect(result).toContain('Target: auth-feature/requirements.md');

    const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
    
    const reqFile = path.join(kiroDir, 'specs', 'auth-feature', 'requirements.md');
    const content = fs.readFileSync(reqFile, 'utf-8');
    expect(content).toContain('## Change Log');
    expect(content).toContain('Bug found in auth flow');
    expect(content).toContain('Update requirements to include 2FA');

    const pendingFile = path.join(kiroDir, 'pending-changes', 'change-123.md');
    expect(fs.existsSync(pendingFile)).toBe(false);

    const archiveFile = path.join(kiroDir, 'archive', 'pending-changes', 'merged', 'change-123.md');
    expect(fs.existsSync(archiveFile)).toBe(true);

    const feedbackFile = path.join(kiroDir, 'feedback', 'FB-change-123.md');
    expect(fs.existsSync(feedbackFile)).toBe(true);
    const feedbackContent = fs.readFileSync(feedbackFile, 'utf-8');
    expect(feedbackContent).toContain('変更リクエスト change-123.md は auth-feature/requirements.md にマージされました');
  });

  test('should fail if role is implementer', async () => {
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test Task',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'tester',
      validationAttempts: 0,
      role: 'implementer'
    });

    await expect(sddMergeChange.execute({
      changeId: 'change-123.md',
      feature: 'auth-feature',
      target: 'requirements'
    }, mockContext)).rejects.toThrow('E_PERMISSION_DENIED');
  });

  test('should fail if pending file not found', async () => {
    const result = await sddMergeChange.execute({
      changeId: 'non-existent.md',
      feature: 'auth-feature',
      target: 'requirements'
    }, mockContext);
    expect(result).toContain('エラー: 指定された変更リクエストファイルが見つかりません');
  });

  test('should fail if target file not found', async () => {
    const result = await sddMergeChange.execute({
      changeId: 'change-123.md',
      feature: 'unknown-feature',
      target: 'requirements'
    }, mockContext);
    expect(result).toContain('エラー: マージ先の仕様書ファイルが見つかりません');
  });

  test('should fail with invalid target arg', async () => {
    // @ts-ignore
    await expect(sddMergeChange.execute({
      changeId: 'change-123.md',
      feature: 'auth-feature',
      target: 'invalid-target'
    }, mockContext)).rejects.toThrow('E_INVALID_ARG');
  });
  
  test('should fail with path traversal in changeId', async () => {
    await expect(sddMergeChange.execute({
      changeId: '../secret.txt',
      feature: 'auth-feature',
      target: 'requirements'
    }, mockContext)).rejects.toThrow('E_INVALID_ARG');
  });

  test('should fail with path traversal in feature', async () => {
    await expect(sddMergeChange.execute({
      changeId: 'change-123.md',
      feature: '../auth-feature',
      target: 'requirements'
    }, mockContext)).rejects.toThrow('E_INVALID_ARG: feature にパスセパレータや相対パスを含めることはできません');
  });
});
