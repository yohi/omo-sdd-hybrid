import { tool } from '@opencode-ai/plugin';
import fs from 'fs';
import path from 'path';
import { parseSddTasks } from '../lib/tasks_markdown';

const KIRO_BASE_DIR = '.kiro/specs';
const ROOT_PATH = 'specs';
const TASK_FILES = ['scope.md', 'tasks.md'];

function resolveWithinBases(targetPath: string, baseDirs: string[]): string {
  if (targetPath.includes('\0') || targetPath.includes('..')) {
    throw new Error('Invalid path: contains forbidden characters or segments');
  }

  const resolvedTarget = path.resolve(targetPath);
  const allowed = baseDirs.some(base => resolvedTarget === base || resolvedTarget.startsWith(base + path.sep));

  if (!allowed) {
    throw new Error(`Access Denied: Path traversal detected. Path '${resolvedTarget}' is outside allowed bases (${baseDirs.join(', ')})`);
  }

  return resolvedTarget;
}

function resolveFeaturePaths(featureName: string, kiroBaseResolved: string): string[] {
  if (featureName.includes('\0') || featureName.includes('..')) {
    throw new Error('Invalid feature name: contains forbidden characters or segments');
  }

  return TASK_FILES
    .map(filename => path.join(KIRO_BASE_DIR, featureName, filename))
    .map(candidatePath => {
      try {
        return resolveWithinBases(candidatePath, [kiroBaseResolved]);
      } catch {
        return null;
      }
    })
    .filter((p): p is string => p !== null);
}

function listKiroPaths(kiroBaseResolved: string): string[] {
  if (!fs.existsSync(kiroBaseResolved)) {
    return [];
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(kiroBaseResolved, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter(entry => entry.isDirectory())
    .flatMap(entry => resolveFeaturePaths(entry.name, kiroBaseResolved))
    .filter(candidate => fs.existsSync(candidate));
}

function getTasksPaths(feature?: string): { candidates: string[]; required: string[] } {
  const kiroBaseResolved = path.resolve(KIRO_BASE_DIR);
  const specsBaseResolved = path.resolve('specs');
  const allowedBases = [kiroBaseResolved, specsBaseResolved];

  const candidates: string[] = [];
  const required: string[] = [];

  if (process.env.SDD_TASKS_PATH) {
    const resolvedEnv = resolveWithinBases(process.env.SDD_TASKS_PATH, allowedBases);
    candidates.push(resolvedEnv);
    required.push(resolvedEnv);
  }

  if (feature) {
    const featurePaths = resolveFeaturePaths(feature, kiroBaseResolved);
    candidates.push(...featurePaths);
  } else {
    candidates.push(...listKiroPaths(kiroBaseResolved));
  }

  // Root の tasks.md と scope.md も追加
  TASK_FILES.forEach(filename => {
    const rootPath = path.join(ROOT_PATH, filename);
    try {
      const resolved = resolveWithinBases(rootPath, [specsBaseResolved]);
      candidates.push(resolved);
    } catch {
      // Ignore if resolution fails
    }
  });

  const uniqueCandidates = Array.from(new Set(candidates));
  const uniqueRequired = Array.from(new Set(required));

  return { candidates: uniqueCandidates, required: uniqueRequired };
}

export default tool({
  description: '.kiro/specs/**/tasks.md, .kiro/specs/**/scope.md および specs/*.md のフォーマットを検証し、問題を報告します（Markdown ASTベース）',
  args: {
    feature: tool.schema.string().optional().describe('検証する機能名（.kiro/specs/配下のディレクトリ名）')
  },
  async execute({ feature }) {
    let candidates: string[] = [];
    let required: string[] = [];
    try {
      ({ candidates, required } = getTasksPaths(feature));
    } catch (error: any) {
      return `エラー: パス解決に失敗しました (${error.message})`;
    }

    const missingRequired = required.filter(target => !fs.existsSync(target));
    if (missingRequired.length > 0) {
      return `エラー: ${missingRequired[0]} が見つかりません`;
    }

    const existingPaths = candidates.filter(target => {
      try {
        return fs.statSync(target).isFile();
      } catch {
        return false;
      }
    });

    if (existingPaths.length === 0) {
      return `エラー: 対象のタスクファイル (${TASK_FILES.join(' または ')}) が見つかりません`;
    }

    const errorBlocks: string[] = [];

    for (const tasksPath of existingPaths) {
      let content: string;
      try {
        content = fs.readFileSync(tasksPath, 'utf-8');
      } catch (error: any) {
        return `ファイルを読み込めませんでした: ${error.message}`;
      }

      const { errors } = parseSddTasks(content);
      if (errors.length === 0) {
        continue;
      }

      const errorReport = errors
        .map(err => `行 ${err.line}: ${err.reason}\n  > ${err.content}`)
        .join('\n\n');
      errorBlocks.push(`ファイル: ${tasksPath}\n${errorReport}`);
    }

    if (errorBlocks.length === 0) {
      return `✅ バリデーション完了\n\nすべてのタスクが正常です`;
    }

    return `❌ バリデーションエラー\n\n${errorBlocks.join('\n\n')}`;
  }
});
