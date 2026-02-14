import { expect, test, describe, mock, beforeEach } from "bun:test";
import { findSemanticGaps } from "../../.opencode/lib/semantic-search";
import * as embeddingsProvider from "../../.opencode/lib/embeddings-provider";

// getEmbeddings をモック
mock.module("../../.opencode/lib/embeddings-provider", () => ({
  getEmbeddings: mock(async (texts: string[]) => {
    // 呼ばれた時のテキストを検証するために、texts をそのまま返すようなダミーの数値を生成
    return texts.map(() => [0.1, 0.2, 0.3]);
  }),
  isEmbeddingsEnabled: () => true,
}));

describe("semantic-search PII masking", () => {
  beforeEach(() => {
    mock.restore();
    // 環境変数の設定（テスト用）
    process.env.SDD_EMBEDDINGS_API_KEY = "dummy-key";
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

      const { getEmbeddings } = await import("../../.opencode/lib/embeddings-provider");
      const mockedGetEmbeddings = getEmbeddings as any;

      // getEmbeddings が呼ばれた際の引数を確認
      expect(mockedGetEmbeddings).toHaveBeenCalled();
      
      const lastCallArgs = mockedGetEmbeddings.mock.calls[0][0] as string[];
      
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
