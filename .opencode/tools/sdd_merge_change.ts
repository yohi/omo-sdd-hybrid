import { tool } from '@opencode-ai/plugin';
import { readState } from '../lib/state-utils';
import fs from 'fs';
import path from 'path';

export default tool({
  description: '保留中の仕様変更をマージし、アーカイブします（Architect専用）',
  args: {
    changeId: tool.schema.string().describe('マージ対象の変更ID（ファイル名）'),
    feature: tool.schema.string().describe('マージ先の機能名（specs/<feature>/...）'),
    target: tool.schema.string().describe('マージ先のファイル種別 (requirements | design | tasks)').default('requirements')
  },
  async execute({ changeId, feature, target = 'requirements' }) {
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

    if (feature.includes('/') || feature.includes('\\') || feature.includes('..')) {
      throw new Error('E_INVALID_ARG: feature にパスセパレータや相対パスを含めることはできません');
    }
    
    if (!['requirements', 'design', 'tasks'].includes(target)) {
        throw new Error(`E_INVALID_ARG: target は requirements, design, tasks のいずれかである必要があります (Got: ${target})`);
    }

    const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
    const pendingDir = path.join(kiroDir, 'pending-changes');
    const pendingFilePath = path.join(pendingDir, changeId);

    if (!fs.existsSync(pendingFilePath)) {
      return `エラー: 指定された変更リクエストファイルが見つかりません: ${changeId}`;
    }

    const content = fs.readFileSync(pendingFilePath, 'utf-8');
    
    const reasonMatch = content.match(/## Reason\s+([\s\S]*?)(?=\n##|$)/);
    const proposalMatch = content.match(/## Proposal\s+([\s\S]*?)(?=\n##|$)/);
    
    const reason = reasonMatch ? reasonMatch[1].trim() : '(No reason provided)';
    const proposal = proposalMatch ? proposalMatch[1].trim() : '(No proposal provided)';

    const specsDir = path.join(kiroDir, 'specs', feature);
    const targetFilePath = path.join(specsDir, `${target}.md`);

    if (!fs.existsSync(targetFilePath)) {
         return `エラー: マージ先の仕様書ファイルが見つかりません: ${targetFilePath}`;
    }

    const today = new Date().toISOString().split('T')[0];
    const appendContent = `

## Change Log (${today}) - Merged from ${changeId}

### Reason

${reason}

### Proposal

${proposal}
`;
    
    fs.appendFileSync(targetFilePath, appendContent, 'utf-8');

    const archiveDir = path.join(kiroDir, 'archive', 'pending-changes', 'merged');
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
    const feedbackContent = `# 仕様変更のマージ完了

変更リクエスト ${changeId} は ${feature}/${target}.md にマージされました。
ご協力ありがとうございました。
`;
    fs.writeFileSync(feedbackPath, feedbackContent, 'utf-8');

    return `仕様変更をマージしました:
Source: ${changeId} (Archived)
Target: ${feature}/${target}.md
Feedback: FB-${changeId}`;
  }
});
