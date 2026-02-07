import { randomUUID } from 'node:crypto';
import type { Hooks, Plugin } from '../lib/plugin-stub.js';

const SddCommandHandler: Plugin = async (ctx) => {
    return {
        // フォールバック: ネイティブコマンドがサポートされていない環境向けに、チャットメッセージ内のスラッシュコマンドをインターセプトします
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

            // マッピングに一致するか、汎用的な /sdd コマンドかを確認します
            if (cmd in mapping || cmd === '/sdd') {
                // Argument validation to prevent 'unknown' injection
                if (cmd in mapping && args.length < 1) {
                    const usage = `Usage: ${cmd} <feature>`;
                    if (ctx.client.tui?.showToast) {
                        ctx.client.tui.showToast({
                            body: { message: usage, variant: 'error', duration: 4000 }
                        }).catch(console.warn);
                    }
                    return;
                }
                if (cmd === '/sdd' && args.length < 2) {
                    const usage = 'Usage: /sdd <action> <feature>';
                    if (ctx.client.tui?.showToast) {
                        ctx.client.tui.showToast({
                            body: { message: usage, variant: 'error', duration: 4000 }
                        }).catch(console.warn);
                    }
                    return;
                }

                const action = mapping[cmd] || args[0];
                const feature = (cmd === '/sdd' ? args[1] : args[0]);

                // User feedback (best-effort, fail-safe)
                if (ctx.client.tui?.showToast) {
                    ctx.client.tui.showToast({
                        body: {
                            message: `Executing command: ${cmd} -> action: ${action}`,
                            variant: 'info',
                            duration: 3000
                        }
                    }).catch(console.warn);
                }

                // ルーターロジックを使用して結果をアシスタントメッセージとして注入します
                // ここではコンテキストなしでツールを直接呼び出すことが難しいため、応答をシミュレートします。
                // 本来は sddRouterTool.execute を呼び出すべきですが、インポートが必要です。
                //今のところは、ルーターが行うように手動でプロンプト/応答を構築します。

                const prompt = `Command '${cmd}' executed via interceptor.\n` +
                    `Action: ${action}\n` +
                    `Feature: ${feature}\n\n` +
                    `Please proceed with the ${action} phase for ${feature}.`;

                message.content = prompt;

                // 注: PluginInput で公開されていない特定の API がない限り、ここからセッション履歴にメッセージを「注入」することは容易ではありません。
                // そのため、現在のメッセージの内容を直接変更しています。

                // 実際にツールをトリガーしたい場合は、`experimental.chat.system.transform` を検討するか、
                // `ctx.client.session.addMessage` が利用可能であればそれを使用する必要があるかもしれません。
            }
        }
    };
};

export default SddCommandHandler;
