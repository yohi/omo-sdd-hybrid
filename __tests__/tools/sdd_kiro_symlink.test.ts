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
  
  it.todo('promptFile resolving to outside project root via realpath should be rejected');
});
