import { describe, test, expect } from 'bun:test';
import { analyzeCoverage, formatCoverageReport, type CoverageResult } from '../../.opencode/lib/coverage-analyzer';
import type { ExtractedDesign } from '../../.opencode/lib/spec-parser';

describe('coverage-analyzer', () => {
  describe('analyzeCoverage', () => {
    test('完全なカバレッジを検出', () => {
      const design: ExtractedDesign = {
        impactedFiles: ['src/auth/login.ts', 'src/auth/logout.ts'],
        components: [],
        dependencies: []
      };
      const changedFiles = ['src/auth/login.ts', 'src/auth/logout.ts'];

      const result = analyzeCoverage(design, changedFiles);

      expect(result.coveragePercent).toBe(100);
      expect(result.missing).toHaveLength(0);
      expect(result.unexpected).toHaveLength(0);
    });

    test('部分的なカバレッジを検出', () => {
      const design: ExtractedDesign = {
        impactedFiles: ['src/auth/login.ts', 'src/auth/logout.ts'],
        components: [],
        dependencies: []
      };
      const changedFiles = ['src/auth/login.ts'];

      const result = analyzeCoverage(design, changedFiles);

      expect(result.coveragePercent).toBe(50);
      expect(result.missing).toContain('src/auth/logout.ts');
      expect(result.missing).toHaveLength(1);
    });

    test('設計外の変更を検出', () => {
      const design: ExtractedDesign = {
        impactedFiles: ['src/auth/login.ts'],
        components: [],
        dependencies: []
      };
      const changedFiles = ['src/auth/login.ts', 'src/unrelated/file.ts'];

      const result = analyzeCoverage(design, changedFiles);

      expect(result.unexpected).toContain('src/unrelated/file.ts');
      expect(result.unexpected).toHaveLength(1);
      expect(result.coveragePercent).toBe(100);
    });

    test('Globパターンに対応', () => {
      const design: ExtractedDesign = {
        impactedFiles: ['src/auth/**'],
        components: [],
        dependencies: []
      };
      const changedFiles = ['src/auth/login.ts', 'src/auth/service/token.ts'];

      const result = analyzeCoverage(design, changedFiles);

      expect(result.coveragePercent).toBe(100);
      expect(result.missing).toHaveLength(0);
      expect(result.unexpected).toHaveLength(0);
    });

    test('Globパターンにマッチしない場合はmissingに追加', () => {
      const design: ExtractedDesign = {
        impactedFiles: ['src/auth/**', 'src/user/**'],
        components: [],
        dependencies: []
      };
      const changedFiles = ['src/auth/login.ts'];

      const result = analyzeCoverage(design, changedFiles);

      expect(result.coveragePercent).toBe(50);
      expect(result.missing).toContain('src/user/**');
    });

    test('空のimpactedFilesの場合', () => {
      const design: ExtractedDesign = {
        impactedFiles: [],
        components: [],
        dependencies: []
      };
      const changedFiles = ['src/some/file.ts'];

      const result = analyzeCoverage(design, changedFiles);

      expect(result.coveragePercent).toBe(0);
      expect(result.unexpected).toContain('src/some/file.ts');
    });

    test('変更ファイルが空の場合', () => {
      const design: ExtractedDesign = {
        impactedFiles: ['src/auth/login.ts'],
        components: [],
        dependencies: []
      };
      const changedFiles: string[] = [];

      const result = analyzeCoverage(design, changedFiles);

      expect(result.coveragePercent).toBe(0);
      expect(result.missing).toContain('src/auth/login.ts');
    });
  });

  describe('formatCoverageReport', () => {
    test('100%カバレッジのレポート', () => {
      const result: CoverageResult = {
        expectedFiles: ['src/auth/login.ts'],
        actualChanges: ['src/auth/login.ts'],
        missing: [],
        unexpected: [],
        coveragePercent: 100
      };

      const report = formatCoverageReport(result);

      expect(report).toContain('100%');
      expect(report).toContain('すべての設計ファイルが実装され');
    });

    test('未実装ファイルがある場合のレポート', () => {
      const result: CoverageResult = {
        expectedFiles: ['src/auth/login.ts', 'src/auth/logout.ts'],
        actualChanges: ['src/auth/login.ts'],
        missing: ['src/auth/logout.ts'],
        unexpected: [],
        coveragePercent: 50
      };

      const report = formatCoverageReport(result);

      expect(report).toContain('50%');
      expect(report).toContain('未実装ファイル');
      expect(report).toContain('src/auth/logout.ts');
    });

    test('設計外の変更がある場合のレポート', () => {
      const result: CoverageResult = {
        expectedFiles: ['src/auth/login.ts'],
        actualChanges: ['src/auth/login.ts', 'src/unrelated.ts'],
        missing: [],
        unexpected: ['src/unrelated.ts'],
        coveragePercent: 100
      };

      const report = formatCoverageReport(result);

      expect(report).toContain('設計外の変更');
      expect(report).toContain('src/unrelated.ts');
    });

    test('impactedFilesが空の場合のレポート', () => {
      const result: CoverageResult = {
        expectedFiles: [],
        actualChanges: ['src/file.ts'],
        missing: [],
        unexpected: ['src/file.ts'],
        coveragePercent: 0
      };

      const report = formatCoverageReport(result);

      expect(report).toContain('Impacted Files が定義されていません');
    });
  });

  describe('analyzeCoverage (glob fix)', () => {
    test('Should handle {} glob patterns correctly', () => {
        const design: ExtractedDesign = {
            impactedFiles: ['src/auth/*.{ts,tsx}'],
            components: [],
            dependencies: []
        };
        const changedFiles = ['src/auth/login.ts', 'src/auth/Button.tsx'];

        const result = analyzeCoverage(design, changedFiles);

        expect(result.coveragePercent).toBe(100);
        expect(result.missing).toHaveLength(0);
        expect(result.unexpected).toHaveLength(0);
    });

    test('Should handle [] glob patterns correctly', () => {
        const design: ExtractedDesign = {
            impactedFiles: ['src/utils/test[12].ts'],
            components: [],
            dependencies: []
        };
        const changedFiles = ['src/utils/test1.ts'];

        const result = analyzeCoverage(design, changedFiles);

        expect(result.coveragePercent).toBe(100);
        expect(result.missing).toHaveLength(0);
        expect(result.unexpected).toHaveLength(0);
    });
  });
});
