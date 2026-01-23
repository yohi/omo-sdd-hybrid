/**
 * embeddings-provider.ts
 *
 * OpenAI互換 Embeddings API を利用するためのプロバイダモジュール
 */

const API_BASE = process.env.SDD_EMBEDDINGS_API_BASE || 'https://api.openai.com/v1';
const API_KEY = process.env.SDD_EMBEDDINGS_API_KEY;
const MODEL = process.env.SDD_EMBEDDINGS_MODEL || 'text-embedding-3-small';

export function isEmbeddingsEnabled(): boolean {
  return !!API_KEY;
}

export async function getEmbeddings(texts: string[]): Promise<number[][] | null> {
  if (!API_KEY) {
    console.warn('[SDD-EMBEDDINGS] Skipped: SDD_EMBEDDINGS_API_KEY is not set');
    return null;
  }

  // APIエンドポイントの末尾スラッシュ処理
  const baseUrl = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const url = `${baseUrl}/embeddings`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        input: texts
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SDD-EMBEDDINGS] Error ${response.status}: ${errorText}`);
      return null;
    }

    const json = await response.json() as any;
    
    if (!json.data || !Array.isArray(json.data)) {
      console.error('[SDD-EMBEDDINGS] Invalid response format', json);
      return null;
    }

    // index順にソートしてembeddingを抽出
    return json.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);
      
  } catch (error) {
    console.error('[SDD-EMBEDDINGS] Network error:', error);
    return null;
  }
}
