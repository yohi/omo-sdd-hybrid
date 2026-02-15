// Simple file-based lock implementation to avoid proper-lockfile Bun 1.3.5 crash
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { rotateBackup, getBackupPaths } from './backup-utils';
import { logger } from './logger.js';

const DEFAULT_STATE_DIR = '.opencode/state';
const LOCK_DIR_NAME = '.lock';
const LOCK_INFO_NAME = '.lock-info.json';
const STATE_HMAC_KEY_NAME = 'state-hmac.key';
const STATE_AUDIT_LOG_NAME = 'state-audit.log';

export function getStateDir(): string {
  const dir = process.env.SDD_STATE_DIR || DEFAULT_STATE_DIR;
  return path.resolve(dir);
}

export function getStatePath(): string {
  return path.join(getStateDir(), 'current_context.json');
}

export function getTasksPath(): string {
  const p = process.env.SDD_TASKS_PATH || 'specs/tasks.md';
  return path.resolve(p);
}

export interface State {
  version: number;
  activeTaskId: string;
  activeTaskTitle: string;
  allowedScopes: string[];
  startedAt: string;
  startedBy: string;
  validationAttempts: number;
  role: 'architect' | 'implementer' | null;
  tasksMdHash: string;
  stateHash: string;
}

export type StateInput = Omit<State, 'stateHash' | 'tasksMdHash' | 'role'> & {
  tasksMdHash?: string;
  stateHash?: string;
  role?: 'architect' | 'implementer' | null;
};

export interface LockInfo {
  taskId: string | null;
  pid: number;
  host: string;
  startedAt: string;
}

export type StateResult =
  | { status: 'ok'; state: State }
  | { status: 'not_found' }
  | { status: 'corrupted'; error: string }
  | { status: 'recovered'; state: State; fromBackup: string };

// Simple file-based lock utilities
function getLockPath(): string {
  return path.join(getStateDir(), LOCK_DIR_NAME);
}

function getLockInfoPath(): string {
  return path.join(getStateDir(), LOCK_INFO_NAME);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function appendStateAuditLog(message: string): void {
  const stateDir = getStateDir();
  const logPath = path.join(stateDir, STATE_AUDIT_LOG_NAME);

  if (!fs.existsSync(stateDir)) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch {
      return;
    }
  }

  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, entry);
  } catch (e) {
    logger.error('Failed to write state audit log:', e);
  }
}

function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function computeTasksMdHashFromContent(content: string): string {
  return computeSha256(content);
}

async function readTasksMdHash(): Promise<string> {
  const tasksPath = getTasksPath();
  if (!fs.existsSync(tasksPath)) {
    // Kiro統合のみを使用している場合、specs/tasks.mdは存在しない可能性がある
    // その場合は空文字列のハッシュを返す（.kiro/specs/*/scope.mdのみでタスク管理）
    return computeTasksMdHashFromContent('');
  }
  const content = await fs.promises.readFile(tasksPath, 'utf-8');
  return computeTasksMdHashFromContent(content);
}

async function getStateHmacKey(): Promise<string> {
  const envKey = process.env.SDD_STATE_HMAC_KEY;
  if (envKey && envKey.trim() !== '') return envKey.trim();

  const stateDir = getStateDir();
  const keyPath = path.join(stateDir, STATE_HMAC_KEY_NAME);

  // If file exists and has content, use it.
  // Note: There's still a small race if file is empty (being written), handled by retry below.
  if (fs.existsSync(keyPath)) {
    const content = await fs.promises.readFile(keyPath, 'utf-8');
    const trimmed = content.trim();
    if (trimmed) return trimmed;
  }

  if (!fs.existsSync(stateDir)) {
    try {
      await fs.promises.mkdir(stateDir, { recursive: true });
    } catch { /* ignore if already exists */ }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  
  try {
    // Atomic creation: fails if file exists
    // Using synchronous write here for safety with 'wx' flag across processes if possible,
    // but fs.promises.writeFile with 'wx' flag is also fine.
    // However, to match previous logic closely and ensure atomicity:
    await fs.promises.writeFile(keyPath, generated, { mode: 0o600, flag: 'wx' });
    return generated;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'EEXIST') {
      // Race condition: another process created it. Read it.
      // Retry a few times in case the other process is still writing (empty file)
      for (let i = 0; i < 5; i++) {
        try {
          const content = await fs.promises.readFile(keyPath, 'utf-8');
          const trimmed = content.trim();
          if (trimmed) return trimmed;
        } catch { /* ignore read errors temporarily */ }
        
        // Async wait instead of busy wait
        await sleep(10);
      }
      throw new Error(`Failed to read HMAC key after atomic creation race: ${keyPath}`);
    }
    throw error;
  }
}

