---
name: sdd-orchestrator
description: タスク完了を自律的に検証し、pass まで修正ループを回す
priority: 15
---

# SDD Orchestrator スキル

## このスキルを使うタイミング
- タスク実装後、完了を検証したいとき
- 検証エラーを自動修正したいとき
- `sdd_validate_gap` を繰り返し実行する必要があるとき

## 手順（MUST）

### 1. 前提条件の確認
- `sdd_show_context` でアクティブなタスクがあることを確認
- タスクがない場合は `sdd_start_task` を先に実行

### 2. 検証ループ(最大 5 回)

```text
ループ開始:
  1. `sdd_validate_gap` を実行
  2. 実装完了状態なら `sdd_kiro validate-impl` も実行
  3. 結果を確認:
     - 全項目 PASS → ループ終了、手順 3 へ
     - エラーあり → 修正して 1 に戻る
  4. ループ回数が 5 回に達したら → 手順 4 へ
```

#### 検証項目

| 項目 | PASS 条件 |
|------|-----------|
| スコープ検証 | 変更ファイルがすべて allowedScopes 内 |
| Diagnostics | lsp_diagnostics でエラーなし |
| テスト | 関連テストがすべて pass |
| 実装検証 | validate-impl で問題なし |


### 3. 完了処理
検証通過後のみ実行：

1. `specs/tasks.md` で該当タスクを `[x]` にマーク
2. `sdd_end_task` を実行

### 4. エスカレーション
5 回のループで解決できない場合：

1. 現状の問題点を整理
2. 人間にエスカレーション（自動修正を中断）
3. 追加の指示を待つ

## 禁止事項
- 検証なしでのタスク完了マーク
- 5 回以上のループ実行（無限ループ防止）
- Scope 外ファイルの修正
- 検証を偽装する行為

## 環境変数

| 変数 | 値 | 説明 |
|------|-----|------|
| `SDD_GUARD_MODE` | `block` | Phase 1 では block 推奨 |
| `SDD_SCOPE_FORMAT` | `strict` | Phase 1 では strict 推奨 |

## 使用例

```bash
# 1. タスク開始
sdd_start_task Task-1

# 2. 実装(省略)

# 3. Orchestrator スキルで検証ループ
/sdd-orchestrator

# スキルが自動で以下を実行:
# - sdd_validate_gap
# - エラーがあれば修正
# - 再度 sdd_validate_gap
# - pass するまで繰り返し

# 4. pass 後、スキルが自動で完了処理
# - tasks.md を [x] に更新
# - sdd_end_task 実行
```
