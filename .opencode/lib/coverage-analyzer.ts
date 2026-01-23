import { matchesScope } from './glob-utils';
import type { ExtractedDesign } from './spec-parser';

/**
 * カバレッジ分析結果を表す構造体
 */
export interface CoverageResult {
  expectedFiles: string[];
  actualChanges: string[];
  missing: string[];
  unexpected: string[];
  coveragePercent: number;
}

/**
 * design.md で宣言されたファイルと実際の変更ファイルを比較し、
 * カバレッジ分析を行う
 * 
 * @param design - extractDesign() で抽出した設計情報
 * @param changedFiles - git diff で検出された変更ファイル一覧
 * @returns カバレッジ分析結果
 */
export function analyzeCoverage(design: ExtractedDesign, changedFiles: string[]): CoverageResult {
  const expectedFiles = design.impactedFiles;
  
  if (expectedFiles.length === 0) {
    return {
      expectedFiles: [],
      actualChanges: changedFiles,
      missing: [],
      unexpected: changedFiles,
      coveragePercent: 0
    };
  }

  const missing: string[] = [];
  const covered: string[] = [];

  for (const expected of expectedFiles) {
    const isGlobPattern = expected.includes('*') || expected.includes('?');
    
    if (isGlobPattern) {
      const matchedFiles = changedFiles.filter(file => matchesScope(file, [expected]));
      if (matchedFiles.length > 0) {
        covered.push(expected);
      } else {
        missing.push(expected);
      }
    } else {
      if (changedFiles.includes(expected)) {
        covered.push(expected);
      } else {
        missing.push(expected);
      }
    }
  }

  const unexpected: string[] = [];
  for (const file of changedFiles) {
    let isExpected = false;
    for (const expected of expectedFiles) {
      const isGlobPattern = expected.includes('*') || expected.includes('?');
      if (isGlobPattern) {
        if (matchesScope(file, [expected])) {
          isExpected = true;
          break;
        }
      } else {
        if (file === expected) {
          isExpected = true;
          break;
        }
      }
    }
    if (!isExpected) {
      unexpected.push(file);
    }
  }

  const coveragePercent = expectedFiles.length > 0
    ? Math.round((covered.length / expectedFiles.length) * 100)
    : 0;

  return {
    expectedFiles,
    actualChanges: changedFiles,
    missing,
    unexpected,
    coveragePercent
  };
}

/**
 * カバレッジ結果をMarkdownレポート形式でフォーマット
 */
export function formatCoverageReport(result: CoverageResult): string {
  const lines: string[] = [];

  lines.push(`### カバレッジ分析: ${result.coveragePercent}%`);
  lines.push('');

  if (result.expectedFiles.length === 0) {
    lines.push('> design.md に Impacted Files が定義されていません');
    return lines.join('\n');
  }

  if (result.missing.length > 0) {
    lines.push('**未実装ファイル:**');
    for (const file of result.missing) {
      lines.push(`- ⚠️ \`${file}\``);
    }
    lines.push('');
  }

  if (result.unexpected.length > 0) {
    lines.push('**設計外の変更:**');
    for (const file of result.unexpected) {
      lines.push(`- 📝 \`${file}\``);
    }
    lines.push('');
  }

  if (result.missing.length === 0 && result.unexpected.length === 0) {
    lines.push('✅ すべての設計ファイルが実装され、設計外の変更はありません');
  }

  return lines.join('\n');
}
