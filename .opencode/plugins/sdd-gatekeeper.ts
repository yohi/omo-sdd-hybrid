import type { Plugin } from '../lib/plugin-stub';
import { readState, StateResult, State } from '../lib/state-utils';
import { normalizeToRepoRelative, isOutsideWorktree, getWorktreeRoot } from '../lib/path-utils';
import { matchesScope } from '../lib/glob-utils';

const WRITE_TOOLS = ['edit', 'write', 'patch', 'multiedit'];
const ALWAYS_ALLOW = ['specs/', '.opencode/'];
const DESTRUCTIVE_BASH = ['rm ', 'rm -', 'git push', 'reset --hard', 'git apply'];

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
  worktreeRoot: string
): AccessResult {
  if (!WRITE_TOOLS.includes(toolName)) {
    if (toolName === 'bash' && command) {
      if (DESTRUCTIVE_BASH.some(d => command.includes(d))) {
        return { allowed: true, warned: true, message: `破壊的コマンド検出: ${command}`, rule: 'Rule4' };
      }
    }
    return { allowed: true, warned: false };
  }
  
  if (!filePath) return { allowed: true, warned: false };
  
  const normalizedPath = normalizeToRepoRelative(filePath, worktreeRoot);
  
  if (ALWAYS_ALLOW.some(prefix => normalizedPath.startsWith(prefix))) {
    return { allowed: true, warned: false, rule: 'Rule0' };
  }
  
  if (isOutsideWorktree(filePath, worktreeRoot)) {
    return { allowed: true, warned: true, message: `OUTSIDE_WORKTREE: ${normalizedPath}`, rule: 'Rule3' };
  }
  
  if (stateResult.status === 'corrupted') {
    return { 
      allowed: true,
      warned: true, 
      message: `STATE_CORRUPTED: current_context.json が破損しています。再作成が必要です。(${stateResult.error})`,
      rule: 'StateCorrupted'
    };
  }
  
  if (stateResult.status === 'not_found') {
    return { allowed: true, warned: true, message: 'NO_ACTIVE_TASK: 先に sdd_start_task を実行してください', rule: 'Rule1' };
  }
  
  const state = stateResult.state;
  
  if (!state.activeTaskId || state.allowedScopes.length === 0) {
    return { allowed: true, warned: true, message: 'NO_ACTIVE_TASK: 先に sdd_start_task を実行してください', rule: 'Rule1' };
  }
  
  if (!matchesScope(normalizedPath, state.allowedScopes)) {
    return { 
      allowed: true, 
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
  const results: AccessResult[] = files.map(f => 
    evaluateAccess('edit', f.filePath, undefined, stateResult, worktreeRoot)
  );
  
  const warnings = results.filter(r => r.warned);
  
  if (warnings.length === 0) {
    return { allowed: true, warned: false };
  }
  
  const messages = warnings.map(w => w.message).filter(Boolean);
  return {
    allowed: true,
    warned: true,
    message: `multiedit: ${warnings.length}/${files.length} ファイルで警告\n${messages.join('\n')}`,
    rule: warnings[0].rule
  };
}

export const SddGatekeeper: Plugin = async ({ client }) => {
  const worktreeRoot = getWorktreeRoot();
  
  return {
    'tool.execute.before': async (event) => {
      const { name, args } = event.tool;
      
      if (name === 'multiedit' && args.files) {
        const stateResult = readState();
        const result = evaluateMultiEdit(args.files, stateResult, worktreeRoot);
        if (result.warned) {
          console.warn(`[SDD-GATEKEEPER] ${result.message}`);
        }
        return;
      }
      
      const filePath = args.filePath || args.path;
      const command = args.command;
      
      const stateResult = readState();
      const result = evaluateAccess(name, filePath, command, stateResult, worktreeRoot);
      
      if (result.warned) {
        console.warn(`[SDD-GATEKEEPER] ${result.message}`);
      }
    }
  };
};

export default SddGatekeeper;
