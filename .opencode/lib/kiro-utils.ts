import fs from 'fs';
import path from 'path';

export interface KiroSpec {
  featureName: string;
  requirements: string | null;
  design: string | null;
  tasks: string | null;
  specJson: Record<string, unknown> | null;
}

export interface KiroGapResult {
  status: 'found' | 'not_found' | 'partial';
  spec: KiroSpec | null;
  gaps: string[];
  suggestions: string[];
}

const KIRO_DIR = '.kiro';
const SPECS_DIR = `${KIRO_DIR}/specs`;

export function findKiroSpecs(): string[] {
  if (!fs.existsSync(SPECS_DIR)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(SPECS_DIR, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
}

export function loadKiroSpec(featureName: string): KiroSpec | null {
  const specDir = path.join(SPECS_DIR, featureName);
  
  if (!fs.existsSync(specDir)) {
    return null;
  }

  const readOptionalFile = (filename: string): string | null => {
    const filePath = path.join(specDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        return fs.readFileSync(filePath, 'utf-8');
      } catch {
        return null;
      }
    }
    return null;
  };

  const readOptionalJson = (filename: string): Record<string, unknown> | null => {
    const content = readOptionalFile(filename);
    if (content) {
      try {
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
    return null;
  };

  return {
    featureName,
    requirements: readOptionalFile('requirements.md'),
    design: readOptionalFile('design.md'),
    tasks: readOptionalFile('tasks.md'),
    specJson: readOptionalJson('spec.json'),
  };
}

export function analyzeKiroGap(featureName: string, changedFiles: string[]): KiroGapResult {
  const spec = loadKiroSpec(featureName);
  
  if (!spec) {
    return {
      status: 'not_found',
      spec: null,
      gaps: [`Kiro仕様 '${featureName}' が見つかりません (.kiro/specs/${featureName}/)`],
      suggestions: [
        '利用可能な仕様: ' + (findKiroSpecs().join(', ') || 'なし'),
        'Kiro仕様を作成するには: npx cc-sdd@latest --claude'
      ]
    };
  }

  const gaps: string[] = [];
  const suggestions: string[] = [];

  if (!spec.requirements) {
    gaps.push('requirements.md が見つかりません');
    suggestions.push('/kiro:spec-requirements を実行して要件を生成してください');
  }

  if (!spec.design) {
    gaps.push('design.md が見つかりません');
    suggestions.push('/kiro:spec-design を実行して設計を生成してください');
  }

  if (!spec.tasks) {
    gaps.push('tasks.md が見つかりません');
    suggestions.push('/kiro:spec-tasks を実行してタスクを生成してください');
  }

  if (spec.tasks && changedFiles.length > 0) {
    // チェックボックス形式のタスクのみを抽出（番号付きリストを除外）
    const taskLines = spec.tasks.split('\n').filter(line => 
      line.match(/^\s*-\s*\[[ x]\]/i)
    );
    
    const completedTasks = taskLines.filter(line => line.match(/\[x\]/i)).length;
    const totalTasks = taskLines.length;
    
    if (totalTasks > 0) {
      suggestions.push(`タスク進捗: ${completedTasks}/${totalTasks} 完了`);
      
      if (completedTasks < totalTasks) {
        suggestions.push('未完了のタスクがあります。tasks.md を確認してください');
      }
    }
  }

  const status = gaps.length === 0 ? 'found' : 
                 (spec.requirements || spec.design || spec.tasks || spec.specJson) ? 'partial' : 'not_found';

  return {
    status,
    spec,
    gaps,
    suggestions
  };
}

export function formatKiroGapReport(result: KiroGapResult): string {
  const lines: string[] = [];

  if (result.status === 'not_found') {
    lines.push('### Kiro統合: 仕様が見つかりません');
    lines.push('');
    result.gaps.forEach(gap => lines.push(`- ${gap}`));
    lines.push('');
    result.suggestions.forEach(suggestion => lines.push(`> ${suggestion}`));
    return lines.join('\n');
  }

  if (result.status === 'partial') {
    lines.push('### Kiro統合: 仕様が不完全です');
    lines.push('');
    lines.push('**不足しているファイル:**');
    result.gaps.forEach(gap => lines.push(`- ⚠️ ${gap}`));
    lines.push('');
    lines.push('**推奨アクション:**');
    result.suggestions.forEach(suggestion => lines.push(`- ${suggestion}`));
    return lines.join('\n');
  }

  lines.push('### Kiro統合: 仕様が完備しています ✅');
  lines.push('');
  lines.push(`- 機能名: ${result.spec?.featureName}`);
  lines.push('- requirements.md: ✅');
  lines.push('- design.md: ✅');
  lines.push('- tasks.md: ✅');
  
  if (result.suggestions.length > 0) {
    lines.push('');
    result.suggestions.forEach(suggestion => lines.push(`> ${suggestion}`));
  }

  return lines.join('\n');
}
