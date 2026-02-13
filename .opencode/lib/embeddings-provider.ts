/**
 * embeddings-provider.ts
 *
 * OpenAI互換 Embeddings API を利用するためのプロバイダモジュール
 */

const API_BASE = process.env.SDD_EMBEDDINGS_API_BASE || 'https://api.openai.com/v1';
const MODEL = process.env.SDD_EMBEDDINGS_MODEL || 'text-embedding-3-small';

async function fetchGeminiEmbeddings(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.SDD_GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('[SDD-EMBEDDINGS] Gemini Skipped: SDD_GEMINI_API_KEY is not set');
    return null;
  }

  const model = MODEL.includes('embedding-004') ? MODEL : 'text-embedding-004';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: texts.map(text => ({
          model: `models/${model}`,
          content: { parts: [{ text }] }
        }))
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[SDD-EMBEDDINGS] Gemini Error ${response.status}: ${errorText}`);
      return null;
    }

    const json = await response.json() as any;
    if (!json.embeddings || !Array.isArray(json.embeddings)) {
      logger.error('[SDD-EMBEDDINGS] Gemini Invalid response format', json);
      return null;
    }

    if (json.embeddings.length !== texts.length) {
      logger.error('[SDD-EMBEDDINGS] Gemini Mismatched embeddings count', { 
        expected: texts.length, 
        received: json.embeddings.length 
      });
      return null;
    }

    return json.embeddings.map((item: any) => item.values);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      logger.error('[SDD-EMBEDDINGS] Gemini Request timed out after 10s');
      return null;
    }
    logger.error('[SDD-EMBEDDINGS] Gemini Network error:', error);
    return null;
  }
}

import { logger } from './logger.js';

export function isEmbeddingsEnabled(): boolean {
  return !!process.env.SDD_EMBEDDINGS_API_KEY;
}

export async function getEmbeddings(texts: string[]): Promise<number[][] | null> {
  const isGemini = process.env.SDD_AI_PROVIDER === 'gemini' || MODEL.includes('embedding-004');
  if (isGemini) return fetchGeminiEmbeddings(texts);

  const apiKey = process.env.SDD_EMBEDDINGS_API_KEY;
  if (!apiKey) {
    logger.warn('[SDD-EMBEDDINGS] Skipped: SDD_EMBEDDINGS_API_KEY is not set');
    return null;
  }

  // APIエンドポイントの末尾スラッシュ処理
  const baseUrl = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const url = `${baseUrl}/embeddings`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        input: texts
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[SDD-EMBEDDINGS] Error ${response.status}: ${errorText}`);
      return null;
    }

    const json = await response.json() as any;
    
    if (!json.data || !Array.isArray(json.data)) {
      logger.error('[SDD-EMBEDDINGS] Invalid response format', json);
      return null;
    }

    if (json.data.length !== texts.length) {
      logger.error('[SDD-EMBEDDINGS] Mismatched embeddings count', { expected: texts.length, received: json.data.length, json });
      return null;
    }

    // index順にソートしてembeddingを抽出
    return json.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);
      
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      logger.error('[SDD-EMBEDDINGS] Request timed out after 10s');
      return null;
    }
    logger.error('[SDD-EMBEDDINGS] Network error:', error);
    return null;
  }
}
