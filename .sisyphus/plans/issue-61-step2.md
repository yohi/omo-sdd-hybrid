# Issue #61 Step2 作業計画

対象Issue: https://github.com/yohi/omo-sdd-hybrid/issues/61

スコープ: Step2のみ（Step1/3/4は扱わない）

## 既知の事実
- role制御により Implementer は `.kiro/**` を直接編集できない
- Implementer は `sdd_request_spec_change` で `.kiro/pending-changes/` に申請書を生成する

## チェックリスト（Step2: Task 2.1 / 2.2）

- [ ] Task 2.1: sdd-architect の指示文をStep2要件に合わせて更新する
対象ファイル: `.opencode/skills/sdd-architect/SKILL.md`
狙い: Step2でのSpec変更フローと役割境界を明確化し、誤った編集経路を防ぐ
完了条件: Step2の作業範囲・Spec変更の申請手順・禁止事項が明文化されている

- [ ] Task 2.2: sdd-implementer の指示文をStep2要件に合わせて更新する
対象ファイル: `.opencode/skills/sdd-implementer/SKILL.md`
狙い: Implementerの実装・申請の分担を明確化し、`.kiro/**` 直編集を防ぐ
完了条件: 申請フロー（`sdd_request_spec_change`）と禁止範囲が具体的に示されている

## 検証
- `bun test`
- `bun test:seq`
