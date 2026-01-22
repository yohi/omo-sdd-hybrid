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

export async function writeState(state: State): Promise<void> {
  const stateDir = getStateDir();
  const statePath = getStatePath();

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  
  const release = await lockfile.lock(stateDir, { 
    retries: 5,
    stale: 10000
  });
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
      const release = await lockfile.lock(stateDir, { 
        retries: 5,
        stale: 10000
      });
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
