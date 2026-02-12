import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractRequirements, extractDesign, type ExtractedRequirement } from './spec-parser';
import { analyzeCoverage, formatCoverageReport, type CoverageResult } from './coverage-analyzer';
import { findSemanticGaps, type SemanticAnalysisResult } from './semantic-search';
import { logger } from './logger.js';
import { getChatCompletion, isLlmEnabled } from './llm-provider';

export interface KiroSpec {
  featureName: string;
  requirements: string | null;
  design: string | null;
  tasks: string | null;
  scope: string | null;
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

/**
 * featureNameをバリデートし、パス・トラバーサル攻撃を防止します。
 * @param featureName 検証する機能名
 * @returns 有効な場合はtrue、無効な場合はfalse
 */
function isValidFeatureName(featureName: string): boolean {
  // 空文字列チェック
  if (!featureName || featureName.trim() === '') {
    return false;
  }

  // 絶対パスの拒否
  if (path.isAbsolute(featureName)) {
    return false;
  }

  // 親ディレクトリ参照(..)の拒否
  if (featureName.includes('..')) {
    return false;
  }

  // パス区切り文字で始まる場合を拒否
  if (featureName.startsWith(path.sep) || featureName.startsWith('/') || featureName.startsWith('\\')) {
    return false;
  }

  // 解決後のパスがspecsディレクトリ内にあることを確認
  const specsDir = path.resolve(getSpecsDir());
  const specDir = path.resolve(getSpecsDir(), featureName);

  // specDirがspecsDirの子ディレクトリであることを確認
  // path.sepを追加して、プレフィックスマッチングではなく完全なディレクトリマッチングを保証
  if (!specDir.startsWith(specsDir + path.sep)) {
    return false;
  }

  return true;
}

/**
 * テンプレート名をバリデートし、パス・トラバーサル攻撃を防止します。
 * @param templateName 検証するテンプレート名
 * @returns 有効な場合はtrue、無効な場合はfalse
 */
function isValidTemplateName(templateName: string): boolean {
  if (!templateName || templateName.trim() === '') {
    return false;
  }

  // 親ディレクトリ参照(..)の拒否
  if (templateName.includes('..')) {
    return false;
  }

  // パス区切り文字の拒否
  if (templateName.includes('/') || templateName.includes('\\') || templateName.includes(path.sep)) {
    return false;
  }

  return true;
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
  // featureNameのバリデーション
  if (!isValidFeatureName(featureName)) {
    return null;
  }

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
    scope: readOptionalFile('scope.md'),
    specJson: readOptionalJson('spec.json'),
  };
}

