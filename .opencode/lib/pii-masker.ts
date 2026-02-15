/**
 * PII (個人情報) をマスクするためのユーティリティ
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
const IPV6_REGEX = /(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::(?:[0-9a-fA-F]{1,4}:){0,7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:/g;

// High entropy string (heuristic)
const SECRET_REGEX = /\b[A-Za-z0-9+/]{32,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\b/g;

// Specific known patterns
const OPENAI_KEY_REGEX = /\bsk-(?:proj|admin)-[A-Za-z0-9-]{20,}\b|\bsk-[a-zA-Z0-9]{20,}T3BlbkFJ[a-zA-Z0-9]{20,}\b|\bsk-[a-zA-Z0-9]{32,}\b/g;
const AWS_ACCESS_KEY_REGEX = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
const GOOGLE_API_KEY_REGEX = /\bAIza[0-9A-Za-z-_]{35}\b/g;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g;

/**
 * テキスト内の PII をマスクします。
 * @param text マスク対象のテキスト
 * @returns マスク後のテキスト
 */
export function mask(text: string): string {
  if (!text) return text;

  return text
    .replace(OPENAI_KEY_REGEX, '<REDACTED:OPENAI_KEY>')
    .replace(AWS_ACCESS_KEY_REGEX, '<REDACTED:AWS_KEY>')
    .replace(GOOGLE_API_KEY_REGEX, '<REDACTED:GOOGLE_KEY>')
    .replace(PRIVATE_KEY_BLOCK, '<REDACTED:PRIVATE_KEY_BLOCK>')
    .replace(EMAIL_REGEX, '<REDACTED:EMAIL>')
    .replace(IPV4_REGEX, '<REDACTED:IP>')
    .replace(IPV6_REGEX, '<REDACTED:IPV6>')
    .replace(SECRET_REGEX, '<REDACTED:SECRET>');
}
