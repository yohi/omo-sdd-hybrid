import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { getSteeringDir, listSteeringDocs, updateSteeringDoc } from '../../.opencode/lib/kiro-utils';

const TEST_KIRO_DIR = '.kiro_test_utils';

describe('kiro-utils steering', () => {
  beforeEach(() => {
    process.env.SDD_KIRO_DIR = TEST_KIRO_DIR;
    if (fs.existsSync(TEST_KIRO_DIR)) {
      fs.rmSync(TEST_KIRO_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_KIRO_DIR)) {
      fs.rmSync(TEST_KIRO_DIR, { recursive: true, force: true });
    }
    delete process.env.SDD_KIRO_DIR;
  });

  it('should return correct steering directory', () => {
    expect(getSteeringDir()).toBe(path.join(TEST_KIRO_DIR, 'steering'));
  });

  it('should list steering docs (empty)', () => {
    expect(listSteeringDocs()).toEqual([]);
  });

  it('should update and list steering docs', () => {
    const success = updateSteeringDoc('tech-stack', '# Tech Stack');
    expect(success).toBe(true);

    const docs = listSteeringDocs();
    expect(docs).toContain('tech-stack.md');

    const content = fs.readFileSync(path.join(TEST_KIRO_DIR, 'steering', 'tech-stack.md'), 'utf-8');
    expect(content).toBe('# Tech Stack');
  });

  it('should create directory if not exists', () => {
     updateSteeringDoc('new-doc', 'content');
     expect(fs.existsSync(path.join(TEST_KIRO_DIR, 'steering'))).toBe(true);
  });
  
  it('should reject invalid names', () => {
      expect(updateSteeringDoc('../evil', 'content')).toBe(false);
      expect(updateSteeringDoc('/abs/path', 'content')).toBe(false);
      expect(updateSteeringDoc('sub/dir', 'content')).toBe(false);
  });
  
  it('should auto-append .md extension', () => {
      updateSteeringDoc('no-ext', 'content');
      expect(fs.existsSync(path.join(TEST_KIRO_DIR, 'steering', 'no-ext.md'))).toBe(true);
  });
});
