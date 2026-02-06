# OmO-SDD-Hybrid

> **For AI Agents & Developers:**
> プロジェクトの規約、構造、開発ルールについては、ルートおよび各ディレクトリの [AGENTS.md](./AGENTS.md) を **必ず** 参照してください。
> 本プロジェクトは **Strict Hybrid Structure** を採用しており、ソースコードの配置場所が標準的な構成とは異なります。

タスク単位のファイルアクセス制御で「Vibe Coding（仕様逸脱）」を物理的に抑止する OpenCode プラグイン。

## Threat Model（脅威モデル）

> [!WARNING]
> **Out of Scope Editing**: 本プラグインのガード機能は OpenCode 環境外での直接的なファイル編集（ローカルの VSCode 等）には適用されません。運用上の注意点については [運用ガイド](./docs/OPERATIONS.md) を参照してください。

### 防げること
- タスク未選択状態でのコード編集（NO_ACTIVE_TASK）
- タスクスコープ外ファイルへの編集（SCOPE_DENIED）
- ワークツリー外への書き込み（OUTSIDE_WORKTREE）
- ガードモード弱体化（block → warn への降格防止）

### 防げないこと
- LLMがsdd_start_taskを呼ばずに直接編集を試みること（Gatekeeperで検知・ブロックするが、LLMの意図そのものは制御不可）
- 許可されたスコープ内での不適切な変更
- OpenCode Permission設定を迂回する攻撃
- 悪意のあるユーザーによる手動ファイル編集

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
まず `.gitignore` に `.env` を追加してから、プロジェクトルートに `.env` を作成してください。
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

### 4. Kiro (cc-sdd) 統合ワークフロー（推奨）

