# テストスイート知識ベース (__tests__)

## OVERVIEW
OpenCode プラグイン (`omo-sdd-hybrid`) の品質を保証するための Bun Test ベースのテストスイートです。
プラグイン特有のファイル操作フックや CLI ツールの動作を、仮想環境内でシミュレーションして検証します。

## STRUCTURE
- **lib/**, **plugins/**, **tools/**: `.opencode/` 内の同名ディレクトリと鏡像関係。
- **e2e/**: 統合テスト（タスク開始→編集→検証）。
- **helpers/**: 環境シミュレータ (`test-harness.ts`)。

## CONVENTIONS
- **Harnessの使用**: 操作は `test-harness.ts` の `simulateEdit`, `simulateBash` を使用する。
- **State Mock**: テストケースごとに `writeState/clearState` でクリーンな状態を保証する。
- **命名規則**:
  - `*.test.ts`: 標準テスト
  - `*.block.test.ts`: Block モード専用テスト

## ANTI-PATTERNS
- **パスのハードコード**: `lib/path-utils.ts` を使用し、絶対パスを書かない。
- **手動クリーンアップ**: `afterEach` 等で `clearState` を呼び忘れないこと。

## COMMANDS
```bash
bun test             # 全テスト実行
bun test:seq         # 直列実行（ステート競合回避のため推奨）
bun test plugins/    # プラグイン関連のみ実行
```
