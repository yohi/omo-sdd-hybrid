import { tool } from '../lib/plugin-stub';
import { readState as defaultReadState, writeState as defaultWriteState, State } from '../lib/state-utils';
import { matchesScope } from '../lib/glob-utils';
import { countMarkdownTasks } from '../lib/tasks_markdown';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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
    return 'ERROR: git コマンドの実行に失敗しました';
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

function runScopedTests(allowedScopes: string[], skipTests: boolean = false): string {
  if (skipTests || process.env.SDD_SKIP_TEST_EXECUTION === 'true') {
    return 'SKIP: テスト実行はスキップされました';
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
  if (changedFiles === null || changedFiles.length === 0) {
    return 'SKIP: 変更ファイルがないため、診断不要';
  }

  const scopedFiles = changedFiles.filter(file => matchesScope(file, allowedScopes));
  const tsFiles = scopedFiles.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  
  if (tsFiles.length === 0) {
    return 'SKIP: TypeScriptファイルの変更なし';
  }

  return `以下のファイルで lsp_diagnostics を実行してください:\n  - ${tsFiles.join('\n  - ')}`;
}

export function validateKiroIntegration(kiroSpec?: string, deep?: boolean): string {
  if (!kiroSpec) {
    return 'INFO: kiroSpec が指定されていません。仕様とのギャップ分析を行うには --kiroSpec <feature> を指定してください。';
  }

  const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
  const specDir = path.join(kiroDir, 'specs', kiroSpec);

  if (!fs.existsSync(specDir)) {
    return `WARN: 仕様ディレクトリが見つかりません: ${specDir}\n  仕様を作成するには: /kiro:spec-init ${kiroSpec} (または READMEのKiro統合手順を参照)`;
  }

  const reports: string[] = [];
  
  const files = [
    { name: 'spec.json', required: false },
    { name: 'requirements.md', required: true },
    { name: 'design.md', required: true },
    { name: 'tasks.md', required: true }
  ];

  const statusLines: string[] = [];
  let tasksInfo = '';

  for (const file of files) {
    const filePath = path.join(specDir, file.name);
    if (fs.existsSync(filePath)) {
      statusLines.push(`[PASS] ${file.name}`);
      
      if (file.name === 'tasks.md') {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const progress = countMarkdownTasks(content);
          const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
          tasksInfo = `\n  進捗: ${progress.completed}/${progress.total} (${percent}%)`;
        } catch (e) {
          tasksInfo = `\n  進捗: 取得失敗 (${e instanceof Error ? e.message : String(e)})`;
        }
      }
    } else {
      statusLines.push(file.required ? `[FAIL] ${file.name} (Not Found)` : `[SKIP] ${file.name} (Optional)`);
    }
  }

  reports.push(statusLines.join('\n') + tasksInfo);

  if (deep) {
    reports.push('\n[Deep Analysis]');
    reports.push('  構造的・意味的ギャップ分析は現在開発中です。');
    reports.push('  現在の実装状況と requirements.md の項目を突き合わせてください。');
  } else {
    reports.push('\nHint: --deep オプションで詳細な分析（Embeddings等）を有効化できます（未実装）。');
  }

  return reports.join('\n');
}

export interface ValidateGapOptions {
  taskId?: string;
  kiroSpec?: string;
  deep?: boolean;
  skipTests?: boolean;
  currentAttempts?: number;
}

export async function validateGapInternal(state: State, options: ValidateGapOptions): Promise<string> {
  const effectiveTaskId = options.taskId || state.activeTaskId;
  const currentAttempts = options.currentAttempts ?? state.validationAttempts;
  const allowedScopes = state.allowedScopes;
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
  sections.push(runScopedTests(allowedScopes, options.skipTests));
  
  sections.push('\n## Kiro統合 (cc-sdd)');
  sections.push(validateKiroIntegration(options.kiroSpec, options.deep));
  
  sections.push('\n---');
  sections.push('検証完了後、sdd_end_task を実行してタスクを終了してください。');
  
  return sections.join('\n');
}

export default tool({
  description: '仕様とコードの差分を検証（スコープ + テスト + Diagnostics + cc-sdd統合）',
  args: {
    taskId: tool.schema.string().optional().describe('検証するタスクID（省略時は現在アクティブなタスク）'),
    kiroSpec: tool.schema.string().optional().describe('Kiro仕様名（.kiro/specs/配下のディレクトリ名）'),
    deep: tool.schema.boolean().optional().describe('深度分析を有効にする')
  },
  async execute({ taskId, kiroSpec, deep }, context: any) {
    const readState = context?.__testDeps?.readState ?? defaultReadState;
    const writeState = context?.__testDeps?.writeState ?? defaultWriteState;
    const validateGapInternalDeps = context?.__testDeps?.validateGapInternal ?? validateGapInternal;

    const stateResult = await readState();
    
    if (stateResult.status !== 'ok' && stateResult.status !== 'recovered') {
      return `エラー: アクティブなタスクがありません。sdd_start_task を実行してください。\n\n状態: ${stateResult.status}`;
    }
    
    const state = stateResult.state;
    const currentAttempts = state.validationAttempts + 1;
    
    if (currentAttempts > MAX_VALIDATION_ATTEMPTS) {
      return `❌ エスカレーション: 検証が ${MAX_VALIDATION_ATTEMPTS} 回連続で失敗しました\n\nタスク: ${taskId || state.activeTaskId}\n\n検証ループを続けるには、sdd_end_task → sdd_start_task でタスクをリセットしてください。`;
    }
    
    await writeState({
      ...state,
      validationAttempts: currentAttempts
    });
    
    return validateGapInternalDeps(state, {
      taskId,
      kiroSpec,
      deep,
      currentAttempts,
      skipTests: false
    });
  }
});
