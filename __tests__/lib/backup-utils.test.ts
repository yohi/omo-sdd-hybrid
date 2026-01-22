import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';

const TEST_DIR = '.opencode/state/test-backup';
const TEST_FILE = `${TEST_DIR}/test.json`;

describe('backup-utils', () => {
  beforeEach(() => {
    // Clean up before test
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up after test
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('rotateBackup', () => {
    test('rotates existing file to .bak', async () => {
      const { rotateBackup } = await import('../../.opencode/lib/backup-utils');
      
      fs.writeFileSync(TEST_FILE, 'original');
      
      rotateBackup(TEST_FILE);
      
      expect(fs.existsSync(`${TEST_FILE}.bak`)).toBe(true);
      expect(fs.readFileSync(`${TEST_FILE}.bak`, 'utf-8')).toBe('original');
    });

    test('shifts existing backups correctly', async () => {
      const { rotateBackup } = await import('../../.opencode/lib/backup-utils');
      
      // Create initial file and existing backup
      fs.writeFileSync(TEST_FILE, 'v2');
      fs.writeFileSync(`${TEST_FILE}.bak`, 'v1');
      
      rotateBackup(TEST_FILE);
      
      expect(fs.existsSync(`${TEST_FILE}.bak`)).toBe(true);
      expect(fs.existsSync(`${TEST_FILE}.bak.1`)).toBe(true);
      expect(fs.readFileSync(`${TEST_FILE}.bak`, 'utf-8')).toBe('v2');
      expect(fs.readFileSync(`${TEST_FILE}.bak.1`, 'utf-8')).toBe('v1');
    });

    test('deletes oldest backup when exceeding generations', async () => {
      const { rotateBackup } = await import('../../.opencode/lib/backup-utils');
      
      // Create file with 3 existing backups (max generations = 3)
      fs.writeFileSync(TEST_FILE, 'v4');
      fs.writeFileSync(`${TEST_FILE}.bak`, 'v3');
      fs.writeFileSync(`${TEST_FILE}.bak.1`, 'v2');
      fs.writeFileSync(`${TEST_FILE}.bak.2`, 'v1');
      
      rotateBackup(TEST_FILE, 3);
      
      // v1 should be deleted, v2->v3 shifted
      expect(fs.existsSync(`${TEST_FILE}.bak`)).toBe(true);
      expect(fs.existsSync(`${TEST_FILE}.bak.1`)).toBe(true);
      expect(fs.existsSync(`${TEST_FILE}.bak.2`)).toBe(true);
      expect(fs.existsSync(`${TEST_FILE}.bak.3`)).toBe(false);
      
      expect(fs.readFileSync(`${TEST_FILE}.bak`, 'utf-8')).toBe('v4');
      expect(fs.readFileSync(`${TEST_FILE}.bak.1`, 'utf-8')).toBe('v3');
      expect(fs.readFileSync(`${TEST_FILE}.bak.2`, 'utf-8')).toBe('v2');
    });

    test('does nothing when file does not exist', async () => {
      const { rotateBackup } = await import('../../.opencode/lib/backup-utils');
      
      // Should not throw
      expect(() => rotateBackup(TEST_FILE)).not.toThrow();
      expect(fs.existsSync(`${TEST_FILE}.bak`)).toBe(false);
    });

    test('works with custom generations count', async () => {
      const { rotateBackup } = await import('../../.opencode/lib/backup-utils');
      
      // Create file with existing backups
      fs.writeFileSync(TEST_FILE, 'v3');
      fs.writeFileSync(`${TEST_FILE}.bak`, 'v2');
      fs.writeFileSync(`${TEST_FILE}.bak.1`, 'v1');
      
      // With generations = 2, .bak.1 should be deleted
      rotateBackup(TEST_FILE, 2);
      
      expect(fs.existsSync(`${TEST_FILE}.bak`)).toBe(true);
      expect(fs.existsSync(`${TEST_FILE}.bak.1`)).toBe(true);
      expect(fs.existsSync(`${TEST_FILE}.bak.2`)).toBe(false);
    });

    test('handles multiple rotations correctly', async () => {
      const { rotateBackup } = await import('../../.opencode/lib/backup-utils');
      
      // First write
      fs.writeFileSync(TEST_FILE, 'v1');
      rotateBackup(TEST_FILE);
      expect(fs.readFileSync(`${TEST_FILE}.bak`, 'utf-8')).toBe('v1');
      
      // Second write
      fs.writeFileSync(TEST_FILE, 'v2');
      rotateBackup(TEST_FILE);
      expect(fs.readFileSync(`${TEST_FILE}.bak`, 'utf-8')).toBe('v2');
      expect(fs.readFileSync(`${TEST_FILE}.bak.1`, 'utf-8')).toBe('v1');
      
      // Third write
      fs.writeFileSync(TEST_FILE, 'v3');
      rotateBackup(TEST_FILE);
      expect(fs.readFileSync(`${TEST_FILE}.bak`, 'utf-8')).toBe('v3');
      expect(fs.readFileSync(`${TEST_FILE}.bak.1`, 'utf-8')).toBe('v2');
      expect(fs.readFileSync(`${TEST_FILE}.bak.2`, 'utf-8')).toBe('v1');
    });
  });
});
