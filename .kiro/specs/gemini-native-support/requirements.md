# Requirements: gemini-native-support

## 1. 概要
Gemini API をネイティブにサポートするための要件定義。OpenAI 互換形式から Gemini 形式への変換ロジック、および環境変数による設定を定義する。

## 2. メッセージマッピングロジック

### 2.1 ロール変換
OpenAI 形式のメッセージ配列を Gemini API の `contents` および `system_instruction` に変換する。

- `system` ロール: `system_instruction` フィールドへ変換。
- `user` ロール: `contents` 配列内の `role: "user"` へ変換。
- `assistant` ロール: `contents` 配列内の `role: "model"` へ変換。

### 2.2 具体的な変換例

#### Before (OpenAI 形式)
```json
[
  { "role": "system", "content": "あなたは優秀なエンジニアです。" },
  { "role": "user", "content": "こんにちは" },
  { "role": "assistant", "content": "こんにちは！何かお手伝いしましょうか？" }
]
```

#### After (Gemini 形式)
```json
{
  "system_instruction": {
    "parts": [
      { "text": "あなたは優秀なエンジニアです。" }
    ]
  },
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "こんにちは" }]
    },
    {
      "role": "model",
      "parts": [{ "text": "こんにちは！何かお手伝いしましょうか？" }]
    }
  ]
}
```

## 3. 環境変数定義
以下の環境変数を使用してプロバイダー設定を行う。

| 変数名 | 説明 | 例 |
| :--- | :--- | :--- |
| `SDD_AI_PROVIDER` | 使用する AI プロバイダー | `gemini` |
| `SDD_GEMINI_API_KEY` | Google AI Studio で発行された API キー | `AIzaSy...` |
| `SDD_LLM_MODEL` | 使用する生成モデル名 | `gemini-1.5-pro`, `gemini-1.5-flash` |
| `SDD_EMBEDDINGS_MODEL` | 使用する埋め込みモデル名 | `text-embedding-004` |

## 4. 制約事項
- 外部 SDK (Google Generative AI SDK 等) は使用せず、`fetch` による HTTP リクエストで実装すること。
- OpenAI 形式の `system` メッセージが複数ある場合は、結合して一つの `system_instruction` とする。
