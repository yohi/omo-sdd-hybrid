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
function resolveRealPath(targetPath: string, throwOnFailure: boolean = false): string {
  try {
    return fs.realpathSync(targetPath);
  } catch (error: any) {
    // Only attempt manual resolution for non-existent files
    if (error?.code === 'ENOENT') {
      try {
        // Iterate up directory tree to find the first existing ancestor
        let currentPath = targetPath;
        let remainder = '';
        
        // Iterate up until we reach the root or find an existing path
        while (true) {
          const parent = path.dirname(currentPath);
          if (parent === currentPath) break; // Reached root

          const basename = path.basename(currentPath);
          remainder = remainder ? path.join(basename, remainder) : basename;
          currentPath = parent;

          try {
            // Check if parent exists. lstatSync throws if not found.
            fs.lstatSync(currentPath);
            
            // If we are here, currentPath exists. Resolve it.
            const realParent = fs.realpathSync(currentPath);
            return path.join(realParent, remainder);
          } catch (e: any) {
            if (e.code === 'ENOENT') {
              continue; // Parent doesn't exist, keep going up
            }
            // Other error (EACCES etc), stop trying and fallback
            break;
          }
        }
      } catch {
        // Ignore any errors during manual resolution
      }
    }
    
    if (throwOnFailure) {
      throw new Error(`Failed to resolve real path for: ${targetPath}`);
    }
    return path.resolve(targetPath);
  }
}

export function isOutsideWorktree(filePath: string, worktreeRoot: string): boolean {
  const absolutePath = path.resolve(filePath);
  const worktreeRootResolved = path.resolve(worktreeRoot);
  
  let realFilePath: string;
  let realWorktreeRoot: string;

  try {
    // Resolve real paths to prevent symlink bypass.
    // If resolution fails (e.g. cannot trace parents due to EACCES), 
    // we must treat it as potentially outside for safety (Fail Closed).
    realFilePath = resolveRealPath(absolutePath, true);
    realWorktreeRoot = resolveRealPath(worktreeRootResolved, false);
  } catch (e) {
    // If we cannot resolve the real path, we cannot guarantee it's inside.
    return true;
  }
  
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
