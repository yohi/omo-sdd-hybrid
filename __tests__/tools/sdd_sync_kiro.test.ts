import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';

describe('sdd_sync_kiro', () => {
  let KIRO_DIR: string;
  let SPECS_DIR: string;
  let TASKS_PATH: string;
  const TEST_FEATURE = 'test-feature';
  let TEST_SPEC_DIR: string;

  beforeEach(() => {
    setupTestState();
    KIRO_DIR = process.env.SDD_KIRO_DIR!;
    SPECS_DIR = `${KIRO_DIR}/specs`;
    TASKS_PATH = process.env.SDD_TASKS_PATH!;
    TEST_SPEC_DIR = `${SPECS_DIR}/${TEST_FEATURE}`;
  });

  afterEach(async () => {
    cleanupTestState();
  });

  test('returns info when root tasks.md does not exist and no kiro specs', async () => {
    const sddSyncKiro = await import('../../.opencode/tools/sdd_sync_kiro');
    const result = await sddSyncKiro.default.execute({}, {} as any);
    
    expect(result).toContain('情報');
    expect(result).toContain('Kiro仕様が見つかりません');
  });

  test('returns info when no kiro specs exist', async () => {
    fs.writeFileSync(TASKS_PATH, '* [ ] Task-1: Test (Scope: `src/*`)');
    
    const sddSyncKiro = await import('../../.opencode/tools/sdd_sync_kiro');
    const result = await sddSyncKiro.default.execute({}, {} as any);
    
    expect(result).toContain('情報');
    expect(result).toContain('Kiro仕様が見つかりません');
  });

  test('syncs status from root to kiro (Root→Kiro)', async () => {
    fs.writeFileSync(TASKS_PATH, '* [x] Task-1: テストタスク (Scope: `src/*`)');
    
    fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
    fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '- [ ] Task-1: テストタスク');
    
    const sddSyncKiro = await import('../../.opencode/tools/sdd_sync_kiro');
    const result = await sddSyncKiro.default.execute({}, {} as any);
    
    expect(result).toContain('[SYNC]');
    expect(result).toContain('Task-1');
    expect(result).toContain('DONE');
    
    const kiroContent = fs.readFileSync(`${TEST_SPEC_DIR}/tasks.md`, 'utf-8');
    expect(kiroContent).toContain('[x]');
  });

  test('imports new tasks from kiro to root (Kiro→Root)', async () => {
    fs.writeFileSync(TASKS_PATH, '# Tasks\n');
    
    fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
    fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, '- [ ] NewTask-1: 新規タスク');
    
    const sddSyncKiro = await import('../../.opencode/tools/sdd_sync_kiro');
    const result = await sddSyncKiro.default.execute({}, {} as any);
    
    expect(result).toContain('[IMPORT]');
    expect(result).toContain('NewTask-1');
    
    const rootContent = fs.readFileSync(TASKS_PATH, 'utf-8');
    expect(rootContent).toContain('NewTask-1');
    expect(rootContent).toContain(`Scope: \`${TEST_FEATURE}\``);
  });

  test('handles multiple features', async () => {
    fs.writeFileSync(TASKS_PATH, '* [x] FeatureA-1: タスクA (Scope: `src/*`)');
    
    fs.mkdirSync(`${SPECS_DIR}/feature-a`, { recursive: true });
    fs.writeFileSync(`${SPECS_DIR}/feature-a/tasks.md`, '- [ ] FeatureA-1: タスクA');
    
    fs.mkdirSync(`${SPECS_DIR}/feature-b`, { recursive: true });
    fs.writeFileSync(`${SPECS_DIR}/feature-b/tasks.md`, '- [ ] FeatureB-1: 新規タスクB');
    
    const sddSyncKiro = await import('../../.opencode/tools/sdd_sync_kiro');
    const result = await sddSyncKiro.default.execute({}, {} as any);
    
    expect(result).toContain('feature-a');
    expect(result).toContain('feature-b');
    expect(result).toContain('[SYNC]');
    expect(result).toContain('[IMPORT]');
  });

  test('skips lines without task ID', async () => {
    fs.writeFileSync(TASKS_PATH, '# Tasks\n');
    
    fs.mkdirSync(TEST_SPEC_DIR, { recursive: true });
    fs.writeFileSync(`${TEST_SPEC_DIR}/tasks.md`, `- [ ] IDなしタスク
- [ ] Valid-1: 有効なタスク`);
    
    const sddSyncKiro = await import('../../.opencode/tools/sdd_sync_kiro');
    const result = await sddSyncKiro.default.execute({}, {} as any);
    
    const rootContent = fs.readFileSync(TASKS_PATH, 'utf-8');
    expect(rootContent).toContain('Valid-1');
    expect(rootContent).not.toContain('IDなしタスク');
  });
});
