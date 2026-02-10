# 運用ガイド (Operations Guide)

本ドキュメントでは、OmO-SDD-Hybrid プラグインを安全かつ継続的に運用するための制約、トラブルシューティング、および設定リファレンスについて説明します。

## 運用上の制約 (Operational Constraints)

OmO-SDD-Hybrid は OpenCode 環境内での「仕様に基づかない編集 (Vibe Coding)」を物理的に抑止しますが、以下の制約を理解した上で運用してください。

1. **OpenCode 外での編集に対する無防備性**
   - 本プラグインのガード機能（Gatekeeper）は、OpenCode ランタイム経由のファイル操作に対してのみ有効です。
   - ローカルのファイルシステムで直接 VSCode や Vim を使用してファイルを編集した場合、**ガードは一切機能しません。**
   - 開発フローとして、すべてのコード変更は必ず OpenCode 環境（またはプラグインが統合された IDE エージェント）を通じて行われるように運用ルールを徹底してください。
   - CI (`sdd_ci_runner`) を活用し、`.kiro/specs/**/scope.md` に定義されていない変更がコミット・プッシュされることを防ぐ運用を推奨します。

2. **ステートファイルの保護**
   - `.opencode/state/` 配下のファイル（`current_context.json`, `guard-mode.json` 等）を直接手動で編集しないでください。
   - これらのファイルは整合性保護のために HMAC ハッシュで署名されています。手動編集を行うと `STATE_CORRUPTED` エラーが発生し、タスクの継続が不能になります。

## 復旧ランブック (Recovery Runbook)

状態の不整合やデッドロックが発生した場合の復旧手順です。

### 1. `STATE_CORRUPTED` (状態破損) の復旧
ステートファイルの整合性チェックに失敗した場合に発生します。

- **自動復旧**: 
  - システムは自動的に `.opencode/state/*.bak*` から有効なバックアップを探して復旧を試みます。
- **手動復旧**:
  - 自動復旧に失敗した場合は、現在の作業を中断し、以下のコマンドを実行してステートをリセットしてください。
    ```bash
    sdd_end_task
    ```
  - `sdd_end_task` が失敗する場合は、以下の緊急コマンドを使用します。
    ```bash
    sdd_force_unlock --force true
    # その後、必要に応じて .opencode/state/current_context.json を削除
    ```
- **タスクの再開**:
  - ステートをクリーンにした後、再度 `sdd_start_task <TaskID>` を実行してタスクを開始してください。

### 2. ロック残留 (`ELOCKED`) の解消
複数のプロセスが同時にステートを更新しようとしたり、以前のプロセスが異常終了した場合に発生します。

- **待ち時間による自動解消**:
  - ロックの有効期限はデフォルト 30 秒です。1 分程度待ってから再試行してください。
- **強制解除ツール**:
  - 解消しない場合は `sdd_force_unlock` を使用します。
    ```bash
    # 状態確認
    sdd_force_unlock
    
    # 強制解除
    sdd_force_unlock --force true
    
    # 他者のロックを強制的に奪う場合 (PID/Host不一致時)
    sdd_force_unlock --force true --overrideOwner true
    ```

### 3. スコープ外変更によるブロック
`block` モード時に許可されていないファイルを編集しようとして拒否された場合。

- **正しい対処**: `.kiro/specs/<feature>/scope.md` を更新し、対象のファイルを `Scope` に追加してから `sdd_start_task` を再実行（一度 `sdd_end_task` が必要）してください。
- **一時的な回避 (非推奨)**: `sdd_set_guard_mode warn` (または `disabled`) で警告モード（または無効化）に切り替えることも可能ですが、監査ログに記録されます。

## 設定リファレンス (Configuration Reference)

環境変数による動作のカスタマイズが可能です。

### 1. 動作モード・パス設定

| 環境変数 | デフォルト値 | 説明 |
|----------|--------------|------|
| `SDD_GUARD_MODE` | `warn` | ガードモード。`warn` (警告のみ)、`block` (書き込み拒否)、または `disabled` (無効)。設定ファイルが優先されます。 |
| `SDD_WORKTREE_ROOT` | (Git root) | 監視対象のルートディレクトリ。未設定時は Git リポジトリのルートを自動取得します。 |
| `SDD_KIRO_DIR` | `.kiro` | Kiro仕様書（`scope.md`）の探索ルート。 |
| `SDD_SCOPE_FORMAT` | `lenient` | Scope 定義の形式。`strict` に設定するとバッククォート囲み以外をエラーにします。 |
| `SDD_STATE_DIR` | `.opencode/state` | ステートファイルの保存先ディレクトリ。 |

### 2. セキュリティ・整合性

| 環境変数 | デフォルト値 | 説明 |
|----------|--------------|------|
| `SDD_STATE_HMAC_KEY` | (自動生成) | ステート改ざん検知用のキー。固定化を強く推奨します。 |
| `SDD_SKIP_TEST_EXECUTION` | `false` | `validate_gap` 時のテスト実行をスキップするかどうか。 |

### 3. 排他制御 (Locking)

| 環境変数 | デフォルト値 | 説明 |
|----------|--------------|------|
| `SDD_LOCK_STALE` | `30000` (ms) | ロックが期限切れとみなされる時間。 |
| `SDD_LOCK_RETRIES` | `10` | ロック取得のリトライ回数。 |

## ポリシーファイル (Policy Files)

以下のパスに動作ポリシーが保存されます。

- `.opencode/state/guard-mode.json`: `sdd_set_guard_mode` で設定された現在のガードモード (`warn`/`block`/`disabled`)。
- `.opencode/state/guard-mode.log`: ガードモード変更や弱体化試行の監査ログ。
- `.opencode/state/current_context.json`: 現在アクティブなタスクとスコープのコンテキスト。
- `.opencode/state/state-hmac.key`: 自動生成された HMAC キー（環境変数未指定時）。