export async function computeStateHash(state: StateInput): Promise<string> {
  const payload = {
    version: state.version,
    activeTaskId: state.activeTaskId,
    activeTaskTitle: state.activeTaskTitle,
    allowedScopes: state.allowedScopes,
    startedAt: state.startedAt,
    startedBy: state.startedBy,
    validationAttempts: state.validationAttempts,
    role: state.role ?? null,
    tasksMdHash: state.tasksMdHash ?? '',
  };

  const key = await getStateHmacKey();
  return crypto.createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex');
}

function isLockStale(lockPath: string, staleMs: number): boolean {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return true;
  }
}

export function readLockInfo(): LockInfo | null {
  const infoPath = getLockInfoPath();
  if (!fs.existsSync(infoPath)) return null;
  try {
    const content = fs.readFileSync(infoPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (
      parsed &&
      typeof parsed.pid === 'number' &&
      typeof parsed.host === 'string' &&
      (parsed.taskId === null || typeof parsed.taskId === 'string') &&
      typeof parsed.startedAt === 'string'
    ) {
      return parsed as LockInfo;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLockInfo(taskId: string | null): void {
  const infoPath = getLockInfoPath();
  const info: LockInfo = {
    taskId,
    pid: process.pid,
    host: os.hostname(),
    startedAt: new Date().toISOString()
  };
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
}

function removeLockInfo(): void {
  const infoPath = getLockInfoPath();
  try {
    if (fs.existsSync(infoPath)) {
      fs.unlinkSync(infoPath);
    }
  } catch { /* ignore */ }
}

export async function lockStateDir(taskId?: string | null): Promise<() => Promise<void>> {
  const stateDir = getStateDir();
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  const lockPath = getLockPath();
  const isTest = process.env.NODE_ENV === 'test' || process.env.SDD_TEST_MODE === 'true';

  let stale = parseInt(process.env.SDD_LOCK_STALE || '30000', 10);
  if (!Number.isFinite(stale)) stale = 30000;

  let retries = parseInt(process.env.SDD_LOCK_RETRIES || (isTest ? '2' : '10'), 10);
  if (!Number.isFinite(retries)) retries = isTest ? 2 : 10;

  const waitMs = isTest ? 100 : 4000;

  for (let i = 0; i <= retries; i++) {
    try {
      // Atomic directory creation - fails if already exists
      fs.mkdirSync(lockPath);

      // Write owner information
      try {
        writeLockInfo(taskId ?? null);
      } catch (e) {
        try { fs.rmdirSync(lockPath); } catch { /* ignore */ }
        throw e;
      }

      // Lock acquired - return release function
      return async () => {
        try {
          removeLockInfo();
          fs.rmdirSync(lockPath);
        } catch { /* ignore */ }
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'EEXIST') {
        // Lock exists - check if stale
        if (isLockStale(lockPath, stale)) {
          try {
            removeLockInfo();
            fs.rmdirSync(lockPath);
            continue; // Retry immediately
          } catch { /* ignore */ }
        }

        if (i < retries) {
          await sleep(waitMs);
          continue;
        }

        const totalWaitSec = Math.round((retries * waitMs) / 1000);
        throw new Error(
          `[SDD] Failed to acquire lock on ${stateDir}.\n` +
          `Lock path: ${lockPath}\n` +
          `Another process might be active, or a stale lock remains.\n` +
          `We tried waiting for ~${totalWaitSec}s.\n` +
          `Try running: sdd_force_unlock`
        );
      }
      throw error;
    }
  }

  throw new Error('[SDD] Failed to acquire lock: max retries exceeded');
}

export async function writeState(state: StateInput): Promise<void> {
  const currentStatePath = getStatePath();
  const release = await lockStateDir(state.activeTaskId);
  try {
    const currentStateDir = path.dirname(currentStatePath);
    if (!fs.existsSync(currentStateDir)) {
      fs.mkdirSync(currentStateDir, { recursive: true });
    }

    let tasksMdHash = state.tasksMdHash;
    if (!tasksMdHash || tasksMdHash.trim() === '') {
      tasksMdHash = await readTasksMdHash();
    }
    
    const role = state.role ?? null;
    const stateHash = await computeStateHash({ ...state, tasksMdHash, role });
    
    const stateToWrite: State = {
      ...state,
      role,
      tasksMdHash: tasksMdHash!,
      stateHash,
    };

    rotateBackup(currentStatePath);
    const tmpPath = `${currentStatePath}.${process.pid}.${Math.random().toString(36).substring(2)}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(stateToWrite, null, 2));
    fs.renameSync(tmpPath, currentStatePath);

    appendStateAuditLog(`STATE_WRITE: taskId=${stateToWrite.activeTaskId} by=${stateToWrite.startedBy}`);
  } finally {
    await release();
  }
}

function validateState(state: unknown): state is State {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;

  // Check role if present (backward compatibility: allow missing, check valid if present)
  if ('role' in s) {
    if (s.role !== 'architect' && s.role !== 'implementer' && s.role !== null) {
      return false;
    }
  }

  return (
    typeof s.version === 'number' && Number.isFinite(s.version) &&
    typeof s.activeTaskId === 'string' && s.activeTaskId.trim() !== '' &&
    typeof s.activeTaskTitle === 'string' && s.activeTaskTitle.trim() !== '' &&
    Array.isArray(s.allowedScopes) &&
    typeof s.startedAt === 'string' && s.startedAt.trim() !== '' &&
    typeof s.startedBy === 'string' && s.startedBy.trim() !== '' &&
    typeof s.validationAttempts === 'number' && Number.isFinite(s.validationAttempts) &&
    typeof s.tasksMdHash === 'string' && s.tasksMdHash.trim() !== '' &&
    typeof s.stateHash === 'string' && s.stateHash.trim() !== ''
  );
}

// Pure parsing logic only
function tryParseState(filePath: string): { ok: true; content: unknown } | { ok: false; error: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return { ok: true, content: parsed };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

// Separated migration logic
async function migrateState(parsed: unknown): Promise<{ ok: true; state: State } | { ok: false; error: string }> {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Invalid JSON object' };
  }

  const mutable = parsed as Record<string, unknown>;

  // Legacy Migration: Inject missing hashes
  if (!mutable.tasksMdHash || !mutable.stateHash) {
    try {
      if (!mutable.tasksMdHash) {
        mutable.tasksMdHash = await readTasksMdHash();
      }
      // Normalize role
      if (!('role' in mutable)) {
        mutable.role = null;
      }
      if (!mutable.stateHash) {
        mutable.stateHash = await computeStateHash(mutable as StateInput);
      }
    } catch (e) {
      // If migration fails (e.g. cannot read tasks.md), schema validation will fail below
    }
  }

  if (validateState(mutable)) {
    // Inject default role if missing (for safety)
    if (!('role' in mutable)) {
      mutable.role = null;
    }
    return { ok: true, state: mutable as State };
  }
  
  return { ok: false, error: 'Invalid state schema after migration attempt' };
}

async function verifyStateIntegrity(state: State): Promise<{ ok: true } | { ok: false; error: string }> {
  let currentTasksHash: string;
  try {
    currentTasksHash = await readTasksMdHash();
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  if (state.tasksMdHash !== currentTasksHash) {
    return { ok: false, error: 'TASKS_HASH_MISMATCH' };
  }

  const expected = await computeStateHash(state);
  if (state.stateHash !== expected) {
    return { ok: false, error: 'STATE_HASH_MISMATCH' };
  }

  return { ok: true };
}

export async function readState(): Promise<StateResult> {
  const statePath = getStatePath();

  if (!fs.existsSync(statePath)) {
    return { status: 'not_found' };
  }

  let corruptionReason: string | null = null;

  const parseResult = tryParseState(statePath);
  if (parseResult.ok) {
    const migrationResult = await migrateState(parseResult.content);
    if (migrationResult.ok) {
      const integrity = await verifyStateIntegrity(migrationResult.state);
      if (integrity.ok) {
        return { status: 'ok', state: migrationResult.state };
      }
      corruptionReason = integrity.error;
      appendStateAuditLog(`STATE_CORRUPTED: ${integrity.error}`);
      logger.warn(`[SDD] State corrupted: ${integrity.error}. Attempting recovery from backup...`);
    } else {
       corruptionReason = migrationResult.error;
       appendStateAuditLog(`STATE_CORRUPTED_SCHEMA: ${migrationResult.error}`);
       logger.warn(`[SDD] State schema invalid: ${migrationResult.error}. Attempting recovery from backup...`);
    }
  } else {
    corruptionReason = parseResult.error;
    appendStateAuditLog(`STATE_CORRUPTED_PARSE: ${parseResult.error}`);
    logger.warn(`[SDD] State corrupted: ${parseResult.error}. Attempting recovery from backup...`);
  }

  const backupPaths = getBackupPaths(statePath);
  for (const backupPath of backupPaths) {
    if (!fs.existsSync(backupPath)) continue;

    const backupParse = tryParseState(backupPath);
    if (backupParse.ok) {
      const backupMigration = await migrateState(backupParse.content);
      if (backupMigration.ok) {
        const integrity = await verifyStateIntegrity(backupMigration.state);
        if (!integrity.ok) {
          continue;
        }
        const release = await lockStateDir();
        try {
          // Check current state again after acquiring lock (avoid TOCTOU)
          const currentParse = tryParseState(statePath);
          if (currentParse.ok) {
             const currentMigration = await migrateState(currentParse.content);
             if (currentMigration.ok) {
                const currentIntegrity = await verifyStateIntegrity(currentMigration.state);
                if (currentIntegrity.ok) {
                  return { status: 'ok', state: currentMigration.state };
                }
             }
          }
          
          fs.copyFileSync(backupPath, statePath);
          logger.warn(`[SDD] State recovered from ${backupPath}`);
          appendStateAuditLog(`STATE_RECOVERED: from=${backupPath}`);
          return { status: 'recovered', state: backupMigration.state, fromBackup: backupPath };
        } finally {
          await release();
        }
      }
    } else {
      appendStateAuditLog(`STATE_CORRUPTED_PARSE_BACKUP: file=${path.basename(backupPath)} error=${backupParse.error}`);
    }
  }

  logger.warn('[SDD] No valid backup found. State is corrupted.');
  return { status: 'corrupted', error: corruptionReason ?? 'UNKNOWN' };
}

export async function clearState(): Promise<void> {
  const statePath = getStatePath();
  const stateDir = getStateDir();

  // If stateDir doesn't exist, nothing to clear
  if (!fs.existsSync(stateDir)) {
    return;
  }

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockStateDir();
  } catch (e) {
    logger.warn(`[SDD] Failed to lock state dir during clearState: ${(e as Error).message}`);
    throw e;
  }

  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    getBackupPaths(statePath).forEach(backupPath => {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    });
  } catch { /* noop */ } finally {
    if (release) await release();
  }
}

export type GuardMode = 'warn' | 'block' | 'disabled';

export interface GuardModeState {
  mode: GuardMode;
  updatedAt: string;
  updatedBy: string;
}

export function getGuardModePath(): string {
  const dir = getStateDir();
  return path.join(dir, 'guard-mode.json');
}

export async function writeGuardModeState(state: GuardModeState): Promise<void> {
  const currentGuardPath = getGuardModePath();
  const release = await lockStateDir();
  try {
    const targetDir = path.dirname(currentGuardPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const tmpPath = `${currentGuardPath}.${process.pid}.${Math.random().toString(36).substring(2)}.tmp`;
    
    // Write and flush (using sync for reliability in tests)
    const fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, JSON.stringify(state, null, 2));
    
    // Only attempt fsync if we have a valid fd and the function exists
    // Note: Node's fs.fsyncSync exists, Bun's might differ but usually supports it
    try {
      if (typeof (fs as any).fsyncSync === 'function') {
        (fs as any).fsyncSync(fd);
      }
    } catch (e) {
      // Ignore fsync errors (e.g. if file system doesn't support it)
    }
    
    fs.closeSync(fd);
    
    // Ensure write is settled before rename
    if (!fs.existsSync(tmpPath)) {
        throw new Error(`[SDD] Failed to create temp file: ${tmpPath}`);
    }

    fs.renameSync(tmpPath, currentGuardPath);
  } finally {
    await release();
  }
}

export async function readGuardModeState(): Promise<GuardModeState | null> {
  const filePath = getGuardModePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content || content.trim() === '') return null; // Avoid empty file issues
    const parsed = JSON.parse(content);
    if (parsed && (parsed.mode === 'warn' || parsed.mode === 'block' || parsed.mode === 'disabled')) {
      return parsed as GuardModeState;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use writeGuardModeState instead to ensure proper locking.
 * This is for internal use within the same process where lock is already held.
 */
export function writeGuardModeStateSync(state: GuardModeState): void {
  const currentGuardPath = getGuardModePath();
  const targetDir = path.dirname(currentGuardPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const tmpPath = `${currentGuardPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, currentGuardPath);
}
