import { randomUUID } from 'node:crypto';
import type { Hooks, Plugin } from '../lib/plugin-stub.js';
import { tool } from '../lib/plugin-stub.js';
import { getBuiltinCommand, getAllBuiltinCommands } from "../lib/builtin-commands/index.js";

const SddCommandHandler: Plugin = async (ctx) => {
    // 組み込みコマンドを Tool として定義・登録する
    const commandsAsTools = getAllBuiltinCommands().reduce((acc, cmd) => {
        acc[cmd.name] = tool({
            description: cmd.description,
            command: true, // 重要: これによりスラッシュコマンドとして認識される
            args: {
                feature: tool.schema.string().optional().describe(cmd.argumentHint || 'Feature name')
            },
            execute: async (args, context) => {
                const feature = args.feature || '';
                const promptContent = cmd.template.replace('{{feature}}', feature);

                // Toast通知
                if (ctx.client.tui?.showToast) {
                    await ctx.client.tui.showToast({
                        body: { 
                            message: `Executing /${cmd.name} ${feature}`.trim(), 
                            variant: 'info', 
                            duration: 3000 
                        }
                    });
                }

                // AIエージェントへの指示送信
                if (context.sessionID && ctx.client.session?.prompt) {
                    try {
                        await ctx.client.session.prompt({
                            path: { id: context.sessionID },
                            body: { 
                                parts: [{ 
                                    type: "text", 
                                    text: promptContent 
                                }] 
                            }
                        });
                        return `Command /${cmd.name} sent successfully.`;
                    } catch (error) {
                        const errMsg = error instanceof Error ? error.message : String(error);
                        if (ctx.client.tui?.showToast) {
                            await ctx.client.tui.showToast({
                                body: { 
                                    message: `Failed to execute /${cmd.name}: ${errMsg}`, 
                                    variant: 'error', 
                                    duration: 4000 
                                }
                            });
                        }
                        return `Error executing command: ${errMsg}`;
                    }
                }
                return "Session ID missing, cannot execute prompt.";
            }
        });
        return acc;
    }, {} as Record<string, any>);

    return {
        // Tool登録
        tool: commandsAsTools,

        // [Fallback] チャットメッセージとして入力されたコマンドを捕捉
        // TUIイベントが発火しない環境や、チャット欄に直接入力された場合用
        'chat.message': async (params, { message }) => {
            if (message.role !== 'user' || typeof message.content !== 'string') return;

            const content = message.content.trim();
            if (!content.startsWith('/')) return;

            const [cmd, ...args] = content.split(/\s+/);
            const normalizedCmd = cmd.replace(/^\/+/, "");

            // Toolとして登録されているコマンドはここでは処理しない（重複実行防止）
            if (getBuiltinCommand(normalizedCmd)) {
                return;
            }

            // 汎用 /sdd コマンドの処理
            if (normalizedCmd === 'sdd') {
                if (args.length < 2) {
                    const usage = 'Usage: /sdd <action> <feature>';
                    if (ctx.client.tui?.showToast) {
                        ctx.client.tui.showToast({
                            body: { message: usage, variant: 'error', duration: 4000 }
                        }).catch(console.warn);
                    }
                    return;
                }
                const action = args[0];
                const feature = args[1];
                
                // アクションに対応するコマンド定義を探す (e.g. "profile")
                const targetCmd = getBuiltinCommand(action);
                if (targetCmd) {
                     const prompt = targetCmd.template.replace('{{feature}}', feature);
                     message.content = prompt;
                } else {
                    const available = getAllBuiltinCommands().map(c => c.name).join(', ');
                    const errorMsg = `Unknown action: '${action}'. Available actions: ${available}`;
                    
                    if (ctx.client.tui?.showToast) {
                        ctx.client.tui.showToast({
                            body: { message: errorMsg, variant: 'error', duration: 4000 }
                        }).catch(console.warn);
                    }
                    message.content = '';
                }
                return;
            }
        }
    };
};

export default SddCommandHandler;