Kiroツール (`.kiro/`) とSDD (`specs/`) を組み合わせた理想的な開発サイクルです。
詳細は **[3. 参考開発フロー](#3-参考開発フローsddサイクル)** を参照してください。

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

### 2. スラッシュコマンド一覧 (推奨)

開発フェーズに応じて、以下のスラッシュコマンドを使用して役割（ペルソナ）を切り替えます。

| コマンド | ロール | 説明 |
|---------|--------|------|
| `/profile` | **Architect** | 仕様策定・設計フェーズ。要件定義やタスク分解を行います。 |
| `/impl` | **Implementer** | 実装フェーズ。スコープを厳守し、Vibe Coding を回避しながらコーディングします。 |
| `/validate` | **Reviewer** | 検証フェーズ。仕様と実装の乖離（Gap）を厳格に分析します。 |

#### 💡 高度な使い方 (Advanced Usage)

スラッシュコマンドは、テキストやファイルを同時に渡すことで、初期コンテキストを効率的に伝えることができます。

- **指示を同時に渡す**:
  ```bash
  /profile OAuth2の認証を追加したい
  ```
  Architectロールになり、即座にOAuth2の要件定義セッションを開始します。

- **ファイルをコンテキストにする**:
  ```bash
  /profile @specs/initial_idea.md
  ```
  手持ちのメモや既存のドキュメント（`@ファイル名`）をベースに、仕様策定を開始します。

- **実装指示を渡す**:
  ```bash
  /impl @src/auth/login.ts のバリデーションロジックを修正して
  ```
  Implementerロールになり、特定のファイルに対する具体的な実装指示を渡せます。

### 3. 参考開発フロー（SDDサイクル）

プロジェクトのフェーズに合わせて、以下の3段階で開発を進めます。
**アイコンの意味**: 👤 ユーザーが実行 / 🤖 エージェントが自動実行

#### Phase 1: Architect - 仕様策定とタスク分解
AIと対話しながら「何を作るか」を固め、タスクを定義します。

1. **ロール切替**:
   ```bash
   👤 /profile
   # または
   👤 /profile OAuth2の実装をしたい
   ```
   **Architect ロール**に切り替わります。

2. **仕様策定 (Design)**:
   対話を通じて仕様書（`.kiro/specs/`）を作成・洗練させます。以下のコマンドはエージェントが必要に応じて裏側で実行します。
   ```bash
   🤖 sdd_kiro init --feature <feature-name>
   🤖 sdd_kiro requirements --feature <feature-name>
   🤖 sdd_kiro design --feature <feature-name>
   ```

3. **タスク定義 & Scope設定 (手動)**:
   仕様が固まったらタスクを定義し、`specs/tasks.md` に **編集権限（Scope）** を記述します。これがGatekeeperの設定となります。
   ```markdown
   # specs/tasks.md
   * [ ] <feature-name>: 機能の実装 (Scope: `src/features/<feature-name>/**`)
   ```

#### Phase 2: Implementer - 実装
許可された範囲（Scope）内で、仕様に忠実な実装を行います。

1. **実装モード開始**:
   ```bash
   👤 /impl
   # または
   👤 /impl @specs/tasks.md Task-1を開始して
   ```
   **Implementer ロール**に切り替わります。

2. **タスク開始処理**:
   ユーザーが`/impl`を実行すると、エージェントは自動的に以下のコマンドを実行してロックを取得します。
   ```bash
   🤖 sdd_start_task <feature-name>
   🤖 sdd_kiro impl --feature <feature-name>
   ```

3. **コーディング & 検証**:
   ユーザーが実装の指示を出し、エージェントがコードを書きます。その過程で、エージェントは自律的に検証ツールを使用します。
   ```bash
   🤖 sdd_validate_gap --kiroSpec <feature-name> --deep
   ```

#### Phase 3: Reviewer - 検証と納品
実装完了後、客観的な視点で検証を行います。

1. **検証モード開始**:
   ```bash
   👤 /validate
   ```
   **Reviewer ロール**に切り替わります。

2. **厳密な検証 (Validation)**:
   エージェントは以下のチェックを順次実行し、レポートを提出します。
   *   🤖 `sdd_validate_gap --deep` (Gap Analysis)
   *   🤖 `sdd_kiro validate-design` (Design Check)

#### 💡 仕様変更が必要になったら？
実装中に仕様の不備に気づいた場合、勝手にコードを変える（Vibe Coding）のではなく、**必ず Phase 1 (Architect) に戻って仕様書から修正**してください。これにより「ドキュメントとコードの乖離」を恒久的に防ぎます。

#### Step 4: タスク終了
全ての検証が完了したらタスクを終了し、ロックを解除します。これだけは **ユーザーが明示的に** 行うのが安全です（またはエージェントに頼んでも構いません）。
```bash
👤 sdd_end_task
```

## コマンド一覧 (CLI Tools)

エージェントが内部的に使用する、またはユーザーが手動で実行するCLIツール群です。

| コマンド | 説明 |
|---------|------|
| `sdd_start_task <TaskID>` | 指定したタスクを開始し、編集スコープを有効化します（ロール自動判定あり）。 |
| `sdd_end_task` | 現在のタスクを終了し、状態をクリアします。 |
| `sdd_show_context` | 現在アクティブなタスク、許可されたスコープ、開始時間を表示します。 |
| `sdd_project_status` | プロジェクトの進捗状況とステータスを表示します。 |
| `sdd_validate_gap` | 仕様とコードのギャップ分析、テスト実行、Diagnostics検証を行います。 |
| `sdd_request_spec_change` | Implementerが仕様変更を提案するためのリクエストを作成します。 |
| `sdd_review_pending` | 保留中の仕様変更提案を一覧表示します（Architect専用）。 |
| `sdd_merge_change` | 保留中の仕様変更をマージし、アーカイブします（Architect専用）。 |
| `sdd_reject_change` | 保留中の仕様変更を却下し、アーカイブします（Architect専用）。 |
| `sdd_report_bug` | 発見された不具合をバグ票として報告します。 |
| `sdd_scaffold_specs` | Kiro形式の仕様書（Requirements/Design/Tasks）の雛形（テンプレート）を生成・初期化します。 |
| `sdd_generate_tasks` | 要件・設計ファイルに基づき、タスク定義ファイル（tasks.md）の雛形を生成します。 |
| `sdd_generate_tests` | requirements.md の受入条件からテストコードの雛形を生成します。 |
| `sdd_lint_tasks` | .kiro/specs/*/tasks.md のフォーマットを検証し、問題を報告します（Markdown ASTベース）。 |
| `sdd_sync_kiro` | Kiro仕様とRoot tasks.md を同期します。 |
| `sdd_set_guard_mode` | Gatekeeperの動作モード（warn/block）を切り替えます。 |
| `sdd_force_unlock` | 【非常用】ロック状態を強制解除します。 |
| `sdd_ci_runner` | CI環境での検証（tasks.md整合性、変更範囲ガード）を実行します。 |
| `sdd_kiro` | Kiro互換のコマンドエントリーポイント。各機能の詳細は後述。 |

## ドキュメント / 運用

詳細な運用方法やトラブルシューティングについては、以下のドキュメントを参照してください。

- [運用ガイド (docs/OPERATIONS.md)](./docs/OPERATIONS.md): 運用上の制約、復旧ランブック、環境変数リファレンス。

## 高度な機能: Kiro 統合 (cc-sdd)

[cc-sdd](https://github.com/gotalab/cc-sdd)（Kiro）と連携し、仕様書（Requirements, Design, Tasks）と実装の整合を確認しやすくします。

### セットアップ

```bash
npx cc-sdd@latest --claude
```

### 仕様駆動ワークフロー

詳細は **[3. 参考開発フロー](#3-参考開発フローsddサイクル)** を参照してください。

### sdd_kiro コマンドリファレンス

`sdd_kiro` は以下のサブコマンドをサポートします。通常はスラッシュコマンド経由でAgentが実行しますが、手動実行も可能です。

### 意味的検証 (Semantic Verification)

`sdd_validate_gap` に `--deep` オプションを明示的に指定し、かつ環境変数が設定されている場合のみ、Embeddings（ベクトル検索）を用いた意味的ギャップ検出が行われます（オプトイン方式）。

#### 必要な設定
以下の環境変数を設定してください（`.env` ファイル対応）。

| 変数名 | デフォルト値 | 説明 |
|--------|------------|------|
| `SDD_EMBEDDINGS_API_KEY` | (必須) | OpenAI互換APIのキー |
| `SDD_EMBEDDINGS_API_BASE` | `https://api.openai.com/v1` | APIエンドポイント |
| `SDD_EMBEDDINGS_MODEL` | `text-embedding-3-small` | 使用するモデル |
| `SDD_EMBEDDINGS_THRESHOLD` | `0.75` | 類似度閾値 (0.0 - 1.0) |

設定がない場合、意味的分析は安全にスキップされます。

### データ取り扱い（deep分析）

`--deep` オプション使用時に外部APIへ送信されるデータと、プライバシーに関する注意事項を説明します。

#### 送信されるデータ

以下のテキストが Embeddings API（OpenAI互換）にPOSTされます。

- **仕様書**: `requirements.md`, `design.md` の各セクション
- **コード**: 関数/クラス単位のテキスト断片
- **ファイルパス**: 相対パス形式

#### 検証の有効化 (Opt-in)

- 意味的分析（外部送信を含む）を実行するには、`--deep` オプションの指定が **必須** です。
- 環境変数が設定されていても、`--deep` を指定しない限りデータは送信されません。

#### 注意

> [!WARNING]
> - 機密情報や個人情報を含むコードに対しては、deep分析の使用を **避けてください**
> - 送信前のPIIマスキング機能は **現時点で未実装** です
> - 将来的にローカルEmbeddingモデル対応を検討しています

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

## Gitフックの設定 (Pre-commit)

ローカルでのコミット時に `validate_gap` を強制することで、不整合な状態でのコミット（Vibe Coding）を防止できます。
`.git/hooks/pre-commit` はGit管理対象外のため、開発者が個別に設定する必要があります。

**設定手順:**

1. `.git/hooks/pre-commit` を作成:

```bash
cat << 'EOF' > .git/hooks/pre-commit
#!/bin/bash
set -euo pipefail

echo "🔍 Running SDD validation..."

# 1. ユニットテストの実行
bun test

# 2. SDD整合性チェック (tasks.md vs 変更範囲)
# 内部で .opencode/tools/sdd_ci_runner.ts を呼び出し、スコープ違反があればブロックします
# ローカル実行時は staged files (コミット予定ファイル) のみが検証対象です
bun run scripts/sdd_ci_validate.ts

echo "✅ All checks passed."
EOF
```

2. 実行権限を付与:

```bash
chmod +x .git/hooks/pre-commit
```

### CIでの変更範囲検証（Scope Guard / Issue #87）

`bun run scripts/sdd_ci_validate.ts` は内部で `.opencode/tools/sdd_ci_runner.ts` を実行し、
**`specs/tasks.md` の Scope（glob）と、git差分で検出した変更ファイルを突合**して検証します。
Scope外の変更が含まれている場合は **Fail-Closed（CIを失敗）** します。

#### デフォルト挙動

- `specs/**`, `.opencode/**` は Always Allow（Scope突合をスキップして許可）
- それ以外の変更は、`specs/tasks.md` に定義された Scope のいずれかに一致する必要があります

#### フラグ

`scripts/sdd_ci_validate.ts` は引数を runner に転送できるため、以下のように指定できます。

```bash
# Always Allow を無効化し、すべての変更が tasks.md の Scope に含まれることを必須化
bun run scripts/sdd_ci_validate.ts -- --strict

# CIで未追跡ファイル（git管理外）が存在しても失敗しない
bun run scripts/sdd_ci_validate.ts -- --allow-untracked
```

- `--strict`:
  - Always Allow（`specs/**`, `.opencode/**`）を無効化し、これらのパスも Scope に含まれない場合は失敗します。
- `--allow-untracked`:
  - CIモードで未追跡ファイル（`git ls-files --others --exclude-standard`）が存在しても失敗しません。
  - ローカルの pre-commit（staged files 検証）では未追跡ファイル検出は行いません。

## トラブルシューティング

### ロック残留（ゾンビロック）の対処

`sdd_start_task` 等の実行時にロック取得エラー (`ELOCKED`) が発生し、長時間待っても解消しない場合、以下の手順で対処してください。

#### 1. 自動回復を待つ
デフォルトでは、ロックが 30秒 以上更新されない（stale）場合、次の再試行時に自動的に削除されます。まずは 1分程度待ってから再実行してください。

#### 2. 強制解除ツールを使用する
それでも解決しない場合、`sdd_force_unlock` ツールを使用します。

**ステップ 1: 診断 (Dry-run)**
```bash
sdd_force_unlock
```
現在のロック状態と State ファイルの健全性を表示します。

**ステップ 2: 強制解除**
```bash
sdd_force_unlock --force true
```
ロックファイル（`.opencode/state.lock` 等）を物理的に削除します。

#### 3. 設定の調整 (Environment Variables)
環境変数でロックのタイムアウト設定を調整できます。

| 変数名 | デフォルト | 説明 |
|--------|------------|------|
| `SDD_LOCK_STALE` | `30000` (30秒) | ロックが stale（期限切れ）とみなされるまでの時間 (ms) |
| `SDD_LOCK_RETRIES` | `10` | ロック取得失敗時のリトライ回数（各回 4秒待機） |

## 環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `SDD_GUARD_MODE` | `warn` (default) / `block` | スコープ外ファイル編集時の動作。`block` 推奨。環境変数より設定ファイル (`.opencode/state/guard-mode.json`) が優先されます（弱体化不可）。 |
| `SDD_SKIP_TEST_EXECUTION` | `true` / `false` | `validate_gap` 実行時のテスト自動実行をスキップします。 |
| `SDD_STATE_HMAC_KEY` | (自動生成) | state改ざん検知用のHMACキー。未設定の場合は `.opencode/state/state-hmac.key` を自動生成します。 |
| `SDD_SCOPE_FORMAT` | `lenient` | `strict` に設定すると、Scope定義のバッククォート囲み（Scope: \`path/**\`）を強制します。 |
| `SDD_TASKS_PATH` | `specs/tasks.md` | タスク定義ファイルのパスを変更する場合に使用します。 |
| `SDD_KIRO_DIR` | `.kiro` | Kiro仕様書の格納ディレクトリを変更する場合に使用します。 |
| `SDD_TESTS_OUTPUT_DIR` | `__tests__/generated` | `sdd_generate_tests` で生成されるテストファイルの出力先を指定します。 |

### `SDD_STATE_HMAC_KEY` の固定化（推奨）
ローカルとCIで同一のキーを使用し、キー再生成による意図しない `STATE_CORRUPTED` を防ぎます。

**ローカル（例）**
```bash
export SDD_STATE_HMAC_KEY="your-32bytes-hex-or-base64"
```

**CI（GitHub Actions）**
リポジトリの Secrets に `SDD_STATE_HMAC_KEY` を登録し、環境変数として注入してください。

### ガードモードの設定 (Security)

セキュリティ強化のため、ガードモード（`warn` vs `block`）の設定は環境変数よりも専用の設定ファイルが優先されます。

```bash
# ガードモードを 'block' に設定（推奨）
bun .opencode/tools/sdd_set_guard_mode.ts block
```

- 設定は `.opencode/state/guard-mode.json` に保存されます。
- 保存された設定が `block` の場合、環境変数で `SDD_GUARD_MODE=warn` と指定しても **強制的に block されます**（弱体化の防止）。
- 弱体化の試行は `.opencode/state/guard-mode.log` に監査ログとして記録されます。
- **Fail-Closed**: 設定ファイルが欠損または破損している場合、自動的に `block` モードが適用されます（環境変数が `warn` であっても無視されます）。

## ファイル構成

本プロジェクトは **Hybrid構成** を採用しています。
ソースコードの大部分は `.opencode/` に隠蔽され、`src/` はユーザー実装領域として管理されます。

詳細な構造と役割については、各ディレクトリの `AGENTS.md` を参照してください。

```text
omo-sdd-hybrid/
├── .opencode/           # [CORE] プラグインの実体 (Hidden Source)
│   ├── plugins/         # Gatekeeper, Context Injector
│   ├── tools/           # CLIコマンド実装
│   ├── lib/             # 共通ロジック & 状態管理
│   └── state/           # 実行時状態 (Git管理外)
├── src/                 # [USER] SDD管理対象のコード領域 (Userland)
├── specs/               # [USER] タスク・仕様定義 (Source of Truth)
├── __tests__/           # [DEV] テスト (.opencodeと鏡像構成)
└── package.json         # 開発用設定
```

## 開発 (Development)

本プロジェクトの開発には **Bun** を使用します（推奨バージョン: `>=1.0.0`）。
詳細なコーディング規約やテスト方法は [AGENTS.md](./AGENTS.md) を参照してください。

### 主な開発コマンド

| コマンド | 説明 |
|---------|------|
| `bun test` | 全テストを実行します。 |
| `bun test:seq` | テストを直列実行します（推奨）。StateやLockの競合を防ぐため、CI等ではこちらを使用してください。 |
| `bun run scripts/sdd_ci_validate.ts` | CI用バリデーションスクリプトを実行します。 |

## ライセンス

MIT
