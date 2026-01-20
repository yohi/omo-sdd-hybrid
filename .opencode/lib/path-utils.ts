import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

export function getWorktreeRoot(): string {
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

export function isOutsideWorktree(filePath: string, worktreeRoot: string): boolean {
  const absolutePath = path.resolve(filePath);
  const worktreeRootResolved = path.resolve(worktreeRoot);
  
  const fileRoot = path.parse(absolutePath).root;
  const worktreeRootParsed = path.parse(worktreeRootResolved).root;
  if (fileRoot !== worktreeRootParsed) {
    return true;
  }
  
  const relative = path.relative(worktreeRootResolved, absolutePath);
  return relative === '..' || relative.startsWith('..' + path.sep);
}

export function normalizeToRepoRelative(filePath: string, worktreeRoot: string): string {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(worktreeRoot, absolutePath);
  return relativePath.split(path.sep).join('/');
}
