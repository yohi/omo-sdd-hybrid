import { randomUUID } from 'node:crypto';
import type { Hooks, Plugin, ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { getBuiltinCommand, getAllBuiltinCommands } from "../lib/builtin-commands/index.js";
import { writeGuardModeState, type GuardMode } from '../lib/state-utils';

const SddCommandHandler: Plugin = async (ctx) => {
    const updateGuardModeStateAndNotifyUser = async (mode: GuardMode): Promise<{ success: boolean; error?: string }> => {
        try {
            await writeGuardModeState({
                mode,
                updatedAt: new Date().toISOString(),
                updatedBy: 'user'
            });

            if (ctx.client.tui?.showToast) {
                try {
                    await ctx.client.tui.showToast({
                        body: { message: `Guard mode changed to ${mode}`, variant: 'info', duration: 3000 }
                    });
                } catch (e) { /* ignore toast errors */ }
            }
            return { success: true };
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            if (ctx.client.tui?.showToast) {
                try {
                    await ctx.client.tui.showToast({
                        body: { message: `Failed to update guard mode: ${errMsg}`, variant: 'error', duration: 4000 }
                    });
                } catch (e) { /* ignore toast errors */ }
            }
            return { success: false, error: errMsg };
        }
    };

    // 組み込みコマンドを Tool として定義・登録する
    const commandsAsTools = getAllBuiltinCommands().reduce<Record<string, ToolDefinition>>((acc, cmd) => {
        acc[cmd.name] = tool({
            description: cmd.description,
            args: {
                feature: tool.schema.string().optional().describe(cmd.argumentHint || 'Feature name')
            },
            execute: async (args, context) => {
                const argsList = (args.feature || '').split(/\s+/);
                const fileArgs = argsList.filter(arg => arg.startsWith('@'));
                const nonFileArgs = argsList.filter(arg => !arg.startsWith('@'));

                const feature = nonFileArgs.join(' ').trim();
                let promptFileArg = '';

                if (fileArgs.length > 0) {
                    const filePath = fileArgs[0].substring(1);
                    if (filePath.trim() !== '') {
                        promptFileArg = ` --promptFile "${filePath}"`;
                    }
                }

                let promptContent = cmd.template.replace('{{feature}}', feature);

                if (promptFileArg) {
                    promptContent = promptContent.replace(
                        '</command-instruction>',
                        `${promptFileArg}\n</command-instruction>`
                    );
                }

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
    }, {});

    // /guard コマンドを Tool として追加
    commandsAsTools['guard'] = tool({
        description: 'Set Gatekeeper guard mode',
        args: {
            mode: tool.schema.string().describe('Guard mode (warn, block, disabled)')
        },
        execute: async (args, context) => {
            const mode = args.mode as GuardMode;
            if (mode !== 'warn' && mode !== 'block' && mode !== 'disabled') {
                const errorMsg = `Invalid guard mode: ${mode}. Must be warn, block, or disabled.`;
                if (ctx.client.tui?.showToast) {
                    await ctx.client.tui.showToast({
                        body: { message: errorMsg, variant: 'error', duration: 4000 }
                    });
                }
                return errorMsg;
            }

            const result = await updateGuardModeStateAndNotifyUser(mode);
            if (!result.success) {
                return `Error: ${result.error}`;
            }

            // Notify AI agent (best effort)
            if (context.sessionID && ctx.client.session?.prompt) {
                try {
                    await ctx.client.session.prompt({
                        path: { id: context.sessionID },
                        body: {
                            parts: [{ type: 'text', text: `[System] User changed guard mode to '${mode}'.` }]
                        }
                    });
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    // Show error toast for notification failure but don't fail the command
                    if (ctx.client.tui?.showToast) {
                        try {
                            await ctx.client.tui.showToast({
                                body: { message: `Guard mode updated, but failed to notify agent: ${errMsg}`, variant: 'warning', duration: 4000 }
                            });
                        } catch (e) { /* ignore toast errors */ }
                    }
                }
            }

            return `Guard mode set to ${mode}`;
        }
    });

    return {
        // Tool登録
        tool: commandsAsTools,

        // [Fallback] チャットメッセージとして入力されたコマンドを捕捉
        // TUIイベントが発火しない環境や、チャット欄に直接入力された場合用
        'chat.message': async (params, output) => {
            const { message, parts } = output;
            if (!message || message.role !== 'user') return;

            // partsからテキストを取得
            const textPart = parts?.find(p => p.type === 'text');
            if (!textPart || typeof textPart.text !== 'string') return;

            const content = textPart.text.trim();
            if (!content.startsWith('/')) return;

            const [cmd, ...args] = content.split(/\s+/);
            const normalizedCmd = cmd.replace(/^\/+/, "");

            // /guard コマンドの処理
            if (normalizedCmd === 'guard') {
                const mode = args[0] as GuardMode;
                if (mode !== 'warn' && mode !== 'block' && mode !== 'disabled') {
                    const errorMsg = `Invalid guard mode: ${mode}. Must be warn, block, or disabled.`;
                    if (ctx.client.tui?.showToast) {
                        await ctx.client.tui.showToast({
                            body: { message: errorMsg, variant: 'error', duration: 4000 }
                        });
                    }
                    return;
                }

                const result = await updateGuardModeStateAndNotifyUser(mode);
                if (result.success) {
                    textPart.text = `[System] User changed guard mode to '${mode}'.`;
                }
                return;
            }

            // 1. 登録されている組み込みコマンドかどうかを確認
            const builtinCmd = getBuiltinCommand(normalizedCmd);

            // 2. コマンドが見つかった場合、テンプレートを展開してメッセージを置換する
            if (builtinCmd) {
                const fileArgs = args.filter(arg => arg.startsWith('@'));
                const nonFileArgs = args.filter(arg => !arg.startsWith('@'));

                let feature = nonFileArgs.join(' ').trim();
                let promptFileArg = '';

                if (fileArgs.length > 0) {
                    const filePath = fileArgs[0].substring(1);
                    if (filePath.trim() !== '') {
                        promptFileArg = ` --promptFile "${filePath}"`;
                    }
                }

                let promptContent = builtinCmd.template.replace('{{feature}}', feature || '(not specified)');

                if (promptFileArg) {
                    promptContent = promptContent.replace(
                        '</command-instruction>',
                        `${promptFileArg}\n</command-instruction>`
                    );
                }

                // メッセージの内容をプロンプト（指示書）そのものに書き換える
                // これにより、AIはユーザーが「スラッシュコマンド」ではなく「長いプロンプト」を入力したと認識して処理を開始する
                textPart.text = promptContent;

                // ユーザーへのフィードバック（オプション）
                if (ctx.client.tui?.showToast) {
                    await ctx.client.tui.showToast({
                        body: {
                            message: `Expanded /${normalizedCmd} command template.`,
                            variant: 'info',
                            duration: 2000
                        }
                    });
                }
                return;
            }

            // 3. 汎用 /sdd コマンドの処理 (既存ロジック維持)
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
                    textPart.text = prompt;
                } else {
                    const available = getAllBuiltinCommands().map(c => c.name).join(', ');
                    const errorMsg = `Unknown action: '${action}'. Available actions: ${available}`;

                    if (ctx.client.tui?.showToast) {
                        ctx.client.tui.showToast({
                            body: { message: errorMsg, variant: 'error', duration: 4000 }
                        }).catch(console.warn);
                    }
                    // 元のメッセージを保持してエラーをトーストで通知済み
                    return;
                }
                return;
            }
        }
    };
};

export default SddCommandHandler;
