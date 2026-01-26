import { evaluateAccess, evaluateMultiEdit, type AccessResult, type GuardMode } from '../../.opencode/lib/access-policy';
import { StateResult, readState, clearState, getStatePath } from '../../.opencode/lib/state-utils';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function setupTestState(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omo-sdd-state-'));
  process.env.SDD_STATE_DIR = tmpDir;
  process.env.SDD_TASKS_PATH = path.join(tmpDir, 'tasks.md');
  process.env.SDD_KIRO_DIR = path.join(tmpDir, '.kiro');
  process.env.SDD_TEST_MODE = 'true'; // Enable fast locks
  return tmpDir;
}

export function cleanupTestState(): void {
  const stateDir = process.env.SDD_STATE_DIR;
  if (stateDir && fs.existsSync(stateDir)) {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  delete process.env.SDD_STATE_DIR;
  delete process.env.SDD_TASKS_PATH;
  delete process.env.SDD_KIRO_DIR;
  delete process.env.SDD_TEST_MODE;
}

export async function ensureNoBackups(): Promise<void> {
  await clearState();
  const statePath = getStatePath();
  const backupPatterns = ['.bak', '.bak.1', '.bak.2'];
  backupPatterns.forEach(suffix => {
    const backupPath = statePath + suffix;
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  });
}

export async function deleteAllBackups(): Promise<void> {
  const statePath = getStatePath();
  const backupPatterns = ['.bak', '.bak.1', '.bak.2'];
  backupPatterns.forEach(suffix => {
    const backupPath = statePath + suffix;
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  });
}

export function getTestWorktreeRoot(): string {
  return process.cwd();
}

export async function simulateEdit(relativePath: string, stateResult?: StateResult, mode?: GuardMode): Promise<AccessResult> {
  const resolvedStateResult = stateResult ?? await readState();
  const worktreeRoot = getTestWorktreeRoot();
  return evaluateAccess('edit', relativePath, undefined, resolvedStateResult, worktreeRoot, mode);
}

export async function simulateBash(command: string, stateResult?: StateResult, mode?: GuardMode): Promise<AccessResult> {
  const resolvedStateResult = stateResult ?? await readState();
  const worktreeRoot = getTestWorktreeRoot();
  return evaluateAccess('bash', undefined, command, resolvedStateResult, worktreeRoot, mode);
}

export async function simulateMultiEdit(
  files: Array<{ filePath: string }>,
  stateResult?: StateResult
): Promise<AccessResult> {
  const resolvedStateResult = stateResult ?? await readState();
  const worktreeRoot = getTestWorktreeRoot();
  return evaluateMultiEdit(files, resolvedStateResult, worktreeRoot);
}

export function captureWarnings(fn: () => void): string[] {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}
