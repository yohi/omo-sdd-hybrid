import { tool } from '@opencode-ai/plugin';
import { type GuardMode, writeGuardModeState } from '../lib/state-utils';

export default tool({
    description: 'ガードモードを設定します（warn, block または disabled）',
    args: {
        mode: tool.schema.string().describe('ガードモード: warn（警告のみ）、block（ブロック）または disabled（無効）')
    },
    async execute({ mode }) {
        if (mode !== 'warn' && mode !== 'block' && mode !== 'disabled') {
            return 'エラー: mode は "warn", "block" または "disabled" を指定してください';
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
