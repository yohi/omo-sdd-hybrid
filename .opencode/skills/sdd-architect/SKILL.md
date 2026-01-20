---
name: sdd-architect
description: 新機能の仕様設計を行う（Requirements → Design → Tasks）
priority: 10
---

# SDD Architect スキル

## このスキルを使うタイミング
- 新機能の開発を開始するとき
- 仕様書を作成・更新するとき

## 手順（MUST）

1. **specs ディレクトリ作成**
   - `specs/<feature>/` ディレクトリを作成

2. **Requirements 作成**
   - `specs/<feature>/requirements.md` を作成
   - ユーザーと対話しながら要件を明確化

3. **Design 作成**
   - `specs/<feature>/design.md` を作成
   - 影響ファイル（Impacted Files）を明記

4. **Tasks 作成**
   - `specs/tasks.md` にタスクを追加
   - **配置ルール**: `specs/tasks.md` はリポジトリ全体のタスクリスト用。機能固有のタスクは `specs/<feature>/tasks.md` に配置する（例: `specs/auth/tasks.md`）。複数機能にまたがるタスクや統合タスクは `specs/tasks.md` を使用する
   - 各タスクに `(Scope: ...)` を **必ず** 付ける（上記の形式ルールと配置ルールを併せて適用）
   - 形式: `* [ ] Task-N: タイトル (Scope: \`glob1\`, \`glob2\`)`

## 重要なルール
- Scope は最小権限で設定する（`src/**` のような広い範囲は避ける）
- ユーザー承認を得るまで次のステップに進まない
