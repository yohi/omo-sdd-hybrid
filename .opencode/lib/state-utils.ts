import lockfile from 'proper-lockfile';
import writeFileAtomic from 'write-file-atomic';
import fs from 'fs';
import { rotateBackup, getBackupPaths } from './backup-utils';

const DEFAULT_STATE_DIR = '.opencode/state';

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
}

export type StateResult = 
  | { status: 'ok'; state: State }
  | { status: 'not_found' }
  | { status: 'corrupted'; error: string }
  | { status: 'recovered'; state: State; fromBackup: string };

export function getLockOptions(): lockfile.LockOptions {
  const stale = parseInt(process.env.SDD_LOCK_STALE || '30000', 10);
  // Default: retry 10 times, wait 4s each = 40s total coverage > 30s stale
  const retries = parseInt(process.env.SDD_LOCK_RETRIES || '10', 10);
  
  return {
    stale,
    retries: {
      retries,
      minTimeout: 4000,
      maxTimeout: 4000
    }
  };
}

export async function lockStateDir(): Promise<() => Promise<void>> {
  const stateDir = getStateDir();
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  
  try {
    return await lockfile.lock(stateDir, getLockOptions());
  } catch (error: any) {
    if (error.code === 'ELOCKED') {
      const lockDir = `${stateDir}/${stateDir.split('/').pop()}.lock`; // simplified guess
      throw new Error(
        `[SDD] Failed to acquire lock on ${stateDir}.\n` +
        `Another process might be active, or a stale lock remains.\n` +
        `We tried waiting for ~40s.\n` +
        `Try running: sdd_force_unlock`
      );
    }
    throw error;
  }
}

export async function writeState(state: State): Promise<void> {
  const statePath = getStatePath();
  const release = await lockStateDir();
  try {
    rotateBackup(statePath);
    await writeFileAtomic(statePath, JSON.stringify(state, null, 2));
  } finally {
    await release();
  }
}

function validateState(state: unknown): state is State {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
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
      return { ok: true, state: parsed };
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

export function clearState(): void {
  const statePath = getStatePath();
  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    getBackupPaths(statePath).forEach(backupPath => {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    });
  } catch { /* noop */ }
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
  const path = getGuardModePath();
  if (!fs.existsSync(path)) return null;
  try {
    const content = fs.readFileSync(path, 'utf-8');
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
    await writeFileAtomic(statePath, JSON.stringify(state, null, 2));
  } finally {
    await release();
  }
}
