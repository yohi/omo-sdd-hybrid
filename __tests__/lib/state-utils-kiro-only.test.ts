import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeState, readState, clearState } from '../../.opencode/lib/state-utils';

describe('state-utils: Kiro統合のみ（specs/tasks.md不在時の動作）', () => {
  let tmpDir: string;
  let originalCwd: string;
  const envKeysToRestore = ['SDD_STATE_DIR', 'SDD_TASKS_PATH'];
  const originalEnvValues = new Map<string, string | undefined>();

  beforeEach(() => {
    originalCwd = process.cwd();
    
    for (const key of envKeysToRestore) {
      originalEnvValues.set(key, process.env[key]);
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omo-sdd-state-kiro-'));
    process.chdir(tmpDir);
    process.env.SDD_STATE_DIR = path.join(tmpDir, '.opencode/state');
    process.env.SDD_TASKS_PATH = path.join(tmpDir, 'specs/tasks.md');
  });

  afterEach(async () => {
    await clearState();
    process.chdir(originalCwd);
    
    for (const key of envKeysToRestore) {
      const originalValue = originalEnvValues.get(key);
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
    originalEnvValues.clear();
    
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('specs/tasks.mdが存在しない場合でも、writeStateが成功する（Kiro統合のみ）', async () => {
    // specs/tasks.mdを作成しない（Kiro統合のみの状態をシミュレート）
    
    await writeState({
      version: 1,
      activeTaskId: 'KIRO-1',
      activeTaskTitle: 'Kiro Task',
      allowedScopes: ['.kiro/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });

    const result = await readState();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.state.activeTaskId).toBe('KIRO-1');
      expect(result.state.tasksMdHash).toBeTruthy();
    }
  });

  test('specs/tasks.md存在 → 削除で、State整合性エラーになる', async () => {
    // Step 1: specs/tasks.mdを作成してStateを保存
    const tasksPath = process.env.SDD_TASKS_PATH!;
    fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');

    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });

    // Step 2: specs/tasks.mdを削除（意図的な破壊）
    fs.unlinkSync(tasksPath);

    // Step 3: readStateで整合性チェック
    const result = await readState();
    
    // 期待: TASKS_HASH_MISMATCHでcorruptedステータスになる
    expect(result.status).toBe('corrupted');
    if (result.status === 'corrupted') {
      expect(result.error).toBe('TASKS_HASH_MISMATCH');
    }
  });

  test('specs/tasks.md不在 → 作成で、新しいハッシュでStateが更新される', async () => {
    // Step 1: specs/tasks.md不在でStateを作成（Kiro統合のみ）
    await writeState({
      version: 1,
      activeTaskId: 'KIRO-1',
      activeTaskTitle: 'Kiro Task',
      allowedScopes: ['.kiro/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });

    const state1 = await readState();
    expect(state1.status).toBe('ok');
    const emptyHash = state1.status === 'ok' ? state1.state.tasksMdHash : '';

    // Step 2: specs/tasks.mdを後から作成
    const tasksPath = process.env.SDD_TASKS_PATH!;
    fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');

    // Step 3: 新しいStateを書き込む
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });

    const state2 = await readState();
    expect(state2.status).toBe('ok');
    if (state2.status === 'ok') {
      expect(state2.state.tasksMdHash).not.toBe(emptyHash);
      expect(state2.state.tasksMdHash).toBeTruthy();
    }
  });

  test('specs/tasks.md存在時は、既存の動作と変わらない', async () => {
    // Step 1: specs/tasks.mdを作成
    const tasksPath = process.env.SDD_TASKS_PATH!;
    fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Test (Scope: `src/**`)');

    // Step 2: Stateを書き込む
    await writeState({
      version: 1,
      activeTaskId: 'Task-1',
      activeTaskTitle: 'Test',
      allowedScopes: ['src/**'],
      startedAt: new Date().toISOString(),
      startedBy: 'test',
      validationAttempts: 0
    });

    // Step 3: Stateを読み込む
    const result = await readState();
    expect(result.status).toBe('ok');

    // Step 4: specs/tasks.mdを変更
    fs.writeFileSync(tasksPath, '* [ ] Task-1: Modified (Scope: `src/**`, `lib/**`)');

    // Step 5: 整合性チェックで失敗することを確認
    const result2 = await readState();
    expect(result2.status).toBe('corrupted');
    if (result2.status === 'corrupted') {
      expect(result2.error).toBe('TASKS_HASH_MISMATCH');
    }
  });
});
