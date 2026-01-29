import { tool } from '../lib/plugin-stub';
import fs from 'fs';
import path from 'path';
import { parseSddTasks } from '../lib/tasks_markdown';

function getTasksPath(feature?: string) {
  const baseDir = '.kiro/specs';
  const resolvedBase = path.resolve(baseDir);

  if (process.env.SDD_TASKS_PATH) {
    const resolvedEnv = path.resolve(process.env.SDD_TASKS_PATH);
    if (resolvedEnv.includes('\0') || resolvedEnv.includes('..') || !resolvedEnv.startsWith(resolvedBase)) {
       throw new Error(`Access Denied: Path traversal detected. SDD_TASKS_PATH '${resolvedEnv}' is outside base '${resolvedBase}'`);
    }
    return resolvedEnv;
  }

  // Sanitize feature input
  const featureName = feature || 'default';
  
  // Basic sanity check for null bytes and obvious traversal attempts
  if (featureName.includes('\0') || featureName.includes('..')) {
    throw new Error('Invalid feature name: contains forbidden characters or segments');
  }

  const candidatePath = path.join(baseDir, featureName, 'tasks.md');
  const resolvedPath = path.resolve(candidatePath);

  // Path Traversal Protection: Ensure resolved path is still within the base directory
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error(`Access Denied: Path traversal detected. Resolved path '${resolvedPath}' is outside base '${resolvedBase}'`);
  }

  return resolvedPath;
}

export default tool({
  description: '.kiro/specs/*/tasks.md のフォーマットを検証し、問題を報告します（Markdown ASTベース）',
  args: {
    feature: tool.schema.string().optional().describe('検証する機能名（.kiro/specs/配下のディレクトリ名）')
  },
  async execute({ feature }) {
    let tasksPath: string;
    try {
      tasksPath = getTasksPath(feature);
    } catch (error: any) {
      return `エラー: パス解決に失敗しました (${error.message})`;
    }
    
    if (!fs.existsSync(tasksPath)) {
      return `エラー: ${tasksPath} が見つかりません`;
    }

    let content: string;
    try {
      content = fs.readFileSync(tasksPath, 'utf-8');
    } catch (error: any) {
       return `ファイルを読み込めませんでした: ${error.message}`;
    }

    const { errors } = parseSddTasks(content);

    if (errors.length === 0) {
      return `✅ バリデーション完了\n\nすべてのタスクが正常です`;
    }

    const errorReport = errors
      .map(err => `行 ${err.line}: ${err.reason}\n  > ${err.content}`)
      .join('\n\n');

    return `❌ バリデーションエラー\n\n${errorReport}`;
  }
});
