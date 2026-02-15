import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'path';
import fs from 'fs';
import { normalizePath, validatePath, PathValidationError } from '../../.opencode/lib/path-validator';
import { createTempDir, cleanupTempDir } from '../helpers/temp-dir';

describe('path-validator', () => {
  describe('normalizePath', () => {
    it('should normalize paths with backslashes', () => {
      expect(normalizePath('a\\b\\c')).toBe('a/b/c');
    });

    it('should normalize paths with redundant slashes', () => {
      expect(normalizePath('a//b///c')).toBe('a/b/c');
    });

    it('should resolve .. and . segments', () => {
      expect(normalizePath('a/b/../c')).toBe('a/c');
      expect(normalizePath('a/./b')).toBe('a/b');
    });
  });

  describe('validatePath', () => {
    let tempDir: string;
    let baseDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
      baseDir = path.join(tempDir, 'base');
      fs.mkdirSync(baseDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should return normalized absolute path for valid paths inside baseDir', () => {
      const target = path.join(baseDir, 'file.txt');
      fs.writeFileSync(target, 'hello');
      
      const result = validatePath(target, baseDir);
      expect(result).toBe(normalizePath(fs.realpathSync(target)));
    });

    it('should handle non-existent paths within baseDir', () => {
      const target = path.join(baseDir, 'new-file.txt');
      // ファイルは存在しないが、親ディレクトリはベースディレクトリ内
      const result = validatePath(target, baseDir);
      expect(result).toBe(normalizePath(path.resolve(target)));
    });

    it('should throw PathValidationError for null bytes', () => {
      expect(() => {
        validatePath('file\0.txt', baseDir);
      }).toThrow(/E_INVALID_PATH/);
    });

    it('should throw PathValidationError for path traversal using ..', () => {
      const target = path.join(baseDir, '../outside.txt');
      expect(() => {
        validatePath(target, baseDir);
      }).toThrow(/E_PATH_TRAVERSAL/);
    });

    it('should throw PathValidationError for absolute paths outside baseDir', () => {
      const outsideDir = path.join(tempDir, 'outside');
      fs.mkdirSync(outsideDir);
      const target = path.join(outsideDir, 'secret.txt');
      
      expect(() => {
        validatePath(target, baseDir);
      }).toThrow(/E_PATH_TRAVERSAL/);
    });

    it('should handle symlinks pointing inside baseDir', () => {
      const target = path.join(baseDir, 'file.txt');
      fs.writeFileSync(target, 'hello');
      
      const link = path.join(baseDir, 'link.txt');
      fs.symlinkSync(target, link);
      
      const result = validatePath(link, baseDir);
      expect(result).toBe(normalizePath(fs.realpathSync(target)));
    });

    it('should throw PathValidationError for symlinks pointing outside baseDir', () => {
      const outsideFile = path.join(tempDir, 'outside.txt');
      fs.writeFileSync(outsideFile, 'secret');
      
      const link = path.join(baseDir, 'malicious-link.txt');
      fs.symlinkSync(outsideFile, link);
      
      expect(() => {
        validatePath(link, baseDir);
      }).toThrow(/E_PATH_TRAVERSAL/);
    });

    it('should handle symlinks in baseDir path itself', () => {
      const realBase = path.join(tempDir, 'real-base');
      fs.mkdirSync(realBase);
      const linkBase = path.join(tempDir, 'link-base');
      fs.symlinkSync(realBase, linkBase);
      
      const target = path.join(realBase, 'file.txt');
      fs.writeFileSync(target, 'hello');
      
      // linkBase を baseDir として渡しても、実体である realBase 内のファイルは許可されるべき
      const result = validatePath(target, linkBase);
      expect(result).toBe(normalizePath(fs.realpathSync(target)));
    });
  });
});
