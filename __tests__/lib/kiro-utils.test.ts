import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import fs from 'fs';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

// Mock embeddings-provider
mock.module("../../.opencode/lib/embeddings-provider", () => ({
  getEmbeddings: async (texts: string[]) => {
    return texts.map(t => {
      // REQ-001 has vector [1, 0, 0]
      if (t.includes('REQ-001') || t.includes('match_content')) return [1, 0, 0];
      // gap_content has vector [0, 1, 0] -> Sim 0
      if (t.includes('gap_content')) return [0, 1, 0];
      return [0, 0, 1];
    });
  },
  isEmbeddingsEnabled: () => true
}));

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
      const result = await analyzeKiroGapDeep(TEST_FEATURE, ['src/auth/login.ts']);
      
      expect(result.status).toBe('found');
      expect(result.extractedRequirements).toHaveLength(1);
      expect(result.extractedRequirements[0].id).toBe('REQ-001');
      expect(result.coverage).not.toBeNull();
      expect(result.coverage?.coveragePercent).toBe(100);
      expect(result.semanticAnalysisPrompt).not.toBeNull();
      // semanticAnalysis should be present
      expect(result.semanticAnalysis).not.toBeNull();
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
      const result = await analyzeKiroGapDeep(TEST_FEATURE, ['src/auth/login.ts']);
      
      expect(result.coverage?.coveragePercent).toBe(50);
      expect(result.coverage?.missing).toContain('src/auth/logout.ts');
      expect(result.gaps.some(g => g.includes('未実装'))).toBe(true);
    });

    test('意味的ギャップを検出 (類似度低)', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, `
## REQ-001: 認証
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, '# Design');
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      // changed file has "gap_content" -> Vector [0, 1, 0] vs REQ [1, 0, 0] -> Sim 0
      fs.mkdirSync('src', { recursive: true });
      fs.writeFileSync('src/gap.ts', 'gap_content');

      const { analyzeKiroGapDeep } = await import('../../.opencode/lib/kiro-utils');
      const result = await analyzeKiroGapDeep(TEST_FEATURE, ['src/gap.ts']);
      
      expect(result.semanticAnalysis?.gaps.length).toBeGreaterThan(0);
      expect(result.gaps.some(g => g.includes('意味的ギャップ'))).toBe(true);
    });

    test('意味的整合性OK (類似度高)', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, `
## REQ-001: 認証 REQ-001
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, '# Design');
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      // changed file has "match_content" -> Vector [1, 0, 0] vs REQ [1, 0, 0] -> Sim 1
      fs.mkdirSync('src', { recursive: true });
      fs.writeFileSync('src/match.ts', 'match_content');

      const { analyzeKiroGapDeep } = await import('../../.opencode/lib/kiro-utils');
      const result = await analyzeKiroGapDeep(TEST_FEATURE, ['src/match.ts']);
      
      expect(result.semanticAnalysis?.gaps).toEqual([]);
      expect(result.semanticAnalysis?.details.length).toBe(1);
    });
  });

  describe('formatEnhancedKiroGapReport', () => {
    test('拡張レポートに意味的分析情報を含む', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/requirements.md`, `
## REQ-001: テスト

テスト説明
`);
      fs.writeFileSync(`${TEST_SPEC_DIR}/design.md`, '# Design');
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '# Tasks');
      
      fs.mkdirSync('src', { recursive: true });
      fs.writeFileSync('src/gap.ts', 'gap_content'); // Will trigger gap

      const { analyzeKiroGapDeep, formatEnhancedKiroGapReport } = await import('../../.opencode/lib/kiro-utils');
      const result = await analyzeKiroGapDeep(TEST_FEATURE, ['src/gap.ts']);
      const report = formatEnhancedKiroGapReport(result);
      
      expect(report).toContain('意味的ギャップ検出');
      expect(report).toContain('⚠️');
    });
  });

  describe('updateKiroSpecTasks', () => {
    test('updates tasks.md for existing feature', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '- [ ] Old content');
      
      const { updateKiroSpecTasks } = await import('../../.opencode/lib/kiro-utils');
      const result = updateKiroSpecTasks(TEST_FEATURE, '- [x] New content');
      
      expect(result).toBe(true);
      expect(fs.readFileSync(`${TEST_SPEC_DIR}/tasks.md`, 'utf-8')).toBe('- [x] New content');
    });

    test('returns false for non-existent feature', async () => {
      const { updateKiroSpecTasks } = await import('../../.opencode/lib/kiro-utils');
      const result = updateKiroSpecTasks('non-existent-feature', 'content');
      
      expect(result).toBe(false);
    });

    test('returns false when tasks.md does not exist', async () => {
      fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
      
      const { updateKiroSpecTasks } = await import('../../.opencode/lib/kiro-utils');
      const result = updateKiroSpecTasks(TEST_FEATURE, 'content');
      
      expect(result).toBe(false);
    });
  });
});
