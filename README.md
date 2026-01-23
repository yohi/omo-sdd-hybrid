# OmO-SDD-Hybrid

> **For AI Agents & Developers:**
> プロジェクトの規約、構造、開発ルールについては、ルートおよび各ディレクトリの [AGENTS.md](./AGENTS.md) を **必ず** 参照してください。

タスク単位のファイルアクセス制御で「Vibe Coding（仕様逸脱）」を物理的に抑止する OpenCode プラグイン。

## インストール

プロジェクトの `opencode.json` (または `opencode.jsonc`) にプラグイン定義を追加することでインストールできます。

### 1. レジストリの設定

GitHub Packages からパッケージをダウンロードするために、認証設定が必要です。

#### 1. GitHub Personal Access Token (PAT) の作成
1. GitHub の [Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens) にアクセスします。
2. "Generate new token (classic)" をクリックします。
3. **read:packages** スコープにチェックを入れてトークンを生成します。

#### 2. .npmrc の設定
プロジェクトのルートに `.npmrc` ファイルを作成（または追記）し、以下の設定を追加します。
セキュリティのため、トークンを直接ファイルに記述せず、環境変数 `NODE_AUTH_TOKEN` を使用することを強く推奨します。

```ini
@yohi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

この設定により、`@yohi` スコープのパッケージは GitHub Packages から取得され、認証には環境変数が使用されます。

#### 3. 環境変数 NODE_AUTH_TOKEN の設定
`.npmrc` で参照されている `NODE_AUTH_TOKEN` を有効にする手順です。

**シェルでの設定 (Mac/Linux):**
```bash
export NODE_AUTH_TOKEN=your_token_here
```

**.env ファイルでの設定:**
プロジェクトルートの `.env` ファイルに記述します（`.gitignore` への追加を忘れずに）。
```env
NODE_AUTH_TOKEN=your_token_here
```

**CI/CD (GitHub Actions):**
リポジトリの Secrets に `NODE_AUTH_TOKEN` として登録してください。

### 2. configへの追加

`opencode.jsonc` の `plugin` 配列にパッケージ名を追加します。

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    // ... other plugins
    "@yohi/omo-sdd-hybrid" 
  ]
}
```

OpenCode 起動時に自動的にインストールされ、Gatekeeper 機能（ファイル監視）が有効になります。

## ベストプラクティス

SDD（仕様駆動開発）の効果を最大化するための推奨運用ルールです。

### 1. タスク設計の粒度
- **1タスク = 1コミット/PR** を目指します。
- レビューが困難になる巨大なタスクは避け、実装可能な単位（例: APIエンドポイント1つ、コンポーネント1つ）に分割してください。

### 2. スコープ（Scope）の絞り込み
- **最小権限の原則**: `src/**` のような広すぎる指定は避け、影響範囲を特定できる粒度（例: `src/auth/**`）で指定します。
- これにより、意図しない依存関係の発生や、無関係なファイルへの変更（Vibe Coding）を物理的に防げます。

### 3. こまめな検証
- 実装の区切りで頻繁に `sdd_validate_gap` を実行してください。
- 早い段階で「スコープ外への変更」や「テスト不整合」を検知することで、手戻りを最小化できます。

## 使い方 (Basic Usage)

インストール後、OpenCode 環境は `.opencode/plugins` 内の Gatekeeper を自動的に認識することを想定しています。

### 1. タスク定義ファイルの作成

プロジェクトルートに `specs/tasks.md` を作成し、タスクと編集スコープ（Scope）を定義します。

