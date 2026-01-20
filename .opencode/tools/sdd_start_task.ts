import { tool } from '../lib/plugin-stub';
import { parseTasksFile } from '../lib/tasks-parser';
import { writeState } from '../lib/state-utils';
import fs from 'fs';

const TASKS_PATH = 'specs/tasks.md';

export default tool({
  description: 'タスクを開始し、編集可能なスコープを設定します',
  args: {
    taskId: tool.schema.string().describe('開始するタスクID (例: Task-1)')
  },
  async execute({ taskId }) {
    if (!fs.existsSync(TASKS_PATH)) {
      throw new Error(`E_TASKS_NOT_FOUND: ${TASKS_PATH} が見つかりません`);
    }
    
    const content = fs.readFileSync(TASKS_PATH, 'utf-8');
    const tasks = parseTasksFile(content);
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) {
      throw new Error(`E_TASK_NOT_FOUND: ${taskId} が見つかりません`);
    }
    
    if (task.done) {
      throw new Error(`E_TASK_ALREADY_DONE: ${taskId} は既に完了しています`);
    }
    
    if (task.scopes.length === 0) {
      throw new Error(`E_SCOPE_MISSING: ${taskId} に Scope が定義されていません`);
    }
    
    await writeState({
      version: 1,
      activeTaskId: task.id,
      activeTaskTitle: task.title,
      allowedScopes: task.scopes,
      startedAt: new Date().toISOString(),
      startedBy: 'sdd_start_task'
    });
    
    return `タスク開始: ${task.id}
タイトル: ${task.title}
許可スコープ: ${task.scopes.join(', ')}
State: .opencode/state/current_context.json`;
  }
});
