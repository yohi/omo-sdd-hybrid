import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

export function getWorktreeRoot(): string {
  if (process.env.SDD_WORKTREE_ROOT) {
    const root = process.env.SDD_WORKTREE_ROOT.trim();
    if (root) {
      return root;
    }
  }
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch {
    return process.cwd();
  }
}

export function isSymlink(filePath: string): boolean {
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Resolve real path (follow symlinks), fallback to resolved path on error
 */
function resolveRealPath(targetPath: string): string {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

export function isOutsideWorktree(filePath: string, worktreeRoot: string): boolean {
  const absolutePath = path.resolve(filePath);
  const worktreeRootResolved = path.resolve(worktreeRoot);
  
  // Resolve real paths to prevent symlink bypass
  const realFilePath = resolveRealPath(absolutePath);
  const realWorktreeRoot = resolveRealPath(worktreeRootResolved);
  
  const fileRoot = path.parse(realFilePath).root;
  const worktreeRootParsed = path.parse(realWorktreeRoot).root;
  if (fileRoot !== worktreeRootParsed) {
    return true;
  }
  
  const relative = path.relative(realWorktreeRoot, realFilePath);
  return relative === '..' || relative.startsWith('..' + path.sep);
}

export function normalizeToRepoRelative(filePath: string, worktreeRoot: string): string {
  const absolutePath = path.resolve(filePath);
  
  // Resolve real paths to prevent symlink bypass
  const realFilePath = resolveRealPath(absolutePath);
  const realWorktreeRoot = resolveRealPath(worktreeRoot);
  
  const relativePath = path.relative(realWorktreeRoot, realFilePath);
  return relativePath.split(path.sep).join('/');
}
