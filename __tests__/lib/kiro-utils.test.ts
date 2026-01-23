import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

describe('kiro-utils', () => {
  let KIRO_DIR: string;
  let SPECS_DIR: string;
  const TEST_FEATURE = 'test-feature';
  let TEST_SPEC_DIR: string;

  beforeEach(() => {
    setupTestState();
    KIRO_DIR = process.env.SDD_KIRO_DIR!;
    SPECS_DIR = `${KIRO_DIR}/specs`;
    TEST_SPEC_DIR = `${SPECS_DIR}/${TEST_FEATURE}`;
  });

  afterEach(() => {
    cleanupTestState();
  });

  describe('findKiroSpecs', () => {
    test('returns empty array when .kiro/specs does not exist', async () => {
      const { findKiroSpecs } = await import('../../.opencode/lib/kiro-utils');
      expect(findKiroSpecs()).toEqual([]);
    });

    test('returns feature names when specs exist', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.mkdirSync(`${SPECS_DIR}/another-feature`, { recursive: true });
      
      const { findKiroSpecs } = await import('../../.opencode/lib/kiro-utils');
      const specs = findKiroSpecs();
      
      expect(specs).toContain(TEST_FEATURE);
      expect(specs).toContain('another-feature');
    });
  });

  describe('loadKiroSpec', () => {
    test('returns null when spec does not exist', async () => {
      const { loadKiroSpec } = await import('../../.opencode/lib/kiro-utils');
      expect(loadKiroSpec('nonexistent')).toBeNull();
    });

    test('loads spec with all files present', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, '# Requirements');
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, '# Design');
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      fs.writeFileSync(`${TEST_SPEC_DIR}/spec.json`, JSON.stringify({ name: 'test' }));
      
      const { loadKiroSpec } = await import('../../.opencode/lib/kiro-utils');
      const spec = loadKiroSpec(TEST_FEATURE);
      
      expect(spec).not.toBeNull();
      expect(spec?.featureName).toBe(TEST_FEATURE);
      expect(spec?.requirements).toBe('# Requirements');
      expect(spec?.design).toBe('# Design');
      expect(spec?.tasks).toBe('# Tasks');
      expect(spec?.specJson).toEqual({ name: 'test' });
    });

    test('handles partial spec gracefully', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, '# Requirements');
      
      const { loadKiroSpec } = await import('../../.opencode/lib/kiro-utils');
      const spec = loadKiroSpec(TEST_FEATURE);
      
      expect(spec).not.toBeNull();
      expect(spec?.requirements).toBe('# Requirements');
      expect(spec?.design).toBeNull();
      expect(spec?.tasks).toBeNull();
    });
  });

  describe('analyzeKiroGap', () => {
    test('returns not_found when spec does not exist', async () => {
      const { analyzeKiroGap } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGap('nonexistent', []);
      
      expect(result.status).toBe('not_found');
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    test('returns partial when some files are missing', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, '# Requirements');
      
      const { analyzeKiroGap } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGap(TEST_FEATURE, []);
      
      expect(result.status).toBe('partial');
      expect(result.gaps).toContain('design.md が見つかりません');
      expect(result.gaps).toContain('tasks.md が見つかりません');
    });

    test('returns partial when only spec.json exists', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/spec.json`, JSON.stringify({ name: 'test' }));
      
      const { analyzeKiroGap } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGap(TEST_FEATURE, []);
      
      expect(result.status).toBe('partial');
    });

    test('returns found when all files are present', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, '# Requirements');
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, '# Design');
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      const { analyzeKiroGap } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGap(TEST_FEATURE, []);
      
      expect(result.status).toBe('found');
      expect(result.gaps).toEqual([]);
    });
  });

  describe('formatKiroGapReport', () => {
    test('formats not_found result correctly', async () => {
      const { formatKiroGapReport, analyzeKiroGap } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGap('nonexistent', []);
      const report = formatKiroGapReport(result);
      
      expect(report).toContain('仕様が見つかりません');
    });

    test('formats partial result correctly', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, '# Requirements');
      
      const { formatKiroGapReport, analyzeKiroGap } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGap(TEST_FEATURE, []);
      const report = formatKiroGapReport(result);
      
      expect(report).toContain('仕様が不完全です');
      expect(report).toContain('不足しているファイル');
    });

    test('formats found result correctly', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, '# Requirements');
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, '# Design');
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      const { formatKiroGapReport, analyzeKiroGap } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGap(TEST_FEATURE, []);
      const report = formatKiroGapReport(result);
      
      expect(report).toContain('仕様が完備しています');
      expect(report).toContain('✅');
    });
  });

  describe('analyzeKiroGapDeep', () => {
    test('基本的なギャップ分析に加えて拡張情報を返す', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, `
## REQ-001: ユーザー認証

ユーザーがログインできる

### 受入条件
- JWT返却
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, `
## Impacted Files

- \`src/auth/login.ts\`
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      const { analyzeKiroGapDeep } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGapDeep(TEST_FEATURE, ['src/auth/login.ts']);
      
      expect(result.status).toBe('found');
      expect(result.extractedRequirements).toHaveLength(1);
      expect(result.extractedRequirements[0].id).toBe('REQ-001');
      expect(result.coverage).not.toBeNull();
      expect(result.coverage?.coveragePercent).toBe(100);
      expect(result.semanticAnalysisPrompt).not.toBeNull();
    });

    test('カバレッジ不足を検出', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, '# Req');
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, `
## Impacted Files

- \`src/auth/login.ts\`
- \`src/auth/logout.ts\`
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      const { analyzeKiroGapDeep } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGapDeep(TEST_FEATURE, ['src/auth/login.ts']);
      
      expect(result.coverage?.coveragePercent).toBe(50);
      expect(result.coverage?.missing).toContain('src/auth/logout.ts');
      expect(result.gaps.some(g => g.includes('未実装'))).toBe(true);
    });

    test('設計外の変更を検出', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, '# Req');
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, `
## Impacted Files

- \`src/auth/login.ts\`
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      const { analyzeKiroGapDeep } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGapDeep(TEST_FEATURE, ['src/auth/login.ts', 'src/unrelated.ts']);
      
      expect(result.coverage?.unexpected).toContain('src/unrelated.ts');
      expect(result.suggestions.some(s => s.includes('設計外'))).toBe(true);
    });

    test('仕様が存在しない場合は空の拡張情報を返す', async () => {
      const { analyzeKiroGapDeep } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGapDeep('nonexistent', ['src/file.ts']);
      
      expect(result.status).toBe('not_found');
      expect(result.coverage).toBeNull();
      expect(result.extractedRequirements).toEqual([]);
      expect(result.semanticAnalysisPrompt).toBeNull();
    });
  });

  describe('formatEnhancedKiroGapReport', () => {
    test('拡張レポートにカバレッジ情報を含む', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, `
## REQ-001: テスト

テスト説明
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, `
## Impacted Files

- \`src/test.ts\`
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      const { analyzeKiroGapDeep, formatEnhancedKiroGapReport } = await import('../../.opencode/lib/kiro-utils');
      const result = analyzeKiroGapDeep(TEST_FEATURE, ['src/test.ts']);
      const report = formatEnhancedKiroGapReport(result);
      
      expect(report).toContain('カバレッジ分析');
      expect(report).toContain('100%');
      expect(report).toContain('抽出された要件');
      expect(report).toContain('REQ-001');
    });
  });
});

