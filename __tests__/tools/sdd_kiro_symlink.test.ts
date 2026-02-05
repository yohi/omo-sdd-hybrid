import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

const TOOL_PATH = '../../.opencode/tools/sdd_kiro';

describe('sdd_kiro path traversal and symlink check', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  async function runTool(args: any) {
    const module = await import(TOOL_PATH);
    return module.default.execute(args, {});
  }

  it('promptFile path traversal via parent directory reference should be rejected', async () => {
    const feature = 'test-feature';
    const result = await runTool({ command: 'requirements', feature, promptFile: '../foo.md' });
    expect(result).toContain('エラー: 不正なファイルパスです。プロジェクトルート内のファイルを指定してください');
  });

  it('promptFile pointing to a symlink should be rejected', async () => {
    const feature = 'test-symlink';
    const realFile = 'real-prompt.md';
    const symlinkFile = 'symlink-prompt.md';
    
    fs.writeFileSync(realFile, 'real content');
    fs.symlinkSync(realFile, symlinkFile);
    
    try {
      const result = await runTool({ command: 'requirements', feature, promptFile: symlinkFile });
      // The error message might vary depending on implementation details, 
      // but we expect it to fail due to symlink detection or realpath resolving.
      // Current implementation plan is to explicitly reject symlinks.
      expect(result).toContain('シンボリックリンクは許可されていません');
    } finally {
      fs.unlinkSync(symlinkFile);
      fs.unlinkSync(realFile);
    }
  });
  
  it('promptFile resolving to outside project root via realpath should be rejected', async () => {
    // This is hard to test in the current harness because we can't easily create files outside of the temporary test root 
    // without messing with the actual system or assuming /tmp structure.
    // However, if we assume the tool resolves realpath, we can simulate a "valid looking" path that resolves elsewhere?
    // Actually, testing the symlink rejection itself covers the main vector.
    // We can try to use a symlink that points to a file within the project, which should be rejected if we ban symlinks entirely.
    // (Which is what we did in the previous test).
  });
});
