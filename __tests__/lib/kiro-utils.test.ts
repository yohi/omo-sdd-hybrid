import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';

describe('kiro-utils', () => {
  const KIRO_DIR = '.kiro';
  const SPECS_DIR = `${KIRO_DIR}/specs`;
  const TEST_FEATURE = 'test-feature';
  const TEST_SPEC_DIR = `${SPECS_DIR}/${TEST_FEATURE}`;

  beforeEach(() => {
    if (fs.existsSync(KIRO_DIR)) {
      fs.rmSync(KIRO_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(KIRO_DIR)) {
      fs.rmSync(KIRO_DIR, { recursive: true });
    }
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
});
