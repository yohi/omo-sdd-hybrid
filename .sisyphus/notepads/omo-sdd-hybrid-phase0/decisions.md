# Decisions - omo-sdd-hybrid-phase0

## 2026-01-20 Task -1: Plugin API 調査に基づく決定

### 決定 1: Plugin 登録方法

**選択**: `opencode.jsonc` の `plugin` 配列を使用

**理由**:
- OpenCode v1.1.25 では `.opencode/plugins.json` ではなく `opencode.jsonc` で管理
- Config スキーマ（config.ts:L886）で `plugin: z.string().array().optional()` と定義

**実装**:
```jsonc
// .opencode/opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./plugins/sdd-gatekeeper.ts"]
}
```

### 決定 2: plugin-stub.ts の作成

**選択**: ローカルスタブを作成

**理由**:
- `@opencode-ai/plugin` は npm に公開されていない
- workspace 内パッケージとしてのみ存在
- テスト実行時に依存解決が必要

**実装**: `.opencode/lib/plugin-stub.ts` を作成

### 決定 3: ToolExecuteBeforeEvent の型修正

**選択**: 実際の API 構造に合わせる

**変更前**（計画）:
```typescript
interface ToolExecuteBeforeEvent {
  tool: {
    name: string;
    args: Record<string, any>;
  };
}
```

**変更後**（実際）:
```typescript
// フック引数は2つ: input と output
"tool.execute.before"?: (
  input: { tool: string; sessionID: string; callID: string },
  output: { args: any },
) => Promise<void>
```

### 決定 4: ToolContext の使用

**選択**: 実際の ToolContext 型を使用

**実装**:
```typescript
type ToolContext = {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): void
  ask(input: AskInput): Promise<void>
}
```
