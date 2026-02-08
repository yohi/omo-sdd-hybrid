import { tool } from '@opencode-ai/plugin';
import { readState } from '../lib/state-utils';
import fs from 'fs';
import path from 'path';

export default tool({
  description: '保留中の仕様変更提案を一覧表示します（Architect専用）',
  args: {},
  async execute() {
    const result = await readState();
    if (result.status !== 'ok' && result.status !== 'recovered') {
      throw new Error(`E_STATE_INVALID: アクティブなタスクがありません (Status: ${result.status})`);
    }

    const { state } = result;

    if (state.role !== 'architect') {
      throw new Error(`E_PERMISSION_DENIED: このコマンドは Architect ロールのみ実行可能です (Current role: ${state.role})`);
    }

    const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
    const pendingDir = path.join(kiroDir, 'pending-changes');

    if (!fs.existsSync(pendingDir)) {
      return '保留中の仕様変更提案はありません (ディレクトリが存在しません)';
    }

    const files = fs.readdirSync(pendingDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse(); // 新しい順

    if (files.length === 0) {
      return '保留中の仕様変更提案はありません';
    }

    const summaries = files.map(filename => {
      const filePath = path.join(pendingDir, filename);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // 簡易パース
        const taskIdMatch = content.match(/- \*\*Task ID\*\*: (.*)/);
        const dateMatch = content.match(/- \*\*Date\*\*: (.*)/);
        
        // Reason抽出 (## Reason から次の ## または末尾まで)
        const reasonMatch = content.match(/## Reason\s+([\s\S]*?)(?=\n##|$)/);
        const reason = reasonMatch ? reasonMatch[1].trim().split('\n')[0] : '(No reason provided)';

        // Proposal抽出
        const proposalMatch = content.match(/## Proposal\s+([\s\S]*?)(?=\n##|$)/);
        const proposal = proposalMatch ? proposalMatch[1].trim().split('\n')[0] : '(No proposal provided)';

        const taskId = taskIdMatch ? taskIdMatch[1].trim() : 'Unknown';
        const date = dateMatch ? dateMatch[1].trim() : 'Unknown';

        // 100文字程度で切り詰め
        const truncate = (s: string) => s.length > 100 ? s.substring(0, 97) + '...' : s;

        return `## [${filename}]
- **Task**: ${taskId}
- **Date**: ${date}
- **Reason**: ${truncate(reason)}
- **Proposal**: ${truncate(proposal)}
- **Path**: ${filePath}`;
      } catch (e) {
        return `## [${filename}]
- **Error**: ファイルの読み込みまたはパースに失敗しました`;
      }
    });

    return `# 保留中の仕様変更提案 (${files.length}件)

${summaries.join('\n\n')}`;
  }
});
