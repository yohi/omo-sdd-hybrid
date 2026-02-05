# TOOL IMPLEMENTATION KNOWLEDGE BASE

**Context:** OmO-SDD-Hybrid (CLI Tools)
**Scope:** `.opencode/tools/`

## OVERVIEW
このディレクトリには、OpenCode環境内で呼び出し可能なSDD（仕様駆動開発）制御用CLIコマンドの実装が含まれる。
各ファイルは単一のOpenCode Toolとして公開され、ユーザーやエージェントによって実行されるエントリーポイントとして機能する。
ここで実装されたロジックは、主に `../lib/` 内のコア機能や状態管理モジュールを呼び出し、Gatekeeperと連携してファイルシステムのアクセス制御を行う。

## TOOL LIST

| File | Command | Description |
|------|---------|-------------|
| `sdd_start_task.ts` | `sdd_start_task` | 指定されたタスクを開始し、Scopeに基づき編集権限を付与する。 |
| `sdd_end_task.ts` | `sdd_end_task` | 現在のタスクを完了し、編集権限を破棄する。未コミット変更のチェックを行う。 |
| `sdd_validate_gap.ts` | `sdd_validate_gap` | 現在の実装と仕様のギャップを検証する。 |
| `sdd_validate_design.ts` | `sdd_validate_design` | 設計書（Design.md）と実装コードの整合性を検証する。 |
| `sdd_show_context.ts` | `sdd_show_context` | 現在アクティブなタスクや許可されているファイルScopeを表示する。 |
| `sdd_set_guard_mode.ts` | `sdd_set_guard_mode` | Gatekeeperの動作モード（Strict/Permissiveなど）を切り替える。 |
| `sdd_request_spec_change.ts` | `sdd_request_spec_change` | 実装中に仕様変更が必要になった場合のフローを開始する。 |
| `sdd_lint_tasks.ts` | `sdd_lint_tasks` | `specs/tasks.md` の構文や構造をチェックする。 |
| `sdd_force_unlock.ts` | `sdd_force_unlock` | 【非常用】ロック状態を強制解除する（管理者権限相当）。 |
| `sdd_sync_kiro.ts` | `sdd_sync_kiro` | 外部記録システム（Kiro）との同期を行う。 |

## IMPLEMENTATION PATTERN

各ツールは OpenCode Tool 定義に従い、以下のパターンで実装される。

```typescript
import { defineTool } from '../lib/tool-utils'; // 仮のユーティリティ
import { TaskManager } from '../lib/task-manager';

export default defineTool({
  name: "sdd_example_command",
  description: "コマンドの説明（エージェント向けプロンプトに影響）",
  parameters: {
    // JSON Schemaによる引数定義
    type: "object",
    properties: {
      taskId: { type: "string" }
    },
    required: ["taskId"]
  },
  handler: async (args, context) => {
    // 1. 引数検証
    // 2. 状態チェック (State Manager)
    // 3. アクション実行
    // 4. 結果返却 (Markdown/Text)
    return "Result message";
  }
});
```

## CONVENTIONS

1.  **Dynamic Load**: これらのファイルはOpenCode起動時に動的に読み込まれるため、トップレベルでの副作用（即時実行コード）は禁止。
2.  **No Binaries**: バイナリ依存を含めない。純粋な TypeScript/JavaScript で完結させる。
3.  **Error Handling**: エラー時は例外を投げっぱなしにせず、明確なエラーメッセージを文字列として返すこと。
4.  **Idempotency**: 可能な限り冪等性を保つ（特に状態変更系）。
5.  **Output Format**: ユーザーが読むメッセージは日本語。機械可読な構造化データが必要な場合はJSON文字列を返すか、明確なフォーマットを使用する。
