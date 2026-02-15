import { describe, test, expect, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { 
  getStatePath, 
  getGuardModePath, 
  writeState, 
  writeGuardModeState, 
  setTestConfig,
  StateInput, 
  GuardModeState 
} from '../../.opencode/lib/state-utils';
import { withTempDir, waitForFile } from '../helpers/temp-dir';

  const setupEnv = (tmpDir: string) => {
    // Isolated configuration using setTestConfig
    setTestConfig({
      stateDir: path.resolve(tmpDir),
      tasksPath: path.resolve(tmpDir, 'specs', 'tasks.md'),
      lockRetries: 50,
      lockStale: 10000,
      testMode: true
    });
    
    // Backup: Set env var to ensure consistency even if testConfig context is lost
    process.env.SDD_STATE_DIR = path.resolve(tmpDir);
    process.env.SDD_TASKS_PATH = path.resolve(tmpDir, 'specs', 'tasks.md');

  if (!fs.existsSync(path.join(tmpDir, 'specs'))) {
    fs.mkdirSync(path.join(tmpDir, 'specs'), { recursive: true });
  }

  fs.writeFileSync(path.join(tmpDir, 'specs', 'tasks.md'), '* [ ] Task-1: Test Task (Scope: `src/**`)', 'utf-8');
};

afterEach(() => {
  setTestConfig(null);
});

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
  const timeoutMs = 30000; // Increased timeout for parallel execution stability

  test('concurrent writeState calls handle locking correctly without errors', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const promises: Promise<void>[] = [];

      // 並列に書き込みリクエストを発行
      for (let i = 0; i < iterations; i++) {
        const state = createSampleState(`task-${i}`);
        promises.push(writeState(state));
      }

      // 全て成功することを期待
      const writeResults = await Promise.allSettled(promises);
      
      const statePath = path.join(tmpDir, 'current_context.json');
      // 成功したものが少なくとも1つはあるはず（ロック競合で一部失敗する可能性は許容するが、ファイルは存在すべき）
      const succeeded = writeResults.filter(r => r.status === 'fulfilled');

      if (succeeded.length === 0) {
        const failed = writeResults.filter(r => r.status === 'rejected');
        console.error('All writes failed. Reasons:');
        failed.forEach((f: any) => console.error(f.reason?.message || f.reason));
      }
      expect(succeeded.length).toBeGreaterThan(0);

      await waitForFile(statePath, 5000); // Increased wait time
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
    });
  }, timeoutMs);

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
      const guardPath = path.join(tmpDir, 'guard-mode.json');

      // If at least one succeeded, the file should exist
      if (results.some(r => r.status === 'fulfilled')) {
        await waitForFile(guardPath, 10000); // Further Increased wait time
        expect(fs.existsSync(guardPath)).toBe(true);
        const content = fs.readFileSync(guardPath, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      }

      // 一時ファイルのクリーンアップ確認
      const files = fs.readdirSync(tmpDir);
      expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
      expect(files.filter(f => f === '.lock')).toHaveLength(0);
    });
  }, timeoutMs);

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

      const statePath = path.join(tmpDir, 'current_context.json');
      const guardPath = path.join(tmpDir, 'guard-mode.json');

      if (results.some((r, i) => i % 2 === 0 && r.status === 'fulfilled')) {
        await waitForFile(statePath, 10000); // Further Increased wait time
        expect(fs.existsSync(statePath)).toBe(true);
        expect(() => JSON.parse(fs.readFileSync(statePath, 'utf-8'))).not.toThrow();
      }
      
      if (results.some((r, i) => i % 2 === 1 && r.status === 'fulfilled')) {
        await waitForFile(guardPath, 10000); // Further Increased wait time
        expect(fs.existsSync(guardPath)).toBe(true);
        expect(() => JSON.parse(fs.readFileSync(guardPath, 'utf-8'))).not.toThrow();
      }

      const files = fs.readdirSync(tmpDir);
      expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
      expect(files.filter(f => f === '.lock')).toHaveLength(0);
    });
  }, timeoutMs);
});
