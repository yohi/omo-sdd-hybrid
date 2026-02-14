/**
 * PII (個人情報) をマスクするためのユーティリティ
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// 高エントロピーな文字列（簡易的な秘密鍵等の検出用）
const SECRET_REGEX = /\b[A-Za-z0-9+/]{32,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\b/g;

/**
 * テキスト内の PII をマスクします。
 * @param text マスク対象のテキスト
 * @returns マスク後のテキスト
 */
export function mask(text: string): string {
  if (!text) return text;

  return text
    .replace(EMAIL_REGEX, '<REDACTED:EMAIL>')
    .replace(IPV4_REGEX, '<REDACTED:IP>')
    .replace(SECRET_REGEX, '<REDACTED:SECRET>');
}
