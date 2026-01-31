// Simple file-based lock implementation to avoid proper-lockfile Bun 1.3.5 crash
import fs from 'fs';
import path from 'path';
import os from 'os';
import { rotateBackup, getBackupPaths } from './backup-utils';

const DEFAULT_STATE_DIR = '.opencode/state';
const LOCK_DIR_NAME = '.lock';
const LOCK_INFO_NAME = '.lock-info.json';

export function getStateDir(): string {
  return process.env.SDD_STATE_DIR || DEFAULT_STATE_DIR;
}

export function getStatePath(): string {
  return `${getStateDir()}/current_context.json`;
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
}

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

export async function writeState(state: State): Promise<void> {
  const statePath = getStatePath();
  const release = await lockStateDir(state.activeTaskId);
  try {
    rotateBackup(statePath);
    // Use fs.writeFileSync instead of write-file-atomic to avoid potential Bun issues
    const tmpPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
    fs.renameSync(tmpPath, statePath);
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
    typeof s.validationAttempts === 'number' && Number.isFinite(s.validationAttempts)
  );
}

function tryParseState(filePath: string): { ok: true; state: State } | { ok: false; error: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (validateState(parsed)) {
      // Migration: Inject default role if missing
      if (!('role' in parsed)) {
        (parsed as any).role = null;
      }
      return { ok: true, state: parsed as State };
    }
    return { ok: false, error: 'Invalid state schema' };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function readState(): Promise<StateResult> {
  const stateDir = getStateDir();
  const statePath = getStatePath();

  if (!fs.existsSync(statePath)) {
    return { status: 'not_found' };
  }

  const result = tryParseState(statePath);
  if (result.ok) {
    return { status: 'ok', state: result.state };
  }

  console.warn(`[SDD] State corrupted: ${result.error}. Attempting recovery from backup...`);

  const backupPaths = getBackupPaths(statePath);
  for (const backupPath of backupPaths) {
    if (!fs.existsSync(backupPath)) continue;

    const backupResult = tryParseState(backupPath);
    if (backupResult.ok) {
      const release = await lockStateDir();
      try {
        // Check current state again after acquiring lock (avoid TOCTOU)
        const current = tryParseState(statePath);
        if (current.ok) {
          return { status: 'ok', state: current.state };
        }

        fs.copyFileSync(backupPath, statePath);
        console.warn(`[SDD] State recovered from ${backupPath}`);
        return { status: 'recovered', state: backupResult.state, fromBackup: backupPath };
      } finally {
        await release();
      }
    }
  }

  console.warn('[SDD] No valid backup found. State is corrupted.');
  return { status: 'corrupted', error: result.error };
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
    console.warn(`[SDD] Failed to lock state dir during clearState: ${(e as Error).message}`);
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
