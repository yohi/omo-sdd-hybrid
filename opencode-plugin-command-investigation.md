# OpenCodeプラグインアーキテクチャにおける動的スラッシュコマンド認識とファイルレス統合手法に関する包括的調査報告書

## 1. 序論

### 1.1 背景：AIコーディングエージェントの拡張性という課題

近年、ソフトウェア開発の現場において、OpenCodeやClaude Codeに代表されるAIコーディングエージェントの導入が急速に進んでいる。これらのツールは、単なるコード補完の枠を超え、端末（ターミナル）内で開発者と対話し、自律的にファイル操作やコマンド実行を行う「エージェント型」のワークフローを確立した。

このパラダイムシフトにおいて、ツールの機能を拡張するプラグインシステムの重要性は極めて高い。特に、開発者コミュニティや企業内でのツール配布を考慮した際、ユーザーの手動操作（設定ファイルのコピーやディレクトリの作成など）を極力排除し、パッケージのインストールのみで機能が完結する「ファイルレスアーキテクチャ」の実現が求められている。

### 1.2 目的とスコープ

本報告書は、OpenCodeのプラグインシステムにおいて、ユーザーディレクトリへのファイルコピー（アーティファクトの生成）を行わずに、カスタムスラッシュコマンド（例: `/review`, `/deploy`）を認識・実行させるための技術的手法を包括的に調査・分析したものである。

OpenCodeの標準的な仕様では、カスタムコマンドはユーザーの `~/.config/opencode/commands/` ディレクトリにMarkdownファイルを配置することで定義される。しかし、これはプラグインとしての配布・更新の観点からは管理コストが高く、ユーザー体験を損なう要因となり得る。そこで、プラグインのコード内から動的にコマンドを注入する手法が模索されている。

本稿では、以下の2つの主要なアプローチを軸に議論を展開する。

1.  **手法A（ネイティブ統合）**: OpenCodeの `config` フックを利用し、メモリ上の設定オブジェクトにコマンド定義を動的にマージする手法。これは理想的な解決策であるが、OpenCodeのバージョンや環境によってはAPIが未実装または制限されている場合がある。
2.  **手法B（メッセージインターセプト）**: ユーザーの入力を監視し、特定のスラッシュコマンドを検出して処理を横取り（インターセプト）する代替手法。手法Aが利用できない環境における現実的な解として、本報告書の中心的な分析対象となる。

### 1.3 報告書の構成

本報告書は、OpenCodeの内部アーキテクチャの解析から始まり、各手法の実装詳細、制約事項、セキュリティリスク、および将来的な展望に至るまでを網羅する。特に、GitHub上のissue議論やコミュニティの実装例（oh-my-opencode等）から得られた知見を統合し、実用性と理論的深度を兼ね備えた技術文書として構成されている。

---

## 2. OpenCodeアーキテクチャとプラグインシステムの解剖

スラッシュコマンドの動的認識メカニズムを理解するためには、OpenCodeがどのようにユーザー入力を処理し、プラグインがどの段階で介入可能かを把握する必要がある。本章では、OpenCodeの基盤技術とプラグインライフサイクルについて詳述する。

### 2.1 クライアント・サーバーモデルとBunランタイム

OpenCodeは、ユーザーインターフェース（TUI: Text User Interface）とバックエンドサーバーが分離されたアーキテクチャを採用している。

-   **サーバープロセス**: TypeScriptで記述され、高速なJavaScriptランタイムであるBun上で動作する。Honoフレームワークを用いたHTTPサーバーとして機能し、LLM（Large Language Model）との通信、ファイルシステム操作、セッション管理、そしてプラグインの実行を担う。
-   **クライアント（TUI）**: Go言語で記述されたターミナルインターフェースであり、サーバーと通信してユーザー入力を送信し、レンダリングを行う。

この分離構造はプラグイン開発において重要な意味を持つ。プラグインはサーバー側で実行されるため、TUIへの直接的な描画操作（DOM操作のようなもの）はできず、APIを通じたメッセージング（`ctx.client.tui.*`）によってUIを制御する必要がある。

