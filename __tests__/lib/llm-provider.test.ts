
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { getChatCompletion } from "../../.opencode/lib/llm-provider";

const originalEnv = process.env;

describe("llm-provider", () => {
  let fetchMock: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    fetchMock = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        choices: [
          { message: { content: "OpenAI response" } }
        ]
      })
    }));
    global.fetch = fetchMock;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    mock.restore();
  });

  test("uses OpenAI by default", async () => {
    process.env.SDD_LLM_API_KEY = "openai-key";
    const messages = [{ role: "user", content: "hello" }] as any;
    
    const result = await getChatCompletion(messages);
    
    expect(result).toBe("OpenAI response");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("api.openai.com");
    expect(options.headers["Authorization"]).toBe("Bearer openai-key");
  });

  test("uses Gemini when SDD_AI_PROVIDER is gemini", async () => {
    process.env.SDD_AI_PROVIDER = "gemini";
    process.env.SDD_GEMINI_API_KEY = "gemini-key";
    
    fetchMock = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        candidates: [
          { content: { parts: [{ text: "Gemini response" }] } }
        ]
      })
    }));
    global.fetch = fetchMock;

    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
      { role: "assistant", content: "ast" }
    ] as any;
    
    const result = await getChatCompletion(messages);
    
    expect(result).toBe("Gemini response");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("key=gemini-key");
    
    const body = JSON.parse(options.body);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.contents).toHaveLength(2);
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0].text).toBe("usr");
    expect(body.contents[1].role).toBe("model");
    expect(body.contents[1].parts[0].text).toBe("ast");
    expect(body.generationConfig.temperature).toBe(0.1);
  });

  test("uses Gemini when MODEL starts with gemini-", async () => {
    // Reset env to avoid SDD_AI_PROVIDER influence
    process.env = { ...originalEnv, SDD_LLM_MODEL: "gemini-1.5-pro", SDD_GEMINI_API_KEY: "gemini-key" };
    
    // Need to re-import or trigger MODEL reload if it's cached.
    // In our implementation, MODEL is at top level.
    // Since we can't easily re-import in the same process with different env,
    // we assume the logic works if we can isolate the check.
    
    fetchMock = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        candidates: [
          { content: { parts: [{ text: "Gemini response" }] } }
        ]
      })
    }));
    global.fetch = fetchMock;

    const messages = [{ role: "user", content: "hello" }] as any;
    const result = await getChatCompletion(messages);
    
    expect(result).toBe("Gemini response");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("models/gemini-1.5-pro");
  });
});
