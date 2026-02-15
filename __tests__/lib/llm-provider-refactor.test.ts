import { expect, test, describe, mock, beforeEach, afterEach } from 'bun:test';
import { getChatCompletion, TimeoutError, APIError } from '../../.opencode/lib/llm-provider';

describe('llm-provider refactor', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SDD_LLM_API_KEY = 'test-key';
    process.env.SDD_LLM_MODEL = 'gpt-4o';
    process.env.SDD_AI_PROVIDER = 'openai';
    mock.restore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('successful completion', async () => {
    global.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello!' } }]
    }), { status: 200 })));

    const result = await getChatCompletion([{ role: 'user', content: 'Hi' }]);
    expect(result).toBe('Hello!');
  });

  test('timeout handling', async () => {
    process.env.SDD_LLM_TIMEOUT = '100';
    global.fetch = mock(() => new Promise((resolve, reject) => {
      setTimeout(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      }, 500);
    }));

    try {
      await getChatCompletion([{ role: 'user', content: 'Hi' }]);
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect((e as Error).name).toBe('TimeoutError');
      expect((e as Error).message).toContain('E_LLM_TIMEOUT');
    }
  });

  test('API error handling (non-retryable)', async () => {
    global.fetch = mock(() => Promise.resolve(new Response('Bad Request', { status: 400 })));

    try {
      await getChatCompletion([{ role: 'user', content: 'Hi' }]);
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
      expect((e as APIError).status).toBe(400);
    }
  });

  test('retry logic for 429', async () => {
    let callCount = 0;
    global.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response('Rate Limit', { status: 429 }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'Recovered' } }]
      }), { status: 200 }));
    });

    const result = await getChatCompletion([{ role: 'user', content: 'Hi' }]);
    expect(result).toBe('Recovered');
    expect(callCount).toBe(2);
  });

  test('retry logic for 500', async () => {
    let callCount = 0;
    global.fetch = mock(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve(new Response('Server Error', { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'Finally' } }]
      }), { status: 200 }));
    });

    const result = await getChatCompletion([{ role: 'user', content: 'Hi' }]);
    expect(result).toBe('Finally');
    expect(callCount).toBe(3);
  });

  test('fails after max retries', async () => {
    global.fetch = mock(() => Promise.resolve(new Response('Persistent Error', { status: 500 })));

    try {
      await getChatCompletion([{ role: 'user', content: 'Hi' }]);
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
      expect((e as APIError).status).toBe(500);
    }
  });
});
