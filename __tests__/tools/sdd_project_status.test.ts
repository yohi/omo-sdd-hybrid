import statusTool from '../../.opencode/tools/sdd_project_status';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import fs from 'fs';
import path from 'path';

describe('sdd_project_status', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTestState();
    fs.mkdirSync(path.join(tmpDir, '.kiro/pending-changes'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.kiro/specs/auth'), { recursive: true });
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('基本的なステータス表示', async () => {
    const tasksContent = `
# Tasks
* [x] Task-1
* [ ] Task-2
    `;
    fs.writeFileSync(path.join(tmpDir, 'tasks.md'), tasksContent);

    fs.writeFileSync(path.join(tmpDir, '.kiro/pending-changes/change-1.md'), 'content');

    const featTasks = `
* [x] Sub-1
* [x] Sub-2
* [ ] Sub-3
    `;
    fs.writeFileSync(path.join(tmpDir, '.kiro/specs/auth/tasks.md'), featTasks);

    const mockStateResult = {
      status: 'ok' as const,
      state: {
        version: 1,
        activeTaskId: 'Task-2',
        activeTaskTitle: 'Implement status',
        allowedScopes: [],
        startedAt: '2023-01-01',
        startedBy: 'user',
        validationAttempts: 0,
        role: 'implementer' as const
      }
    };
    
    const context = {
        __testDeps: {
            readState: async () => mockStateResult
        }
    };

    const output = await statusTool.execute({}, context);

    expect(output).toContain('**進捗 (Root)**: 1/2 (50%)');
    expect(output).toContain('**未処理の変更提案**: 1件');
    expect(output).toContain('**現在のアクティブタスク**: Task-2 (Implement status)');
    expect(output).toContain('**auth**: 2/3 (67%)');
  });

  test('Stateなし、ファイルなしの場合', async () => {
    const context = {
        __testDeps: {
            readState: async () => ({ status: 'not_found' as const })
        }
    };
    
    // tasks.md が存在しない場合は 0/0 になる
    const output = await statusTool.execute({}, context);

    expect(output).toContain('**進捗 (Root)**: 0/0 (0%)');
    expect(output).toContain('**未処理の変更提案**: 0件');
    expect(output).toContain('**現在のアクティブタスク**: なし');
    expect(output).toContain('機能定義なし');
  });
});
