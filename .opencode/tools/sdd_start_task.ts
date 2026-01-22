import { tool } from '../lib/plugin-stub';
import { parseTasksFile, ScopeFormatError, ParsedTask } from '../lib/tasks-parser';
import { writeState } from '../lib/state-utils';
import fs from 'fs';

function getTasksPath() {
  return process.env.SDD_TASKS_PATH || 'specs/tasks.md';
}

export default tool({
  description: 'タスクを開始し、編集可能なスコープを設定します',
  args: {
    taskId: tool.schema.string().describe('開始するタスクID (例: Task-1)')
  },
  async execute({ taskId }) {
    const tasksPath = getTasksPath();
    if (!fs.existsSync(tasksPath)) {
      throw new Error(`E_TASKS_NOT_FOUND: ${tasksPath} が見つかりません`);
    }
    
    const content = fs.readFileSync(tasksPath, 'utf-8');
    
    let tasks: ParsedTask[];
    try {
      tasks = parseTasksFile(content);
    } catch (error) {
      if (error instanceof ScopeFormatError) {
        const failingTaskInfo = error.taskId ? `タスク ${error.taskId}` : 'いずれかのタスク';
        throw new Error(`E_SCOPE_FORMAT: ${failingTaskInfo} の Scope 形式が不正です（リクエストされたタスク: ${taskId}）。\nバッククォートで囲んでください: (Scope: \`path/**\`)\n現在の環境: SDD_SCOPE_FORMAT=${process.env.SDD_SCOPE_FORMAT || 'lenient'}\n元のエラー: ${error.message}`);
      }
      throw error;
    }
    
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
      startedBy: 'sdd_start_task',
      validationAttempts: 0
    });
    
    return `タスク開始: ${task.id}
タイトル: ${task.title}
許可スコープ: ${task.scopes.join(', ')}
State: .opencode/state/current_context.json`;
  }
});
