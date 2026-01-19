# 統合仕様書（LLMフレンドリー版）
## OpenCode プラグイン: **OmO-SDD-Hybrid**
Version: 0.9（Phase 0/1 対応）  
Status: Draft（実装可能な詳細度）

---

## 0. 目的と背景

### 0.1 目的（Goals）
本プラグインは、oh-my-opencode（OmO）のエージェント実行力と、cc-sdd の仕様駆動プロセス（Requirements→Design→Tasks→Implementation）を統合し、AI開発における以下を同時に達成する。

- **仕様逸脱（Vibe Coding）を物理的に抑止**する（フックでブロック可能）
- **導入ハードルを低く**し、チームに **SDDサイクルを定着**させる（SKILL.md でプロトコル化）
- **タスクID単位で編集可能範囲を制御**し、「どのタスクで何を触ってよいか」を明確化する（Scope）

### 0.2 非目的（Non-Goals）
- DDD（コンテキストマップ、集約、テンプレート等）の全面導入（Phase 2以降）
- 自動マージや自動デプロイ（本仕様では扱わない）
- すべての破壊的コマンドの完全検出（Permissionsとの併用で現実解を取る）

---

## 1. 用語（Definitions）

- **Spec（仕様）**: `specs/<feature>/` 配下の requirements/design/tasks 等のドキュメント群
- **Task（タスク）**: `specs/tasks.md` に定義された実装単位（例: Task-1）
- **Scope（スコープ）**: タスクが変更可能なファイルパス（glob）集合
- **State（状態）**: 現在着手中タスクと許可スコープを保持するJSON（`.opencode/state/current_context.json`）
- **Gatekeeper（ゲートキーパー）**: ツール実行前に編集/破壊的操作を制御するフック（Plugin）
- **Skills**: エージェントが守るべき作業手順（プロトコル）を自然言語で固定化した `SKILL.md`

---

## 2. 全体アーキテクチャ

### 2.1 コンポーネント
本プラグインは以下で構成する。

1) **Skills（手順の脳）**
- `.opencode/skills/sdd-architect/SKILL.md`
- `.opencode/skills/sdd-implementer/SKILL.md`
- `.opencode/skills/sdd-orchestrator/SKILL.md`（Phase 1推奨）

2) **Custom Tools（状態更新の唯一の正規入口）**
- `.opencode/tools/sdd_start_task`（必須）
- `.opencode/tools/sdd_end_task`（推奨）
- `.opencode/tools/sdd_show_context`（任意）

3) **Plugin / Hooks（物理ガード）**
- `.opencode/plugins/sdd-gatekeeper`（必須）
  - edit/write 等の「書き込み系ツール」を制御
  - bash 等の「破壊的コマンド」を制御（Permissionsを優先、補助で検知）

4) **State File（単一の真実）**
- `.opencode/state/current_context.json`

---

## 3. ディレクトリ / ファイル仕様

### 3.1 必須ディレクトリ
```

specs/
tasks.md

.opencode/
skills/
sdd-architect/SKILL.md
sdd-implementer/SKILL.md
tools/
sdd_start_task.(ts|js)
sdd_end_task.(ts|js)           # 推奨
plugins/
sdd-gatekeeper.(ts|js)
state/
current_context.json           # 実行時に生成

```

### 3.2 常に編集を許可するパス（Allowlist）
Gatekeeper は以下を**常に編集許可**する（プロセスを止めないため）。

- `specs/**`
- `.opencode/**`

---

## 4. `specs/tasks.md` フォーマット仕様（Scope拡張）

### 4.1 タスク行の文法（Grammar）
タスクは「1行で完結」し、以下形式に従う。

```

* [ ] <TaskID>: <Title> (Scope: `<glob1>`, `<glob2>`, ...)
* [x] <TaskID>: <Title> (Scope: `<glob1>`, ...)

```

#### TaskID ルール
- MUST: `[A-Za-z][A-Za-z0-9_-]*-\d+` に一致（例: `Task-1`, `PAY-12`）

#### Scope ルール
- MUST: `(Scope: ...)` を含む
- MUST: 原則バッククォートで囲う（ `src/auth/**` ）
- SHOULD: `**` を推奨（再帰マッチ）
- MAY: カンマ区切り（バッククォートなし）も許容（移行期間）

