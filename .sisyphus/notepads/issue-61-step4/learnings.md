## 2026-01-30 Task: issue-61-step4 (Dogfooding E2E Test)

- **E2Eテスト実装**: `__tests__/e2e/dogfooding.step4.test.ts` を追加し、Implementer/Architect ロールによる権限分離（Implementerは `.kiro` ブロック、Architectは許可）と、`sdd_request_spec_change` による仕様変更申請フローを検証した。
- **Gatekeeperの改修**: テスト環境（tmpDir）がリポジトリ外にある場合、`OUTSIDE_WORKTREE` エラーが発生するため、Gatekeeper 初期化時に `options.worktree` が渡された場合は `getWorktreeRoot()` よりも優先して使用するように変更した（`.opencode/plugins/sdd-gatekeeper.ts`）。
- **Guard Mode 検証**: テスト実行時に `writeGuardModeState({ mode: 'block', ... })` を明示的に呼び出すことで、環境変数に依存せず強制的にブロックモードでの挙動を検証した。
- **パス指定の注意点**: `evaluateRoleAccess` 内部の `normalizeToRepoRelative()` は `path.resolve()` を使用して正規化を行う。そのため、tmp環境にある `.kiro` ディレクトリをテストから渡す際は、相対パスではなく**絶対パス**で指定しないと、意図しないリポジトリルート起点のパスとして解決されてしまう。
- **Plugin Hook**: テストコード内で `gatekeeper['tool.execute.before']` を手動で呼び出す際、Gatekeeperの実装（独自イベント構造）と `plugin-stub` の型定義に乖離があるため、`as any` キャストを使用して型エラーを回避した。
