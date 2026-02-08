import { randomUUID } from 'node:crypto';
import type { Hooks, Plugin } from '../lib/plugin-stub.js';
import { getBuiltinCommand, getAllBuiltinCommands } from "../../src/features/builtin-commands/index.js";

const SddCommandHandler: Plugin = async (ctx) => {
    return {
        // [Approach A] 正規のTUIコマンド実行イベントをフック
        // ユーザーが "/profile" などを入力してEnterを押した瞬間に発火します
        event: async ({ event }) => {
            if (event.type !== 'tui.command.execute') return;

            const payload = event.properties || event.data || event.payload || {};
            const rawCommand = payload.command || payload.name || "";
            
            // コマンド名の正規化 (e.g. "/profile" -> "profile")
            const normalizedCmd = rawCommand.trim().replace(/^\/+/, "");
            if (!normalizedCmd) return;

            // 組み込みコマンド定義の検索
            const cmdDef = getBuiltinCommand(normalizedCmd);
            if (!cmdDef) return;

            // 引数の取得
            const args = Array.isArray(payload.args) 
                ? payload.args 
                : (typeof payload.arguments === 'string' ? payload.arguments.split(/\s+/) : []);
            
            // テンプレート変数の置換
            const feature = args[0] || '';
            // {{feature}} があれば置換、なければ末尾に追加するなどの処理が可能だが、
            // 現状のテンプレートは単純な文字列置換を想定
            const promptContent = cmdDef.template.replace('{{feature}}', feature || '(not specified)');

            // ユーザーへのフィードバック (Toast)
            if (ctx.client.tui?.showToast) {
                ctx.client.tui.showToast({
                    body: { 
                        message: `Executing /${normalizedCmd} ${feature}`.trim(), 
                        variant: 'info', 
                        duration: 3000 
                    }
                }).catch(console.warn);
            }

            // AIエージェントへの指示送信 (Session Prompt)
            // sessionIDが存在する場合のみ実行可能
            const sessionID = payload.sessionID;
            if (sessionID && ctx.client.session?.prompt) {
                try {
                    await ctx.client.session.prompt({
                        path: { id: sessionID },
                        body: { 
                            parts: [{ 
                                type: "text", 
                                text: promptContent 
                            }] 
                        }
                    });
                } catch (error) {
                    console.warn(`Failed to execute command /${normalizedCmd}:`, error);
                    if (ctx.client.tui?.showToast) {
                        ctx.client.tui.showToast({
                            body: { 
                                message: `Failed to execute /${normalizedCmd}: ${error instanceof Error ? error.message : String(error)}`, 
                                variant: 'error', 
                                duration: 4000 
                            }
                        }).catch(console.warn);
                    }
                }
            }
        },

        // [Fallback] チャットメッセージとして入力されたコマンドを捕捉
        // TUIイベントが発火しない環境や、チャット欄に直接入力された場合用
        'chat.message': async (params, { message }) => {
            if (message.role !== 'user' || typeof message.content !== 'string') return;

            const content = message.content.trim();
            if (!content.startsWith('/')) return;

            const [cmd, ...args] = content.split(/\s+/);
            const normalizedCmd = cmd.replace(/^\/+/, "");

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
                    message.content = errorMsg;
                }
                return;
            }

            // 個別コマンドの処理 (e.g. /profile)
            const cmdDef = getBuiltinCommand(normalizedCmd);
            if (cmdDef) {
                const feature = args[0] || '';
                const prompt = cmdDef.template.replace('{{feature}}', feature || '(not specified)');
                
                // メッセージ内容をプロンプトに書き換え（チャット送信として処理される）
                message.content = prompt;
            }
        }
    };
};

export default SddCommandHandler;
