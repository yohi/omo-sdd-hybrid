import { tool } from "../../.opencode/lib/plugin-stub.js";
import { getAllBuiltinCommands, getBuiltinCommand } from "../features/builtin-commands/index.js";

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
    args: {
        command: tool.schema.string().describe("The command name to execute (e.g., 'profile', 'impl')"),
        args: tool.schema.string().optional().describe("Optional arguments for the command"),
    },
    execute: async ({ command, args }) => {
        // 1. コマンドの検索
        const normalizedCmd = command.trim().replace(/^\/+/, "");
        const cmdDef = getBuiltinCommand(normalizedCmd);

        if (!cmdDef) {
            return `Command '/${normalizedCmd}' not found. Available commands:\n${commandsList}`;
        }

        // 2. テンプレートの処理
        let content = cmdDef.template;
        if (args) {
            content = content.replace(/\$ARGUMENTS/g, args);
        }

        // 3. プロンプト（指示書）を返す
        return `
# /${cmdDef.name} Executed
${content}
    `;
    },
});
