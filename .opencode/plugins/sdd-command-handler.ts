import type { Hooks, Plugin } from '../lib/plugin-stub.js';

const SddCommandHandler: Plugin = async () => {
    return {
        'command.execute.before': async (input, output) => {
            const { command, arguments: args } = input;

            const mapping: Record<string, string> = {
                'profile': 'profile',
                'impl': 'impl',
                'validate': 'validate-design', // Default validation action
            };

            if (command in mapping) {
                // Construct a prompt that instructs the model to call the appropriate tool
                const action = mapping[command];
                const prompt = `User executed command '/${command} ${args}'.\n` +
                    `Please call the tool 'sdd_kiro' with arguments: { command: '${action}', feature: '${args || "unknown"}' }.\n` +
                    `If 'feature' is missing and required for '${action}', ask the user for it.`;

                // Inject the prompt as a system message or user message part
                // 'command.execute.before' では完全なツール呼び出しを直接注入することは難しいが、
                // but we can substitute the user's input with a clear instruction.
                // However, 'output.parts' expects Part[].

                output.parts.push({
                    id: crypto.randomUUID(),
                    sessionID: input.sessionID,
                    messageID: crypto.randomUUID(), // Placeholder
                    type: 'text',
                    text: prompt,
                    // active: true // implied
                });
            }
        },
    };
};

export default SddCommandHandler;
