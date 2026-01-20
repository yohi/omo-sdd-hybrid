# Learnings - omo-sdd-hybrid-phase0

## 2026-01-20 Task -1: OpenCode Plugin API 検証

### 検証結果サマリ

- **検証コミット**: `968239bb76f953385e7c363806c143536f2e5139` (v1.1.25)
- **リポジトリ**: https://github.com/anomalyco/opencode

### 確認された API 仕様

#### 1. tool.execute.before フック ✅ 存在

**型定義** (`packages/plugin/src/index.ts:L176`):
```typescript
"tool.execute.before"?: (
  input: { tool: string; sessionID: string; callID: string },
  output: { args: any },
) => Promise<void>
```

**注意**: 計画では `event.tool.name` と `event.tool.args` だったが、実際は:
- `input.tool` - ツール名
- `output.args` - ツール引数

#### 2. @opencode-ai/plugin パッケージ

- **npm 公開**: なし（workspace 内パッケージ）
- **対応**: `.opencode/lib/plugin-stub.ts` を作成してローカルでスタブを提供

#### 3. Tool 登録形式 ✅ 計画通り

```typescript
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "...",
  args: {
    param: tool.schema.string().describe("...")
  },
  async execute(args, context) {
    return "result"
  }
})
```

**ToolContext 型**:
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

#### 4. Plugin 登録 ⚠️ 計画と異なる

**計画**: `.opencode/plugins.json`
**実際**: `opencode.jsonc` の `plugin` 配列

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./plugins/sdd-gatekeeper.ts"]
}
```

#### 5. Skill 形式 ✅ 計画通り

`.opencode/skill/*/SKILL.md`:
```markdown
---
name: skill-name
description: use this when...
---

Skill content here
```

#### 6. Tool 配置 ✅ 計画通り

- `.opencode/tool/*.ts` に配置で自動検出
- `opencode.jsonc` の `tools` で有効/無効を制御可能

### 計画への調整

| 項目 | 計画 | 実際 | 対応 |
|------|------|------|------|
| Plugin 登録 | `.opencode/plugins.json` | `opencode.jsonc` の `plugin` 配列 | opencode.jsonc を使用 |
| @opencode-ai/plugin | npm パッケージ | workspace パッケージ | plugin-stub.ts を作成 |
| tool.execute.before 引数 | `event.tool.name/args` | `input.tool`, `output.args` | 型定義を修正 |
