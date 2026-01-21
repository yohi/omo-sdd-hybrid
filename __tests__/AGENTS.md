# テストスイート知識ベース (__tests__)

## OVERVIEW
OpenCode プラグイン (`omo-sdd-hybrid`) の品質を保証するための Bun Test ベースのテストスイートです。
プラグイン特有のファイル操作フックや CLI ツールの動作を、仮想環境内でシミュレーションして検証します。

## STRUCTURE
- **lib/**, **plugins/**, **tools/**: `.opencode/` 内の同名ディレクトリと鏡像関係にあり、対応するユニットテストを格納。
- **e2e/**: 実際の開発フロー（タスク開始→編集→検証）を模倣した統合テスト。
- **helpers/**: テスト実行用の環境シミュレータ (`test-harness.ts`) 等。

## CONVENTIONS
- **Harnessの使用**: テスト内でのエディタ操作やコマンド実行は、必ず `test-harness.ts` の `simulateEdit`, `simulateBash` を使用すること。
- **State Mock**: テストケースごとに `state-utils.ts` の `writeState/clearState` を使用して、クリーンな状態から開始すること。
- **命名規則**:
  - `*.test.ts`: 標準テスト
  - `*.block.test.ts`: Block モード専用テスト

## ANTI-PATTERNS
- **パスのハードコード**: テスト内で絶対パスや環境依存のパスを書かない。`lib/path-utils.ts` を使用する。
- **内部実装のテスト**: 関数の戻り値だけでなく、プラグインの「振る舞い（警告が出たか、エラーになったか）」を検証することを優先する。
- **手動クリーンアップ**: `afterEach` 等で `clearState` を呼び忘れないこと。

## COMMANDS
```bash
bun test             # 全テスト実行
bun test plugins/    # プラグイン関連のみ実行
```
