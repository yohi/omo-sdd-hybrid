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
   - allowedScopes 内のファイルのみ編集可能
   - Scope 外の変更が必要な場合:
     1. コードを書かずに停止
     2. `specs/tasks.md` の Scope を更新
     3. 再度 `sdd_start_task` を実行

3. **検証**
   - `sdd_validate_gap` を実行
   - エラーがないことを確認

4. **完了**
   - 検証通過後、`specs/tasks.md` で `[x]` をマーク
   - `sdd_end_task` を実行

## 禁止事項
- `sdd_start_task` なしでの実装開始
- Scope 外ファイルの編集
- 検証なしでのタスク完了