### 2.2 プラグインコンテキスト（Plugin Context）

OpenCodeのプラグインは、初期化時に `PluginContext` オブジェクトを受け取る。このオブジェクトは、プラグインが外部環境と相互作用するためのインターフェースを提供する。

| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `client` | `OpencodeClient` | SDKクライアント。セッション操作、TUI制御、認証、イベント購読などの主要機能へのアクセスポイント。 |
| `project` | `Project` | 現在のプロジェクト情報（ID、パス、VCS情報など）。 |
| `directory` | `string` | 現在の作業ディレクトリ（CWD）。 |
| `$` | `Shell` | Bun Shell API。システムコマンドを実行するために使用される（例: `await $`git status``）。 |

特に `client` オブジェクトは、後述する手法Bにおいて、ユーザーへのフィードバック（トースト通知）やセッション制御を行うための鍵となる。

### 2.3 フックシステムとイベントバス

OpenCodeの拡張性は、特定のライフサイクルイベントに介入する「フック（Hook）」によって実現されている。プラグインは、特定のフック関数を実装したオブジェクトを返すことで、システムの挙動を変更できる。

#### 主要なフック一覧

| フック名 | 引数シグネチャ | 実行タイミングと役割 |
| :--- | :--- | :--- |
| **`config`** | `(config: Config) => Promise<void>` | **初期化フェーズ**: 設定ファイルがロードされた直後に実行される。設定オブジェクトを直接変異（Mutate）させることで、動的な設定注入が可能。 |
| **`chat.message`** | `(input, output) => Promise<void>` | **対話フェーズ**: ユーザーがメッセージを送信した後、LLMにコンテキストが送られる直前に実行される。メッセージ内容の解析、変更、ブロックが可能。 |
| **`tool.execute.before`** | `(input, output) => Promise<void>` | **実行フェーズ**: エージェントがツール（bash, edit等）を呼び出す直前に実行される。引数の検証やセキュリティチェックに使用される。 |
| **`event`** | `({ event }) => Promise<void>` | **監視フェーズ**: システム全体で発生するイベント（`session.idle`, `tui.command.execute` 等）を受動的にリッスンする。 |

ユーザーディレクトリへのファイルコピーを行わずにスラッシュコマンドを実現するためには、これらのフックのうち `config`（手法A）または `chat.message`（手法B）を戦略的に利用する必要がある。

---

## 3. 標準的なコマンド実装とその課題

まず、OpenCodeが標準で提供しているコマンド定義方法を確認し、なぜファイルレス実装が必要とされるのか、その動機を明確にする。

### 3.1 Markdownによる静的定義

標準的なOpenCodeのコマンドは、`.md` ファイルとして定義される。ユーザーは `~/.config/opencode/commands/`（グローバル）または `.opencode/commands/`（プロジェクトローカル）にファイルを配置する。

#### 例: test.md

```markdown
---
description: Run tests with coverage
agent: build
model: anthropic/claude-3-5-sonnet-20241022
---

Run the full test suite with coverage report and show any failures.
Focus on the failing tests and suggest fixes.
```

このファイルを配置すると、ユーザーはTUI上で `/test` と入力してコマンドを呼び出すことができる。

### 3.2 配布と管理の課題（The Distribution Problem）

この標準手法は、個人のカスタマイズには適しているが、機能拡張パッケージ（プラグイン）として配布する際には以下の問題が生じる。

1.  **インストール手順の複雑化**: ユーザーに対し、「プラグインをインストールした後、このMarkdownファイルを指定のディレクトリに手動でコピーしてください」という追加の手順を強いることになる。これはユーザー体験（UX）を損ない、導入の障壁となる。
2.  **バージョニングと更新の困難さ**: プラグイン本体のコードが更新された際、ユーザーの手元にあるMarkdownファイルは自動的に更新されない。コマンドの定義（プロンプトやパラメータ）を変更したい場合、ユーザーに再度コピーを依頼する必要がある。
3.  **ファイルシステムの汚染**: ユーザーの環境に複数のファイルが散乱することになり、アンインストール時にゴミとして残るリスクがある。

