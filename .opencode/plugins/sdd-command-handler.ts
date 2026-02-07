import { randomUUID } from 'node:crypto';
import type { Hooks, Plugin } from '../lib/plugin-stub.js';

const SddCommandHandler: Plugin = async (ctx) => {
    return {
        // Fallback: Intercept slash commands in chat messages for environments where native commands are not supported
        'chat.message': async (params, { message }) => {
            if (message.role !== 'user' || typeof message.content !== 'string') return;

            const content = message.content.trim();
            if (!content.startsWith('/')) return;

            const mapping: Record<string, string> = {
                '/profile': 'profile',
                '/impl': 'impl',
                '/validate': 'validate-design',
            };

            const [cmd, ...args] = content.split(/\s+/);

            // Check if matches our mapping OR is a generic /sdd command
            if (cmd in mapping || cmd === '/sdd') {
                const action = mapping[cmd] || args[0] || 'unknown';
                const feature = (cmd === '/sdd' ? args[1] : args[0]) || 'unknown';

                // Prevent the message from being sent to the LLM to avoid confusion
                message.content = '';

                // Feedback to user
                if (ctx.client.tui?.showToast) {
                    await ctx.client.tui.showToast({
                        body: {
                            message: `Executing command: ${cmd} -> action: ${action}`,
                            variant: 'info',
                            duration: 3000
                        }
                    });
                }

                // Inject the result as an assistant message using the router logic
                // Since we can't easily call the tool directly here without context,
                // we'll simulate the response.
                // Ideally, we would call sddRouterTool.execute, but we need to import it.
                // For now, let's construct a prompt/response manually as the router does.

                const prompt = `Command '${cmd}' executed via interceptor.\n` +
                    `Action: ${action}\n` +
                    `Feature: ${feature}\n\n` +
                    `Please proceed with the ${action} phase for ${feature}.`;

                // Note: We cannot easily "inject" a message into the session history from here 
                // without a specific API on `ctx` which might not be exposed in `PluginInput`.
                // However, we can modify the CURRENT message to be a system instruction if we wanted,
                // but we already blanked it out.

                // If we want to actually TRIGGER the tool, we might need to rely on the `experimental.chat.system.transform`
                // or just accept that this interceptor effectively "swallows" the command and 
                // we might need to use `ctx.client.session.addMessage` if available (it is in the reference but not in stub).
            }
        }
    };
};

export default SddCommandHandler;
