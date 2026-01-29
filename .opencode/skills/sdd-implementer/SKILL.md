---
name: sdd-implementer
description: タスクに基づいて実装を行う
priority: 10
---

# SDD Implementer スキル

## このスキルを使うタイミング
- タスクを実装するとき

## 手順（MUST）

1. **タスク開始**
   - 実装前に必ず `sdd_start_task <TaskID>` を実行
   - State が生成され、編集可能スコープが設定される

2. **実装**
   - `allowedScopes` 内のファイルのみ編集可能
   - **重要**: `.kiro/` ディレクトリ配下の仕様書は Gatekeeper により編集がブロックされているため、直接変更してはならない。

   ### Scope 外の変更・仕様不備への対応
   実装中に Scope 外のファイル編集が必要になったり、仕様（`.kiro`）の不備を見つけた場合は、以下の手順で申請を行う。

   1. **変更申請を作成**
      ```bash
      sdd_request_spec_change --reason "理由（例: 共通ユーティリティの修正が必要）" --proposal "変更内容（例: util.ts にバリデーション関数を追加）"
      ```
   2. **承認待ち**
      - 申請書が `.kiro/pending-changes/` に作成される
      - Architect が内容を確認し、仕様と Scope を更新するのを待つ
      - 必要に応じて `sdd_end_task` で一度タスクを中断する

   ### 補足: Scope 定義の微調整
   - Gatekeeper の設定ファイルである `specs/tasks.md` 自体は編集可能な場合があるが、仕様変更を伴う場合は原則として上記の申請フローを経由すること。

3. **検証**
   - `sdd_validate_gap` を実行
   - エラーがないことを確認

4. **完了**
   - 検証通過後、`specs/tasks.md` で `[x]` をマーク
   - `sdd_end_task` を実行

## 禁止事項
- `sdd_start_task` なしでの実装開始
- Scope 外ファイルの編集（Vibe Coding）
- **`.kiro/` ディレクトリ内の仕様書直接編集**
- 検証なしでのタスク完了
