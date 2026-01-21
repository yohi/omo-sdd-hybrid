import { tool } from '../lib/plugin-stub';
import { readState } from '../lib/state-utils';
import { matchesScope } from '../lib/glob-utils';
import { parseTasksFile, ScopeFormatError, ParsedTask } from '../lib/tasks-parser';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';

const TASKS_PATH = 'specs/tasks.md';

function getChangedFiles(): string[] | null {
  const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    encoding: 'utf-8',
    timeout: 5000
  });
  
  if (result.error || result.status !== 0) {
    return null;
  }
  
  return result.stdout.split('\n').filter(Boolean);
}

function validateScopes(allowedScopes: string[], changedFiles: string[] | null): string {
  if (changedFiles === null) {
    return 'ERROR: git コマンドの実行に失敗しました（git が利用できないか、git リポジトリ外です）';
  }
  
  if (changedFiles.length === 0) {
    return 'PASS: 変更ファイルなし';
  }
  
  const violations: string[] = [];
  const passed: string[] = [];
  
  for (const file of changedFiles) {
    if (matchesScope(file, allowedScopes)) {
      passed.push(file);
    } else {
      violations.push(file);
    }
  }
  
  if (violations.length === 0) {
    return `PASS: ${passed.length} ファイルがスコープ内\n  ${passed.join('\n  ')}`;
  }
  
  return `WARN: ${violations.length} ファイルがスコープ外\n  ${violations.join('\n  ')}\n\n許可スコープ: ${allowedScopes.join(', ')}`;
}

function runScopedTests(allowedScopes: string[]): string {
  if (process.env.SDD_SKIP_TEST_EXECUTION === 'true') {
    return 'SKIP: テスト実行はスキップされました（手動で実行してください）';
  }
  
  const testPatterns = allowedScopes
    .filter(s => s.includes('__tests__') || s.includes('test'))
    .map(s => s.replaceAll('**', ''));
  
  if (testPatterns.length === 0) {
    return 'SKIP: テストスコープが定義されていません';
  }
  
  const bunArgs = ['test', ...testPatterns.map(p => `./${p}`)];
  const result = spawnSync('bun', bunArgs, {
    encoding: 'utf-8',
    timeout: 30000
  });
  
  const output = (result.stdout || '') + (result.stderr || '');
  
  if (result.error) {
    return `ERROR: ${result.error.message}\n${output}`;
  }
  
  if (result.status === 0) {
    return `PASS:\n${output}`;
  }
  
  return `FAIL:\n${output}`;
}

function checkDiagnostics(allowedScopes: string[]): string {
  return 'lsp_diagnostics を実行してエラーがないか確認してください';
}

export default tool({
  description: '仕様とコードの差分を検証（lsp_diagnostics + テスト + スコープ）',
  args: {
    taskId: tool.schema.string().optional().describe('検証するタスクID（省略時は現在アクティブなタスク）')
  },
  async execute({ taskId }) {
    const stateResult = readState();
    
    if (stateResult.status !== 'ok') {
      return `エラー: アクティブなタスクがありません。sdd_start_task を実行してください。

状態: ${stateResult.status}`;
    }
    
    const state = stateResult.state;
    const effectiveTaskId = taskId || state.activeTaskId;
    
    let allowedScopes: string[];
    if (taskId) {
      if (!fs.existsSync(TASKS_PATH)) {
        return `エラー: ${TASKS_PATH} が見つかりません`;
      }
      
      const content = fs.readFileSync(TASKS_PATH, 'utf-8');
      let tasks: ParsedTask[];
      try {
        tasks = parseTasksFile(content);
      } catch (error) {
        if (error instanceof ScopeFormatError) {
          console.error(`エラー: ${TASKS_PATH} の形式が不正です: ${error.message}`);
          process.exit(1);
        }
        if (error instanceof Error) {
          console.error(`エラー: ${TASKS_PATH} の解析に失敗しました: ${error.message}`);
          process.exit(1);
        }
        throw error;
      }
      
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        return `エラー: タスク ${taskId} が見つかりません`;
      }
      
      if (task.scopes.length === 0) {
        return `エラー: タスク ${taskId} に Scope が定義されていません`;
      }
      
      allowedScopes = task.scopes;
    } else {
      allowedScopes = state.allowedScopes;
    }
    
    const changedFiles = getChangedFiles();
    
    const sections: string[] = [];
    
    sections.push(`# 検証レポート: ${effectiveTaskId}`);
    sections.push(`許可スコープ: ${allowedScopes.join(', ')}`);
    
    sections.push('\n## スコープ検証');
    sections.push(validateScopes(allowedScopes, changedFiles));
    
    sections.push('\n## Diagnostics');
    sections.push(checkDiagnostics(allowedScopes));
    
    sections.push('\n## テスト');
    sections.push(runScopedTests(allowedScopes));
    
    sections.push('\n---');
    sections.push('検証完了後、sdd_end_task を実行してタスクを終了してください。');
    
    return sections.join('\n');
  }
});
