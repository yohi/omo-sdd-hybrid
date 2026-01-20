# 統合仕様書（LLMフレンドリー版）
## OpenCode プラグイン: **OmO-SDD-Hybrid**
Version: 1.0（Phase 0/1 対応）  
Status: Ready for Implementation（MUST FIX 項目解決済み）

**更新履歴:**
- v1.0 (2026-01-20): MUST FIX 項目解決
  - kiro 依存を任意統合に降格、スタブ実装追加
  - Glob 仕様固定（picomatch、Normative 定義）
  - パス正規化アルゴリズム明文化（worktree 外判定）
  - State 更新の原子性（Atomic write + ロック機構）
  - tasks.md Scope 表現の Phase 1 統一（移行ポリシー）
- v0.9 (初稿): 基本設計

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

#### Scope ルール（Phase別）

**Phase 0（導入期・柔軟）:**
- MUST: `(Scope: ...)` を含む
- SHOULD: バッククォートで囲う（ `src/auth/**` ）
- MAY: カンマ区切り（バッククォートなし）も許容（移行期間）
  - 例: `(Scope: src/auth/**, tests/auth/**)`（非推奨だが解析可能）

**Phase 1（厳格化・統一）:**
- MUST: `(Scope: ...)` を含む
- MUST: 各 glob を **バッククォートで囲う**
  - 正: `(Scope: \`src/auth/**\`, \`tests/auth/**\`)`
  - 誤: `(Scope: src/auth/**, tests/auth/**)` → `E_SCOPE_FORMAT` エラー
- MUST: glob 間はカンマ + スペースで区切る（`, `）

#### Scope の推奨パターン

| パターン | 用途 | 例 |
|---------|------|---|
| `<dir>/**` | ディレクトリ全体（再帰） | `src/auth/**`, `tests/auth/**` |
| `<dir>/*.ext` | 特定拡張子のみ | `src/migrations/*.sql` |
| `<dir>/**/*.ext` | 特定拡張子（再帰） | `src/**/*.test.ts` |
| `<file>` | 単一ファイル | `src/config.ts` |

**避けるべきパターン:**
- `**`（全ファイル）：最小権限原則に反する
- `src/**`（広すぎる）：タスク単位で絞る

