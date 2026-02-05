import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

const TOOL_PATH = '../../.opencode/tools/sdd_kiro';

describe('sdd_kiro path traversal check', () => {
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
    // Create a file outside the project root (not really outside in test env but simulated by passing relative path with ..)
    // We expect the tool to resolve relative path against process.cwd(). 
    // Since we cannot easily change process.cwd() in bun test without side effects, 
    // we test if it rejects ".." which would go outside if we were at root.
    
    // However, the check I implemented is:
    // const rel = path.relative(process.cwd(), resolvedPromptFile);
    // if (rel.startsWith('..') || path.isAbsolute(rel)) ...
    
    // So passing "../foo.md" should fail.
    const result = await runTool({ command: 'requirements', feature, promptFile: '../foo.md' });
    expect(result).toContain('エラー: 不正なファイルパスです。プロジェクトルート内のファイルを指定してください');
  });
  
  it('promptFile with valid path should be accepted', async () => {
     // Create a dummy file in cwd
     const validFile = 'valid-prompt.md';
     fs.writeFileSync(validFile, 'valid prompt content');
     
     const feature = 'valid-feature';
     const result = await runTool({ command: 'requirements', feature, promptFile: validFile });
     
     // Clean up
     fs.unlinkSync(validFile);
     
     // Should fail with feature not found or success creating requirements, but NOT path traversal error
     // Since requirements command will try to create directory inside .kiro/specs/... which is fine.
     // If promptFile was rejected, it would return error. 
     // If accepted, it proceeds to create requirements.md.
     expect(result).not.toContain('エラー: 不正なファイルパスです');
  });

});
