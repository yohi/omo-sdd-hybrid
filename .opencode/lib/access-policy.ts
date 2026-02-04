import fs from 'fs';
import { type StateResult, type State, type GuardMode, type GuardModeState, getStateDir } from './state-utils';
import { normalizeToRepoRelative, isOutsideWorktree } from './path-utils';
import { matchesScope } from './glob-utils';
import { loadPolicyConfig } from './policy-loader';
import { logger } from './logger.js';

export const WRITE_TOOLS = ['edit', 'write', 'patch', 'multiedit'];

export { type GuardMode };

const DEFAULT_GUARD_AUDIT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_GUARD_AUDIT_MAX_BACKUPS = 3;

type GuardAuditLogEntry = {
  event: string;
  message: string;
  meta?: Record<string, unknown>;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getGuardAuditMaxBytes(): number {
  return parsePositiveInt(process.env.SDD_GUARD_AUDIT_MAX_BYTES, DEFAULT_GUARD_AUDIT_MAX_BYTES);
}

function getGuardAuditMaxBackups(): number {
  return parsePositiveInt(process.env.SDD_GUARD_AUDIT_MAX_BACKUPS, DEFAULT_GUARD_AUDIT_MAX_BACKUPS);
}

function getGuardAuditBackupPath(logPath: string, index: number): string {
  if (index <= 1) return `${logPath}.bak`;
  return `${logPath}.bak.${index - 1}`;
}

function rotateGuardAuditLog(logPath: string, maxBackups: number): void {
  if (maxBackups <= 0) return;

  const oldestPath = getGuardAuditBackupPath(logPath, maxBackups);
  if (fs.existsSync(oldestPath)) {
    fs.unlinkSync(oldestPath);
  }

  for (let i = maxBackups - 1; i >= 1; i -= 1) {
    const fromPath = getGuardAuditBackupPath(logPath, i);
    const toPath = getGuardAuditBackupPath(logPath, i + 1);
    if (fs.existsSync(fromPath)) {
      fs.renameSync(fromPath, toPath);
    }
  }

  if (fs.existsSync(logPath)) {
    fs.renameSync(logPath, getGuardAuditBackupPath(logPath, 1));
  }
}

function appendAuditLog(entry: string | GuardAuditLogEntry) {
  const stateDir = getStateDir();
  const logPath = `${stateDir}/guard-mode.log`;
  
  if (!fs.existsSync(stateDir)) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch { /* ignore */ }
  }

  const timestamp = new Date().toISOString();
  const payload: GuardAuditLogEntry = typeof entry === 'string'
    ? { event: 'INFO', message: entry }
    : entry;
  const logEntry = JSON.stringify({ timestamp, ...payload });
  try {
    const maxBytes = getGuardAuditMaxBytes();
    const maxBackups = getGuardAuditMaxBackups();
    if (fs.existsSync(logPath)) {
      const stat = fs.statSync(logPath);
      if (stat.size >= maxBytes) {
        rotateGuardAuditLog(logPath, maxBackups);
      }
    }
    fs.appendFileSync(logPath, `${logEntry}\n`);
  } catch (e) {
    logger.error('Failed to write audit log:', e);
  }
}

