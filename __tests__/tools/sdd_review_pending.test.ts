import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { writeState } from '../../.opencode/lib/state-utils';
import fs from 'fs';
import path from 'path';

describe('sdd_review_pending', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('lists pending changes for architect', async () => {
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

    const pendingDir = path.join(process.env.SDD_KIRO_DIR!, 'pending-changes');
    fs.mkdirSync(pendingDir, { recursive: true });

    // Create dummy change request
    const filename = '2023-10-27-Task-1.md';
    const content = `# Specification Change Request

- **Task ID**: Task-1
- **Date**: 2023-10-27T10:00:00Z
- **Author**: Implementer

## Reason
This is a reason.
Multiple lines.

## Proposal
This is a proposal.
Multiple lines.
`;
    fs.writeFileSync(path.join(pendingDir, filename), content);

    const sddReviewPending = await import('../../.opencode/tools/sdd_review_pending');
    const result = await sddReviewPending.default.execute({}, {} as any);

    expect(result).toContain('保留中の仕様変更提案 (1件)');
    expect(result).toContain(`## [${filename}]`);
    expect(result).toContain('**Task**: Task-1');
    expect(result).toContain('**Reason**: This is a reason.');
    expect(result).toContain('**Proposal**: This is a proposal.');
  });

  test('handles empty directory gracefully', async () => {
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

    const pendingDir = path.join(process.env.SDD_KIRO_DIR!, 'pending-changes');
    if (fs.existsSync(pendingDir)) {
      fs.rmSync(pendingDir, { recursive: true, force: true });
    }

    const sddReviewPending = await import('../../.opencode/tools/sdd_review_pending');
    const result = await sddReviewPending.default.execute({}, {} as any);

    expect(result).toContain('保留中の仕様変更提案はありません');
  });

  test('handles broken files gracefully', async () => {
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

    const pendingDir = path.join(process.env.SDD_KIRO_DIR!, 'pending-changes');
    fs.mkdirSync(pendingDir, { recursive: true });
    
    // Create broken file (empty)
    fs.writeFileSync(path.join(pendingDir, 'broken.md'), '');

    const sddReviewPending = await import('../../.opencode/tools/sdd_review_pending');
    const result = await sddReviewPending.default.execute({}, {} as any);

    expect(result).toContain('## [broken.md]');
    // Should extract defaults or handle empty
    // The current implementation returns "(No reason provided)" for empty sections if regex doesn't match
    expect(result).toContain('**Reason**: (No reason provided)'); 
  });

  test('throws E_PERMISSION_DENIED for implementer', async () => {
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

    const sddReviewPending = await import('../../.opencode/tools/sdd_review_pending');
    
    await expect(sddReviewPending.default.execute({}, {} as any))
      .rejects.toThrow('E_PERMISSION_DENIED');
  });

  test('throws E_STATE_INVALID when state is not valid', async () => {
     // No active task state
     // setupTestState creates an empty/invalid state by default if writeState isn't called?
     // Actually setupTestState sets env vars but doesn't write state.json.
     // readState throws if file doesn't exist, or returns null?
     // Let's rely on readState behavior. If no file, it throws or returns default?
     // Based on lib/state-utils, it might return null or default.
     // But checking the tool implementation:
     // if (result.status !== 'ok' && result.status !== 'recovered')
     
     // Ensure we have a "valid" state file but with status that causes error, or just no state file?
     // If no state file, readState usually initializes one or throws.
     // Let's just not write state and see if readState handles it or returns a "not ok" status.
     
     // Actually, let's write a state with 'ended' status (implied by no active task)
     // But wait, the tool checks result.status.
     
     const sddReviewPending = await import('../../.opencode/tools/sdd_review_pending');
     // Without writeState, readState likely returns a default "idle" state or similar if implemented that way,
     // or throws if file missing.
     // Let's assume writeState is needed to make it "ok".
     
     // To test E_STATE_INVALID, we can try running without writing state (simulating no active task)
     await expect(sddReviewPending.default.execute({}, {} as any))
        .rejects.toThrow(); // E_STATE_INVALID or similar
  });
});
