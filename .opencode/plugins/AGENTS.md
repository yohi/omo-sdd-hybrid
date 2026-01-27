# PLUGIN KNOWLEDGE BASE

**Context:** OmO-SDD-Hybrid Logic Layer
**Scope:** Event Hooks & Runtime Enforcement

## OVERVIEW (Hook System)
OpenCodeのツール実行ライフサイクルに介入するイベントフック層。
主に `tool.execute` イベントをインターセプトし、AIの自律的な行動（特にファイル操作）が
定義されたSDD仕様（Specs）と整合しているかを監視・制御する。
「物理的な制約」を課すことで、Vibe Codingをシステムレベルで阻止する要となる。

## KEY PLUGINS
### Gatekeeper (`sdd-gatekeeper.ts`)
**役割:** ファイルアクセス制御 (The Bouncer)
- `write`, `edit` ツール呼び出しを検知。
- 現在アクティブなタスクがあるか確認。
- 操作対象ファイルがタスクの `Scope`（許可リスト）に含まれているか検証。
- 違反時はツール実行前に例外を投げ、操作をブロックする。

### Context Injector (`sdd-injector.ts`)
**役割:** コンテキスト自動注入 (The Guide)
- ユーザーの発言前に、現在のSDD状態（Active Task, Pending Checks）をシステムプロンプトとして挿入。
- 開発者が常に「今何をすべきか」を認識できる状態を維持する。

## ARCHITECTURE
**Intercept tool.execute**
1. **Pre-Execution**: ツール呼び出し直前にフック発火。
   - 引数（args）の検証。
   - 状態（State）の読み取り。
   - **Block**: 条件満たさない場合、実行をキャンセルしエラーを返却。
2. **Execution**: （許可された場合のみ）実際のツールが動作。
3. **Post-Execution**: 実行結果に対する追加検証（オプション）。

## CONVENTIONS
- **Stateless Logic**: プラグイン内部に状態を持たず、必ず `.opencode/state/` または `lib/` 経由で状態を参照する。
- **Fail Fast**: 警告ではなく「エラー」として処理を中断させる。生ぬるい警告は無視されるため。
- **No Side Effects**: Gatekeeperは「判定」のみを行い、ファイル自体を勝手に書き換えない。
