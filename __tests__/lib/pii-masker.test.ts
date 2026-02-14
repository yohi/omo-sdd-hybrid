import { expect, test, describe } from "bun:test";
import { mask } from "../../.opencode/lib/pii-masker";

describe("pii-masker", () => {
  test("メールアドレスをマスクできること", () => {
    const text = "私のメールアドレスは test@example.com です。";
    expect(mask(text)).toBe("私のメールアドレスは <REDACTED:EMAIL> です。");
  });

  test("IPv4アドレスをマスクできること", () => {
    const text = "サーバーのIPは 192.168.1.1 です。";
    expect(mask(text)).toBe("サーバーのIPは <REDACTED:IP> です。");
  });

  test("高エントロピーな文字列（シークレット）をマスクできること", () => {
    const secret = "a".repeat(32); // 32文字の英数字
    const text = `APIキーは ${secret} です。`;
    expect(mask(text)).toBe("APIキーは <REDACTED:SECRET> です。");
  });

  test("複数のPIIが混在していてもマスクできること", () => {
    const text = "user@test.com から 10.0.0.1 へのリクエストに SGVsbG8gV29ybGQgZnJvbSBPcGVuQ29kZSE= が含まれていました。";
    const masked = mask(text);
    expect(masked).toContain("<REDACTED:EMAIL>");
    expect(masked).toContain("<REDACTED:IP>");
    expect(masked).toContain("<REDACTED:SECRET>");
  });

  test("PIIが含まれない場合はそのまま返すこと", () => {
    const text = "これは普通のテキストです。";
    expect(mask(text)).toBe(text);
  });
});