function generateTaskSuggestions(
  suggestions: string[],
  specTasks: string,
  changedFiles: string[]
): void {
  // チェックボックス形式のタスクのみを抽出（番号付きリストを除外）
  const taskLines = specTasks.split('\n').filter(line =>
    line.match(/^\s*[-\*]\s*\[[ x]\]/i)
  );

  const completedTasks = taskLines.filter(line => line.match(/\[x\]/i)).length;
  const totalTasks = taskLines.length;

  if (totalTasks === 0) {
    return;
  }

  // 変更がある場合、または未完了タスクがある場合に情報を表示
  if (changedFiles.length === 0 && completedTasks >= totalTasks) {
    return;
  }

  suggestions.push(`タスク進捗: ${completedTasks}/${totalTasks} 完了`);

  if (completedTasks < totalTasks) {
    suggestions.push('未完了のタスクがあります。tasks.md を確認してください');
  }
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

  if (spec.tasks) {
    generateTaskSuggestions(suggestions, spec.tasks, changedFiles);
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
    try {
      enhanced.semanticAnalysis = await findSemanticGaps(
        enhanced.extractedRequirements,
        changedFiles
      );
    } catch (error) {
      enhanced.semanticAnalysis = null;
      enhanced.gaps.push('意味的分析の実行に失敗しました（Embeddingsの設定や接続を確認してください）');
    }

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
      lines.push('### 意味的分析: スキップ（詳細なし）');
      lines.push('> Embeddingsが無効化されている、ファイルが分析スコープ外、または要件が抽出されなかった可能性があります');
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

export function updateKiroSpecTasks(featureName: string, newContent: string): boolean {
  // featureNameのバリデーション
  if (!isValidFeatureName(featureName)) {
    return false;
  }

  const specsDir = getSpecsDir();
  const specDir = path.join(specsDir, featureName);
  const tasksPath = path.join(specDir, 'tasks.md');

  if (!fs.existsSync(tasksPath)) {
    return false;
  }

  try {
    fs.writeFileSync(tasksPath, newContent, 'utf-8');
    return true;
  } catch (e) {
    logger.error(`Failed to update tasks for ${featureName}:`, e);
    return false;
  }
}

export function getSteeringDir(): string {
  return path.join(getKiroDir(), 'steering');
}

export function listSteeringDocs(): string[] {
  const steeringDir = getSteeringDir();
  if (!fs.existsSync(steeringDir)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(steeringDir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name);
  } catch (e) {
    logger.error('Failed to list steering docs:', e);
    return [];
  }
}

export function updateSteeringDoc(name: string, content: string): boolean {
  if (!name || name.trim() === '') return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;

  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const steeringDir = getSteeringDir();
  const filePath = path.join(steeringDir, fileName);

  try {
    if (!fs.existsSync(steeringDir)) {
      fs.mkdirSync(steeringDir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (e) {
    logger.error(`Failed to update steering doc ${fileName}:`, e);
    return false;
  }
}

export interface DesignAnalysisResult {
  status: 'ok' | 'missing_req' | 'missing_design' | 'inconsistent' | 'error';
  issues: string[];
  suggestions: string[];
}

export function analyzeDesignConsistency(featureName: string): DesignAnalysisResult {
  const spec = loadKiroSpec(featureName);
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (!spec) {
    return {
      status: 'missing_req',
      issues: [`Feature '${featureName}' spec not found`],
      suggestions: []
    };
  }

  if (!spec.requirements) {
    issues.push('requirements.md not found');
  }

  if (!spec.design) {
    issues.push('design.md not found');
  }

  let status: 'ok' | 'missing_req' | 'missing_design' | 'inconsistent' | 'error' = 'ok';

  if (!spec.requirements) {
    status = 'missing_req';
  } else if (!spec.design) {
    status = 'missing_design';
  }

  return {
    status,
    issues,
    suggestions
  };
}

export async function analyzeDesignConsistencyDeep(featureName: string): Promise<DesignAnalysisResult> {
  const baseResult = analyzeDesignConsistency(featureName);
  if (baseResult.status !== 'ok') {
    return baseResult;
  }

  const spec = loadKiroSpec(featureName)!;
  const analysis = await analyzeDocConsistency(spec);

  if (analysis.status === 'issues') {
    return {
      status: 'inconsistent',
      issues: analysis.issues,
      suggestions: ['設計書(design.md)を見直し、要件との不整合を解消してください。']
    };
  }

  return baseResult;
}

export async function analyzeDocConsistency(spec: KiroSpec): Promise<{ status: 'ok' | 'issues', issues: string[] }> {
  if (!isLlmEnabled()) {
    return { status: 'ok', issues: [] };
  }

  if (!spec.requirements || !spec.design) {
    return { status: 'ok', issues: [] };
  }

  const prompt = `要件定義書(requirements.md)と基本設計書(design.md)の整合性を分析してください。
設計書で不足している要件、矛盾、または論理的なエラーを報告してください。
検出された問題点を日本語の箇条書き形式で出力してください。
問題が見つからない場合は、 "No issues found" とのみ返答してください。

### Requirements
${spec.requirements}

### Design
${spec.design}

### Tasks (Optional Context)
${spec.tasks || 'Not provided'}
`;

  try {
    const response = await getChatCompletion([
      { role: 'system', content: 'You are an expert system architect performing specification consistency analysis.' },
      { role: 'user', content: prompt }
    ]);

    if (!response || response.trim() === 'No issues found') {
      return { status: 'ok', issues: [] };
    }

    const issues = response.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./))
      .map(line => line.replace(/^[-*\d.]+\s*/, ''));

    return { 
      status: issues.length > 0 ? 'issues' : 'ok', 
      issues 
    };
  } catch (error) {
    logger.error('Failed to analyze doc consistency:', error);
    return { status: 'ok', issues: [] };
  }
}

/**
 * テンプレートを検索して読み込み、プレースホルダーを置換します。
 * 1. CWDから上方向に .opencode/templates/specs/<name> を検索
 * 2. パッケージ内のデフォルト位置を検索
 * 3. 見つからない場合はデフォルトのEARS形式を返却
 *
 * @param templateName テンプレートファイル名（例: requirements.md）
 * @param replacements 置換するキーと値のマップ
 */
export function loadSpecTemplate(templateName: string, replacements: Record<string, string>): string {
  // templateNameのバリデーション
  if (!isValidTemplateName(templateName)) {
    return getDefaultEarsTemplate();
  }

  let templatePath: string | null = null;

  // 1. 上方検索
  let currentDir = process.cwd();
  while (true) {
    const candidate = path.join(currentDir, '.opencode', 'templates', 'specs', templateName);
    if (fs.existsSync(candidate)) {
      templatePath = candidate;
      break;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // 2. パッケージ内のデフォルト位置
  if (!templatePath) {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // 実行環境（開発ソース or ビルド済み）に応じてパッケージルートを解決
      let packageRoot: string;
      const devPath = path.join('.opencode', 'lib');
      if (__dirname.endsWith(devPath) || __dirname.includes(devPath + path.sep)) {
        // 開発環境: .opencode/lib/kiro-utils.ts -> ../..
        packageRoot = path.resolve(__dirname, '../..');
      } else if (__dirname.endsWith('dist') || __dirname.includes('dist' + path.sep)) {
        // ビルド環境: dist/ または dist/tools/ -> 親ディレクトリ（プロジェクトルート）
        // dist 直下なら 1階層上、dist/tools なら 2階層上
        if (__dirname.endsWith('dist')) {
          packageRoot = path.resolve(__dirname, '..');
        } else {
          // dist/tools などのサブディレクトリを想定
          packageRoot = path.resolve(__dirname, '../..');
        }
      } else {
        // フォールバック: 上方向に .opencode/templates を含むディレクトリを探索
        let current = __dirname;
        let found = false;
        while (current !== path.dirname(current)) {
          if (fs.existsSync(path.join(current, '.opencode', 'templates'))) {
            found = true;
            break;
          }
          current = path.dirname(current);
        }
        packageRoot = found ? current : path.resolve(__dirname, '../..');
      }
      
      const packageCandidate = path.join(packageRoot, '.opencode', 'templates', 'specs', templateName);
      if (fs.existsSync(packageCandidate)) {
        templatePath = packageCandidate;
      }
    } catch (e) {
      // エラー時は無視してフォールバックへ
    }
  }

  let content: string;
  if (templatePath) {
    try {
      content = fs.readFileSync(templatePath, 'utf-8');
    } catch (e) {
      // 読み込み失敗時はフォールバックへ
      content = getDefaultEarsTemplate();
    }
  } else {
    content = getDefaultEarsTemplate();
  }

  // 置換処理
  const finalReplacements = { ...replacements };

  // エイリアスの処理: INTRODUCTION -> prompt / PROMPT
  if (!finalReplacements.INTRODUCTION) {
    if (finalReplacements.prompt) {
      finalReplacements.INTRODUCTION = finalReplacements.prompt;
    } else if (finalReplacements.PROMPT) {
      finalReplacements.INTRODUCTION = finalReplacements.PROMPT;
    }
  }

  // 各キーを {{KEY}} 形式で置換
  for (const [key, value] of Object.entries(finalReplacements)) {
    const escapedKey = escapeRegex(key);
    const regex = new RegExp(`{{${escapedKey}}}`, 'g');
    content = content.replace(regex, value);
  }

  return content;
}

/**
 * 正規表現で使用するために特殊文字をエスケープします。
 * @param str エスケープする文字列
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * デフォルトのEARS形式テンプレートを返却します
 */
function getDefaultEarsTemplate(): string {
  return [
    '# Requirements: {{FEATURE}}',
    '',
    '## 概要',
    '{{PROMPT}}',
    '',
    '## 受入条件 (EARS)',
    '- **前提** <前提条件>',
    '- **もし** <操作>',
    '- **ならば** <結果>',
    ''
  ].join('\n');
}
