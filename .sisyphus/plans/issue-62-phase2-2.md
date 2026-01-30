# 作業計画書: Issue #62 Phase2-2 (Task 2.2) `sdd_generate_tasks`

## Context

Issue #62 の Phase 2 「Full-Cycle Support」のうち、Task 2.2 `sdd_generate_tasks` を実装する。

### 目的

- `.kiro/specs/<feature>/` 内の仕様（requirements, design）を基に、実装タスク一覧（tasks.md）を生成・初期化する。
- ユーザーが手動でタスク分解する手間を省き、SDDサイクル（Specs -> Code）への移行をスムーズにする。

### 期待する仕様（Issue記載 / 推定）

- コマンド: `sdd_generate_tasks --feature <name>`
- 入力: `.kiro/specs/<feature>/requirements.md`, `.kiro/specs/<feature>/design.md`
- 出力: `.kiro/specs/<feature>/tasks.md`
- 既存ファイルがある場合は安全に振る舞う（上書き確認、またはスキップ）。
- 現段階では高度なAI分解ではなく、テンプレート生成や、簡易的なタスクリスト初期化（`cc-sdd` 連携の準備）を主目的とする。

---

## Verification Strategy

- `bun test` が全てパスすること。
- `lsp_diagnostics(filePath=".")` が error=0 であること。
- 生成された `tasks.md` が期待通りのパスとフォーマットであること。

---

## TODOs

> Implementation + Test = ONE Task. 可能な限りTDDで進める。

- [ ] 1. タスク定義確認: `specs/tasks.md` の Scope 確認と更新

  **Files (Scope想定)**:
  - `specs/tasks.md` (Task-2-2 定義済み、Scope再確認)
  - `.opencode/tools/sdd_generate_tasks.ts`
  - `.opencode/lib/**`
  - `__tests__/tools/sdd_generate_tasks.test.ts`
  - `README.md`

  **Parallelizable**: NO

---

- [ ] 2. `sdd_generate_tasks` 実装 + テスト（TDD）

  **Expected Behavior**:
  - 引数 `--feature <name>` を受け取る。
  - 対象ディレクトリ `.kiro/specs/<feature>/` の存在を確認する。
  - `tasks.md` を生成する（初期テンプレート、または `requirements.md` からの簡易抽出ロジックがあれば含める）。
  - 既にファイルが存在する場合のハンドリング（エラーまたは上書きオプション `--overwrite`）。

  **Parallelizable**: NO（実装の中心）

---

- [ ] 3. ツール露出/ドキュメント更新

  **What to do**:
  - `package.json` (bin) への登録確認。
  - `README.md` に `sdd_generate_tasks` の使用法を追記。
  - `sdd_scaffold_specs` との使い分けを明確化。

  **Parallelizable**: NO
