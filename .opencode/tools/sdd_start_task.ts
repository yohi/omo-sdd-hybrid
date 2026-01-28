import { tool } from '../lib/plugin-stub';
import { writeState } from '../lib/state-utils';
import fs from 'fs';
import { parseSddTasks } from '../lib/tasks_markdown';

const processLogger = {
  error: (...args: any[]) => console.error(...args),
};

function getTasksPath() {
  return process.env.SDD_TASKS_PATH || 'specs/tasks.md';
}

export class ScopeFormatError extends Error {
  taskId?: string;
  constructor(message: string, taskId?: string) {
    super(message);
    this.name = 'ScopeFormatError';
    this.taskId = taskId;
  }
}

export default tool({
  description: 'タスクを開始し、編集可能なスコープを設定します',
  args: {
    taskId: tool.schema.string().describe('開始するタスクID (例: Task-1)'),
    role: tool.schema.string().optional().describe('ロールを指定 (architect | implementer)')
  },
  async execute({ taskId, role }) {
    const tasksPath = getTasksPath();
    if (!fs.existsSync(tasksPath)) {
      throw new Error(`E_TASKS_NOT_FOUND: ${tasksPath} が見つかりません`);
    }
    
    const content = fs.readFileSync(tasksPath, 'utf-8');

    const result = parseSddTasks(content, { validateScopes: false });
    if (result.errors.length > 0) {
      processLogger.error('[SDD] tasks.md のパースに失敗しました', {
        tasksPath,
        errors: result.errors,
      });
      throw new Error(
        `E_TASKS_PARSE_ERROR: ${tasksPath} の解析に失敗しました。\n` +
          result.errors.map(e => `- L${e.line}: ${e.reason} (${e.content})`).join('\n')
      );
    }

    const { tasks } = result;
    
    try {
      if (process.env.SDD_SCOPE_FORMAT === 'strict') {
        for (const t of tasks) {
          const rawText = t.rawScopeText ? t.rawScopeText.trim() : '';
          const isJustBackticks = rawText.replace(/`/g, '').trim().length === 0;

          if (t.scopes.length === 0 && rawText.length > 0 && !isJustBackticks) {
            throw new ScopeFormatError(`Scope must be enclosed in backticks: ${t.rawScopeText}`, t.id);
          }
        }
      }
    } catch (error: any) {
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
    
    if (task.checked) {
      throw new Error(`E_TASK_ALREADY_DONE: ${taskId} は既に完了しています`);
    }
    
    if (task.scopes.length === 0) {
      throw new Error(`E_SCOPE_MISSING: ${taskId} に Scope が定義されていません`);
    }

    let determinedRole: 'architect' | 'implementer' | null = null;
    if (role) {
      if (role !== 'architect' && role !== 'implementer') {
        throw new Error(`E_INVALID_ROLE: role must be 'architect' or 'implementer', got ${role}`);
      }
      determinedRole = role as 'architect' | 'implementer';
    } else {
      if (/^KIRO-\d+$/.test(taskId)) {
        determinedRole = 'architect';
      } else {
        determinedRole = 'implementer';
      }
    }
    
    await writeState({
      version: 1,
      activeTaskId: task.id,
      activeTaskTitle: task.description,
      allowedScopes: task.scopes,
      startedAt: new Date().toISOString(),
      startedBy: 'sdd_start_task',
      validationAttempts: 0,
      role: determinedRole
    });
    
    return `タスク開始: ${task.id}
タイトル: ${task.description}
ロール: ${determinedRole}
許可スコープ: ${task.scopes.join(', ')}
State: .opencode/state/current_context.json`;
  }
});
