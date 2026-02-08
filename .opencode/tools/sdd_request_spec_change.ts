import { tool } from '@opencode-ai/plugin';
import { readState } from '../lib/state-utils';
import fs from 'fs';
import path from 'path';

export default tool({
  description: 'Implementerが仕様変更を提案するためのリクエストを作成します',
  args: {
    reason: tool.schema.string().describe('仕様変更が必要な理由'),
    proposal: tool.schema.string().describe('具体的な変更案')
  },
  async execute({ reason, proposal }) {
    const result = await readState();
    if (result.status !== 'ok' && result.status !== 'recovered') {
      throw new Error(`E_STATE_INVALID: アクティブなタスクがありません (Status: ${result.status})`);
    }

    const { state } = result;

    if (state.role !== 'implementer') {
      throw new Error(`E_PERMISSION_DENIED: このコマンドは Implementer ロールのみ実行可能です (Current role: ${state.role})`);
    }

    if (!state.activeTaskId) {
      throw new Error('E_NO_ACTIVE_TASK: アクティブなタスクIDが見つかりません');
    }

    const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
    const outputDir = path.join(kiroDir, 'pending-changes');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTaskId = state.activeTaskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${timestamp}-${safeTaskId}.md`;
    const filePath = path.join(outputDir, filename);

    const content = `# Specification Change Request

- **Task ID**: ${state.activeTaskId}
- **Date**: ${new Date().toISOString()}
- **Author**: Implementer

## Reason
${reason}

## Proposal
${proposal}
`;

    fs.writeFileSync(filePath, content, 'utf-8');

    return `仕様変更リクエストを作成しました:
Path: ${filePath}
Task: ${state.activeTaskId}
Reason: ${reason}`;
  }
});
