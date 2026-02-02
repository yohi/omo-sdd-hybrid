import fs from 'fs';
import { type StateResult, type State, type GuardMode, type GuardModeState, getStateDir } from './state-utils';
import { normalizeToRepoRelative, isOutsideWorktree } from './path-utils';
import { matchesScope } from './glob-utils';
import { loadPolicyConfig } from './policy-loader';

export const WRITE_TOOLS = ['edit', 'write', 'patch', 'multiedit'];

export { type GuardMode };

function appendAuditLog(message: string) {
  const stateDir = getStateDir();
  const logPath = `${stateDir}/guard-mode.log`;
  
  if (!fs.existsSync(stateDir)) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch { /* ignore */ }
  }

  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, entry);
  } catch (e) {
    console.error('Failed to write audit log:', e);
  }
}

export function determineEffectiveGuardMode(
  envMode: string | undefined,
  fileState: GuardModeState | null
): GuardMode {
  if (fileState === null) {
    if (envMode !== 'block') {
      appendAuditLog(`FAIL_CLOSED: Guard mode state is missing or invalid. Enforcing 'block'.`);
    }
    return 'block';
  }

  const envBlock = envMode === 'block';
  const fileBlock = fileState.mode === 'block';

  if (fileBlock) {
    if (!envBlock && envMode === 'warn') {
       appendAuditLog(`DENIED_WEAKENING: Guard mode file is 'block', but env SDD_GUARD_MODE is '${envMode}'. Enforcing 'block'.`);
    }
    return 'block';
  }

  if (envBlock) {
    return 'block';
  }

  return 'warn';
}

/**
 * @deprecated Use determineEffectiveGuardMode instead
 */
export function getGuardMode(): GuardMode {
  const mode = process.env.SDD_GUARD_MODE;
  return mode === 'block' ? 'block' : 'warn';
}

export interface AccessResult {
  allowed: boolean;
  warned: boolean;
  message?: string;
  rule?: 'Rule0' | 'Rule1' | 'Rule2' | 'Rule3' | 'Rule4' | 'StateCorrupted' | 'RoleDenied' | 'RoleAllowed';
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

export function evaluateRoleAccess(
  toolName: string,
  filePath: string | undefined,
  command: string | undefined,
  stateResult: StateResult,
  worktreeRoot: string,
  mode: GuardMode = getGuardMode()
): AccessResult {
  const baseResult = evaluateAccess(toolName, filePath, command, stateResult, worktreeRoot, mode);
  
  // Rule0 (specs/, .opencode/) is absolute
  if (baseResult.rule === 'Rule0') {
    return baseResult;
  }

  // Only check write tools and existing file paths
  if (!filePath || !WRITE_TOOLS.includes(toolName)) {
    return baseResult;
  }

  // Only check if state is available and role is defined
  if (stateResult.status !== 'ok' && stateResult.status !== 'recovered') {
    return baseResult;
  }

  const role = stateResult.state.role;
  if (!role) {
    return baseResult;
  }

  const normalizedPath = normalizeToRepoRelative(filePath, worktreeRoot);
  const isKiroPath = normalizedPath.startsWith('.kiro/');
  const allowedOnViolation = mode === 'warn';

  if (role === 'architect') {
    // Architect: Only allow .kiro/** (Priority over scope)
    if (isKiroPath) {
      return { allowed: true, warned: false, rule: 'RoleAllowed' };
    } else {
      // Deny everything else (except Rule0 handled above)
      return {
        allowed: allowedOnViolation,
        warned: true,
        message: `ROLE_DENIED: role=architect は .kiro/** のみ書き込み可能です: ${normalizedPath}`,
        rule: 'RoleDenied'
      };
    }
  }

  if (role === 'implementer') {
    // Implementer: Deny .kiro/** (Priority over scope)
    if (isKiroPath) {
      return {
        allowed: allowedOnViolation,
        warned: true,
        message: `ROLE_DENIED: role=implementer は .kiro/** への書き込みが禁止されています: ${normalizedPath}`,
        rule: 'RoleDenied'
      };
    }
  }

  return baseResult;
}

export function evaluateMultiEdit(
  files: Array<{ filePath: string }>,
  stateResult: StateResult,
  worktreeRoot: string,
  mode: GuardMode = getGuardMode()
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
    evaluateRoleAccess('edit', f.filePath, undefined, stateResult, worktreeRoot, mode)
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