これらの課題を解決するため、ファイル実体をユーザー環境に生成せず、プラグインのロジック内で完結する「ファイルレス」な実装が求められている。

---

## 4. 手法A：Configフックによるネイティブ統合（理想解）

「手法A」は、OpenCodeの正規のAPIである `config` フックを利用して、メモリ上で設定オブジェクトを書き換えるアプローチである。これが利用可能な環境であれば、最も堅牢でユーザー体験の優れた実装となる。

### 4.1 メカニズム：実行時設定マージ

OpenCodeは起動時に複数のソース（グローバル設定、プロジェクト設定、環境変数）から設定を読み込み、単一の `Config` オブジェクトにマージする。プラグインの `config` フックは、このマージプロセス完了後、システムが稼働する直前に呼び出される。

このタイミングで `config.command` オブジェクトに新しいエントリを追加すれば、システムはそれを「ユーザーがファイルで定義したコマンド」と同等に扱う。

### 4.2 実装コード詳解

以下のTypeScriptコードは、プラグイン内から動的に `/my-command` を登録する例である。

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const NativeCommandPlugin: Plugin = async (ctx) => {
  return {
    // configフック：設定オブジェクトを受け取り、変更を加える
    config: async (config) => {
      // 既存のcommandオブジェクトがない場合は初期化
      if (!config.command) {
        config.command = {};
      }

      // 新しいコマンドを注入
      // キー名 "my-command" がスラッシュコマンド "/my-command" になる
      config.command["my-command"] = {
        description: "プラグインから注入された動的コマンド",
        // テンプレート文字列。$ARGUMENTS はユーザー入力を受け取るプレースホルダ
        template: "以下の指示に従ってコードを修正してください。\n\n指示: $ARGUMENTS",
        agent: "build", // 実行するエージェントを指定
        model: "anthropic/claude-3-5-sonnet-20241022" // モデルの指定（任意）
      };

      // ログ出力（デバッグ用）
      await ctx.client.app.log({
        body: {
          message: "NativeCommandPlugin: Command '/my-command' injected via config hook.",
          level: "info",
          service: "native-command-plugin"
        }
      });
    },
  };
};
```

### 4.3 利点：完全なネイティブ挙動

この手法の最大の利点は、OpenCodeのTUIシステムがこのコマンドを認識できる点にある。

-   **オートコンプリート**: ユーザーが `/` を入力した際、コマンドパレットの候補リストに `my-command` が表示される。
-   **ヘルプ統合**: `/help` コマンドの出力に、説明文（description）と共に表示される。
-   **引数処理**: OpenCode標準の引数パーサー（`$ARGUMENTS` や `$1`, `$2` 等）が利用できる。

### 4.4 未実装・制限のケース（Why Method A Fails）

「手法Aが未実装な場合」とは、以下のような状況を想定している。

1.  **APIバージョンの不一致**: 古いバージョンのOpenCodeや、特定のフォーク版では `config` フックが提供されていない、あるいは読み取り専用である可能性がある。
2.  **動的性の制限**: `config` フックは起動時に一度だけ実行される静的な定義に近い。実行時の状況（例：現在のGitブランチ名や外部APIの状態）に応じてコマンドの定義自体を動的に変更したい場合、この手法では対応しきれない。
3.  **即時実行の欠如**: `config` フックで定義したコマンドは、あくまで「LLMへのプロンプトテンプレート」である。ユーザーがコマンドを入力すると、必ずLLM推論（エージェントの思考）が開始される。LLMを介さずに、単に設定を切り替えたり、軽量なスクリプトを実行したい場合（Non-Agentic Command）、この手法はオーバーヘッドが大きすぎる。

---

## 5. 手法B：メッセージインターセプトによる代替実装

手法Aが利用できない、あるいはLLMを介さない即時実行が必要な場合、「手法B」すなわち **`chat.message` フックによるメッセージインターセプト** が唯一の解となる。これは、Webブラウザの拡張機能やミドルウェアパターンに似たアプローチであり、ユーザーの入力をシステムが処理する前に「横取り」し、独自のロジックを実行する。

### 5.1 アーキテクチャ概念：チャットミドルウェア

この手法では、プラグインはあたかも「中間管理者（Middleware）」のように振る舞う。

1.  **Intercept (傍受)**: ユーザーがチャットボックスに入力しEnterを押した瞬間、そのメッセージはサーバーに送られる。
2.  **Analyze (解析)**: `chat.message` フックが発火。プラグインはメッセージ内容を文字列として取得し、正規表現で解析する。
3.  **Branch (分岐)**:
    -   **パス1（通常メッセージ）**: 特定のコマンド形式（例: `/` で始まる）でなければ、何もせずスルーする（`return`）。OpenCodeは通常通りLLMにメッセージを送る。
    -   **パス2（マクロ展開）**: メッセージ内容を別のプロンプトに書き換える（`output.parts` の変更）。
    -   **パス3（即時実行/キャンセル）**: プラグイン内で処理を実行し、LLMへの送信を阻止または無効化する。

### 5.2 実装パターン1：マクロ展開（Agentic Expansion）

これは「手法A」の挙動を、フックを使って擬似的に再現するパターンである。`oh-my-opencode` プラグインなどがこの手法を採用している。

#### 動作原理

ユーザーが `/refactor main.ts` と入力したとする。プラグインはこの文字列を検知し、事前に定義された長大なプロンプト（「あなたは熟練したリファクタリングエンジニアです。main.tsを分析し...」）に置換する。ユーザーからは短いコマンドに見えるが、LLMには詳細な指示が渡る。

#### 実装コード詳解

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const MacroExpansionPlugin: Plugin = async (ctx) => {
  return {
    "chat.message": async (input, output) => {
      // 1. メッセージテキストの抽出
      const textPart = input.parts.find(p => p.type === 'text');
      if (!textPart || typeof textPart.text !== "string") return;

      const rawText = textPart.text.trim();

      // 2. コマンド検出（正規表現）
      // 例: /refactor <対象>
      const match = rawText.match(/^\/refactor\s+(.*)/);

      if (match) {
        const target = match[1]; // 引数部分

        // 3. テンプレート展開
        const expandedPrompt = `
          【自動生成プロンプト: Refactor Command】
          対象: ${target}

          指示:
          上記のコードについて、可読性、保守性、パフォーマンスの観点からリファクタリングを行ってください。
          変更を加える前に、改善点をリストアップしてください。
        `.trim();

        // 4. メッセージの書き換え (Mutation)
        output.parts = [{
          type: "text",
          text: expandedPrompt
        }];

        // 5. ユーザーへのフィードバック
        await ctx.client.tui.showToast({
          title: "Command Expanded",
          message: `/refactor ${target} を実行中...`,
          variant: "info"
        });

        // ログ出力
        await ctx.client.app.log({
          body: {
            message: `Expanded /refactor command for target: ${target}`,
            level: "info",
            service: "macro-plugin"
          }
        });
      }
    }
  };
};
```

