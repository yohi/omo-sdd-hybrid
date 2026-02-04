import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import { 
  getStatePath, 
  getGuardModePath, 
  writeState, 
  writeGuardModeState, 
  StateInput, 
  GuardModeState 
} from '../../.opencode/lib/state-utils';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

describe('state-utils concurrent writes', () => {
  let stateDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    stateDir = setupTestState();
    // 並列実行時のロック競合に耐えられるようにリトライ回数を増やす
    process.env.SDD_LOCK_RETRIES = '50';
    process.env.SDD_LOCK_STALE = '10000';
  });

  afterEach(() => {
    cleanupTestState();
    process.env = { ...originalEnv };
  });

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

  test('concurrent writeState calls handle locking correctly without errors', async () => {
    const iterations = 20;
    const promises: Promise<void>[] = [];

    // 並列に書き込みリクエストを発行
    for (let i = 0; i < iterations; i++) {
      const state = createSampleState(`task-${i}`);
      promises.push(writeState(state));
    }

    // 全て成功することを期待
    await Promise.all(promises);

    const statePath = getStatePath();
    expect(fs.existsSync(statePath)).toBe(true);

    // JSONとして破損していないか確認
    const content = fs.readFileSync(statePath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();

    // 一時ファイルが残っていないか確認
    const files = fs.readdirSync(stateDir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);

    // ロックディレクトリが残っていないか確認
    const lockDir = files.filter(f => f === '.lock');
    expect(lockDir).toHaveLength(0);
  });

  test('concurrent writeGuardModeState calls handle locking correctly', async () => {
    const iterations = 20;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < iterations; i++) {
      const mode = i % 2 === 0 ? 'warn' : 'block';
      promises.push(writeGuardModeState(createGuardModeState(mode, `user-${i}`)));
    }

    await Promise.all(promises);

    const guardPath = getGuardModePath();
    expect(fs.existsSync(guardPath)).toBe(true);

    const content = fs.readFileSync(guardPath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();

    // 一時ファイルのクリーンアップ確認
    const files = fs.readdirSync(stateDir);
    expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
    expect(files.filter(f => f === '.lock')).toHaveLength(0);
  });

  test('mixed concurrent writes (writeState + writeGuardModeState) do not conflict', async () => {
    const iterations = 20;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < iterations; i++) {
      promises.push(writeState(createSampleState(`mixed-task-${i}`)));
      promises.push(writeGuardModeState(createGuardModeState('block', `mixed-user-${i}`)));
    }

    await Promise.all(promises);

    const statePath = getStatePath();
    const guardPath = getGuardModePath();

    expect(fs.existsSync(statePath)).toBe(true);
    expect(fs.existsSync(guardPath)).toBe(true);

    expect(() => JSON.parse(fs.readFileSync(statePath, 'utf-8'))).not.toThrow();
    expect(() => JSON.parse(fs.readFileSync(guardPath, 'utf-8'))).not.toThrow();

    const files = fs.readdirSync(stateDir);
    expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
    expect(files.filter(f => f === '.lock')).toHaveLength(0);
  });
});