### 4.2 例
```

* [ ] Task-1: ユーザー認証APIの実装 (Scope: `src/auth/**`, `src/users/**`, `tests/auth/**`)
* [ ] Task-2: 決済DBスキーマ作成 (Scope: `src/db/migrations/**`)

````

---

## 5. State ファイル仕様（`.opencode/state/current_context.json`）

### 5.1 目的
- 「今どのタスクに着手しているか」と「どこを編集してよいか」を、LLMにも機械にも明確にする。

### 5.2 JSON スキーマ（概念）
```json
{
  "version": 1,
  "activeTaskId": "Task-1",
  "activeTaskTitle": "ユーザー認証APIの実装",
  "allowedScopes": ["src/auth/**", "src/users/**", "tests/auth/**"],
  "startedAt": "2026-01-20T00:00:00.000Z",
  "startedBy": "agent-name-or-role",
  "sessionId": "optional",
  "messageId": "optional"
}
````

### 5.3 不変条件（Invariants）

* MUST: `activeTaskId` が存在しない場合、`specs/**` と `.opencode/**` 以外の編集は不可（warn/block）
* MUST: `allowedScopes` が空の場合、編集不可（warn/block）
* SHOULD: `activeTaskId` は tasks.md 上で未完了（`[ ]`）であること
* MAY: 実行環境依存の `sessionId` 等を追加してよい（Gatekeeperは無視してよい）

---

## 6. Custom Tool 仕様

### 6.1 `sdd_start_task(taskId)`

#### 目的

* tasks.md を解析し、該当タスクの Scope を抽出して State に書き込む（権限発行）

#### 入力

* `taskId: string`（例: `Task-1`）

#### 手順（Normative）

* MUST: `specs/tasks.md` を読み込む
* MUST: `taskId` の行を検索する
* MUST: 行が `[ ]`（未完了）であることを確認する
* MUST: `(Scope: ...)` をパースし、glob配列 `allowedScopes` を得る
* MUST: `.opencode/state/current_context.json` に書き込む（上書き）

#### 出力

* MUST: 「開始したタスクID」「許可スコープ一覧」「stateファイル位置」を人間可読で返す

#### エラー（例）

* `E_TASKS_NOT_FOUND`: `specs/tasks.md` が存在しない
* `E_TASK_NOT_FOUND`: taskId が見つからない
* `E_TASK_ALREADY_DONE`: `[x]` タスクを指定した
* `E_SCOPE_MISSING`: Scope が書かれていない/空

---

### 6.2 `sdd_end_task()`（推奨）

#### 目的

* State をクリアし、次タスクの選択を強制する（事故防止）

#### 手順

* MUST: `.opencode/state/current_context.json` を削除、または `activeTaskId=null` 相当へ更新

---

### 6.3 `sdd_show_context()`（任意）

* 現在の `activeTaskId` と `allowedScopes` を表示するだけ（デバッグ用）

---

## 7. Gatekeeper（Plugin/Hook）仕様：State-Aware Access Control

### 7.1 対象ツール（書き込み系）

Gatekeeper は以下を「書き込み系」とみなす（実装側で追加可能）。

* edit / write / patch / multiedit / それに準ずるもの

### 7.2 モード（Phaseで切替）

* **Phase 0:** `warn`（警告ログ + 実行は許可）
* **Phase 1:** `block`（エラーで停止）

> 実装は `SDD_GUARD_MODE=warn|block` の環境変数や設定で切替可能にすること。

### 7.3 ルール（Decision Rules）

#### Rule 0: Always Allow

* 編集対象が `specs/**` または `.opencode/**` なら **常に allow**

#### Rule 1: State Required

* `specs/**` `.opencode/**` 以外を編集する場合:

  * `current_context.json` が無い → warn/block
  * `activeTaskId` が無い → warn/block
  * `allowedScopes` が空 → warn/block

#### Rule 2: Scope Match

* 編集対象の **repo相対パス** が `allowedScopes` のいずれかの glob に一致しない → warn/block

#### Rule 3: Outside Worktree Deny

* リポジトリ外（`../` など）の編集要求 → warn/block（原則 block 推奨）

#### Rule 4: Destructive Bash (補助)

* bash コマンドが明確に危険（例: `rm`, `git push`, `reset --hard`, `apply`）なら warn/block
* ただし **Permissions を主手段**とし、Gatekeeperは補助

### 7.4 エラーメッセージ（LLM向けに定型化推奨）

* `NO_ACTIVE_TASK`: 「先に `sdd_start_task <TaskID>` を実行してください」
* `SCOPE_DENIED`: 「Task-<id> は <path> への書き込み権限を持ちません。allowedScopes=...」
* `OUTSIDE_WORKTREE`: 「worktree外のパスは編集できません: ...」

---

## 8. Skills（LLMが迷わない手順書）

### 8.1 `sdd-architect`（Requirements→Design→Tasks）

**MUST**

* 新機能開始時は必ず `kiro:spec-init` から始める
* `kiro:spec-requirements` の結果をユーザー承認するまで次へ進まない
* `kiro:spec-design` 後、設計と影響ファイル（Impacted Files）を明記する
* `kiro:spec-tasks` 後、各タスク行に `(Scope: ...)` を必ず付ける

### 8.2 `sdd-implementer`（実装ループ）

**MUST**

* 実装開始前に必ず `sdd_start_task <TaskID>` を実行する
* Scope外の変更が必要になったら **コードを書かずに** tasks.md を更新（Scope追加）し、再度 `sdd_start_task`
* 実装後は `kiro:validate-gap`（または相当）を実行してズレを検証する
* タスクを `[x]` にするのは、validate通過後のみ

### 8.3 `sdd-orchestrator`（Phase 1: 自律ループ）

**MUST**

* Implementer が編集したら `validate-gap` を自動で回す（passまで修正ループ）
* pass後にのみ tasks.md のチェック更新を許可する（または更新を提案）
* 次タスク開始時は `sdd_start_task` を必ず実行させる

---

## 9. Permissions（推奨）

Gatekeeperだけに頼らず、`opencode.json` の permission で bash を抑制する。

* MUST: `bash` は基本 `ask`（または deny）にする
* SHOULD: `git status`, `git diff`, `grep`, `ls`, `cat` などは allow

---

## 10. 受け入れ基準（Acceptance Criteria）

| シナリオ | 事前状態                          | 操作                  | 期待結果（Phase 0）          | 期待結果（Phase 1）           |
| ---- | ----------------------------- | ------------------- | ---------------------- | ----------------------- |
| A    | stateなし                       | `src/a.ts` を編集      | WARNして実行は通す            | BLOCK（NO_ACTIVE_TASK）   |
| B    | Task-1開始, Scope=`src/auth/**` | `src/auth/x.ts` 編集  | allow                  | allow                   |
| C    | Task-1開始, Scope=`src/auth/**` | `src/pay/y.ts` 編集   | WARN（SCOPE_DENIED）     | BLOCK（SCOPE_DENIED）     |
| D    | 仕様更新                          | `specs/tasks.md` 編集 | allow                  | allow                   |
| E    | worktree外                     | `../secrets.txt` 編集 | WARN                   | BLOCK（OUTSIDE_WORKTREE） |
| F    | 破壊的bash                       | `rm -rf` 実行         | ask/warn（Permission優先） | ask/block（Permission優先） |

---

## 11. 既知のエッジケース / 運用ルール

* **複数タスク並行は原則禁止**（stateは単一タスクのみ保持）
* Scopeの粒度は「最小権限」を推奨（広すぎる `src/**` は避ける）
* 新規ファイル作成も **Scope内でのみ許可**
* リネーム/移動が必要なら、Scopeに移動先も含める（または tasks.md 更新）
* CI/ビルド生成物（例: `dist/**`, `build/**`）は通常 Scope から除外（編集不要）

---

## 12. フェーズ計画（Phase 0/1）

### Phase 0（即時導入：定着）

* Gatekeeper: warn モード
* 必須: Skills + `sdd_start_task` + `sdd-gatekeeper`
* 達成条件: 「SDDサイクルが回り、仕様逸脱が警告で可視化される」

### Phase 1（自律化：厳格化）

* Gatekeeper: block モード
* 追加: orchestrator の validate-gap 自律ループ、`sdd_end_task`
* 達成条件: 「タスク未選択/Scope外編集が物理的に不可能、validateが自律で回る」

---

## 13. 実装者向け最重要メモ（LLMに伝えるべき核心）

* **編集前に必ず `sdd_start_task`**（これが“権限発行”）
* **Gatekeeperは state と scope だけを信じる**（LLMの言い訳は信じない）
* **Scope外の必要が出たら、先に tasks.md を更新して承認を取る**
* **最終チェックは validate-gap（仕様とコードの差分検査）**

```