#### インサイト：状態管理と再帰防止

`oh-my-opencode` の実装事例では、書き換えたメッセージが再度フックに引っかかり、無限ループに陥るリスクや、他のプラグインとの競合により書き換えが反映されない問題（Issue #885）が報告されている。これを防ぐため、内部的に処理済みフラグを管理するか、書き換えたメッセージに特殊なタグ（例: `<auto-slash-command>...</auto-slash-command>`）を埋め込み、再処理を防止するガードロジックが必要となる場合がある。

### 5.3 実装パターン2：即時実行とLLMキャンセル（Non-Agentic Execution）

LLMを使わず、プラグイン側で完結するコマンド（例: 設定変更、Git操作、クリップボード操作など）を実現する場合、LLMへのリクエストを「キャンセル」または「無効化」する必要がある。

#### LLMキャンセルの課題

`chat.message` フックは `Promise<void>` を返す仕様であり、明示的に「処理を中止（Abort）」する返り値を持たない場合が多い。単純にメッセージを空にするとエラーになる可能性がある。

#### 戦略：セッションアボートによる強制終了

調査結果に基づくと、最も効果的な方法は `ctx.client.session.abort()` を使用することである。

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const InstantCommandPlugin: Plugin = async (ctx) => {
  return {
    "chat.message": async (input, output) => {
      const textPart = input.parts.find(p => p.type === 'text');
      if (!textPart) return;
      const text = textPart.text.trim();

      // コマンド: /toggle-feature
      if (text === "/toggle-feature") {
        // 1. 即時処理の実行
        const newState = await toggleFeatureLogic();

        // 2. ユーザーへのフィードバック
        await ctx.client.tui.showToast({
          title: "設定変更",
          message: `機能Xを ${newState ? '有効' : '無効'} にしました`,
          variant: "success"
        });

        // 3. LLM生成の阻止 (Session Abort Strategy)
        try {
          await ctx.client.session.abort({
            path: { id: input.sessionID }
          });
          await ctx.client.tui.clearPrompt();
        } catch (e) {
          // フォールバック: LLMに対して無視を指示
          output.parts = [{ type: "text", text: "Ignore this message." }];
        }
      }
    }
  };
};
```

---

## 6. 実装の深掘り：堅牢なインターセプターの構築

手法B（メッセージインターセプト）をプロダクションレベルで実装するためには、単純な文字列一致だけでなく、引数解析やコンテキスト注入といった高度な機能が必要となる。

### 6.1 正規表現による堅牢なパージング

ユーザー入力は多様である。単にスペースで区切るだけでは、引用符で囲まれた引数やフラグを正しく扱えない。

**推奨される正規表現パターン**:
```typescript
// コマンド名と、残りの引数全体をキャプチャ
const commandRegex = /^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/s;
```
末尾の `s` フラグ（dotAll）は、改行を含む入力を扱うために重要である。

### 6.2 引数解析（Argument Parsing）

コマンドラインツールのような引数（例: `/cmd --verbose -f "file name.txt"`）をサポートする場合、専用のパーサーライブラリ（`minimist` や `yargs-parser` など）を利用するか、簡易的なパーサーを実装する必要がある。

### 6.3 コンテキスト注入（Context Injection）

OpenCodeの特徴である `@filename` によるコンテキスト参照を、自作コマンド内でも有効にするには、OpenCodeが内部で行っている解決ロジックを模倣するか、あるいはOpenCodeに解決させた後のメッセージを利用する必要がある。`input.parts` に含まれる解決済みコンテキストを利用することが可能である。

---

## 7. 比較分析と選択指針

### 7.1 手法比較マトリクス

| 評価項目 | 手法A: Config Hook (Native) | 手法B-1: Macro Expansion (Agentic) | 手法B-2: Instant Execution (Non-Agentic) |
| :--- | :--- | :--- | :--- |
| **ユーザー体験 (UX)** | **最良** (補完・ヘルプあり) | 良 (補完なし・実行はエージェント) | 特殊 (補完なし・即時反応) |
| **レイテンシ** | 低 (初期化時のみ) | 中 (LLM推論待ち時間あり) | **最低** (LLMなし、即時) |
| **実装コスト** | 低 | 中 | 高 (アボート処理などハックが必要) |
| **コスト (API料金)** | 発生する | 発生する (プロンプト分) | **発生しない** |
| **柔軟性** | 低 (テンプレートのみ) | 中 (動的プロンプト生成) | **高** (任意のコード実行) |
| **制約** | API未実装環境で不可 | なし | TUI制御の限界に依存 |

### 7.2 選択指針

1.  **標準的なカスタムプロンプトを追加したい場合**:
    -   まず **手法A** を試みる。これが最もOpenCodeの哲学に沿っている。
    -   環境制約で手法Aが使えない場合、**手法B-1** にフォールバックする。
2.  **LLMを使わないツール（Git操作、設定切替）を作りたい場合**:
    -   **手法B-2** 一択である。標準のコマンドシステムでは必ずLLMが呼び出されてしまうため。

---

## 8. ケーススタディ：コミュニティにおける実装事例分析

### 8.1 事例1: oh-my-opencode の auto-slash-command フック

-   **課題**: `/brainstorming` と入力した際、フックが発火しているにもかかわらずTUI上でメッセージが変化しない現象（Issue #925）が発生。
-   **原因**: `output.parts` のミューテーションが、内部パイプラインにおいて正しく伝播していなかった。
-   **教訓**: `chat.message` フック内でのオブジェクト操作は慎重に行う必要がある。また、デバッグには `ctx.client.app.log` を用いてサーバー側のログを確認することが必須である。

### 8.2 事例2: TUIトースト通知の非同期性

-   **課題**: 即時実行コマンドにおいて、トーストが表示される前にセッションがアボートされると通知が見逃される場合がある。
-   **対策**: 重要な通知はトーストだけでなく、チャットログやシステムメッセージへの挿入で補完することが望ましい。

---

## 9. セキュリティと安全性への配慮

### 9.1 プロンプトインジェクション（Prompt Injection）

ユーザー入力をそのままプロンプトテンプレートに埋め込む際、悪意ある入力によってエージェントの挙動が操作されるリスクがある。

-   **対策**: テンプレート展開時にサニタイズを行う。また、エージェントのパーミッション設定を適切に行い、危険なツールの実行には必ずユーザー確認を求めるようにする。

### 9.2 無限ループとリソース枯渇

エージェントがツールを呼び出し、その結果がまたエージェントを刺激するループが発生する場合がある。

-   **対策**: 自動生成されたメッセージにはメタデータや不可視のタグを付与し、プラグインが自身の生成したメッセージには反応しないようなガード処理を入れる。

---

## 10. 結論と推奨実装コード

### 10.1 推奨実装：ハイブリッド・インターセプタープラグイン

```typescript
/**
 * Fileless Slash Command Plugin
 * 手法B（Interceptor Pattern）を用いたスラッシュコマンドの実装。
 */

