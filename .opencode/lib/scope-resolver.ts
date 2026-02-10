import fs from 'fs';
import path from 'path';
import { parseSddTasks, type SddTask } from './tasks_markdown';
import { logger } from './logger.js';

/**
 * タスク解決結果
 */
export interface ResolvedTask {
  task: SddTask;
  source: 'scope.md' | 'tasks.md';
  feature?: string; // scope.mdから解決された場合の機能名
}

/**
 * 全スコープ解決結果
 */
export interface AllScopes {
  scopes: string[];
  sources: Array<{ path: string; type: 'scope.md' | 'tasks.md' }>;
}

/**
 * Kiro specs ディレクトリのパスを取得
 */
function getKiroSpecsDir(): string {
  const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
  return path.join(kiroDir, 'specs');
}

/**
 * specs/tasks.md のパスを取得（後方互換性）
 */
function getTasksPath(): string {
  return process.env.SDD_TASKS_PATH || 'specs/tasks.md';
}

/**
 * .kiro/specs 配下の全機能ディレクトリを取得
 */
function listKiroFeatures(): string[] {
  const specsDir = getKiroSpecsDir();

  if (!fs.existsSync(specsDir)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(specsDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.isSymbolicLink())
      .map(e => e.name);
  } catch (error) {
    logger.error('Failed to list Kiro features:', error);
    return [];
  }
}

/**
 * 指定された機能の scope.md からタスクを検索
 */
function findTaskInFeatureScope(feature: string, taskId: string): SddTask | null {
  const specsDir = getKiroSpecsDir();
  const scopePath = path.join(specsDir, feature, 'scope.md');

  if (!fs.existsSync(scopePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(scopePath, 'utf-8');
    const { tasks, errors } = parseSddTasks(content, { validateScopes: true });

    if (errors.length > 0) {
      logger.warn(`[scope-resolver] ${scopePath} にパースエラーがあります:`, errors);
    }

    const task = tasks.find(t => t.id === taskId);
    return task || null;
  } catch (error) {
    logger.error(`Failed to read ${scopePath}:`, error);
    return null;
  }
}

/**
 * findTaskInKiroScopes - Search for a task in all scope.md files
 */
export function findTaskInKiroScopes(taskId: string): { task: SddTask; feature: string } | null {
  const features = listKiroFeatures();

  for (const feature of features) {
    const task = findTaskInFeatureScope(feature, taskId);
    if (task) {
      return { task, feature };
    }
  }

  return null;
}

/**
 * specs/tasks.md からタスクを検索（フォールバック）
 */
function findTaskInRootTasks(taskId: string): SddTask | null {
  const tasksPath = getTasksPath();

  if (!fs.existsSync(tasksPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(tasksPath, 'utf-8');
    const { tasks, errors } = parseSddTasks(content, { validateScopes: true });

    if (errors.length > 0) {
      logger.warn(`[scope-resolver] ${tasksPath} にパースエラーがあります:`, errors);
    }

    const task = tasks.find(t => t.id === taskId);
    return task || null;
  } catch (error) {
    logger.error(`Failed to read ${tasksPath}:`, error);
    return null;
  }
}

/**
 * タスクを解決する（scope.md 優先、tasks.md フォールバック）
 * 
 * @param taskId タスクID
 * @returns 解決されたタスク、またはnull
 */
export function resolveTask(taskId: string): ResolvedTask | null {
  // 1. scope.md から検索
  const kiroResult = findTaskInKiroScopes(taskId);
  if (kiroResult) {
    logger.info(`[scope-resolver] タスク ${taskId} を .kiro/specs/${kiroResult.feature}/scope.md から解決しました`);
    return {
      task: kiroResult.task,
      source: 'scope.md',
      feature: kiroResult.feature
    };
  }

  // 2. specs/tasks.md から検索（フォールバック）
  const rootTask = findTaskInRootTasks(taskId);
  if (rootTask) {
    logger.info(`[scope-resolver] タスク ${taskId} を specs/tasks.md から解決しました（フォールバック）`);
    return {
      task: rootTask,
      source: 'tasks.md'
    };
  }

  logger.warn(`[scope-resolver] タスク ${taskId} が見つかりませんでした`);
  return null;
}

/**
 * 全 scope.md と tasks.md からスコープを集約
 * 
 * @returns 全スコープとそのソース情報
 */
export function resolveAllScopes(): AllScopes {
  const scopes: string[] = [];
  const sources: Array<{ path: string; type: 'scope.md' | 'tasks.md' }> = [];

  // 1. 全 scope.md から収集
  const features = listKiroFeatures();
  const specsDir = getKiroSpecsDir();

  for (const feature of features) {
    const scopePath = path.join(specsDir, feature, 'scope.md');

    if (!fs.existsSync(scopePath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(scopePath, 'utf-8');
      const { tasks } = parseSddTasks(content, { validateScopes: false });

      const featureScopes = tasks.flatMap(t => t.scopes);
      scopes.push(...featureScopes);

      if (featureScopes.length > 0) {
        sources.push({ path: scopePath, type: 'scope.md' });
      }
    } catch (error) {
      logger.error(`Failed to read ${scopePath}:`, error);
    }
  }

  // 2. specs/tasks.md から収集（フォールバック）
  const tasksPath = getTasksPath();
  if (fs.existsSync(tasksPath)) {
    try {
      const content = fs.readFileSync(tasksPath, 'utf-8');
      const { tasks } = parseSddTasks(content, { validateScopes: false });

      const rootScopes = tasks.flatMap(t => t.scopes);
      scopes.push(...rootScopes);

      if (rootScopes.length > 0) {
        sources.push({ path: tasksPath, type: 'tasks.md' });
      }
    } catch (error) {
      logger.error(`Failed to read ${tasksPath}:`, error);
    }
  }

  // 重複を除去
  const uniqueScopes = Array.from(new Set(scopes));

  return { scopes: uniqueScopes, sources };
}
