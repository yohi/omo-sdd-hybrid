# OmO-SDD-Hybrid

> **For AI Agents & Developers:**
> プロジェクトの規約、構造、開発ルールについては、ルートおよび各ディレクトリの [AGENTS.md](./AGENTS.md) を **必ず** 参照してください。
> 本プロジェクトは **Strict Hybrid Structure** を採用しており、ソースコードの配置場所が標準的な構成とは異なります。

タスク単位のファイルアクセス制御で「Vibe Coding（仕様逸脱）」を物理的に抑止する OpenCode プラグイン。

## Threat Model（脅威モデル）

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

#### Phase 1: Architect (仕様策定)
1. **初期化**: `sdd_scaffold_specs --feature <name>` で仕様書セットを生成。
2. **AI対話**: `/kiro` コマンドを使用して Requirements と Design を詰める。
3. **タスク分解**: `sdd_generate_tasks` で実装タスク (`tasks.md`) を自動生成。
4. **Scope定義**: `specs/tasks.md` にタスクIDを登録し、具体的なファイルスコープを定義する。

#### Phase 2: Implementer (実装)
1. **開始**: `sdd_start_task <TaskID>` (Role: implementer)
2. **実装**: `requirements.md` の受入条件を満たすコードを記述。
3. **検証**: `sdd_validate_gap --kiroSpec <name> --deep` で仕様との乖離をAIレビュー。
4. **完了**: `sdd_end_task` → PR作成。

#### Phase 3: Reviewer (レビュー)
1. **CI検証**: `sdd_ci_runner` が「変更ファイルがScope内か」を機械的に保証。
2. **仕様チェック**: PRの内容が `requirements.md` と合致しているかを確認。

このサイクルにより、**「仕様なき実装（Vibe Coding）」** と **「実装なき仕様変更（ドキュメント劣化）」** の両方を防ぎます。

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

> **Note (Smart Role Selection):**
> タスクの説明文（Description）やIDに基づき、適切なロール（Architect または Implementer）が自動的に選択されます。
> - "設計", "仕様", "Design" 等が含まれる場合 → **Architect**
> - それ以外（実装タスク等） → **Implementer**
>
> ロールを手動で指定する場合は `--role` オプションを使用してください。
> ```bash
> sdd_start_task Task-1 --role architect
> ```

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

> **Note (Smart Strategy):**
> 現在のロールが **Architect** の場合、自動的に `--deep` オプション（意味的検証）が有効になります。
> Implementer の場合は、標準の検証（テスト + Diagnostics）が優先されます。

#### Step 4: タスクを終了する
作業が完了したらタスクを終了し、スコープ制限を解除します。

```bash
sdd_end_task
```

> **Note (Smart Summary):**
> タスク終了時に、変更されたファイルの一覧（Git diffベース）がサマリーとして表示されます。
> 作業内容の確認やコミットメッセージの作成に役立ちます。

## コマンド一覧

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
| `sdd_lint_tasks` | tasks.md のフォーマットを検証し、問題を報告します（Markdown ASTベース）。 |
| `sdd_sync_kiro` | Kiro仕様とRoot tasks.md を同期します。 |
| `sdd_set_guard_mode` | Gatekeeperの動作モード（warn/block）を切り替えます。 |
| `sdd_force_unlock` | 【非常用】ロック状態を強制解除します。 |
| `sdd_ci_runner` | CI環境での検証（tasks.md整合性、変更範囲ガード）を実行します。 |

## 高度な機能: Kiro 統合 (cc-sdd)

