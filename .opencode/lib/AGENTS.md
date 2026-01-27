# MODULE KNOWLEDGE BASE

**Context:** OmO-SDD-Hybrid Core Library (.opencode/lib/)
**Role:** 共有ロジック & 状態管理バックエンド

## OVERVIEW
CLIツールとGatekeeperプラグインが共有するコアロジック群。
主にファイルシステムベースの状態管理（State I/O）、仕様ファイル（Specs）の解析、およびパス判定ロジックを提供する。
UIや対話機能は持たず、純粋なデータ処理とファイル操作に特化している。

## KEY MODULES

### state-utils.ts (State Manager)
実行時の作業状態（Active Task）とロックファイルを管理する。
- **責務**: `.opencode/state/` 下のJSONファイルの読み書き。
- **機能**: `getActiveTask()`, `startTask()`, `endTask()`。
- **重要**: プロセス間（CLIとIDE拡張）で状態を共有するための唯一のインターフェース。

### policy-loader.ts (Spec Parser)
`specs/tasks.md` を解析し、実行可能なポリシーオブジェクトに変換する。
- **責務**: Markdownからのタスク定義・Scope定義の抽出。
- **機能**: タスクIDの存在検証、許可されたファイルパターンの解決。
- **挙動**: 定義不整合（無効なGlobなど）がある場合は即座に例外を発生させる。

## STATE MANAGEMENT

### Persistence Strategy
状態はメモリ上ではなく、物理ファイル（JSON）として永続化される。
これにより、ステートレスなCLIコマンドと、常駐するGatekeeper間での情報共有を実現している。

### Locking & Atomic Writes
- **Atomic Operations**: 状態ファイルの破損を防ぐため、書き込みは「一時ファイル作成 -> リネーム」のアトミック操作として実装されるべきである。
- **Concurrency**: 複数のCLIコマンドやIDEイベントが同時に発生した場合の競合を防ぐため、`state-utils` は簡易的なファイルロック機構または同期的なI/O操作によって一貫性を保つ。

## CONVENTIONS

- **Pure Functions Preferred**: I/O境界（`state-utils`等）を除き、ロジックは副作用のない純粋関数として実装する。
- **Fail Fast**: 無効なステートや不正な引数を検出した際は、曖昧な処理をせず即座に `Error` をスローする。
- **No Console Output**: ライブラリ層であるため、`console.log` 等による標準出力は行わない（呼び出し元のTools層に任せる）。