### 4.2 例
```markdown

* [ ] Task-1: ユーザー認証APIの実装 (Scope: `src/auth/**`, `src/users/**`, `tests/auth/**`)
* [ ] Task-2: 決済DBスキーマ作成 (Scope: `src/db/migrations/**`)
* [x] Task-3: ログイン画面の作成 (Scope: `src/ui/login/**`, `src/ui/components/Button.tsx`)

```

### 4.3 移行ポリシー（Phase 0 → Phase 1）

#### 移行タイミング

以下の条件を満たした時点で Phase 1 へ移行:
1. Phase 0 での運用期間が **2週間以上**
2. warn ログの誤検知率が **5%以下**
3. チーム全体が Scope 記述に習熟

#### 移行手順

**Step 1: tasks.md のフォーマット変換**

Migration script を実行:
```bash
# Dry-run（変更内容のプレビュー）
npx sdd migrate-tasks --format=backtick-required --dry-run

# 実行
npx sdd migrate-tasks --format=backtick-required
```

**変換例:**
```markdown
# Before (Phase 0)
* [ ] Task-1: Title (Scope: src/auth/**, tests/auth/**)

# After (Phase 1)
* [ ] Task-1: Title (Scope: `src/auth/**`, `tests/auth/**`)
```

**Step 2: 環境変数の更新**

```bash
# Phase 0 → Phase 1
export SDD_GUARD_MODE=block  # warn から block へ
export SDD_SCOPE_FORMAT=strict  # 旧形式を拒否
```

**Step 3: 検証**

全タスクで `sdd_start_task` が成功することを確認:
```bash
# 全タスクの構文チェック
npx sdd lint-tasks
```

#### ロールバック手順

Phase 1 で問題が発生した場合:
```bash
# Phase 1 → Phase 0
export SDD_GUARD_MODE=warn
export SDD_SCOPE_FORMAT=lenient

# tasks.md を Phase 0 形式に戻す（バックアップから復元）
git checkout HEAD -- specs/tasks.md
```

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

### 5.4 排他制御とアトミック更新（Normative）

#### 5.4.1 競合リスク

複数エージェント/並行ツール実行時、State への同時書き込みで以下が発生し得る:
- State ファイルの破損（JSON パースエラー）
- 上書きによるタスクIDの消失
- Gatekeeper の誤判定

#### 5.4.2 ロック機構（MUST）

State 更新時は **ファイルベースロック** を取得すること。

**推奨ライブラリ:** `proper-lockfile@^4.1.2`

**実装例:**
```typescript
import lockfile from 'proper-lockfile';
import path from 'path';

const STATE_PATH = '.opencode/state/current_context.json';

async function updateState(newState: State): Promise<void> {
  const lockPath = path.resolve(STATE_PATH);
  
  // Step 1: ロック取得（他のプロセスが解放するまで待機）
  const release = await lockfile.lock(lockPath, {
    retries: {
      retries: 5,
      minTimeout: 100,
      maxTimeout: 1000
    }
  });
  
  try {
    // Step 2: State 更新（アトミック write）
    await atomicWrite(STATE_PATH, JSON.stringify(newState, null, 2));
  } finally {
    // Step 3: ロック解放
    await release();
  }
}
```

#### 5.4.3 アトミック Write（MUST）

State 書き込みは **アトミック操作** とすること（部分書き込みを防ぐ）。

**推奨ライブラリ:** `write-file-atomic@^5.0.1`

**実装例:**
```typescript
import writeFileAtomic from 'write-file-atomic';

async function atomicWrite(filePath: string, content: string): Promise<void> {
  // 一時ファイルに書き込み → atomic rename
  await writeFileAtomic(filePath, content, {
    encoding: 'utf-8',
    mode: 0o644
  });
}
```

**手動実装例（ライブラリが使えない場合）:**
```typescript
import fs from 'fs';
import path from 'path';

function atomicWriteSync(filePath: string, content: string): void {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  
  try {
    // 一時ファイルに書き込み
    fs.writeFileSync(tempPath, content, { encoding: 'utf-8', mode: 0o644 });
    
    // アトミックに rename（POSIX では原子性が保証される）
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // 失敗時は一時ファイルを削除
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}
```

#### 5.4.4 State 破損時のフォールバック

State ファイルが破損している場合の動作:

| Phase | 動作 | メッセージ |
|-------|------|-----------|
| Phase 0 | WARN + 実行許可（`specs/**`, `.opencode/**` のみ） | `STATE_CORRUPTED: current_context.json が破損しています。再作成が必要です` |
| Phase 1 | BLOCK | `STATE_CORRUPTED: current_context.json が破損しています。sdd_start_task を実行してください` |

**検証実装例:**
```typescript
function loadState(): State | null {
  try {
    const content = fs.readFileSync(STATE_PATH, 'utf-8');
    const state = JSON.parse(content);
    
    // 最小限の検証
    if (!state.activeTaskId || !Array.isArray(state.allowedScopes)) {
      throw new Error('Invalid state schema');
    }
    
    return state;
  } catch (error) {
    console.error('STATE_CORRUPTED:', error.message);
    return null;
  }
}
```

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

## 7.6 パス正規化とWorktree境界検証（Normative）

### 7.6.1 目的

Gatekeeper は以下を保証すること:
1. **Worktree 外への書き込みを防ぐ**（Rule 3）
2. **Symlink を介した迂回を防ぐ**
3. **パスの決定性**（OS・環境差を吸収）

### 7.6.2 アルゴリズム（手順）

以下の順序で実施すること。

#### Step 1: 絶対パス化

* ツールから渡されたパスを絶対パスに変換
* Node.js: `path.resolve(filePath)`

#### Step 2: Symlink の解決（リンク先を追跡**しない**）

* Symlink 自体のパスを使用（`fs.lstat` で確認）
* `fs.realpath` で解決**しない**
* 理由: Symlink でworktree外を指すことで迂回されるリスクを防ぐ

例:
```typescript
// ❌ WRONG: Symlink を解決してしまう
const realPath = fs.realpathSync(filePath);

// ✅ CORRECT: Symlink は解決しない
const absolutePath = path.resolve(filePath);
```

#### Step 3: Worktree ルートの取得

* Git リポジトリのルートディレクトリを取得
* 実装例:
  ```typescript
  import { execSync } from 'child_process';
  
  function getWorktreeRoot(): string {
    try {
      return execSync('git rev-parse --show-toplevel', {
        encoding: 'utf-8',
        cwd: process.cwd()
      }).trim();
    } catch {
      // Gitリポジトリでない場合はプロジェクトルート
      return process.cwd();
    }
  }
  ```

#### Step 4: 相対パス化

* Worktree ルートからの相対パスを計算
* Node.js: `path.relative(worktreeRoot, absolutePath)`

#### Step 5: Worktree 外判定

* 相対パスが `..` で始まる場合、worktree **外**
* 絶対パスが worktree ルートの外側にある場合も **外**

実装例:
```typescript
function isOutsideWorktree(filePath: string, worktreeRoot: string): boolean {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(worktreeRoot, absolutePath);
  
  // `..` で始まる or 空文字列（ルート自体）の場合は外
  return relativePath.startsWith('..') || relativePath === '';
}
```

#### Step 6: POSIX 形式への正規化

* パスセパレータを `/` に統一
* Windows の `\` を変換

実装例:
```typescript
const normalizedPath = relativePath.split(path.sep).join('/');
```

### 7.6.3 検証フロー（完全版）

```typescript
function validatePathForEdit(
  filePath: string,
  allowedScopes: string[],
  worktreeRoot: string
): { allowed: boolean; reason?: string } {
  
  // Step 1-2: 絶対パス化（Symlinkは解決しない）
  const absolutePath = path.resolve(filePath);
  
  // Step 3-4: Worktreeルートからの相対パス
  const relativePath = path.relative(worktreeRoot, absolutePath);
  
  // Step 5: Worktree外チェック（Rule 3）
  if (relativePath.startsWith('..') || relativePath === '') {
    return { 
      allowed: false, 
      reason: 'OUTSIDE_WORKTREE: Worktree外のパスは編集できません' 
    };
  }
  
  // Step 6: POSIX形式に正規化
  const normalizedPath = relativePath.split(path.sep).join('/');
  
  // Rule 0: Always Allow
  if (normalizedPath.startsWith('specs/') || 
      normalizedPath.startsWith('.opencode/')) {
    return { allowed: true };
  }
  
  // Rule 2: Scope Match
  const matchesScope = allowedScopes.some(glob =>
    picomatch.isMatch(normalizedPath, glob, { dot: false })
  );
  
  if (!matchesScope) {
    return {
      allowed: false,
      reason: `SCOPE_DENIED: ${normalizedPath} はallowedScopesに含まれません`
    };
  }
  
  return { allowed: true };
}
```

### 7.6.4 エッジケース

| ケース | 扱い | 実装 |
|--------|------|------|
| ルートディレクトリ自体 `/` | worktree外として **拒否** | `relativePath === ''` |
| Symlink → worktree外 | Symlink自体のパスで判定（worktree内なら許可） | `fs.lstat` 使用 |
| 絶対パス（`/etc/passwd`） | worktree外として **拒否** | `relativePath.startsWith('..')` |
| `../` を含むパス | worktree外として **拒否** | Step 5 の判定 |
| Windows UNC パス `\\server\share` | サポート**しない**（エラー） | 事前チェック推奨 |

---

## 7.5 Glob マッチング仕様（Normative）

### 7.5.1 ライブラリ指定

実装は **picomatch** ライブラリを使用すること。

* npm: `picomatch@^2.3.1` 以上
* 理由: 高速・軽量、正規表現ベース、クロスプラットフォーム対応

### 7.5.2 Glob パターン仕様

以下の仕様に従う。

| パターン | マッチ対象 | 例 |
|---------|----------|---|
| `*` | 単一パスセグメント内の0文字以上（`/` を除く） | `src/*.ts` → `src/a.ts`, `src/b.ts` |
| `**` | 0個以上のディレクトリ（再帰マッチ） | `src/**/*.ts` → `src/a.ts`, `src/auth/b.ts` |
| `?` | 単一パスセグメント内の1文字（`/` を除く） | `src/?.ts` → `src/a.ts` のみ |
| `[abc]` | 文字クラス | `src/[ab].ts` → `src/a.ts`, `src/b.ts` |
| `{a,b}` | 選択（OR） | `src/{auth,pay}/*.ts` → `src/auth/x.ts`, `src/pay/y.ts` |

### 7.5.3 パスセパレータ

* MUST: パスセパレータは **常に `/`** （POSIX形式）
* Windows環境でも `\` を `/` に正規化すること
* 実装例:
  ```typescript
  import path from 'path';
  const normalized = filePath.split(path.sep).join('/');
  ```

### 7.5.4 Dotfile（隠しファイル）

* デフォルト: Dotfileは **マッチしない**
* 明示的に指定した場合のみマッチ
  - 例: `.opencode/**` は `.opencode/.gitignore` にマッチ
  - 例: `src/**` は `src/.env` にマッチ**しない**
* picomatch オプション: `{ dot: false }` （デフォルト）

### 7.5.5 Case Sensitivity

* デフォルト: **OS のデフォルトに従う**
  - Linux/macOS: Case-sensitive
  - Windows: Case-insensitive
* picomatch オプション: `{ nocase: false }` （OSデフォルト）

### 7.5.6 絶対パス vs 相対パス

* Scope glob は **常にリポジトリルート相対**
* 先頭の `/` は無視（`/src/**` と `src/**` は同義）
* 実装時は以下を推奨:
  ```typescript
  // 1. ファイルパスをリポジトリルート相対に変換
  const repoRoot = getRepositoryRoot();
  const relativePath = path.relative(repoRoot, absolutePath);
  
  // 2. POSIX形式に正規化
  const normalizedPath = relativePath.split(path.sep).join('/');
  
  // 3. Glob に対して isMatch
  const allowed = allowedScopes.some(glob => 
    picomatch.isMatch(normalizedPath, glob, { dot: false })
  );
  ```

### 7.5.7 エッジケース

| ケース | 扱い | 理由 |
|--------|------|------|
| 空文字列 glob `""` | マッチしない（E_SCOPE_INVALID） | 意味が不明瞭 |
| ルートマッチ `**` | 全ファイルにマッチ（警告推奨） | 最小権限原則に反する |
| 否定パターン `!src/**` | **サポートしない** | tasks.md の文法と衝突 |
| Symlink | リンク先を **解決しない**（パスそのものでマッチ） | セキュリティ（後述） |

---

## 8. Skills（LLMが迷わない手順書）

### 8.1 `sdd-architect`（Requirements→Design→Tasks）

#### MUST

* 新機能開始時は `specs/<feature>/` ディレクトリを作成する
* Requirements → Design → Tasks の順に文書を作成する
* 各タスク行に `(Scope: ...)` を **必ず** 付ける（後述の文法に従う）
* 設計後、影響ファイル（Impacted Files）を明記する

#### MAY（任意統合: kiro/cc-sdd が利用可能な場合）

* `kiro:spec-init` で初期化テンプレートを生成してもよい
* `kiro:spec-requirements` で要件抽出を補助してもよい
* `kiro:spec-design` で設計ドキュメント生成を補助してもよい
* `kiro:spec-tasks` でタスク分割を補助してもよい

#### MUST NOT（kiro が利用不可の場合）

* kiro コマンドの不在を理由にプロセスを止めてはならない
* 代わりに `specs/` 配下のテンプレートファイルを手動作成する

### 8.2 `sdd-implementer`（実装ループ）

**MUST**

* 実装開始前に必ず `sdd_start_task <TaskID>` を実行する
* Scope外の変更が必要になったら **コードを書かずに** tasks.md を更新（Scope追加）し、再度 `sdd_start_task`
* 実装後は検証ステップを実行する（後述）
* タスクを `[x]` にするのは、検証通過後のみ

**検証ステップ（優先順）**

1. `sdd_validate_gap <TaskID>` が利用可能なら実行（仕様とコードの差分検証）
2. 利用不可の場合、以下を手動確認:
   - 変更したファイルが allowedScopes 内にあるか
   - lsp_diagnostics でエラーがないか
   - 関連するテストが存在すれば実行

**MAY（任意統合: kiro/cc-sdd が利用可能な場合）**

* `kiro:validate-gap` でズレ検証を自動化してもよい

### 8.3 `sdd-orchestrator`（Phase 1: 自律ループ）

**MUST**

* Implementer が編集したら検証ステップを自動で回す（passまで修正ループ）
* pass後にのみ tasks.md のチェック更新を許可する（または更新を提案）
* 次タスク開始時は `sdd_start_task` を必ず実行させる

**検証ステップの自動化**

* `sdd_validate_gap` が利用可能ならそれを使用
* 利用不可の場合、lsp_diagnostics + テスト実行で代替

---

### 8.4 kiro/cc-sdd 統合に関する補足

本プラグインは **kiro コマンドに依存せず動作** する。kiro/cc-sdd は以下の補助機能を提供する任意統合である。

**kiro コマンド仕様（参考）**

| コマンド | 目的 | 代替手段（kiro不在時） |
|---------|------|---------------------|
| `kiro:spec-init` | specs/ テンプレート生成 | 手動で `specs/<feature>/requirements.md` 等を作成 |
| `kiro:spec-requirements` | 要件抽出補助 | ユーザーと対話しながら requirements.md を記述 |
| `kiro:spec-design` | 設計生成補助 | design.md を手動記述 |
| `kiro:spec-tasks` | タスク分割補助 | tasks.md を手動記述 |
| `kiro:validate-gap` | 仕様とコードの差分検証 | lsp_diagnostics + 手動レビュー |

**スタブ実装の提供**

プラグインは `.opencode/tools/sdd_validate_gap.ts` にスタブを提供する。

```typescript
// スタブ実装例（kiro 不在時の動作）
export default tool({
  description: "仕様とコードの差分を検証（kiro統合時は自動化）",
  args: { taskId: tool.schema.string() },
  async execute(args, context) {
    // kiro が利用可能かチェック
    const kiroAvailable = await checkKiroAvailable();
    
    if (kiroAvailable) {
      // kiro:validate-gap を実行
      return await runKiroValidateGap(args.taskId);
    } else {
      // フォールバック: 手動検証手順を返す
      return `kiro:validate-gap は利用できません。
以下を手動で確認してください:
1. lsp_diagnostics で変更ファイルにエラーがないか
2. 関連テストが存在すれば実行
3. tasks.md の要件が満たされているか確認`;
    }
  }
});
```

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

