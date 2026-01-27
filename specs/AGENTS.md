# SPECS KNOWLEDGE BASE

**Context:** User Interaction / Task Definitions
**Role:** Control Plane for SDD (Specification Driven Development)

## OVERVIEW
このディレクトリは、OmO-SDD-Hybridシステムにおける「ユーザーインターフェース」の役割を果たす。
開発者はここで「何を」「どこで」行うかを宣言し、システム（Gatekeeper）はその宣言に基づいてファイルアクセス権限を動的に制御する。
コードを書く前に、必ずここでの定義が必要となる（Specs First）。

## FILE TYPES (tasks.md)
最も重要なファイルは `tasks.md` である。

### tasks.md structure
各タスクは以下の要素を持つ必要がある：
- **ID**: 一意の識別子（例: `TASK-001`）
- **Description**: 何をするか
- **Status**: `TODO`, `IN_PROGRESS`, `DONE`
- **Scope**: このタスクで変更を許可するファイルパス（Globパターン可）

```markdown
# Tasks
## [TASK-001] Feature X Implementation
- Status: TODO
- Scope:
  - src/feature-x/**/*.ts
  - specs/feature-x.md
```

## EDITING RULES
SDDサイクルにおける本ディレクトリの運用ルール：

1. **Define Task**: 作業前に `tasks.md` に新しいタスクブロックを作成する。
2. **Set Scope**: 変更予定のファイルパスを `Scope` に明記する。
   - *重要*: Scopeに含まれないファイルは、タスク開始後も書き込みがブロックされる。
3. **Start**: コマンドラインから `sdd_start_task <ID>` を実行する。
   - この時点で `tasks.md` の内容はシステムにロードされ、Gatekeeperが有効化される。
4. **Refine**: 仕様詳細（`.md`）もこのディレクトリに配置し、Scopeに含めて管理することを推奨する。

## RELATION TO Kiro (cc-sdd integration)
このディレクトリは、Gatekeeperシステム（コードネーム: Kiro）に対する「入力ソース」である。

- **Truth Source**: Kiroは `specs/tasks.md` を唯一の正解（Source of Truth）として扱う。
- **Permission Mapping**: Kiroはここの `Scope` 定義を読み取り、OSレベルまたはエディタレベルでの書き込みロック/アンロックを判定する。
- **Validation**: `sdd_validate_gap` コマンドは、ここの定義と実際のコード変更の乖離を検出する。

> "Code follows Specs. Specs live here."
