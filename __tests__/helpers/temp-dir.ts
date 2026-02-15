import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * os.tmpdir() 内に一意のディレクトリを作成します。
 * @returns 作成されたディレクトリの絶対パス
 */
export function createTempDir(): string {
  const prefix = path.join(os.tmpdir(), 'omo-sdd-');
  return fs.mkdtempSync(prefix);
}

/**
 * ディレクトリを再帰的に削除します。
 * 削除中にエラーが発生した場合はログに出力し、例外は投げません。
 * @param dir 削除するディレクトリのパス
 */
export function cleanupTempDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`E_CLEANUP_FAILED: 一時ディレクトリの削除に失敗しました (${dir}):`, error);
  }
}

/**
 * ファイルが存在するまで待機します（最大タイムアウト指定可能）
 */
export async function waitForFile(filePath: string, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fs.existsSync(filePath)) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`File not found after ${timeout}ms: ${filePath}`);
}

/**
 * 一時ディレクトリを作成し、コールバックを実行した後、自動的に削除するラッパーです。
 * コールバックが例外を投げた場合でも、クリーンアップが実行されます。
 * @param callback 一時ディレクトリのパスを受け取るコールバック関数
 * @returns コールバックの戻り値
 */
export function withTempDir<T>(callback: (dir: string) => T | Promise<T>): T | Promise<T> {
  const dir = createTempDir();
  try {
    const result = callback(dir);
    if (result instanceof Promise) {
      return result.finally(() => cleanupTempDir(dir));
    }
    cleanupTempDir(dir);
    return result;
  } catch (error) {
    cleanupTempDir(dir);
    throw error;
  }
}
