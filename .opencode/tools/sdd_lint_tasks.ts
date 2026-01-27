import { tool } from '../lib/plugin-stub';
import fs from 'fs';
import path from 'path';

function getTasksPath(feature?: string) {
  if (process.env.SDD_TASKS_PATH) {
    return process.env.SDD_TASKS_PATH;
  }

  const baseDir = '.kiro/specs';
  // Sanitize feature input
  const featureName = feature || 'default';
  
  // Basic sanity check for null bytes and obvious traversal attempts
  if (featureName.includes('\0') || featureName.includes('..')) {
    throw new Error('Invalid feature name: contains forbidden characters or segments');
  }

  const resolvedBase = path.resolve(baseDir);
  const candidatePath = path.join(baseDir, featureName, 'tasks.md');
  const resolvedPath = path.resolve(candidatePath);

  // Path Traversal Protection: Ensure resolved path is still within the base directory
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error(`Access Denied: Path traversal detected. Resolved path '${resolvedPath}' is outside base '${resolvedBase}'`);
  }

  return resolvedPath;
}

// Regex: * [x] TaskID: Description (Scope: `pattern`)
const TASK_LINE_PATTERN = /^[\*-] \[([ x])\] ([^:]+): (.+) \(Scope: `(.*)`\)$/;

interface ValidationError {
  line: number;
  content: string;
  reason: string;
}

function validateTasksFile(filePath: string): ValidationError[] {
  const errors: ValidationError[] = [];
  let content: string;
  
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error: any) {
    errors.push({
      line: 0,
      content: '',
      reason: `ファイルを読み込めませんでした: ${error.message}`
    });
    return errors;
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('* [') || line.startsWith('- [')) {
      const match = TASK_LINE_PATTERN.exec(line);
      
      if (!match) {
        errors.push({
          line: i + 1,
          content: line,
          reason: 'フォーマットエラー: タスク行は "* [ ] TaskID: Description (Scope: `pattern`)" 形式である必要があります'
        });
        continue;
      }

      const [, checkbox, taskId, description, scope] = match;

      if (!/^[A-Za-z0-9._-]+-\d+$/.test(taskId)) {
        errors.push({
          line: i + 1,
          content: line,
          reason: `TaskID のフォーマットエラー: "${taskId}" は "TaskID-N" または "PREFIX-N" 形式である必要があります`
        });
      }

      if (!scope || scope.trim() === '') {
        errors.push({
          line: i + 1,
          content: line,
          reason: 'Scope が空です'
        });
      }
    }
  }

  return errors;
}

export default tool({
  description: '.kiro/specs/*/tasks.md のフォーマットを検証し、問題を報告します（正規表現ベース）',
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

    const errors = validateTasksFile(tasksPath);

    if (errors.length === 0) {
      return `✅ バリデーション完了\n\nすべてのタスクが正常です`;
    }

    const errorReport = errors
      .map(err => `行 ${err.line}: ${err.reason}\n  > ${err.content}`)
      .join('\n\n');

    return `❌ バリデーションエラー\n\n${errorReport}`;
  }
});
