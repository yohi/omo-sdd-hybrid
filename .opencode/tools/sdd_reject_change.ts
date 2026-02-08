import { tool } from '@opencode-ai/plugin';
import { readState } from '../lib/state-utils';
import fs from 'fs';
import path from 'path';

export default tool({
  description: '保留中の仕様変更を却下し、アーカイブします（Architect専用）',
  args: {
    changeId: tool.schema.string().describe('却下対象の変更ID（ファイル名）'),
    reason: tool.schema.string().describe('却下理由')
  },
  async execute({ changeId, reason }) {
    const result = await readState();
    if (result.status !== 'ok' && result.status !== 'recovered') {
      throw new Error(`E_STATE_INVALID: アクティブなタスクがありません (Status: ${result.status})`);
    }

    const { state } = result;

    if (state.role !== 'architect') {
      throw new Error(`E_PERMISSION_DENIED: このコマンドは Architect ロールのみ実行可能です (Current role: ${state.role})`);
    }

    if (changeId.includes('/') || changeId.includes('\\') || changeId.includes('..')) {
      throw new Error('E_INVALID_ARG: changeId にパスセパレータや相対パスを含めることはできません');
    }

    const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
    const pendingDir = path.join(kiroDir, 'pending-changes');
    const pendingFilePath = path.join(pendingDir, changeId);

    if (!fs.existsSync(pendingFilePath)) {
      return `エラー: 指定された変更リクエストファイルが見つかりません: ${changeId}`;
    }

    const archiveDir = path.join(kiroDir, 'archive', 'pending-changes', 'rejected');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    const archivePath = path.join(archiveDir, changeId);
    fs.renameSync(pendingFilePath, archivePath);

    const feedbackDir = path.join(kiroDir, 'feedback');
    if (!fs.existsSync(feedbackDir)) {
      fs.mkdirSync(feedbackDir, { recursive: true });
    }
    const feedbackPath = path.join(feedbackDir, `FB-${changeId}`);
    
    const feedbackContent = `# 仕様変更の却下\n\n変更リクエスト ${changeId} は却下されました。\n\n## 理由\n${reason}\n`;
    fs.writeFileSync(feedbackPath, feedbackContent, 'utf-8');

    return `仕様変更を却下しました:
Source: ${changeId} (Archived/Rejected)
Feedback: FB-${changeId}
Reason: ${reason}`;
  }
});
