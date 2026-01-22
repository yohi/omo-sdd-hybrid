import { tool } from '../lib/plugin-stub';
import { lintTaskLine, LintIssue } from '../lib/tasks-parser';
import fs from 'fs';

function getTasksPath() {
  return process.env.SDD_TASKS_PATH || 'specs/tasks.md';
}

interface LintResult {
  line: number;
  content: string;
  issue: LintIssue;
}

const ISSUE_DESCRIPTIONS: Record<LintIssue, string> = {
  'missing-scope': 'Scope が定義されていません。(Scope: `path/**`) を追加してください。',
  'invalid-id': 'タスクIDの形式が不正です。形式: TaskName-123',
  'missing-backticks': 'Scope はバッククォートで囲む必要があります。例: `src/**`',
  'invalid-format': '行の形式が不正です。形式: * [ ] TaskId: Title (Scope: `path/**`)'
};

export default tool({
  description: 'specs/tasks.md のフォーマットを検証し、問題を報告します',
  args: {},
  async execute() {
    const tasksPath = getTasksPath();
    if (!fs.existsSync(tasksPath)) {
      return `エラー: ${tasksPath} が見つかりません`;
    }

    const content = fs.readFileSync(tasksPath, 'utf-8');
    const lines = content.split('\n');
    const issues: LintResult[] = [];

    for (let i = 0; i < lines.length; i++) {
      const issue = lintTaskLine(lines[i]);
      if (issue) {
        issues.push({
          line: i + 1,
          content: lines[i].trim(),
          issue
        });
      }
    }

    if (issues.length === 0) {
      return `✅ All tasks are valid (${lines.filter(l => l.trim().startsWith('* [')).length} タスク検証済み)`;
    }

    const report = issues.map(r => 
      `行 ${r.line}: ${r.issue}\n  ${r.content}\n  → ${ISSUE_DESCRIPTIONS[r.issue]}`
    ).join('\n\n');

    return `❌ ${issues.length} 件の問題が見つかりました\n\n${report}`;
  }
});
