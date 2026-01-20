import lockfile from 'proper-lockfile';
import writeFileAtomic from 'write-file-atomic';
import fs from 'fs';

const STATE_DIR = '.opencode/state';
const STATE_PATH = `${STATE_DIR}/current_context.json`;

export interface State {
  version: number;
  activeTaskId: string;
  activeTaskTitle: string;
  allowedScopes: string[];
  startedAt: string;
  startedBy: string;
}

export type StateResult = 
  | { status: 'ok'; state: State }
  | { status: 'not_found' }
  | { status: 'corrupted'; error: string };

export async function writeState(state: State): Promise<void> {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  
  const release = await lockfile.lock(STATE_DIR, { 
    retries: 5,
    stale: 10000
  });
  try {
    await writeFileAtomic(STATE_PATH, JSON.stringify(state, null, 2));
  } finally {
    await release();
  }
}

export function readState(): StateResult {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return { status: 'not_found' };
    }
    
    const content = fs.readFileSync(STATE_PATH, 'utf-8');
    const state = JSON.parse(content);
    
    if (
      typeof state.version !== 'number' || !Number.isFinite(state.version) ||
      typeof state.activeTaskId !== 'string' || state.activeTaskId.trim() === '' ||
      typeof state.activeTaskTitle !== 'string' || state.activeTaskTitle.trim() === '' ||
      !Array.isArray(state.allowedScopes) ||
      typeof state.startedAt !== 'string' || state.startedAt.trim() === '' ||
      typeof state.startedBy !== 'string' || state.startedBy.trim() === ''
    ) {
      return { status: 'corrupted', error: 'Invalid state schema' };
    }
    
    return { status: 'ok', state };
  } catch (error) {
    return { status: 'corrupted', error: (error as Error).message };
  }
}

export function clearState(): void {
  try {
    if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  } catch { /* noop */ }
}
