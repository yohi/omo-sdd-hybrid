import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { validateKiroIntegration } from '../../.opencode/tools/sdd_validate_gap';

const TEST_DIR = path.join(process.cwd(), 'temp_test_kiro_gap');
const KIRO_DIR = path.join(TEST_DIR, '.kiro');

describe('validateKiroIntegration', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(KIRO_DIR, 'specs'), { recursive: true });
    process.env.SDD_KIRO_DIR = KIRO_DIR;
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    delete process.env.SDD_KIRO_DIR;
  });

  test('returns info when kiroSpec is missing', () => {
    const result = validateKiroIntegration();
    expect(result).toContain('INFO: kiroSpec が指定されていません');
  });

  test('returns warning when spec dir missing', () => {
    const result = validateKiroIntegration('missing-feature');
    expect(result).toContain('WARN: 仕様ディレクトリが見つかりません');
    expect(result).toContain('missing-feature');
  });

  test('rejects dangerous kiroSpec (path traversal)', () => {
    const result = validateKiroIntegration('../evil');
    expect(result).toContain('WARN: 不正な kiroSpec');
  });

  test('checks files and tasks progress', () => {
    const feature = 'test-feature';
    const specDir = path.join(KIRO_DIR, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });

    fs.writeFileSync(path.join(specDir, 'requirements.md'), '# Req');
    fs.writeFileSync(path.join(specDir, 'design.md'), '# Design');
    fs.writeFileSync(path.join(specDir, 'tasks.md'), `
# Tasks
- [x] Task 1
- [ ] Task 2
- [ ] Task 3
`);

    const result = validateKiroIntegration(feature);
    
    expect(result).toContain('[PASS] requirements.md');
    expect(result).toContain('[PASS] design.md');
    expect(result).toContain('[PASS] tasks.md');
    expect(result).toContain('[SKIP] spec.json (Optional)');
    expect(result).toContain('進捗: 1/3 (33%)');
  });

  test('handles missing required files', () => {
    const feature = 'incomplete-feature';
    const specDir = path.join(KIRO_DIR, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });

    const result = validateKiroIntegration(feature);
    
    expect(result).toContain('[FAIL] requirements.md (Not Found)');
    expect(result).toContain('[FAIL] tasks.md (Not Found)');
  });
  
  test('handles deep mode info', () => {
    const feature = 'deep-feature';
    const specDir = path.join(KIRO_DIR, 'specs', feature);
    fs.mkdirSync(specDir, { recursive: true });
    
    const result = validateKiroIntegration(feature, true);
    expect(result).toContain('[Deep Analysis]');
    expect(result).toContain('構造的・意味的ギャップ分析は現在開発中です');
  });
});
