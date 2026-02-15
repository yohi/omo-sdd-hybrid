import { describe, it, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { createTempDir, cleanupTempDir, withTempDir } from './temp-dir';

describe('temp-dir helper', () => {
  it('createTempDir should create a unique directory', () => {
    const dir = createTempDir();
    try {
      expect(fs.existsSync(dir)).toBe(true);
      expect(path.basename(dir)).toStartWith('omo-sdd-');
    } finally {
      cleanupTempDir(dir);
    }
  });

  it('cleanupTempDir should remove the directory', () => {
    const dir = createTempDir();
    expect(fs.existsSync(dir)).toBe(true);
    cleanupTempDir(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('withTempDir should provide a temp dir and clean up automatically', () => {
    let capturedDir = '';
    const result = withTempDir((dir) => {
      capturedDir = dir;
      expect(fs.existsSync(dir)).toBe(true);
      return 'success';
    });

    expect(result).toBe('success');
    expect(fs.existsSync(capturedDir)).toBe(false);
  });

  it('withTempDir should clean up even if callback throws', () => {
    let capturedDir = '';
    try {
      withTempDir((dir) => {
        capturedDir = dir;
        throw new Error('test error');
      });
    } catch (e) {
      // ignore
    }

    expect(capturedDir).not.toBe('');
    expect(fs.existsSync(capturedDir)).toBe(false);
  });
});
