import { tool } from "../lib/plugin-stub.js";
import { getAllBuiltinCommands, getBuiltinCommand } from "../../src/features/builtin-commands/index.js";

// ツール説明文を動的に生成（モデルにコマンド一覧を教えるため）
const commandsList = getAllBuiltinCommands()
    .map(c => `- /${c.name}: ${c.description}`)
    .join("\n");

const DESCRIPTION = `
Execute SDD workflow commands. Use this tool when the user asks to run specific SDD phases.

Available Commands:
${commandsList}
`;

export const sddRouterTool = tool({
    description: DESCRIPTION,
    command: true,
    args: {
        command: tool.schema.string().describe("The command name to execute (e.g., 'profile', 'impl')"),
    },
    execute: async ({ command }) => {
        // 1. コマンドの検索
        const normalizedCmd = command.trim().replace(/^\/+/, "").split(/\s+/)[0];
        const cmdDef = getBuiltinCommand(normalizedCmd);

        if (!cmdDef) {
            return `Command '/${normalizedCmd}' not found. Available commands:\n${commandsList}`;
        }

        // 2. テンプレートの適用
        const content = cmdDef.template;

        // 3. プロンプト（指示書）を返す
        return `
# /${cmdDef.name} Executed
${content}
    `;
    },
});

export default sddRouterTool;
