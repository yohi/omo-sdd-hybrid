import { tool } from '../lib/plugin-stub';
import { readState, writeState } from '../lib/state-utils';
import { matchesScope } from '../lib/glob-utils';
import { parseTasksFile, ScopeFormatError, ParsedTask } from '../lib/tasks-parser';
import { analyzeKiroGap, formatKiroGapReport, findKiroSpecs, analyzeKiroGapDeep, formatEnhancedKiroGapReport } from '../lib/kiro-utils';
import { spawnSync } from 'child_process';
import fs from 'fs';

function getTasksPath() {
  return process.env.SDD_TASKS_PATH || 'specs/tasks.md';
}

const MAX_VALIDATION_ATTEMPTS = 5;

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

function checkDiagnostics(allowedScopes: string[], changedFiles: string[] | null): string {
  if (changedFiles === null) {
    return 'SKIP: 変更ファイルの取得に失敗しました - git 差分の取得エラー';
  }
  
  if (changedFiles.length === 0) {
    return 'SKIP: 変更ファイルがないため、診断不要';
  }

  const scopedFiles = changedFiles.filter(file => matchesScope(file, allowedScopes));
  
  if (scopedFiles.length === 0) {
    return 'SKIP: スコープ内の変更ファイルなし';
  }

  const tsFiles = scopedFiles.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  
  if (tsFiles.length === 0) {
    return 'SKIP: TypeScriptファイルの変更なし';
  }

  const lines: string[] = [
    '以下のファイルで lsp_diagnostics を実行してください:',
    ''
  ];
  
  tsFiles.forEach(file => {
    lines.push(`  - ${file}`);
  });
  
  lines.push('');
  lines.push('コマンド例:');
  lines.push(`  lsp_diagnostics("${tsFiles[0]}")`);
  
  return lines.join('\n');
}

function checkKiroIntegration(taskId: string, changedFiles: string[], useDeepAnalysis: boolean = false): string {
  const kiroSpecs = findKiroSpecs();
  
  if (kiroSpecs.length === 0) {
    return 'INFO: Kiro仕様が見つかりません（オプション機能）\n' +
           '> Kiro統合を有効にするには: npx cc-sdd@latest --claude';
  }

  let matchedSpec = kiroSpecs.find(s => s === taskId);
  
  if (!matchedSpec) {
    matchedSpec = kiroSpecs.find(s => s.toLowerCase() === taskId.toLowerCase());
  }
  
  if (!matchedSpec) {
    const normalizedTaskId = taskId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    matchedSpec = kiroSpecs.find(s => s === normalizedTaskId);
    
    if (!matchedSpec) {
      matchedSpec = kiroSpecs.find(s => 
        s.includes(normalizedTaskId) || normalizedTaskId.includes(s)
      );
    }
  }

  if (!matchedSpec && kiroSpecs.length > 0) {
    return `INFO: タスク '${taskId}' に対応するKiro仕様が見つかりません\n` +
           `利用可能な仕様: ${kiroSpecs.join(', ')}\n` +
           '> 仕様を指定するには taskId を Kiro仕様名と一致させてください';
  }

  if (matchedSpec) {
    if (useDeepAnalysis) {
      const deepResult = analyzeKiroGapDeep(matchedSpec, changedFiles);
      return formatEnhancedKiroGapReport(deepResult);
    } else {
      const gapResult = analyzeKiroGap(matchedSpec, changedFiles);
      return formatKiroGapReport(gapResult);
    }
  }

  return 'INFO: Kiro統合はスキップされました';
}

export default tool({
  description: '仕様とコードの差分を検証（lsp_diagnostics + テスト + スコープ + Kiro統合 + 意味的分析）',
  args: {
    taskId: tool.schema.string().optional().describe('検証するタスクID（省略時は現在アクティブなタスク）'),
    kiroSpec: tool.schema.string().optional().describe('Kiro仕様名（.kiro/specs/配下のディレクトリ名）'),
    deep: tool.schema.boolean().optional().describe('深度分析を有効にする（カバレッジ分析・意味的検証プロンプト生成）')
  },
  async execute({ taskId, kiroSpec, deep }) {
    const stateResult = await readState();
    
    if (stateResult.status !== 'ok' && stateResult.status !== 'recovered') {
      return `エラー: アクティブなタスクがありません。sdd_start_task を実行してください。

状態: ${stateResult.status}`;
    }
    
    const state = stateResult.state;
    const effectiveTaskId = taskId || state.activeTaskId;
    
    const currentAttempts = state.validationAttempts + 1;
    
    if (currentAttempts > MAX_VALIDATION_ATTEMPTS) {
      return `❌ エスカレーション: 検証が ${MAX_VALIDATION_ATTEMPTS} 回連続で失敗しました

タスク: ${effectiveTaskId}
試行回数: ${currentAttempts}回 / ${MAX_VALIDATION_ATTEMPTS}回上限

**次のアクション**:
1. 現在の問題を整理してください
2. 人間にエスカレーションし、追加の指示を待ってください
3. 自動修正を中断してください

検証ループを続けるには、sdd_end_task → sdd_start_task でタスクをリセットしてください。`;
    }
    
    await writeState({
      ...state,
      validationAttempts: currentAttempts
    });
    
    let allowedScopes: string[];
    if (taskId) {
      const tasksPath = getTasksPath();
      if (!fs.existsSync(tasksPath)) {
        return `エラー: ${tasksPath} が見つかりません`;
      }
      
      const content = fs.readFileSync(tasksPath, 'utf-8');
      let tasks: ParsedTask[];
      try {
        tasks = parseTasksFile(content);
      } catch (error) {
        if (error instanceof ScopeFormatError) {
          console.error(`エラー: ${tasksPath} の形式が不正です: ${error.message}`);
          process.exit(1);
        }
        if (error instanceof Error) {
          console.error(`エラー: ${tasksPath} の解析に失敗しました: ${error.message}`);
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
    sections.push(`試行回数: ${currentAttempts} / ${MAX_VALIDATION_ATTEMPTS}`);
    sections.push(`許可スコープ: ${allowedScopes.join(', ')}`);
    
    sections.push('\n## スコープ検証');
    sections.push(validateScopes(allowedScopes, changedFiles));
    
    sections.push('\n## Diagnostics');
    sections.push(checkDiagnostics(allowedScopes, changedFiles));
    
    sections.push('\n## テスト');
    sections.push(runScopedTests(allowedScopes));
    
    sections.push('\n## Kiro統合');
    const kiroTarget = kiroSpec || effectiveTaskId;
    const useDeepAnalysis = deep === true;
    sections.push(checkKiroIntegration(kiroTarget, changedFiles || [], useDeepAnalysis));
    
    sections.push('\n---');
    sections.push('検証完了後、sdd_end_task を実行してタスクを終了してください。');
    
    return sections.join('\n');
  }
});
