# SPECS KNOWLEDGE BASE

**Context:** User Interaction / Task Definitions
**Role:** Control Plane for SDD (Specification Driven Development)

## OVERVIEW
このディレクトリは、OmO-SDD-Hybridシステムにおける「ユーザーインターフェース」の役割を果たす。
開発者はここで「何を」「どこで」行うかを宣言し、システム（Gatekeeper）はその宣言に基づいてファイルアクセス権限を動的に制御する。
コードを書く前に、必ずここでの定義が必要となる（Specs First）。

## FILE TYPES (tasks.md / scope.md)
最も重要なファイルは `tasks.md`（レガシー）と `.kiro/specs/<feature>/scope.md`（新形式）である。

### tasks.md structure
各タスクは以下の要素を持つ（Markdownのチェックボックスリスト形式）：
- **Checkbox**: ステータスを表す (`[ ]`=TODO/IN_PROGRESS, `[x]`=DONE)
- **ID**: 一意の識別子（例: `Task-1`）
- **Description**: タスクの説明
- **Scope**: このタスクで変更を許可するファイルパス（括弧内にGlobパターン記述）

```markdown
# Tasks  (または Scopes)
* [ ] Task-1: Feature X Implementation (Scope: `src/feature-x/**/*.ts`, `specs/feature-x.md`)
* [x] Task-2: Bug Fix Y (Scope: `src/utils.ts`)
```

**推奨**: 新規タスクは `.kiro/specs/<feature>/scope.md` に配置してください。`specs/tasks.md` は後方互換性のため残されています。

## EDITING RULES
SDDサイクルにおける本ディレクトリの運用ルール：

1. **Define Task**: 作業前に `.kiro/specs/<feature>/scope.md` (推奨) または `tasks.md` に新しいタスクブロックを作成する。
2. **Set Scope**: 変更予定のファイルパスを `Scope` に明記する。
   - *重要*: Scopeに含まれないファイルは、タスク開始後も書き込みがブロックされる。
3. **Start**: コマンドラインから `sdd_start_task <ID>` を実行する。
   - この時点で `tasks.md` の内容はシステムにロードされ、Gatekeeperが有効化される。
4. **Refine**: 仕様詳細（`.md`）もこのディレクトリに配置し、Scopeに含めて管理することを推奨する。

## RELATION TO Kiro (cc-sdd integration)
このディレクトリは、Gatekeeperシステム（コードネーム: Kiro）に対する「入力ソース」である。

- **Truth Source**: Kiroは `.kiro/specs/<feature>/scope.md` を優先し、見つからない場合は `specs/tasks.md` をフォールバックとして扱う。
- **Permission Mapping**: Kiroはこれらファイルの `Scope` 定義を読み取り、OSレベルまたはエディタレベルでの書き込みロック/アンロックを判定する。
- **Validation**: `sdd_validate_gap` コマンドは、ここの定義と実際のコード変更の乖離を検出する。

> "Code follows Specs. Specs live here."
