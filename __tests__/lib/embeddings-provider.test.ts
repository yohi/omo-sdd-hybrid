
import { describe, test, expect, mock, spyOn } from "bun:test";
import { getEmbeddings } from "../../.opencode/lib/embeddings-provider";

const originalEnv = process.env;

describe("embeddings-provider", () => {
  let fetchMock: any;

  // Setup / Teardown
  const setup = () => {
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
  };

  const teardown = () => {
    process.env = originalEnv;
    mock.restore();
  };

  test("returns embeddings when counts match", async () => {
    setup();
    const texts = ["text1", "text2"];
    
    // Mock returns 2 items, input is 2 items -> OK
    const result = await getEmbeddings(texts);
    
    expect(result).toHaveLength(2);
    expect(result).toEqual([[0.1], [0.2]]);
    teardown();
  });

  test("returns null and logs error when counts mismatch", async () => {
    setup();
    const texts = ["text1", "text2", "text3"]; // Input 3 items
    
    // Mock returns 2 items -> Mismatch
    const result = await getEmbeddings(texts);
    
    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      '[SDD-EMBEDDINGS] Mismatched embeddings count', 
      expect.objectContaining({ expected: 3, received: 2 })
    );
    teardown();
  });
});
