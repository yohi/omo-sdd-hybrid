# USERLAND SOURCE (SDD MANAGED)

**Context:** Managed User Code (OmO-SDD-Hybrid)
**Role:** Target Implementation Area
**Manager:** SDD Gatekeeper (`.opencode/plugins/sdd-gatekeeper.ts`)

## OVERVIEW
このディレクトリは、SDD（仕様駆動開発）プラグインによって管理される「ユーザーランド」の実装領域です。
開発者は `specs/tasks.md` で定義されたタスクに基づいて、この領域のコードを変更します。
すべての変更は Gatekeeper によって監視され、アクティブなタスクのスコープ外の変更はブロックされます。
（本プロジェクトはセルフホスティング構成のため、SDDツールのコアロジックの一部もここに実装される場合があります）

## CONTENTS

| File/Dir | Description |
|----------|-------------|
| `gap.ts` | 仕様と実装の乖離（Gap）を検出するロジック。AST解析を用いて実装状況を検証します。 |
| `match.ts` | 仕様記述とコードパターンのマッチング処理。 |
| `utils/` | 汎用ユーティリティ群（ファイル操作、文字列処理など）。 |

## ROLE IN SDD CYCLE
このディレクトリは **実装ターゲット** として機能します。

1.  **Scope Enforcement**: `sdd_start_task` 実行時、タスクで指定されたファイルのみが書き込み可能となります。
2.  **Validation Target**: `sdd_validate_gap` コマンドは、このディレクトリ内のコードを解析し、`specs/` 内の仕様と照合します。
3.  **No Hidden Logic**: ユーザーが直接触れるコードであり、隠蔽された `.opencode/` とは異なり、通常のGitワークフローで管理されます。

## CONVENTIONS

### Coding Standards
- **Strict TypeScript**: 型定義を厳格に行い、`any` の使用を避けること。
- **Pure Functions**: `gap.ts` や `match.ts` 内のロジックは可能な限り副作用を持たない純粋関数として実装する。

### SDD Compliance
- **Scope Definition**: 新しいファイルを作成する場合、必ず対応するタスクの `Scope` にファイルパスを含めること。
- **Atomic Implementation**: タスク単位で完結する変更を心がける。複数のタスクにまたがる変更は避ける。

### Documentation
- 公開インターフェース（Exportされる関数・クラス）にはJSDoc形式の日本語コメントを付与すること。
