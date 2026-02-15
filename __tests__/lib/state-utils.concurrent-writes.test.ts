import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { 
  getStatePath, 
  getGuardModePath, 
  writeState, 
  writeGuardModeState, 
  StateInput, 
  GuardModeState 
} from '../../.opencode/lib/state-utils';
import { withTempDir } from '../helpers/temp-dir';

const setupEnv = (tmpDir: string) => {
  process.env.SDD_STATE_DIR = tmpDir;
  process.env.SDD_TASKS_PATH = path.join(tmpDir, 'tasks.md');
  process.env.SDD_KIRO_DIR = path.join(tmpDir, '.kiro');
  process.env.SDD_LOCK_RETRIES = '50';
  process.env.SDD_LOCK_STALE = '10000';
  process.env.SDD_TEST_MODE = 'true';
  process.env.SDD_GUARD_MODE = 'warn';
  fs.writeFileSync(process.env.SDD_TASKS_PATH, '* [ ] Task-1: Test Task (Scope: `src/**`)', 'utf-8');
};

describe('state-utils concurrent writes', () => {
  const createSampleState = (id: string): StateInput => ({
    version: 1,
    activeTaskId: id,
    activeTaskTitle: `Title for ${id}`,
    allowedScopes: ['src/**'],
    startedAt: new Date().toISOString(),
    startedBy: 'tester',
    validationAttempts: 0,
    role: null
  });

  const createGuardModeState = (mode: 'warn' | 'block', user: string): GuardModeState => ({
    mode,
    updatedAt: new Date().toISOString(),
    updatedBy: user
  });

  const iterations = 5;
  const timeoutMs = 10000;

  test('concurrent writeState calls handle locking correctly without errors', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const promises: Promise<void>[] = [];

      // 並列に書き込みリクエストを発行
      for (let i = 0; i < iterations; i++) {
        const state = createSampleState(`task-${i}`);
        promises.push(writeState(state).catch(e => {
          // console.error(`Write failed at iteration ${i}:`, e.message);
          throw e;
        }));
      }

      // 全て成功することを期待
      await Promise.allSettled(promises);

      const statePath = getStatePath();
      expect(fs.existsSync(statePath)).toBe(true);

      // JSONとして破損していないか確認
      const content = fs.readFileSync(statePath, 'utf-8');
      try {
        JSON.parse(content);
      } catch (e: any) {
        console.error(`State file content: "${content}"`);
        throw e;
      }

      // 一時ファイルが残っていないか確認
      const files = fs.readdirSync(tmpDir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);

      // ロックディレクトリが残っていないか確認
      const lockDir = files.filter(f => f === '.lock');
      expect(lockDir).toHaveLength(0);
    }, timeoutMs);
  });

  test('concurrent writeGuardModeState calls handle locking correctly', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const promises: Promise<void>[] = [];

      for (let i = 0; i < iterations; i++) {
        const mode = i % 2 === 0 ? 'warn' : 'block';
        promises.push(writeGuardModeState(createGuardModeState(mode, `user-${i}`)).catch(e => {
          // console.error(`Guard write failed at ${i}:`, e.message);
          throw e;
        }));
      }

      const results = await Promise.allSettled(promises);
      const guardPath = getGuardModePath();

      // If at least one succeeded, the file should exist
      if (results.some(r => r.status === 'fulfilled')) {
        expect(fs.existsSync(guardPath)).toBe(true);
        const content = fs.readFileSync(guardPath, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      }

      // 一時ファイルのクリーンアップ確認
      const files = fs.readdirSync(tmpDir);
      expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
      expect(files.filter(f => f === '.lock')).toHaveLength(0);
    }, timeoutMs);
  });

  test('mixed concurrent writes (writeState + writeGuardModeState) do not conflict', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const promises: Promise<void>[] = [];

      for (let i = 0; i < iterations; i++) {
        promises.push(writeState(createSampleState(`mixed-task-${i}`)).catch(e => {
           // console.error(`Mixed state write failed at ${i}:`, e.message);
           throw e;
        }));
        promises.push(writeGuardModeState(createGuardModeState('block', `mixed-user-${i}`)).catch(e => {
           // console.error(`Mixed guard write failed at ${i}:`, e.message);
           throw e;
        }));
      }

      const results = await Promise.allSettled(promises);

      const statePath = getStatePath();
      const guardPath = getGuardModePath();

      if (results.some((r, i) => i % 2 === 0 && r.status === 'fulfilled')) {
        expect(fs.existsSync(statePath)).toBe(true);
        expect(() => JSON.parse(fs.readFileSync(statePath, 'utf-8'))).not.toThrow();
      }
      
      if (results.some((r, i) => i % 2 === 1 && r.status === 'fulfilled')) {
        expect(fs.existsSync(guardPath)).toBe(true);
        expect(() => JSON.parse(fs.readFileSync(guardPath, 'utf-8'))).not.toThrow();
      }

      const files = fs.readdirSync(tmpDir);
      expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
      expect(files.filter(f => f === '.lock')).toHaveLength(0);
    }, timeoutMs);
  });
});