import type { Plugin } from "@opencode-ai/plugin";

type CommandDef = {
  description: string;
  type: "agentic" | "instant";
  template?: (args: string) => string;
  action?: (args: string, ctx: any) => Promise<void>;
};

export const SlashCommandPlugin: Plugin = async (ctx) => {
  const { client, project } = ctx;

  const commands: Record<string, CommandDef> = {
    "/summary": {
      description: "プロジェクト概要の生成",
      type: "agentic",
      template: (args) => `プロジェクト「${project.name}」を分析してください。追加指示: ${args}`
    },
    "/clean-logs": {
      description: "ログファイルの削除",
      type: "instant",
      action: async (_args, context) => {
        await context.$`rm -f *.log`;
        await client.tui.showToast({ title: "Clean Logs", message: "削除完了", variant: "success" });
      }
    }
  };

  return {
    "chat.message": async (input, output) => {
      const textPart = input.parts.find(p => p.type === "text");
      if (!textPart || typeof textPart.text !== "string") return;

      const rawText = textPart.text.trim();
      if (!rawText.startsWith("/")) return;

      const match = rawText.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/s);
      if (!match) return;

      const [_, cmdName, argsContent] = match;
      const command = commands[`/${cmdName}`];
      if (!command) return;

      if (command.type === "agentic" && command.template) {
        output.parts = [{ type: "text", text: command.template(argsContent || "") }];
      } else if (command.type === "instant" && command.action) {
        await command.action(argsContent || "", ctx);
        output.parts = [{ type: "text", text: `Command '${cmdName}' executed.` }];
      }
    }
  };
};
```

### 10.2 結言

OpenCodeにおける「ファイルレス」なスラッシュコマンド実装は、互換性や即時性の観点から手法B（インターセプトパターン）が強力な手段となる。開発者は、コマンドの性質に応じて手法を適切に選択することで、シームレスな拡張機能を提供可能である。

#### 引用文献

1. How Coding Agents Actually Work: Inside OpenCode | Moncef Abboud
2. Opencode plugin development guide.md - GitHub Gist
3. Plugins - OpenCode Documentation
4. Issue #925 - oh-my-opencode
5. Commands | OpenCode Documentation
...（以下略）