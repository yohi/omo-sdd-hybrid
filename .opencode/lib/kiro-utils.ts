import fs from 'fs';
import path from 'path';
import { extractRequirements, extractDesign, type ExtractedRequirement } from './spec-parser';
import { analyzeCoverage, formatCoverageReport, type CoverageResult } from './coverage-analyzer';
import { findSemanticGaps, type SemanticAnalysisResult } from './semantic-search';

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

function getKiroDir() {
  return process.env.SDD_KIRO_DIR || '.kiro';
}

function getSpecsDir() {
  return path.join(getKiroDir(), 'specs');
}

export function findKiroSpecs(): string[] {
  const specsDir = getSpecsDir();
  if (!fs.existsSync(specsDir)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(specsDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
}

export function loadKiroSpec(featureName: string): KiroSpec | null {
  const specDir = path.join(getSpecsDir(), featureName);
  
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
    result.gaps.forEach(gap => { lines.push(`- ${gap}`); });
    lines.push('');
    result.suggestions.forEach(suggestion => { lines.push(`> ${suggestion}`); });
    return lines.join('\n');
  }

  if (result.status === 'partial') {
    lines.push('### Kiro統合: 仕様が不完全です');
    lines.push('');
    lines.push('**不足しているファイル:**');
    result.gaps.forEach(gap => { lines.push(`- ⚠️ ${gap}`); });
    lines.push('');
    lines.push('**推奨アクション:**');
    result.suggestions.forEach(suggestion => { lines.push(`- ${suggestion}`); });
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
    result.suggestions.forEach(suggestion => { lines.push(`> ${suggestion}`); });
  }

  return lines.join('\n');
}

export interface EnhancedKiroGapResult extends KiroGapResult {
  coverage: CoverageResult | null;
  extractedRequirements: ExtractedRequirement[];
  semanticAnalysisPrompt: string | null;
  semanticAnalysis: SemanticAnalysisResult | null;
}

export async function analyzeKiroGapDeep(featureName: string, changedFiles: string[]): Promise<EnhancedKiroGapResult> {
  const baseResult = analyzeKiroGap(featureName, changedFiles);
  
  const enhanced: EnhancedKiroGapResult = {
    ...baseResult,
    gaps: [...baseResult.gaps],
    suggestions: [...baseResult.suggestions],
    coverage: null,
    extractedRequirements: [],
    semanticAnalysisPrompt: null,
    semanticAnalysis: null
  };

  if (!baseResult.spec) {
    return enhanced;
  }

  if (baseResult.spec.requirements) {
    enhanced.extractedRequirements = extractRequirements(baseResult.spec.requirements);
  }

  if (baseResult.spec.design) {
    const design = extractDesign(baseResult.spec.design);
    enhanced.coverage = analyzeCoverage(design, changedFiles);
    
    if (enhanced.coverage.missing.length > 0) {
      enhanced.gaps.push(
        `設計で宣言されたファイルのうち ${enhanced.coverage.missing.length} 件が未実装`
      );
    }
    
    if (enhanced.coverage.unexpected.length > 0) {
      enhanced.suggestions.push(
        `設計外の変更が ${enhanced.coverage.unexpected.length} 件あります（design.md の更新を検討してください）`
      );
    }
  }

  if (enhanced.extractedRequirements.length > 0 && changedFiles.length > 0) {
    enhanced.semanticAnalysisPrompt = generateSemanticPrompt(
      enhanced.extractedRequirements,
      changedFiles
    );

    // 意味的分析の実行
    enhanced.semanticAnalysis = await findSemanticGaps(
      enhanced.extractedRequirements,
      changedFiles
    );

    if (enhanced.semanticAnalysis && enhanced.semanticAnalysis.gaps.length > 0) {
      enhanced.gaps.push(
        `意味的ギャップが ${enhanced.semanticAnalysis.gaps.length} 件検出されました`
      );
    }
  }

  return enhanced;
}

function generateSemanticPrompt(requirements: ExtractedRequirement[], changedFiles: string[]): string {
  const lines: string[] = [];
  
  lines.push('## 要件充足分析依頼');
  lines.push('');
  lines.push('以下の要件と変更ファイルを照合し、実装が要件を満たしているか分析してください。');
  lines.push('');
  lines.push('### 検証対象の要件');
  lines.push('');
  
  for (const req of requirements) {
    lines.push(`#### ${req.id}: ${req.description.split('\n')[0].substring(0, 100)}`);
    if (req.acceptanceCriteria.length > 0) {
      lines.push('');
      lines.push('**受入条件:**');
      for (const criteria of req.acceptanceCriteria) {
        lines.push(`- ${criteria}`);
      }
    }
    lines.push('');
  }
  
  lines.push('### 変更されたファイル');
  lines.push('');
  for (const file of changedFiles.slice(0, 20)) {
    lines.push(`- \`${file}\``);
  }
  if (changedFiles.length > 20) {
    lines.push(`- ...他 ${changedFiles.length - 20} ファイル`);
  }
  lines.push('');
  lines.push('### 質問');
  lines.push('');
  lines.push('1. 上記のファイル変更は、列挙された要件を充足していますか？');
  lines.push('2. 不足している実装があれば、具体的に指摘してください。');
  lines.push('3. 受入条件のうち、検証が困難なものがあれば指摘してください。');
  
  return lines.join('\n');
}

export function formatEnhancedKiroGapReport(result: EnhancedKiroGapResult): string {
  const lines: string[] = [];
  
  lines.push(formatKiroGapReport(result));
  
  if (result.coverage) {
    lines.push('');
    lines.push(formatCoverageReport(result.coverage));
  }
  
  if (result.extractedRequirements.length > 0) {
    lines.push('');
    lines.push(`### 抽出された要件: ${result.extractedRequirements.length} 件`);
    for (const req of result.extractedRequirements.slice(0, 5)) {
      const shortDesc = req.description.split('\n')[0].substring(0, 60);
      lines.push(`- **${req.id}**: ${shortDesc}${req.description.length > 60 ? '...' : ''}`);
    }
    if (result.extractedRequirements.length > 5) {
      lines.push(`- ...他 ${result.extractedRequirements.length - 5} 件`);
    }
  }

  if (result.semanticAnalysis) {
    lines.push('');
    lines.push('---');
    lines.push('');
    
    if (result.semanticAnalysis.gaps.length > 0) {
      lines.push(`### ⚠️ 意味的ギャップ検出: ${result.semanticAnalysis.gaps.length} 件`);
      lines.push('');
      for (const gap of result.semanticAnalysis.gaps) {
        lines.push(`- ${gap}`);
      }
      lines.push('');
      lines.push('> ※Embeddingsによる自動判定です。必ずしも正確ではありません。');
    } else if (result.semanticAnalysis.details.length > 0) {
      lines.push('### ✅ 意味的整合性: OK');
      lines.push(`> 検証対象: ${result.semanticAnalysis.details.length} 要件`);
    } else {
      lines.push('### 意味的分析: スキップ');
      lines.push('> 変更ファイルが分析対象外か、要件が抽出できませんでした');
    }
  }
  
  if (result.semanticAnalysisPrompt) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('> 💡 **意味的分析プロンプト**: 以下のプロンプトをLLMに渡すことで、より詳細な分析が可能です。');
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>プロンプト（クリックで展開）</summary>');
    lines.push('');
    lines.push('```markdown');
    lines.push(result.semanticAnalysisPrompt);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
  }
  
  return lines.join('\n');
}
