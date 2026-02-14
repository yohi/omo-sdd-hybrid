import { tool } from '@opencode-ai/plugin';
import fs from 'fs';
import path from 'path';
import { writeState } from '../lib/state-utils';
import { resolveTask } from '../lib/scope-resolver';
import { parseSddTasks } from '../lib/tasks_markdown';
import { selectRoleForTask } from '../lib/agent-selector';
import { logger } from '../lib/logger.js';



export default tool({
  description: 'タスクを開始し、編集可能なスコープを設定します',
  args: {
    taskId: tool.schema.string().describe('開始するタスクID (例: Task-1)'),
    role: tool.schema.string().optional().describe('ロールを指定 (architect | implementer)')
  },
  async execute({ taskId, role }) {
    // scope-resolver を使用してタスクを解決
    const resolved = resolveTask(taskId);

    if (!resolved) {
      const tasksPath = process.env.SDD_TASKS_PATH || 'specs/tasks.md';
      const kiroSpecsDir = path.join(process.env.SDD_KIRO_DIR || '.kiro', 'specs');

      let hasScopeMd = false;
      if (fs.existsSync(kiroSpecsDir)) {
        try {
          const features = fs.readdirSync(kiroSpecsDir, { withFileTypes: true });
          hasScopeMd = features
            .filter((entry) => entry.isDirectory())
            .some((entry) => fs.existsSync(path.join(kiroSpecsDir, entry.name, 'scope.md')));
        } catch {
          hasScopeMd = false;
        }
      }

      if (!fs.existsSync(tasksPath) && !hasScopeMd) {
        throw new Error(
          'E_TASKS_NOT_FOUND: tasks.md が見つかりません。\n' +
          'sdd_kiro init または sdd_generate_tasks を実行してタスクを生成してください。'
        );
      }

      if (fs.existsSync(tasksPath)) {
        try {
          const content = fs.readFileSync(tasksPath, 'utf-8');
          const { errors } = parseSddTasks(content, { validateScopes: true });
          const relatedError = errors.find((error) => error.content.includes(`${taskId}:`));
          if (relatedError?.reason.includes('Scope が空です')) {
            throw new Error(`E_SCOPE_MISSING: ${taskId} に Scope が定義されていません`);
          }
          if (relatedError?.reason.includes('フォーマットエラー')) {
            throw new Error(
              `E_SCOPE_FORMAT: ${taskId} の Scope 形式が不正です。バッククォートで囲んでください: (Scope: \`path/**\`)`
            );
          }
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('E_')) {
            throw error;
          }
        }
      }

      throw new Error(
        `E_TASK_NOT_FOUND: ${taskId} が見つかりません。\n` +
        `.kiro/specs/*/tasks.md, .kiro/specs/*/scope.md または specs/tasks.md を確認してください。`
      );
    }

    const { task, source, feature } = resolved;
    const sourceInfo = source === 'feature-tasks.md'
      ? `tasks.md (feature: ${feature})`
      : source === 'scope.md'
      ? `${source} (feature: ${feature})`
      : source;

    logger.info(`[SDD] タスク ${taskId} を ${sourceInfo} から解決しました`);

    // 既に完了済みチェックは残す

    if (task.checked) {
      throw new Error(`E_TASK_ALREADY_DONE: ${taskId} は既に完了しています`);
    }

    if (task.scopes.length === 0) {
      const rawScope = task.rawScopeText?.trim();
      if (rawScope && rawScope.replace(/`/g, '').trim().length > 0) {
        throw new Error(
          `E_SCOPE_FORMAT: ${taskId} の Scope 形式が不正です。バッククォートで囲んでください: (Scope: \`path/**\`)`
        );
      }
      throw new Error(`E_SCOPE_MISSING: ${taskId} に Scope が定義されていません`);
    }

    let determinedRole: 'architect' | 'implementer' | null = null;
    if (role) {
      const normalizedRole = role.toLowerCase().trim();
      if (normalizedRole !== 'architect' && normalizedRole !== 'implementer') {
        throw new Error(`E_INVALID_ROLE: role must be 'architect' or 'implementer', got ${role}`);
      }
      determinedRole = normalizedRole as 'architect' | 'implementer';
    } else {
      determinedRole = await selectRoleForTask(task);
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

    return `タスク開始: ${task.id} (source: ${sourceInfo})
タイトル: ${task.description}
ロール: ${determinedRole}
許可スコープ: ${task.scopes.join(', ')}
State: .opencode/state/current_context.json`;
  }
});
