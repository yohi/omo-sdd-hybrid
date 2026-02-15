import { logger } from './logger.js';

const API_BASE = process.env.SDD_LLM_API_BASE || process.env.SDD_EMBEDDINGS_API_BASE || 'https://api.openai.com/v1';

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class APIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

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

const DEFAULT_TIMEOUT = 30000;

function getTimeout(): number {
  const timeout = process.env.SDD_LLM_TIMEOUT;
  return timeout ? parseInt(timeout, 10) : DEFAULT_TIMEOUT;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getChatCompletion(messages: Message[]): Promise<string> {
  const maxRetries = 3;
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const model = getModel();
      const isGemini = process.env.SDD_AI_PROVIDER === 'gemini' || model.startsWith('gemini-');
      let result: string | null;

      if (isGemini) {
        result = await fetchGeminiCompletion(messages, model);
      } else {
        result = await fetchOpenAiCompletion(messages, model);
      }

      if (result === null) {
        throw new APIError('E_LLM_EMPTY_RESPONSE: LLM returned empty response');
      }
      return result;

    } catch (error: any) {
      lastError = error;
      const status = (error as APIError).status;
      const isRetryable = status === 429 || (status && status >= 500);

      if (isRetryable && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        logger.warn(`[SDD-LLM] Retryable error ${status}. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function fetchOpenAiCompletion(messages: Message[], model: string): Promise<string | null> {
  const apiKey = process.env.SDD_LLM_API_KEY || process.env.SDD_EMBEDDINGS_API_KEY;
  if (!apiKey) {
    throw new APIError('E_LLM_API_KEY_MISSING: SDD_LLM_API_KEY or SDD_EMBEDDINGS_API_KEY is not set');
  }

  const baseUrl = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const url = `${baseUrl}/chat/completions`;

  const timeout = getTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
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
      throw new APIError(`E_LLM_API_ERROR: ${sanitized}`, response.status);
    }

    const json = await response.json() as any;
    
    if (!json.choices || !Array.isArray(json.choices) || json.choices.length === 0) {
      logger.error('[SDD-LLM] Invalid response format', json);
      throw new APIError('E_LLM_INVALID_RESPONSE: Invalid response format from API');
    }

    return json.choices[0].message?.content || null;
      
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      logger.error(`[SDD-LLM] Request timed out after ${timeout}ms`);
      throw new TimeoutError(`E_LLM_TIMEOUT: Request timed out after ${timeout}ms`);
    }
    if (error instanceof APIError) {
      throw error;
    }
    logger.error('[SDD-LLM] Network error:', error);
    throw new APIError(`E_LLM_NETWORK_ERROR: ${error.message}`);
  }
}

async function fetchGeminiCompletion(messages: Message[], model: string): Promise<string | null> {
  const apiKey = process.env.SDD_GEMINI_API_KEY;
  if (!apiKey) {
    throw new APIError('E_LLM_API_KEY_MISSING: SDD_GEMINI_API_KEY is not set');
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

  const timeout = getTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

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
      throw new APIError(`E_LLM_API_ERROR: ${sanitized}`, response.status);
    }

    const json = await response.json() as any;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      logger.error('[SDD-LLM-Gemini] Invalid response format', json);
      throw new APIError('E_LLM_INVALID_RESPONSE: Invalid response format from Gemini API');
    }

    return text;

  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      logger.error(`[SDD-LLM-Gemini] Request timed out after ${timeout}ms`);
      throw new TimeoutError(`E_LLM_TIMEOUT: Request timed out after ${timeout}ms`);
    }
    if (error instanceof APIError) {
      throw error;
    }
    logger.error('[SDD-LLM-Gemini] Network error:', error);
    throw new APIError(`E_LLM_NETWORK_ERROR: ${error.message}`);
  }
}

