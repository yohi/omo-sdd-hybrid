# TEST KNOWLEDGE BASE

**Context:** Plugin Core Testing Strategy
**Scope:** `__tests__/` directory

## OVERVIEW
このディレクトリは `.opencode/` 配下のプラグインコアロジックに対するテストスイートです。
ソースコードが隠蔽ディレクトリにあるため、開発およびCI/CDのために標準的なディレクトリ構造でテストを配置しています。

## MIRROR STRUCTURE
`.opencode/` 内のディレクトリ構造を厳密に模倣（ミラーリング）しています。
テスト対象のファイルを探す際は、以下の対応関係を参照してください。

| Test Path | Target Source Path | Scope |
|-----------|--------------------|-------|
| `__tests__/plugins/*.test.ts` | `.opencode/plugins/*.ts` | Gatekeeper, Injectors |
| `__tests__/tools/*.test.ts` | `.opencode/tools/*.ts` | CLI Commands (start/end) |
| `__tests__/lib/*.test.ts` | `.opencode/lib/*.ts` | State Mgmt, Utils |

## TEST COMMANDS

### `bun test` (Parallel)
純粋なロジックやユーティリティ関数の単体テストに使用します。
ファイルシステムやグローバルステートに依存しないテストは並列実行が可能です。

### `bun test:seq` (Sequential)
**必須:** 状態依存（Stateful）なテスト用。
- ファイルロック機構 (`.opencode/state/lock.json`)
- タスクのアクティブ状態遷移
- Gatekeeperによるファイル書き込みブロック

これらは物理ファイルを共有するため、競合を防ぐために `--preload` 設定等を用いた直列実行が必要です。

## CONVENTIONS

### State Mocking
- **Physical State Isolation**: 本番の `.opencode/state` を汚染しないよう、テスト実行時は一時ディレクトリ (`/tmp/omo-test-env/` 等) を環境変数 `OMO_HOME` で指定してモック化すること。
- **Lock File**: 排他制御のテストでは、必ず `afterEach` でロックファイルをクリーンアップする。

### Gatekeeper Verification
- 実際のファイルシステムへの書き込みを伴うテストは、必ず `setup` / `teardown` でサンドボックス環境を作成・破棄する。
- `console.error` 等の副作用は `spyOn` を使用して検証し、実際の出力は抑制する。
