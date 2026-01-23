# OmO-SDD-Hybrid

> **For AI Agents & Developers:**
> プロジェクトの規約、構造、開発ルールについては、ルートおよび各ディレクトリの [AGENTS.md](./AGENTS.md) を **必ず** 参照してください。

タスク単位のファイルアクセス制御で「Vibe Coding（仕様逸脱）」を物理的に抑止する OpenCode プラグイン。

## インストール

GitHub Packages からインストールします。OpenCode 環境で利用する場合、開発依存（`devDependencies`）として追加してください。

### 1. レジストリの設定
プロジェクトのルートに `.npmrc` ファイルを作成（または追記）し、`@yohi` スコープを GitHub Packages に紐付けます。

```ini
@yohi:registry=https://npm.pkg.github.com
```

### 2. パッケージのインストール

```bash
npm install -D @yohi/omo-sdd-hybrid
# または
bun add -d @yohi/omo-sdd-hybrid
```

## 使い方

インストール後、OpenCode 環境は `.opencode/plugins` 内の Gatekeeper を自動的に認識することを想定しています（※具体的なプラグイン読み込み設定は OpenCode の仕様に準拠してください）。

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

## 高度な機能

### Kiro 統合 (cc-sdd)

[cc-sdd](https://github.com/gotalab/cc-sdd) で生成された仕様書（Requirements, Design, Tasks）との整合性をチェックできます。

1. **仕様の生成**:
   `.kiro/specs/<feature-name>/` 配下に `requirements.md`, `design.md`, `tasks.md` を配置します。

2. **検証**:
   タスクIDと仕様名が一致する場合、自動的に連携されます。異なる場合はオプションで指定します。
   ```bash
   sdd_validate_gap --kiroSpec <feature-name> --deep
   ```
   - **--deep**: LLM用プロンプトを生成し、より深い意味的な分析（要件カバレッジなど）を行います。

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
