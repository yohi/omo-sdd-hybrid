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
  return process.env.SDD_STATE_DIR || DEFAULT_STATE_DIR;
}

export function getStatePath(): string {
  return `${getStateDir()}/current_context.json`;
}

export function getTasksPath(): string {
  return process.env.SDD_TASKS_PATH || 'specs/tasks.md';
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
  return `${getStateDir()}/${LOCK_DIR_NAME}`;
}

function getLockInfoPath(): string {
  return `${getStateDir()}/${LOCK_INFO_NAME}`;
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

function readTasksMdHash(): string {
  const tasksPath = getTasksPath();
  if (!fs.existsSync(tasksPath)) {
    throw new Error(`E_TASKS_NOT_FOUND: ${tasksPath} が見つかりません`);
  }
  const content = fs.readFileSync(tasksPath, 'utf-8');
  return computeTasksMdHashFromContent(content);
}

function getStateHmacKey(): string {
  const envKey = process.env.SDD_STATE_HMAC_KEY;
  if (envKey && envKey.trim() !== '') return envKey.trim();

  const stateDir = getStateDir();
  const keyPath = path.join(stateDir, STATE_HMAC_KEY_NAME);

  // If file exists and has content, use it.
  // Note: There's still a small race if file is empty (being written), handled by retry below.
  if (fs.existsSync(keyPath)) {
    const content = fs.readFileSync(keyPath, 'utf-8').trim();
    if (content) return content;
  }

  if (!fs.existsSync(stateDir)) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
    } catch { /* ignore if already exists */ }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  
  try {
    // Atomic creation: fails if file exists
    fs.writeFileSync(keyPath, generated, { mode: 0o600, flag: 'wx' });
    return generated;
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      // Race condition: another process created it. Read it.
      // Retry a few times in case the other process is still writing (empty file)
      for (let i = 0; i < 5; i++) {
        try {
          const content = fs.readFileSync(keyPath, 'utf-8').trim();
          if (content) return content;
        } catch { /* ignore read errors temporarily */ }
        // Busy wait (synchronous sleep)
        const start = Date.now();
        while (Date.now() - start < 10); 
      }
      throw new Error(`Failed to read HMAC key after atomic creation race: ${keyPath}`);
    }
    throw error;
  }
}

