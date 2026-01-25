import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import syncTool from '../../.opencode/tools/sdd_sync_kiro';
import validateTool from '../../.opencode/tools/sdd_validate_gap';

describe('E2E: Kiro Flow', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = setupTestState();
    // Setup Kiro Spec
    const kiroDir = path.join(stateDir, '.kiro/specs/test-feat');
    fs.mkdirSync(kiroDir, { recursive: true });
    fs.writeFileSync(path.join(kiroDir, 'tasks.md'), '* [ ] TEST-1: Mock Task');

    // FIX: Override SDD_TASKS_PATH to match the new spec (specs/tasks.md)
    process.env.SDD_TASKS_PATH = path.join(stateDir, 'specs/tasks.md');
  });

  afterEach(() => {
    cleanupTestState();
    mock.restore();
  });

  it('should sync tasks to specs/tasks.md and warn on missing API key', async () => {
    // 1. Sync
    await syncTool.execute({});
    
    // VERIFICATION 1: Default path check
    // Expectation: sync tool should write to specs/tasks.md
    // Current Bug: it writes to tasks.md
    const expectedPath = path.join(stateDir, 'specs/tasks.md');
    // We assert true to be true, but we want to fail if file is missing
    const exists = fs.existsSync(expectedPath);
    if (!exists) {
        console.log('DEBUG: specs/tasks.md not found. Checking tasks.md...');
        if (fs.existsSync(path.join(stateDir, 'tasks.md'))) {
            console.log('DEBUG: Found tasks.md instead!');
        }
    }
    expect(exists).toBe(true); 

    // 2. Validate Gap (Deep)
    // Mock Fetch for Embeddings
    global.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ data: [] }))));
    
    // Unset API Key just in case
    delete process.env.SDD_EMBEDDINGS_API_KEY;

    const validateOutput = await validateTool.execute({ deep: true, taskId: 'TEST-1' });
    
    // VERIFICATION 2: Warning check
    expect(validateOutput).toContain('WARN: Embeddings API Key not found');
  });
});
