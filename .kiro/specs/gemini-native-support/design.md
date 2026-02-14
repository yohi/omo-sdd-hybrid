# Design: gemini-native-support

## 1. アーキテクチャ概要
既存の `LLMProvider` および `EmbeddingsProvider` に Strategy パターンを導入し、Gemini API 実装（ネイティブ `fetch` 使用）を追加する。これにより、OpenAI 形式のインターフェースを維持したまま Gemini を利用可能にする。

## 2. コンポーネント設計

### 2.1 Strategy パターン
- `LLMProvider`: 環境変数に基づき、`OpenAILLMStrategy` または `GeminiLLMStrategy` を選択。
- `GeminiLLMStrategy`: Gemini API への変換とリクエストを担当。

### 2.2 Mermaid Diagram
```mermaid
graph TD
    Client --> LLMProvider
    LLMProvider --> ILLMStrategy
    ILLMStrategy <|-- OpenAILLMStrategy
    ILLMStrategy <|-- GeminiLLMStrategy
    GeminiLLMStrategy --> GeminiAPI[Gemini API via fetch]
```

## 3. コンポーネント
- `MessageMapper`: OpenAI 形式から Gemini 形式へのロール変換ロジックをカプセル化する。
- `GeminiHttpClient`: `fetch` を使用した Gemini API への認証およびリクエスト送信の共通基盤。

## 4. API Endpoints
- `POST /v1beta/models/{model}:generateContent`: テキスト生成用エンドポイント。
- `POST /v1beta/models/{model}:embedContent`: 埋め込みベクトル生成用エンドポイント。

## 5. データ構造
### 5.1 ILLMStrategy
```typescript
interface ILLMStrategy {
  generateCompletion(messages: Message[]): Promise<string>;
  streamCompletion(messages: Message[]): AsyncIterable<string>;
}
```

## 6. 依存関係
- Bun Runtime `fetch`: HTTP 通信に使用。外部 SDK (Google Generative AI SDK) は使用しない。