**`specs/tasks.md` の例:**
```markdown
# Tasks

* [ ] Task-1: ユーザー認証機能の実装 (Scope: `src/auth/**`, `tests/auth/**`)
* [ ] Task-2: データベーススキーマの更新 (Scope: `prisma/schema.prisma`)
```

- **Scope**: Globパターンで指定します。複数指定が可能で、定義されたファイル以外への書き込みはブロック（または警告）されます。

### 2. 開発フロー（SDDサイクル）

#### Step 1: タスクを開始する
作業するタスクのIDを指定して開始します。これにより、編集可能なスコープが制限されます。

```bash
sdd_start_task Task-1
```

#### Step 2: 実装する
`allowedScopes` に含まれるファイルのみを編集してください。
- **Scope外の編集**: `SDD_GUARD_MODE` が `block` の場合、保存時にエラーとなり拒否されます。`warn` の場合は警告が表示されます。

#### Step 3: 検証する
実装が仕様と整合しているかを確認します。

```bash
sdd_validate_gap
```
- スコープ外の変更がないかチェック
- TypeScript のエラー診断（Diagnostics）
- スコープ内のテスト実行
- Kiro 仕様書との整合性チェック（後述）

#### Step 4: タスクを終了する
作業が完了したらタスクを終了し、スコープ制限を解除します。

```bash
sdd_end_task
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `sdd_start_task <TaskID>` | 指定したタスクを開始し、編集スコープを有効化します。 |
| `sdd_end_task` | 現在のタスクを終了し、状態をクリアします。 |
| `sdd_show_context` | 現在アクティブなタスク、許可されたスコープ、開始時間を表示します。 |
| `sdd_validate_gap` | 仕様とコードのギャップ分析、テスト実行、Diagnostics検証を行います。 |

## 高度な機能: Kiro 統合 (cc-sdd)

[cc-sdd](https://github.com/gotalab/cc-sdd) と連携し、仕様書（Requirements, Design, Tasks）との完全なトレーサビリティを実現します。

### セットアップ

Kiro（cc-sdd）をプロジェクトにセットアップします。

```bash
npx cc-sdd@latest --claude
```

### 仕様駆動ワークフロー

#### Step 1: 仕様の作成
`cc-sdd` のAIコマンドを使用して、`.kiro/specs/<feature-name>/` 配下に仕様を生成します。

```text
/kiro:spec-init <feature-name>       # 仕様ディレクトリの初期化
/kiro:spec-requirements <feature-name> # 要件定義 (requirements.md)
/kiro:spec-design <feature-name> -y    # 設計 (design.md)
/kiro:spec-tasks <feature-name> -y     # タスク分解 (tasks.md)
```

#### Step 2: SDDタスクとの同期
`sdd_start_task` で使用するタスクIDを、Kiroの仕様名（`<feature-name>`）と一致させると便利です。
あるいは、Kiroが生成した `tasks.md` の内容をプロジェクトルートの `specs/tasks.md` に転記し、Scopeを追記します。

#### Step 3: ギャップ分析（Deep Analysis）
実装中、仕様との乖離がないかを深く分析します。

```bash
sdd_validate_gap --kiroSpec <feature-name> --deep
```

**`--deep` オプションの効果:**
- **構造的分析**: 要件（REQ-XXX）の網羅状況、設計で定義されたコンポーネントの実装状況をチェックします。
- **意味的分析**: LLM用のプロンプトを生成し、「実装が本当に要件を満たしているか」を意味的に検証する準備をします。

### Kiro統合のベストプラクティス

1. **仕様の一元管理**:
   - 原則として、仕様変更は必ず `.kiro/specs/` 内のMarkdownファイルを更新してからコードに反映させてください。
   - コード先行で仕様が変わると、`validate_gap` で常に警告が出ることになり、形骸化の原因になります。

2. **Tasks の連携**:
   - Kiro で生成された `tasks.md` は詳細な実装ステップを含んでいます。
   - SDD の `specs/tasks.md` は Gatekeeper 用のアクセスコントロール定義として機能します。
   - 両者を運用し分けるのが基本ですが、混同しないよう「Scope定義は `specs/tasks.md` だけに書く」というルールを徹底してください。

3. **Deep Analysis の活用**:
   - PR提出前や、主要な機能実装のマイルストーンで必ず `--deep` オプション付きの検証を実行し、AIによる客観的なレビューを受けてください。

## 環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `SDD_GUARD_MODE` | `warn` (default) / `block` | スコープ外ファイル編集時の動作。`block` 推奨。 |
| `SDD_SKIP_TEST_EXECUTION` | `true` / `false` | `validate_gap` 実行時のテスト自動実行をスキップします。 |

## ファイル構成

このプラグイン自体も SDD 構成に従っています。

```text
omo-sdd-hybrid/
├── specs/               # 仕様定義
├── .opencode/           # プラグイン実装（ユーザーからは隠蔽）
│   ├── plugins/         # Gatekeeper ロジック
│   └── tools/           # CLI ツール実装
└── __tests__/           # テストコード
```

## ライセンス

MIT
