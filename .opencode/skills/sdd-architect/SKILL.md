---
name: sdd-architect
description: 新機能の仕様設計を行う（Requirements → Design → Tasks）
priority: 10
---

# SDD Architect スキル

## このスキルを使うタイミング
- 新機能の開発を開始するとき
- 仕様書を作成・更新するとき

## 手順（MUST）— Phase A〜D フロー

### Phase A: インタビュー（`/profile` 実行時のみ）

0. `/profile` コマンドで起動した場合、`profile.md` のインタビュープロトコルに従い要件を収集する
1. インタビュー完了後、プロファイルドキュメントをユーザーに提示して **STOP**
2. **禁止**: `sdd_scaffold_specs`、`sdd_sync_kiro`、ファイル/ディレクトリ生成、validate-gap/validate-design の自動実行
3. ユーザーが明示的に「OK」「進めて」等の承認を与えるまで待機する
4. ユーザー承認後 → Phase B に遷移

### Phase B: 仕様策定（ユーザー承認後に遷移）

以下のステップを順番に実行する。**validate-gap / validate-design / lint_tasks は各コマンド内でプログラム的に自動連鎖実行される。**

1. **Steering 確認**
   - `sdd_kiro steering` を実行して既存のドキュメントを確認
   - 新機能の開発方針が全体の方向性（Product/Tech/Structure）と合致しているか確認
   - 必要に応じて `sdd_kiro steering --feature <doc-name> --prompt "..."` で更新
   - 結果をユーザーに報告する

2. **specs ディレクトリ作成**
   - `sdd_kiro init --feature <feature>` を実行

3. **Requirements 作成 + validate-gap（自動連鎖）**
   - `sdd_kiro requirements --feature <feature>` を実行
   - validate-gap がプログラム内で自動実行され、結果が返される
   - Greenfield（`src/` が空）の場合、validate-gap は自動スキップされ、その旨が報告される
   - validate-gap 結果に問題がある場合、requirements.md を修正して再実行する（最大3回）
   - ★ **ユーザー確認**: requirements の内容と validate-gap 結果をユーザーに報告し、承認を得る

4. **Design 作成 + validate-design（自動連鎖）**
   - `sdd_kiro design --feature <feature>` を実行
   - validate-design がプログラム内で自動実行され、結果が返される
   - validate-design 結果に問題がある場合、design.md を修正して再実行する（最大3回）
   - 影響ファイル（Impacted Files）を明記すること
   - ★ **ユーザー確認**: design の内容と validate-design 結果をユーザーに報告し、承認を得る

5. **Tasks 作成 + lint_tasks（自動連鎖）**
   - `sdd_kiro tasks --feature <feature>` を実行
   - lint_tasks がプログラム内で自動実行され、フォーマット検証結果が返される
   - **配置ルール**: `specs/tasks.md` はリポジトリ全体のタスクリスト用。機能固有のタスクは `specs/<feature>/tasks.md` に配置する
   - 各タスクに `(Scope: ...)` を **必ず** 付ける
   - 形式: `* [ ] Task-N: タイトル (Scope: \`glob1\`, \`glob2\`)`
   - ★ **ユーザー確認**: tasks の内容をユーザーに報告し、承認を得る

### Phase C: PR 作成

6. **ブランチ作成・コミット・PR作成**
   - `feature/<feature-name>` ブランチを作成する
   - 仕様書一式（requirements.md, design.md, tasks.md, scope.md 等）をコミットする
   - `gh pr create` で PR を作成し、URL をユーザーに報告する
   - **コミットメッセージ**: 日本語で記述（例: `feat: <feature> の仕様書一式を作成`）

<!-- TODO: 将来対応 — CodeRabbit CLI チェック
7. **CodeRabbit CLI チェック（将来実装予定）**
   - PR 作成前に `cr review` を実行して仕様書の品質をチェックする
   - NG の場合は修正ループを回す
   - 参考: https://www.coderabbit.ai/ja/cli
-->

**セッション終了**: PR 作成後、このセッションは終了。レビュー対応は人間または別セッションで行う。

### Phase D: 確定（ユーザー手動実行）

7. **Finalize（PR承認後にユーザーが手動実行）**
   - PR のレビュー・承認が完了した後、ユーザーが `/finalize` を実行する
   - `sdd_kiro finalize --feature <feature>` が3文書の整合チェックを行う
   - 日本語の仕様書が `*_ja.md` にリネームされ、英語への翻訳準備が整う
   - 生成されたプロンプトに従い、英語の仕様書（Source of Truth）を作成する

## 運用（Ops）

### 仕様変更リクエストの処理（Pending Changes）
Implementer が `sdd_request_spec_change` で生成した申請を処理するフロー。

1. **申請の監視**
   - 定期的に `.kiro/pending-changes/` ディレクトリを確認する
   - 未処理のMarkdownファイル（例: `req_YYYYMMDD_HHmm.md`）があれば内容をレビューする

2. **レビューとマージ**
   - 申請内容が妥当か判断する
   - **妥当な場合**:
     - `specs/tasks.md` や `specs/<feature>/*.md` に変更内容を手動で反映（マージ）する
     - 反映時は整合性を意識する（RequirementsとTasksの乖離など）
   - **妥当でない場合**:
     - 却下理由をコメントするか、Implementerに修正を指示する（状況に応じた対話）

3. **申請ファイルのクローズ（削除）**
   - マージまたは却下が完了したら、該当する申請ファイルを削除する
   - **注意**: ファイル操作ツール（`apply_patch` の Delete や `bash` コマンド `rm` 等）を使用して確実に削除すること
   - ※アーカイブが必要な場合は `.kiro/archive/` 等へ移動してもよいが、原則は削除で完了とする

## 重要なルール
- Scope は最小権限で設定する（`src/**` のような広い範囲は避ける）
- ★ マークのステップでは必ずユーザーの承認を待つこと
- validate 結果に問題がある場合は修正して再実行すること（最大3回まで。超過時はユーザー判断に委ねる）
- 各ステップの結果（validate-gap / validate-design / lint_tasks）は必ずユーザーに報告する
