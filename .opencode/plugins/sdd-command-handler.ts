import { randomUUID } from 'node:crypto';
import type { Hooks, Plugin } from '../lib/plugin-stub.js';

const SddCommandHandler: Plugin = async () => {
    return {
        'command.execute.before': async (input, output) => {
            const { command, arguments: args } = input;

            const mapping: Record<string, string> = {
                'profile': 'profile',
                'impl': 'impl',
                'validate': 'validate-design', // デフォルトの検証アクション
            };

            if (command in mapping) {
                // モデルに適切なツールを呼び出すよう指示するプロンプトを構築
                const action = mapping[command];
                const prompt = `User executed command '/${command} ${args}'.\n` +
                    `Please call the tool 'sdd_kiro' with arguments: { command: '${action}', feature: '${args || "unknown"}' }.\n` +
                    `If 'feature' is missing and required for '${action}', ask the user for it.`;

                // システムメッセージまたはユーザーメッセージパートとしてプロンプトを注入
                // 'command.execute.before' では完全なツール呼び出しを直接注入することは難しいが、
                // ユーザーの入力を明確な指示に置き換えることができる。
                // ただし、'output.parts' は Part[] を期待している。

                output.parts.push({
                    id: randomUUID(),
                    sessionID: input.sessionID,
                    messageID: randomUUID(), // プレースホルダ
                    type: 'text',
                    text: prompt,
                    // active: true // 暗黙的に true
                });
            }
        },
    };
};

export default SddCommandHandler;