[cc-sdd](https://github.com/gotalab/cc-sdd)（Kiro）と連携し、仕様書（Requirements, Design, Tasks）と実装の整合を確認しやすくします。

### 現状の対応範囲（重要）

- `cc-sdd@2.x` は主に「スラッシュコマンド等の導入・セットアップ」を行うCLIであり、`cc-sdd validate tasks --json` のようなサブコマンド型の検証CLIとしては動作しません。
- 本プロジェクトの `sdd_validate_gap --kiroSpec <feature>` は、現時点では `.kiro/specs/<feature>/` 配下の主要ファイル存在確認と `tasks.md` のチェックボックス進捗集計を行います。
  - 仕様内容（REQや設計）とコードの意味的な突き合わせは、将来的な拡張（`--deep`）として段階的に追加していく想定です。

### セットアップ

Kiro（cc-sdd）をプロジェクトにセットアップします。

```bash
npx cc-sdd@latest --claude
```

### 仕様書テンプレート生成ツール (sdd_scaffold_specs)

Kiro 形式の仕様書テンプレートを一括生成します。

```bash
sdd_scaffold_specs --feature <name> [--prompt "指示"] [--overwrite true]
```

> **Note (Smart Template Selection):**
> 機能名やプロンプトに含まれるキーワード（例: `api`, `ui`, `db`）に応じて、
> `design.md` のテンプレート内容（必要なセクション）が自動的に最適化されます。

- **生成ファイル**:
  - `.kiro/specs/<feature>/requirements.md`: 要件定義
  - `.kiro/specs/<feature>/design.md`: 基本設計
  - `.kiro/specs/<feature>/tasks.md`: タスク分解

- **引数**:
  - `--feature` (必須): 機能名。英数字記号 `^[A-Za-z][A-Za-z0-9._-]*$` のみ使用可能。
  - `--prompt` (任意): 生成時の追加指示（コンテキスト）。
  - `--overwrite` (任意): 既存ファイルを上書きする場合 `true` を指定。

- **使用例**:
  ```bash
  # 基本的な生成
  sdd_scaffold_specs --feature auth-flow

  # 指示を与えて生成
  sdd_scaffold_specs --feature payment --prompt "Stripeを使用した決済フロー"

  # 強制上書き
  sdd_scaffold_specs --feature auth-flow --overwrite true
  ```

### タスク雛形生成ツール (sdd_generate_tasks)

Kiro 仕様書（Requirements, Design）に基づき、タスク定義ファイル (`tasks.md`) の雛形を生成します。

```bash
sdd_generate_tasks --feature <name> [--overwrite true]
```

- **前提条件**:
  - `.kiro/specs/<feature>/requirements.md` および `design.md` が存在すること。

- **生成ファイル**:
  - `.kiro/specs/<feature>/tasks.md`: タスクリストの雛形

- **引数**:
  - `--feature` (必須): 対象の機能名。
  - `--overwrite` (任意): 既存の `tasks.md` を上書きする場合 `true` を指定。

- **sdd_scaffold_specs との違い**:
  - `sdd_scaffold_specs`: 仕様書セット全体の構造と空ファイルを初期化します。
  - `sdd_generate_tasks`: 既存の要件・設計ファイルからタスクリストのテンプレートを生成します。

- **使用例**:
  ```bash
  # tasks.md の生成
  sdd_generate_tasks --feature auth-flow

  # 強制上書き
  sdd_generate_tasks --feature auth-flow --overwrite true
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
- （開発中）**構造的分析**: 要件（REQ-XXX）の網羅状況、設計で定義されたコンポーネントの実装状況のチェックを追加予定です。
- （開発中）**意味的分析**: LLM用のプロンプト生成やEmbeddings等を用いた意味的検証を追加予定です。

### 意味的検証 (Semantic Verification)

`sdd_validate_gap --deep` コマンド実行時、環境変数が設定されていれば Embeddings（ベクトル検索）を用いた意味的ギャップ検出が自動的に行われます。

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

#### オプトアウト

- `SDD_EMBEDDINGS_API_KEY` を **設定しなければ**、意味的分析はスキップされます
- ローカルのみで動作させたい場合は、環境変数からAPIキーを削除してください

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

本プロジェクトの開発には **Bun** を使用します。
詳細なコーディング規約やテスト方法は [AGENTS.md](./AGENTS.md) を参照してください。

### 主な開発コマンド

| コマンド | 説明 |
|---------|------|
| `bun test` | 全テストを実行します。 |
| `bun test:seq` | テストを直列実行します（推奨）。StateやLockの競合を防ぐため、CI等ではこちらを使用してください。 |
| `bun run scripts/sdd_ci_validate.ts` | CI用バリデーションスクリプトを実行します。 |

## ライセンス

MIT
