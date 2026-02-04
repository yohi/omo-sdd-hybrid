
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { getStatePath } from '../../.opencode/lib/state-utils';
import fs from 'fs';

const WORKTREE_ROOT = process.cwd();

const cleanupStateFiles = () => {
  const statePath = getStatePath();
  const filesToClean = [
    statePath,
    `${statePath}.bak`,
    `${statePath}.bak.1`,
    `${statePath}.bak.2`,
  ];
  filesToClean.forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
};

describe('access-policy newline handling', () => {
  beforeEach(() => {
    setupTestState();
    cleanupStateFiles();
  });

  afterEach(() => {
    cleanupStateFiles();
    cleanupTestState();
  });

  test('detects destructive bash command separated by newline', async () => {
    const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
    
    const command = 'echo ok\nrm -rf /';
    const result = evaluateAccess('bash', undefined, command, { status: 'not_found' }, WORKTREE_ROOT, 'warn');
    
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(true);
    expect(result.rule).toBe('Rule4');
    expect(result.message).toContain('破壊的コマンド検出');
  });

  test('detects destructive bash command separated by carriage return', async () => {
    const { evaluateAccess } = await import('../../.opencode/lib/access-policy');
    
    const command = 'echo ok\rrm -rf /';
    const result = evaluateAccess('bash', undefined, command, { status: 'not_found' }, WORKTREE_ROOT, 'warn');
    
    expect(result.allowed).toBe(true);
    expect(result.warned).toBe(true);
    expect(result.rule).toBe('Rule4');
  });
});
