import path from 'path';
import fs from 'fs';

/**
 * パスバリデーションに関連するエラー
 */
export class PathValidationError extends Error {
  constructor(public code: 'E_PATH_TRAVERSAL' | 'E_INVALID_PATH', message: string) {
    super(`${code}: ${message}`);
    this.name = 'PathValidationError';
  }
}

/**
 * パスを正規化する（スラッシュ区切り、重複スラッシュの除去）
 * @param p 対象パス
 * @returns 正規化されたパス
 */
export function normalizePath(p: string): string {
  // Windowsのバックスラッシュをフォワードスラッシュに変換
  const normalized = p.replace(/\\/g, '/');
  // path.normalize を通して .. や . を解決し、再度スラッシュを統一
  return path.normalize(normalized).replace(/\\/g, '/');
}

/**
 * 実パスを解決する（シンボリックリンクを辿る）。
 * 存在しないパスの場合は、存在する親ディレクトリまで遡って解決する。
 */
function resolveRealPath(targetPath: string): string {
  try {
    return fs.realpathSync(targetPath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      const parent = path.dirname(targetPath);
      const basename = path.basename(targetPath);
      if (parent === targetPath) {
        // ルートに到達
        return targetPath;
      }
      // 親を再帰的に解決
      const resolvedParent = resolveRealPath(parent);
      return path.join(resolvedParent, basename);
    }
    throw error;
  }
}

/**
 * パスがベースディレクトリ内にあることを検証する。
 * @param targetPath 検証対象のパス
 * @param baseDir ベースディレクトリ（ワークツリーのルートなど）
 * @returns 正規化された絶対パス
 * @throws PathValidationError パスが不正な場合
 */
export function validatePath(targetPath: string, baseDir: string): string {
  // ヌルバイトチェック
  if (targetPath.indexOf('\0') !== -1) {
    throw new PathValidationError('E_INVALID_PATH', 'パスにヌルバイトが含まれています');
  }

  // 入力の正規化（.. セグメントの解決）
  const normalizedInput = normalizePath(targetPath);
  
  // 明示的な .. セグメントのチェック（正規化後も残っている場合や、正規化前の悪意ある入力）
  if (normalizedInput.split('/').includes('..')) {
    throw new PathValidationError('E_PATH_TRAVERSAL', 'パスに ".." セグメントが含まれています');
  }

  const absoluteBase = path.resolve(baseDir);
  const absoluteTarget = path.resolve(absoluteBase, targetPath);

  // シンボリックリンクを考慮した実パスの解決
  const realBase = resolveRealPath(absoluteBase);
  const realTarget = resolveRealPath(absoluteTarget);

  // 相対パスを計算して、ベースディレクトリ外に出ていないか確認
  const relative = path.relative(realBase, realTarget);
  const relativeParts = relative.split(path.sep);

  if (relativeParts[0] === '..' || path.isAbsolute(relative)) {
    throw new PathValidationError('E_PATH_TRAVERSAL', `パスがベースディレクトリの外を指しています: ${targetPath}`);
  }

  return normalizePath(realTarget);
}
