---
name: sdd-architect
description: 新機能の仕様設計を行う（Requirements → Design → Tasks）
priority: 10
---

# SDD Architect スキル

## このスキルを使うタイミング
- 新機能の開発を開始するとき
- 仕様書を作成・更新するとき

## 手順（MUST）

1. **specs ディレクトリ作成**
   - `specs/<feature>/` ディレクトリを作成

2. **Requirements 作成**
   - `specs/<feature>/requirements.md` を作成
   - ユーザーと対話しながら要件を明確化

3. **Design 作成**
   - `specs/<feature>/design.md` を作成
   - 影響ファイル（Impacted Files）を明記

4. **Tasks 作成**
   - `specs/tasks.md` にタスクを追加
   - **配置ルール**: `specs/tasks.md` はリポジトリ全体のタスクリスト用。機能固有のタスクは `specs/<feature>/tasks.md` に配置する（例: `specs/auth/tasks.md`）。複数機能にまたがるタスクや統合タスクは `specs/tasks.md` を使用する
   - 各タスクに `(Scope: ...)` を **必ず** 付ける（上記の形式ルールと配置ルールを併せて適用）
   - 形式: `* [ ] Task-N: タイトル (Scope: \`glob1\`, \`glob2\`)`

## 運用（Ops）

### 仕様変更リクエストの処理（Pending Changes）
Implementer が `sdd_request_spec_change` で生成した申請を処理するフロー。

1. **申請の監視**
   - 定期的に `.kiro/pending-changes/` ディレクトリを確認する
   - 未処理のMarkdownファイル（例: `req_YYYYMMDD_HHmm.md`）があれば内容をレビューする

2. **レビューとマージ**
   - 申請内容が妥当か判断する
   - **妥当な場合**:
     - `specs/tasks.md` や `.kiro/specs/<feature>/*.md` に変更内容を手動で反映（マージ）する
     - 反映時は整合性を意識する（RequirementsとTasksの乖離など）
   - **妥当でない場合**:
     - 却下理由をコメントするか、Implementerに修正を指示する（状況に応じた対話）

3. **申請ファイルのクローズ（削除）**
   - マージまたは却下が完了したら、該当する申請ファイルを削除する
   - **注意**: ファイル操作ツール（`apply_patch` の Delete や `bash` コマンド `rm` 等）を使用して確実に削除すること
   - ※アーカイブが必要な場合は `.kiro/archive/` 等へ移動してもよいが、原則は削除で完了とする

## 重要なルール
- Scope は最小権限で設定する（`src/**` のような広い範囲は避ける）
- ユーザー承認を得るまで次のステップに進まない
