
import { describe, test, expect, mock, spyOn, beforeEach, afterEach } from "bun:test";
import { getEmbeddings } from "../../.opencode/lib/embeddings-provider";

const originalEnv = process.env;

describe("embeddings-provider", () => {
  let fetchMock: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, SDD_EMBEDDINGS_API_KEY: "test-key" };
    fetchMock = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { embedding: [0.1], index: 0 },
          { embedding: [0.2], index: 1 }
        ]
      })
    }));
    global.fetch = fetchMock;
    spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    mock.restore();
    (console.error as any).mockRestore?.();
  });

  test("returns embeddings when counts match", async () => {
    const texts = ["text1", "text2"];
    
    // Mock returns 2 items, input is 2 items -> OK
    const result = await getEmbeddings(texts);
    
    expect(result).toHaveLength(2);
    expect(result).toEqual([[0.1], [0.2]]);
  });

  test("returns null and logs error when counts mismatch", async () => {
    const texts = ["text1", "text2", "text3"]; // Input 3 items
    
    // Mock returns 2 items -> Mismatch
    const result = await getEmbeddings(texts);
    
    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      '[SDD-EMBEDDINGS] Mismatched embeddings count', 
      expect.objectContaining({ expected: 3, received: 2 })
    );
  });

  test("returns Gemini embeddings when SDD_AI_PROVIDER is gemini", async () => {
    process.env.SDD_AI_PROVIDER = 'gemini';
    process.env.SDD_GEMINI_API_KEY = 'gemini-key';
    
    fetchMock = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        embeddings: [
          { values: [0.3] },
          { values: [0.4] }
        ]
      })
    }));
    global.fetch = fetchMock;

    const texts = ["text1", "text2"];
    const result = await getEmbeddings(texts);
    
    expect(result).toEqual([[0.3], [0.4]]);
    expect(fetchMock).toHaveBeenCalled();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('key=gemini-key');
    
    const body = JSON.parse(options.body);
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0].content.parts[0].text).toBe("text1");
  });
});
