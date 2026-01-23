# Issue-29: Kiro統合 Embeddings 追加計画

## 背景
- `sdd_validate_gap --deep` は現在「要件抽出・設計カバレッジ・意味的分析プロンプト生成」まで実装済み
- Issue-29 では Embeddings による意味的乖離（Gap）の自動検出が要求されている

## 決定事項
- Embeddings 提供元は外部API（OpenAI互換）を優先
- 意味的ギャップの判定単位は要件単位
- 類似度のデフォルト閾値は 0.75（環境変数で上書き可能）

## スコープ
### IN
- 仕様書（requirements.md）と変更コードのベクトル化
- 意味的な乖離（Gap）の自動検出とレポート出力
- Kiro統合の深度分析レポート拡張
- テスト追加（Bun Test）
- README への設定追記

### OUT
- Kiro仕様フォーマットの変更
- 仕様生成機構（cc-sdd 側）の変更

## 実装タスク
### 1. Embeddings 利用インターフェース設計
- `fetch` ベースで OpenAI互換API を叩く薄い抽象化を追加
- 必要な環境変数（例: `SDD_EMBEDDINGS_API_BASE`, `SDD_EMBEDDINGS_API_KEY`, `SDD_EMBEDDINGS_MODEL`, `SDD_EMBEDDINGS_THRESHOLD`）を定義
- 失敗時の扱い（未設定/失敗時は SKIP + 理由表示）を決定

### 2. テキスト前処理とベクトル検索
- requirements.md の抽出要件（`ExtractedRequirement`）をベクトル化
- 変更ファイル内容をチャンク化してベクトル化（上限サイズ・対象拡張子を制御）
- コサイン類似度で要件ごとの Top-1 類似度を算出
- 類似度 < 0.75 を「意味的ギャップ」として検出

### 3. Kiro統合の拡張
- `.opencode/lib/kiro-utils.ts` の `analyzeKiroGapDeep` に意味的ギャップ結果を追加
- `formatEnhancedKiroGapReport` に「意味的ギャップ」セクションを出力
- `.opencode/tools/sdd_validate_gap.ts` の Kiro統合レポートに反映

### 4. テスト追加
- `__tests__/lib/kiro-utils.test.ts` に Embeddings 結果のギャップ検出テストを追加
- `__tests__/tools/sdd_validate_gap.enhanced.test.ts` にレポート出力の検証を追加
- API未設定時に SKIP となるケースをテスト

### 5. ドキュメント更新
- `README.md` の Kiro統合セクションに Embeddings 設定方法を追記
- `sdd_validate_gap --deep` で意味的検証が有効化される旨を明記

## 受け入れ基準
- `sdd_validate_gap --deep` のレポートに「意味的ギャップ」セクションが追加される
- Embeddings 設定がない場合、レポートに SKIP 理由が表示される
- 類似度閾値 0.75 をデフォルトとし、環境変数で上書き可能
- `bun test` が通る

## 検証コマンド
```bash
bun test
```
