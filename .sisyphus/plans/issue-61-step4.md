# Issue #61 Step4 作業計画

対象Issue: <https://github.com/yohi/omo-sdd-hybrid/issues/61>

スコープ: Step4のみ（Step1/2/3は扱わない）

## 既知の事実
- Step3.1にて、Implementerによる `.kiro/**` への直接編集がブロックされることは単体テストレベルで確認済み
- Step2にて、各ロール（Implementer/Architect）の指示書（SKILL.md）は更新済み

## チェックリスト（Step4: Task 4.1）

本ステップでは「Hello World シナリオ」を通して、仕様変更申請フローがエンドツーエンドで成立することを検証する。

- [ ] Task 4.1-1: Implementerによる直接編集のブロック検証（E2Eレベル）
  - 実際にファイルシステム上の `.kiro/specs/hello-world/tasks.md` に対して書き込みを試行し、`AccessDenied` エラーとなることを確認するテストを追加する。

- [ ] Task 4.1-2: 仕様変更申請コマンドの動作検証
  - Implementerロールで `sdd_request_spec_change` を実行し、`.kiro/pending-changes/` 配下に申請ファイル（Markdown）が正しく生成されることを確認する。

- [ ] Task 4.1-3: Architectによる申請取り込みの検証
  - Architectロールで、生成された申請内容に基づき `.kiro/specs/hello-world/tasks.md` を更新する操作が **許可** されることを確認する。

## 完了条件
- 上記の一連のフロー（ブロック → 申請 → 承認/反映）が、人間の介入なし（または最小限）で動作することを示す自動テスト（`__tests__/workflow/spec-change.test.ts` 等）が追加され、パスしていること。
- テスト内で、ロールの切り替え（Implementer vs Architect）が正しく機能していること。

## 検証
- `bun test`
- `bun test:seq`