export function determineEffectiveGuardMode(
  envMode: string | undefined,
  fileState: GuardModeState | null
): GuardMode {
  if (fileState === null) {
    if (envMode !== 'block') {
      appendAuditLog({
        event: 'FAIL_CLOSED',
        message: `Guard mode state is missing or invalid. Enforcing 'block'.`,
        meta: { envMode: envMode ?? null }
      });
    }
    return 'block';
  }

  const envBlock = envMode === 'block';
  const fileBlock = fileState.mode === 'block';

  if (fileBlock) {
    if (!envBlock && envMode === 'warn') {
       appendAuditLog({
         event: 'DENIED_WEAKENING',
         message: `Guard mode file is 'block', but env SDD_GUARD_MODE is '${envMode}'. Enforcing 'block'.`,
         meta: { envMode, fileMode: fileState.mode }
       });
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

type BashRuleMode = 'warn' | 'block';

type BashRule = {
  id: string;
  minMode: BashRuleMode;
  match: (info: BashCommandInfo) => boolean;
};

type BashCommandInfo = {
  command: string;
  args: string[];
  tokens: string[];
};

const BASH_WRAPPER_COMMANDS = new Set(['sudo', 'command', 'env', 'nice', 'nohup', 'time']);

const WRAPPER_ARG_OPTIONS: Record<string, Set<string>> = {
  sudo: new Set(['-u', '-g', '-h', '-p', '-U']),
  env: new Set(['-C', '-u', '-S']),
  nice: new Set(['-n']),
  time: new Set(['-o', '-f']),
};

const DESTRUCTIVE_BASH_RULES: BashRule[] = [
  {
    id: 'rm-force-recursive',
    minMode: 'warn',
    match: ({ command, args }) => {
      if (command !== 'rm') {
        return false;
      }
      const flags = extractFlags(args);
      const recursive = flags.shortFlags.has('r') || flags.shortFlags.has('R') || flags.longFlags.has('recursive');
      const force = flags.shortFlags.has('f') || flags.longFlags.has('force');
      return recursive && force;
    }
  },
  {
    id: 'git-clean-fdx',
    minMode: 'warn',
    match: ({ command, args }) => {
      if (command !== 'git') {
        return false;
      }
      const subcommand = getGitSubcommand(args);
      if (subcommand?.name !== 'clean') {
        return false;
      }
      const flags = extractFlags(subcommand.args);
      return flags.shortFlags.has('f') && flags.shortFlags.has('d') && flags.shortFlags.has('x');
    }
  },
  {
    id: 'git-reset-hard',
    minMode: 'warn',
    match: ({ command, args }) => {
      if (command !== 'git') {
        return false;
      }
      const subcommand = getGitSubcommand(args);
      if (subcommand?.name !== 'reset') {
        return false;
      }
      const flags = extractFlags(subcommand.args);
      return flags.longFlags.has('hard');
    }
  },
  {
    id: 'git-push',
    minMode: 'warn',
    match: ({ command, args }) => {
      if (command !== 'git') {
        return false;
      }
      return getGitSubcommand(args)?.name === 'push';
    }
  },
  {
    id: 'git-apply',
    minMode: 'warn',
    match: ({ command, args }) => {
      if (command !== 'git') {
        return false;
      }
      return getGitSubcommand(args)?.name === 'apply';
    }
  }
];

function splitBashSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let inBacktick = false;
  let commandSubstDepth = 0;
  let subshellDepth = 0;
  let braceDepth = 0;

  const pushSegment = () => {
    const trimmed = current.trim();
    if (trimmed) {
      segments.push(trimmed);
    }
    current = '';
  };

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (!inSingle && ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }

    if (!inSingle && ch === '`') {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }

    if (!inSingle && !inBacktick && ch === '$' && command[i + 1] === '(') {
      commandSubstDepth += 1;
      current += '$(';
      i += 1;
      continue;
    }

    if (!inSingle && !inBacktick && ch === ')' && commandSubstDepth > 0) {
      commandSubstDepth -= 1;
      current += ch;
      continue;
    }

    if (!inBacktick && !inDouble && ch === "'") {
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (!inBacktick && !inSingle && ch === '"') {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick && commandSubstDepth === 0) {
      if (ch === '(') {
        subshellDepth += 1;
        current += ch;
        continue;
      }

      if (ch === ')' && subshellDepth > 0) {
        subshellDepth -= 1;
        current += ch;
        continue;
      }

      if (ch === '{') {
        braceDepth += 1;
        current += ch;
        continue;
      }

      if (ch === '}' && braceDepth > 0) {
        braceDepth -= 1;
        current += ch;
        continue;
      }
    }

    if (
      !inSingle
      && !inDouble
      && !inBacktick
      && commandSubstDepth === 0
      && subshellDepth === 0
      && braceDepth === 0
    ) {
      if (ch === ';' || ch === '\n' || ch === '\r') {
        pushSegment();
        continue;
      }

      if (ch === '&' && command[i + 1] === '&') {
        pushSegment();
        i += 1;
        continue;
      }

      if (ch === '&' && command[i + 1] !== '&' && command[i + 1] !== '>' && command[i - 1] !== '>') {
        pushSegment();
        continue;
      }

      if (ch === '|' && command[i + 1] === '|') {
        pushSegment();
        i += 1;
        continue;
      }

      if (ch === '|') {
        pushSegment();
        continue;
      }
    }

    current += ch;
  }

  pushSegment();
  return segments;
}

function tokenizeBashSegment(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  const pushToken = () => {
    if (current) {
      tokens.push(current);
      current = '';
    }
  };

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (!inSingle && ch === '\\') {
      escaped = true;
      continue;
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && /\s/.test(ch)) {
      pushToken();
      continue;
    }

    current += ch;
  }

  pushToken();
  return tokens;
}

function stripBashWrappers(tokens: string[]): string[] {
  let index = 0;

  const skipEnvAssignments = () => {
    while (index < tokens.length && isEnvAssignment(tokens[index])) {
      index += 1;
    }
  };

  skipEnvAssignments();

  while (index < tokens.length) {
    const token = tokens[index];

    if (BASH_WRAPPER_COMMANDS.has(token)) {
      const wrapper = token;
      index += 1;

      // Consume options
      while (index < tokens.length && tokens[index].startsWith('-')) {
        const option = tokens[index];
        index += 1;

        const argOptions = WRAPPER_ARG_OPTIONS[wrapper];
        
        // Special handling for 'command -v/-V' -> treat as query (stop detection)
        if (wrapper === 'command' && (option === '-v' || option === '-V')) {
          return [];
        }

        if (argOptions?.has(option) && index < tokens.length) {
          index += 1;
        }
      }

      skipEnvAssignments();
      continue;
    }

    break;
  }

  return tokens.slice(index);
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function extractFlags(args: string[]) {
  const shortFlags = new Set<string>();
  const longFlags = new Set<string>();

  for (const arg of args) {
    if (arg === '--') {
      break;
    }
    if (arg.startsWith('--')) {
      const [flag] = arg.slice(2).split('=');
      if (flag) {
        longFlags.add(flag);
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      for (const ch of arg.slice(1)) {
        shortFlags.add(ch);
      }
    }
  }

  return { shortFlags, longFlags };
}

function getGitSubcommand(args: string[]): { name: string; args: string[] } | null {
  let index = 0;

  while (index < args.length) {
    const arg = args[index];

    if (arg === '--') {
      index += 1;
      break;
    }

    if (arg.startsWith('-')) {
      if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(arg)) {
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    return { name: arg, args: args.slice(index + 1) };
  }

  return null;
}

function buildBashCommandInfo(segment: string): BashCommandInfo | null {
  const tokens = tokenizeBashSegment(segment);
  const strippedTokens = stripBashWrappers(tokens);
  if (strippedTokens.length === 0) {
    return null;
  }
  return { command: strippedTokens[0], args: strippedTokens.slice(1), tokens: strippedTokens };
}

function matchPolicyEntries(info: BashCommandInfo, entries: string[]): boolean {
  return entries.some(entry => {
    const entryTokens = tokenizeBashSegment(entry.trim());
    if (entryTokens.length === 0) {
      return false;
    }
    if (info.tokens.length < entryTokens.length) {
      return false;
    }
    for (let i = 0; i < entryTokens.length; i += 1) {
      const expected = entryTokens[i];
      const actual = info.tokens[i];
      if (expected === '-') {
        if (!actual.startsWith('-')) {
          return false;
        }
        continue;
      }
      if (expected !== actual) {
        return false;
      }
    }
    return true;
  });
}

function isDestructiveBash(command: string, policy: { destructiveBash: string[] }, mode: GuardMode): boolean {
  const segments = splitBashSegments(command);
  for (const segment of segments) {
    const info = buildBashCommandInfo(segment);
    if (!info) {
      continue;
    }

    const matchedRule = DESTRUCTIVE_BASH_RULES.some(rule => {
      if (mode === 'warn' && rule.minMode === 'block') {
        return false;
      }
      return rule.match(info);
    });

    if (matchedRule) {
      return true;
    }

    if (matchPolicyEntries(info, policy.destructiveBash)) {
      return true;
    }
  }

  return false;
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
      if (isDestructiveBash(command, policy, mode)) {
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
      allowed: false,
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
