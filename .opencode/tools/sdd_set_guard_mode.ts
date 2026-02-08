import { tool } from '@opencode-ai/plugin';
import { type GuardMode, writeGuardModeState } from '../lib/state-utils';

export default tool({
    description: 'ガードモードを設定します（warn または block）',
    args: {
        mode: tool.schema.string().describe('ガードモード: warn（警告のみ）または block（ブロック）')
    },
    async execute({ mode }) {
        if (mode !== 'warn' && mode !== 'block') {
            return 'エラー: mode は "warn" または "block" を指定してください';
        }

        const currentUser = process.env.USER || 'unknown';

        try {
            await writeGuardModeState({
                mode: mode as GuardMode,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser
            });
            return `ガードモードを '${mode}' に設定しました`;
        } catch (error) {
            return `ガードモードの設定に失敗しました: ${error}`;
        }
    }
});