export function computeStateHash(state: StateInput): string {
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

  const key = getStateHmacKey();
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
    } catch (error: any) {
      if (error.code === 'EEXIST') {
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
  const statePath = getStatePath();
  const release = await lockStateDir(state.activeTaskId);
  try {
    const tasksMdHash = state.tasksMdHash && state.tasksMdHash.trim() !== ''
      ? state.tasksMdHash
      : readTasksMdHash();
    const role = state.role ?? null;
    const stateHash = computeStateHash({ ...state, tasksMdHash, role });
    const stateToWrite: State = {
      ...state,
      role,
      tasksMdHash,
      stateHash,
    };

    rotateBackup(statePath);
    // Use fs.writeFileSync instead of write-file-atomic to avoid potential Bun issues
    const tmpPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(stateToWrite, null, 2));
    fs.renameSync(tmpPath, statePath);
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

function tryParseState(filePath: string): { ok: true; state: State } | { ok: false; error: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    // Migration: validateStateを通過させるために、不足しているハッシュを注入する。
    // これにより、ハッシュを持たないレガシーなstateファイルを読み込み時に移行できる。
    // ここでハッシュを計算するため、verifyStateIntegrityを通過するようになる。
    const mutable = parsed as Record<string, unknown>;
    if (!mutable.tasksMdHash || !mutable.stateHash) {
      try {
        if (!mutable.tasksMdHash) {
          mutable.tasksMdHash = readTasksMdHash();
        }
        // stateハッシュを計算する前にroleが正規化されていることを確認する
        if (!('role' in mutable)) {
          mutable.role = null;
        }
        if (!mutable.stateHash) {
          // 注入されたtasksMdHashとその他のフィールド（欠損や無効な可能性があってもcomputeStateHashは処理する）
          // を使用してstateハッシュの計算を試みる
          mutable.stateHash = computeStateHash(mutable as StateInput);
        }
      } catch (e) {
        // readTasksMdHashが失敗した場合（例: tasks.mdが見つからない）、移行はできない。
        // エラーは無視し、validateStateを失敗させる。
      }
    }

    if (validateState(parsed)) {
      // Migration: roleが不足している場合にデフォルト値を注入（上記でも処理しているが、安全策/フォールバックとして保持）
      if (!('role' in parsed)) {
        const mutable = parsed as Record<string, unknown>;
        mutable.role = null;
      }
      const state = parsed as State;
      return { ok: true, state };
    }
    return { ok: false, error: 'Invalid state schema' };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function verifyStateIntegrity(state: State): { ok: true } | { ok: false; error: string } {
  let currentTasksHash: string;
  try {
    currentTasksHash = readTasksMdHash();
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  if (state.tasksMdHash !== currentTasksHash) {
    return { ok: false, error: 'TASKS_HASH_MISMATCH' };
  }

  const expected = computeStateHash(state);
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

  const result = tryParseState(statePath);
  if (result.ok) {
    const integrity = verifyStateIntegrity(result.state);
    if (integrity.ok) {
      return { status: 'ok', state: result.state };
    }
    corruptionReason = integrity.error;
    appendStateAuditLog(`STATE_CORRUPTED: ${integrity.error}`);
    logger.warn(`[SDD] State corrupted: ${integrity.error}. Attempting recovery from backup...`);
  } else {
    corruptionReason = result.error;
    appendStateAuditLog(`STATE_CORRUPTED_PARSE: ${result.error}`);
    logger.warn(`[SDD] State corrupted: ${result.error}. Attempting recovery from backup...`);
  }

  const backupPaths = getBackupPaths(statePath);
  for (const backupPath of backupPaths) {
    if (!fs.existsSync(backupPath)) continue;

    const backupResult = tryParseState(backupPath);
    if (backupResult.ok) {
      const integrity = verifyStateIntegrity(backupResult.state);
      if (!integrity.ok) {
        continue;
      }
      const release = await lockStateDir();
      try {
        // Check current state again after acquiring lock (avoid TOCTOU)
        const current = tryParseState(statePath);
        if (current.ok) {
          const currentIntegrity = verifyStateIntegrity(current.state);
          if (currentIntegrity.ok) {
            return { status: 'ok', state: current.state };
          }
        }
        fs.copyFileSync(backupPath, statePath);
        logger.warn(`[SDD] State recovered from ${backupPath}`);
        appendStateAuditLog(`STATE_RECOVERED: from=${backupPath}`);
        return { status: 'recovered', state: backupResult.state, fromBackup: backupPath };
      } finally {
        await release();
      }
    } else {
      appendStateAuditLog(`STATE_CORRUPTED_PARSE_BACKUP: file=${path.basename(backupPath)} error=${backupResult.error}`);
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

export type GuardMode = 'warn' | 'block';

export interface GuardModeState {
  mode: GuardMode;
  updatedAt: string;
  updatedBy: string;
}

export function getGuardModePath(): string {
  return `${getStateDir()}/guard-mode.json`;
}

export async function readGuardModeState(): Promise<GuardModeState | null> {
  const filePath = getGuardModePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && (parsed.mode === 'warn' || parsed.mode === 'block')) {
      return parsed as GuardModeState;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeGuardModeState(state: GuardModeState): Promise<void> {
  const statePath = getGuardModePath();
  const release = await lockStateDir();
  try {
    // Use fs.writeFileSync + rename for atomic write
    const tmpPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
    fs.renameSync(tmpPath, statePath);
  } finally {
    await release();
  }
}
