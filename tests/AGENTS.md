# TESTS KNOWLEDGE BASE

**Context:** OmO-SDD-Hybrid (Auxiliary Tests)
**Scope:** `tests/` directory

## OVERVIEW
このディレクトリは、`.opencode` 内のコアロジックとは直接紐付かない、汎用ユーティリティやヘルパー関数のテストコードを格納する。
プラグインの機能要件（Gatekeeper等）そのものではなく、それを支える純粋な関数群の品質を担保する。

## CONTENTS
現在以下のテストスイートが含まれている。

### `utils/`
- **`string-helpers.test.ts`**:
  - 文字列操作ユーティリティの単体テスト。
  - パス正規化、特定のフォーマット変換などのエッジケース検証を行う。

## DISTINCTION (vs `__tests__`)
当プロジェクトには2種類のテストディレクトリが存在する。混同しないこと。

| Directory | Scope | Purpose |
|-----------|-------|---------|
| `__tests__/` | **Core Plugin** | `.opencode/` 以下の構造と鏡像関係にある、プラグイン機能の結合・単体テスト。GatekeeperやState管理のロジック検証はここで行う。 |
| `tests/` | **Auxiliary/Utils** | 特定のプラグインコンポーネントに依存しない、純粋な関数や汎用ユーティリティのテスト。構造的な縛りは緩やか。 |

## CONVENTIONS
1. **Naming**:
   - テストファイルは `*.test.ts` とする。
   - テスト対象の機能やモジュール名をプレフィックスにする。

2. **Independence**:
   - ここに含まれるテストは、`.opencode` の実行時状態（State）やファイルシステム（Mock fs）に依存しない、Pure Functionのテストであることを原則とする。
   - 複雑なセットアップ（`sdd_start_task` のエミュレーションなど）を必要とする場合は `__tests__` への移動を検討する。

3. **Execution**:
   - `bun test` で `__tests__` と共に実行される。
