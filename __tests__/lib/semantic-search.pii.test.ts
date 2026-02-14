import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { findSemanticGaps } from "../../.opencode/lib/semantic-search";
import * as embeddingsProvider from "../../.opencode/lib/embeddings-provider";

describe("semantic-search PII masking", () => {
  let getEmbeddingsSpy: any;

  beforeEach(() => {
    // 環境変数の設定（テスト用）
    process.env.SDD_EMBEDDINGS_API_KEY = "dummy-key";
    
    // getEmbeddings を spyOn でモック
    getEmbeddingsSpy = spyOn(embeddingsProvider, "getEmbeddings").mockImplementation(async (texts: string[]) => {
      return texts.map(() => [0.1, 0.2, 0.3]);
    });
    
    spyOn(embeddingsProvider, "isEmbeddingsEnabled").mockReturnValue(true);
  });

  afterEach(() => {
    getEmbeddingsSpy.mockRestore();
  });

  test("findSemanticGaps は PII をマスクしてから getEmbeddings を呼び出すこと", async () => {
    const requirements = [
      {
        id: "REQ-1",
        description: "ユーザー test@example.com の情報を表示する",
        acceptanceCriteria: []
      }
    ];
    // 一時ファイルを作成してテスト
    const testFile = "pii-test-file.ts";
    const fs = await import("fs");
    fs.writeFileSync(testFile, "const ip = '192.168.1.1';");

    try {
      await findSemanticGaps(requirements, [testFile]);

      // getEmbeddings が呼ばれた際の引数を確認
      expect(getEmbeddingsSpy).toHaveBeenCalled();
      
      const lastCallArgs = getEmbeddingsSpy.mock.calls[0][0] as string[];
      
      // 要件のテキストがマスクされているか
      expect(lastCallArgs).toContain("ユーザー <REDACTED:EMAIL> の情報を表示する");
      // ファイルのコンテンツがマスクされているか
      expect(lastCallArgs).toContain("const ip = '<REDACTED:IP>';");
      
      // 元の PII が含まれていないか
      lastCallArgs.forEach(text => {
        expect(text).not.toContain("test@example.com");
        expect(text).not.toContain("192.168.1.1");
      });

    } finally {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });
});
