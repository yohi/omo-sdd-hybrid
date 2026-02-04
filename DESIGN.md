# Design Philosophy

## 1. Hybrid Architecture (Best of Both Worlds)

本プロジェクト `omo-sdd-hybrid` は、OpenCode エコシステムにおける二つの強力な概念、**`oh-my-opencode`** のエージェント体験と、**`cc-sdd` (Kiro)** の仕様駆動開発サイクルを統合・補完するために設計されました。

### 統合のアプローチ: "Porting & Native Implementation"

外部ライブラリへの依存（`dependencies`）としてこれらを追加するのではなく、それぞれの**設計思想（Design Patterns）とコアロジックを本プロジェクト内に移植・ネイティブ実装**する方針を採用しています。

| 統合元 | 採用した概念 | 実装アプローチ | メリット |
| :--- | :--- | :--- | :--- |
| **`oh-my-opencode`** | **Smart Agent Selection**<br>(コンテキストに応じた最適なエージェント/戦略の自動選択) | ルーターロジックを参考にした**ネイティブ実装**。<br>(`agent-selector.ts` 等) | 外部依存なしで高度な体験を提供。<br>動作の軽量化と安定性の確保。 |
| **`cc-sdd` (Kiro)** | **Specification Driven Development**<br>(仕様書と実装の乖離検知、ドキュメント構造) | `.kiro` ディレクトリ構造との**ファイルシステム連携**。<br>CLIツールではなく構造仕様への準拠。 | Kiroのバージョン変更影響を最小化。<br>仕様書構造の柔軟な拡張性。 |

### なぜ依存させないのか？

1.  **疎結合の維持**: プラグインが設定ボイラープレート（`oh-my-opencode`）に依存すると循環参照を招くリスクがあるため。
2.  **単体完結性 (Standalone)**: このプラグインをインストールするだけで、追加のセットアップなしに「SmartなSDD体験」が完結する利便性を優先。
3.  **パフォーマンス**: 巨大な依存関係を排除し、CI/CD環境でのインストールと実行を高速化。

## 2. Smart Features (Context-Aware Tools)

すべてのコマンドは「コンテキスト指向」で設計されており、ユーザーの手動入力を最小限に抑えます。

- **Role Awareness**: ユーザーが「Architect」か「Implementer」かをタスクから推論し、検証深度（Deep Analysis）を自動調整。
- **Environment Awareness**: プロジェクトの構成（`package.json`, ファイル構造）を読み取り、最適なテストフレームワークやテンプレートを自動選択。
- **History Awareness**: Gitの変更履歴を解析し、作業サマリーを自動生成。

## 3. Strict SDD (Physical Constraints)

AIエージェントによる「Vibe Coding（雰囲気実装）」を物理的に防ぐため、Gatekeeperによる厳格なファイルアクセス制御を行います。

- **Fail-Closed**: 許可されていない操作はデフォルトでブロック。
- **State-Driven**: すべての制御は永続化されたState（`.opencode/state/`）に基づいて行われ、プロセスの再起動にも耐えうる堅牢性を持つ。
