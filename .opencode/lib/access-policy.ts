import type { StateResult, State } from './state-utils';
import { normalizeToRepoRelative, isOutsideWorktree } from './path-utils';
import { matchesScope } from './glob-utils';
import { loadPolicyConfig } from './policy-loader';

export const WRITE_TOOLS = ['edit', 'write', 'patch', 'multiedit'];

export type GuardMode = 'warn' | 'block';

export function getGuardMode(): GuardMode {
  const mode = process.env.SDD_GUARD_MODE;
  return mode === 'block' ? 'block' : 'warn';
}

export interface AccessResult {
  allowed: boolean;
  warned: boolean;
  message?: string;
  rule?: 'Rule0' | 'Rule1' | 'Rule2' | 'Rule3' | 'Rule4' | 'StateCorrupted';
}

export function evaluateAccess(
  toolName: string,
  filePath: string | undefined,
  command: string | undefined,
  stateResult: StateResult,
  worktreeRoot: string,
  mode: GuardMode = getGuardMode()
): AccessResult {
  const allowedOnViolation = mode === 'warn';
  const policy = loadPolicyConfig();
  
  if (!WRITE_TOOLS.includes(toolName)) {
    if (toolName === 'bash' && command) {
      if (policy.destructiveBash.some(d => command.includes(d))) {
        return { allowed: allowedOnViolation, warned: true, message: `破壊的コマンド検出: ${command}`, rule: 'Rule4' };
      }
    }
    return { allowed: true, warned: false };
  }
  
  if (!filePath) {
    return { 
      allowed: false, 
      warned: true, 
      message: 'MISSING_FILEPATH: filePath が指定されていないため、スコープチェックをスキップできません',
      rule: 'Rule1'
    };
  }
  
  const normalizedPath = normalizeToRepoRelative(filePath, worktreeRoot);
  
  if (policy.alwaysAllow.some(prefix => normalizedPath.startsWith(prefix))) {
    return { allowed: true, warned: false, rule: 'Rule0' };
  }
  
  if (isOutsideWorktree(filePath, worktreeRoot)) {
    return { allowed: allowedOnViolation, warned: true, message: `OUTSIDE_WORKTREE: ${normalizedPath}`, rule: 'Rule3' };
  }
  
  if (stateResult.status === 'corrupted') {
    return { 
      allowed: allowedOnViolation,
      warned: true, 
      message: `STATE_CORRUPTED: current_context.json が破損しています。再作成が必要です。(${stateResult.error})`,
      rule: 'StateCorrupted'
    };
  }
  
  if (stateResult.status === 'not_found') {
    return { allowed: allowedOnViolation, warned: true, message: 'NO_ACTIVE_TASK: 先に sdd_start_task を実行してください', rule: 'Rule1' };
  }
  
  // 'recovered' ステータスは 'ok' と同様に処理 (stateResult.state が利用可能)
  
  const state = stateResult.state;
  
  if (!state.activeTaskId || state.allowedScopes.length === 0) {
    return { allowed: allowedOnViolation, warned: true, message: 'NO_ACTIVE_TASK: 先に sdd_start_task を実行してください', rule: 'Rule1' };
  }
  
  if (!matchesScope(normalizedPath, state.allowedScopes)) {
    return { 
      allowed: allowedOnViolation, 
      warned: true, 
      message: `SCOPE_DENIED: ${state.activeTaskId} は ${normalizedPath} への書き込み権限を持ちません。allowedScopes=${state.allowedScopes.join(', ')}`,
      rule: 'Rule2'
    };
  }
  
  return { allowed: true, warned: false };
}

export function evaluateMultiEdit(
  files: Array<{ filePath: string }>,
  stateResult: StateResult,
  worktreeRoot: string
): AccessResult {
  if (!Array.isArray(files)) {
    return {
      allowed: false,
      warned: true,
      message: `INVALID_ARGUMENTS: multiedit 'files' argument must be an array. Received: ${typeof files}`,
      rule: 'Rule1'
    };
  }

  const results: AccessResult[] = files.map(f => 
    evaluateAccess('edit', f.filePath, undefined, stateResult, worktreeRoot)
  );
  
  const warnings = results.filter(r => r.warned);
  const allowed = results.every(r => r.allowed);
  
  if (warnings.length === 0) {
    return { allowed: true, warned: false };
  }
  
  const messages = warnings.map(w => w.message).filter(Boolean);
  return {
    allowed,
    warned: true,
    message: `multiedit: ${warnings.length}/${files.length} ファイルで警告\n${messages.join('\n')}`,
    rule: warnings[0].rule
  };
}
