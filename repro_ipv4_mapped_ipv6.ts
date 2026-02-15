import { mask } from './.opencode/lib/pii-masker';

const testStr = "Testing IPv4-mapped IPv6: ::ffff:192.0.2.128";
const masked = mask(testStr);
console.log("Original:", testStr);
console.log("Masked:  ", masked);

// IPv6として正しくマスクされているか確認
// 現状のバグでは IPV4部分だけ先にマスクされてしまう可能性がある
// 期待値: "<REDACTED:IPV6>" が含まれ、"<REDACTED:IP>" (IPv4) は含まれないこと
if (masked.includes("<REDACTED:IPV6>") && !masked.includes("<REDACTED:IP>")) {
  console.log("SUCCESS: IPv4-mapped IPv6 matched correctly as IPv6.");
  process.exit(0);
} else {
  console.log("FAILURE: IPv4-mapped IPv6 was not matched correctly.");
  process.exit(1);
}
