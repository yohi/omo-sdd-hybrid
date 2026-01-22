import { evaluateAccess, evaluateMultiEdit, AccessResult, GuardMode } from '../../.opencode/plugins/sdd-gatekeeper';
import { StateResult, readState } from '../../.opencode/lib/state-utils';

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
