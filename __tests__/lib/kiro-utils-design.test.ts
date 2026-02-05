import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { analyzeDesignConsistency } from '../../.opencode/lib/kiro-utils';

const TEST_KIRO_DIR = '.kiro_test_design';

describe('kiro-utils design consistency', () => {
  beforeEach(() => {
    process.env.SDD_KIRO_DIR = TEST_KIRO_DIR;
    if (fs.existsSync(TEST_KIRO_DIR)) {
      fs.rmSync(TEST_KIRO_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(TEST_KIRO_DIR, 'specs'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_KIRO_DIR)) {
      fs.rmSync(TEST_KIRO_DIR, { recursive: true, force: true });
    }
    delete process.env.SDD_KIRO_DIR;
  });

  const createSpec = (featureName: string, files: string[]) => {
    const specDir = path.join(TEST_KIRO_DIR, 'specs', featureName);
    fs.mkdirSync(specDir, { recursive: true });
    files.forEach(file => {
      fs.writeFileSync(path.join(specDir, file), 'dummy content');
    });
  };

  it('should return missing_req if feature directory not found', () => {
    const result = analyzeDesignConsistency('non-existent');
    expect(result.status).toBe('missing_req');
    expect(result.issues).toContain("Feature 'non-existent' spec not found");
  });

  it('should return missing_req if requirements.md is missing', () => {
    createSpec('feat-A', ['design.md']);
    const result = analyzeDesignConsistency('feat-A');
    expect(result.status).toBe('missing_req');
    expect(result.issues).toContain('requirements.md not found');
    expect(result.issues).not.toContain('design.md not found');
  });

  it('should return missing_design if design.md is missing', () => {
    createSpec('feat-B', ['requirements.md']);
    const result = analyzeDesignConsistency('feat-B');
    expect(result.status).toBe('missing_design');
    expect(result.issues).toContain('design.md not found');
    expect(result.issues).not.toContain('requirements.md not found');
  });

  it('should return issues for both missing', () => {
    createSpec('feat-C', []);
    const result = analyzeDesignConsistency('feat-C');
    expect(result.status).toBe('missing_req'); // Precedence
    expect(result.issues).toContain('requirements.md not found');
    expect(result.issues).toContain('design.md not found');
  });

  it('should return ok if both exist', () => {
    createSpec('feat-D', ['requirements.md', 'design.md']);
    const result = analyzeDesignConsistency('feat-D');
    expect(result.status).toBe('ok');
    expect(result.issues).toEqual([]);
  });
});
