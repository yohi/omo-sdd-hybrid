/**
 * 文字列ユーティリティ関数
 * OmO-SDD-Hybrid の Gatekeeper 機能をデモするためのサンプル実装
 */

/**
 * 文字列の先頭を大文字化する
 * @param str - 変換対象の文字列
 * @returns 先頭が大文字化された文字列
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 文字列をURLスラグに変換する
 * - 小文字化
 * - スペースをハイフンに変換
 * - 英数字とハイフン以外を除去
 * - 連続するハイフンを単一に
 * - 先頭と末尾のハイフンを除去
 * 
 * @param str - 変換対象の文字列
 * @returns URLスラグ形式の文字列
 */
export function slugify(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * 文字列を指定した長さで切り詰める
 * @param str - 変換対象の文字列
 * @param maxLength - 最大長（省略記号を含む）
 * @param suffix - 省略記号（デフォルト: '...'）
 * @returns 切り詰められた文字列
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (!str || str.length <= maxLength) return str;
  if (maxLength <= 0) return '';
  if (maxLength <= suffix.length) return suffix.slice(0, maxLength);
  return str.slice(0, maxLength - suffix.length) + suffix;
}
