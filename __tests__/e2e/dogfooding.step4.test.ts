
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'path';
import fs from 'fs';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import SddGatekeeper from '../../.opencode/plugins/sdd-gatekeeper';
import sddStartTask from '../../.opencode/tools/sdd_start_task';
import sddRequestSpecChange from '../../.opencode/tools/sdd_request_spec_change';
import { writeGuardModeState } from '../../.opencode/lib/state-utils';

describe('E2E: Hello World Scenario (Step 4)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = setupTestState();
    // Guard mode を block に設定して厳密に検証
    await writeGuardModeState({ 
      mode: 'block',
      updatedAt: new Date().toISOString(),
      updatedBy: 'test-runner'
    });

    // テスト用の tasks.md を作成
    const tasksMdPath = process.env.SDD_TASKS_PATH!;
    const tasksContent = `
# Tasks

* [ ] HW-1: Hello World Implementer (Scope: \`src/hello/**\`)
* [ ] HW-2: Hello World Architect (Scope: \`src/hello/**\`)
`;
    fs.writeFileSync(tasksMdPath, tasksContent, 'utf-8');

    // .kiro ディレクトリの準備（存在しないとエラーになる可能性があるため）
    const kiroDir = process.env.SDD_KIRO_DIR!;
    const kiroSpecsDir = path.join(kiroDir, 'specs', 'hello-world');
    fs.mkdirSync(kiroSpecsDir, { recursive: true });
    // ダミーの仕様ファイル
    fs.writeFileSync(path.join(kiroSpecsDir, 'tasks.md'), '# Kiro Tasks', 'utf-8');
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('Implementer flow: blocked on .kiro edit, allowed to request spec change', async () => {
    // 1. Implementerとしてタスク開始
    await sddStartTask.execute(
      { taskId: 'HW-1', role: 'implementer' },
      {} as any // Dummy context
    );

    // Gatekeeperの初期化
    const gatekeeper = await SddGatekeeper({ 
      client: {},
      project: {},
      directory: tmpDir,
      worktree: tmpDir,
      serverUrl: new URL('http://localhost'),
      $: {} 
    } as any);
    // Gatekeeperの実装は1引数の独自イベント構造を期待しているため、型定義(2引数)を無視して呼び出す
    const beforeHook = gatekeeper['tool.execute.before'] as any;
    if (!beforeHook) throw new Error('Gatekeeper hook not found');

    // 2. .kiro/** への書き込み試行 -> Blockされるべき
    // 絶対パスで指定する (Gatekeeper内部でnormalizeされるため)
    const kiroFilePath = path.join(process.env.SDD_KIRO_DIR!, 'specs', 'hello-world', 'tasks.md');
    
    const editKiroEvent = {
      tool: {
        name: 'edit',
        args: { filePath: kiroFilePath, newString: 'foo', oldString: 'bar' }
      }
    };

    // 期待: ROLE_DENIED (Implementerは.kiroを触れない)
    await expect(beforeHook(editKiroEvent)).rejects.toThrow('ROLE_DENIED');

    // 3. 仕様変更申請 (sdd_request_spec_change)
    const reason = 'Cannot implement X without Y';
    const proposal = 'Add Y to specs';
    
    const resultMsg = await sddRequestSpecChange.execute(
      { reason, proposal },
      {} as any // Dummy context
    );
    
    expect(resultMsg).toContain('仕様変更リクエストを作成しました');

    // ファイル生成確認
    const pendingChangesDir = path.join(process.env.SDD_KIRO_DIR!, 'pending-changes');
    const files = fs.readdirSync(pendingChangesDir);
    expect(files.length).toBe(1);
    
    const content = fs.readFileSync(path.join(pendingChangesDir, files[0]), 'utf-8');
    expect(content).toContain(reason);
    expect(content).toContain(proposal);
    // Markdownフォーマットに合わせて修正
    expect(content).toContain('**Task ID**: HW-1');
  });

  test('Architect flow: allowed on .kiro edit, blocked on src code edit', async () => {
    // 1. Architectとしてタスク開始
    await sddStartTask.execute(
      { taskId: 'HW-2', role: 'architect' },
      {} as any // Dummy context
    );

    const gatekeeper = await SddGatekeeper({ 
      client: {},
      project: {},
      directory: tmpDir,
      worktree: tmpDir,
      serverUrl: new URL('http://localhost'),
      $: {} 
    } as any);
    // Gatekeeperの実装は1引数の独自イベント構造を期待しているため、型定義(2引数)を無視して呼び出す
    const beforeHook = gatekeeper['tool.execute.before'] as any;
    if (!beforeHook) throw new Error('Gatekeeper hook not found');

    // 2. .kiro/** への書き込み試行 -> 許可されるべき
    const kiroFilePath = path.join(process.env.SDD_KIRO_DIR!, 'specs', 'hello-world', 'tasks.md');
    
    const editKiroEvent = {
      tool: {
        name: 'edit',
        args: { filePath: kiroFilePath, newString: 'updated', oldString: 'original' }
      }
    };

    // 期待: エラーにならない
    try {
      await beforeHook(editKiroEvent);
    } catch (e: any) {
      console.error('Unexpected error in Architect flow (.kiro edit):', e);
      throw e;
    }

    // 3. src/** (通常コード) への書き込み試行 -> Blockされるべき
    // 要件: "Architect は .kiro/** 以外への edit が ROLE_DENIED でブロックされる"
    const srcFilePath = path.resolve(tmpDir, 'src/hello/main.ts'); // tmpDir配下の擬似パス
    // 注意: setupTestStateで作られるのはディレクトリだけなので、srcディレクトリは存在しないが、
    // Gatekeeperのチェックはパスベースなのでファイル実体はなくても動くはず（readState等はmock不要）
    
    const editSrcEvent = {
      tool: {
        name: 'edit',
        args: { filePath: srcFilePath, newString: 'code', oldString: '' }
      }
    };

    // 期待: ROLE_DENIED (Architectは実装コードを触れない)
    // 注意: Scopeに含まれていても Role で弾かれるかどうかがポイント
    // HW-ARCH の Scope は `src/hello/**` だが、Architectロールのポリシーにより弾かれるはず
    await expect(beforeHook(editSrcEvent)).rejects.toThrow('ROLE_DENIED');
  });
});
