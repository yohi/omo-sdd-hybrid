import { logger } from './logger.js';

const API_BASE = process.env.SDD_LLM_API_BASE || process.env.SDD_EMBEDDINGS_API_BASE || 'https://api.openai.com/v1';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function getModel(): string {
  return process.env.SDD_LLM_MODEL || 'gpt-4o';
}

export function isLlmEnabled(): boolean {
  return !!(process.env.SDD_LLM_API_KEY || process.env.SDD_EMBEDDINGS_API_KEY || process.env.SDD_GEMINI_API_KEY);
}

export async function getChatCompletion(messages: Message[]): Promise<string | null> {
  const model = getModel();
  const isGemini = process.env.SDD_AI_PROVIDER === 'gemini' || model.startsWith('gemini-');
  if (isGemini) {
    return fetchGeminiCompletion(messages, model);
  }

  const apiKey = process.env.SDD_LLM_API_KEY || process.env.SDD_EMBEDDINGS_API_KEY;
  if (!apiKey) {
    logger.warn('[SDD-LLM] Skipped: SDD_LLM_API_KEY or SDD_EMBEDDINGS_API_KEY is not set');
    return null;
  }

  const baseUrl = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const url = `${baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: getModel(),
        messages: messages,
        temperature: 0.1
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      const sanitized = errorText.length > 200 ? errorText.slice(0, 200) + '... (truncated)' : errorText;
      logger.error(`[SDD-LLM] Error ${response.status}: ${sanitized}`);
      return null;
    }

    const json = await response.json() as any;
    
    if (!json.choices || !Array.isArray(json.choices) || json.choices.length === 0) {
      logger.error('[SDD-LLM] Invalid response format', json);
      return null;
    }

    return json.choices[0].message?.content || null;
      
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      logger.error('[SDD-LLM] Request timed out after 30s');
      return null;
    }
    logger.error('[SDD-LLM] Network error:', error);
    return null;
  }
}

async function fetchGeminiCompletion(messages: Message[], model: string): Promise<string | null> {
  const apiKey = process.env.SDD_GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('[SDD-LLM] Skipped: SDD_GEMINI_API_KEY is not set');
    return null;
  }

  const geminiModel = model.startsWith('gemini-') ? model : 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const systemMessages = messages.filter(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const contents = chatMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const body: any = {
    contents,
    generationConfig: {
      temperature: 0.1
    }
  };

  if (systemMessages.length > 0) {
    const combined = systemMessages.map(m => m.content).join('\n');
    body.systemInstruction = {
      parts: [{ text: combined }]
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      const sanitized = errorText.length > 200 ? errorText.slice(0, 200) + '... (truncated)' : errorText;
      logger.error(`[SDD-LLM-Gemini] Error ${response.status}: ${sanitized}`);
      return null;
    }

    const json = await response.json() as any;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      logger.error('[SDD-LLM-Gemini] Invalid response format', json);
      return null;
    }

    return text;

  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      logger.error('[SDD-LLM-Gemini] Request timed out after 30s');
      return null;
    }
    logger.error('[SDD-LLM-Gemini] Network error:', error);
    return null;
  }
}
