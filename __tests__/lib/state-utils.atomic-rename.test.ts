import { describe, test, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { getStatePath, writeState, StateInput } from '../../.opencode/lib/state-utils';
import { withTempDir } from '../helpers/temp-dir';

const setupEnv = (tmpDir: string) => {
  process.env.SDD_STATE_DIR = tmpDir;
  process.env.SDD_TASKS_PATH = path.join(tmpDir, 'tasks.md');
  process.env.SDD_KIRO_DIR = path.join(tmpDir, '.kiro');
  process.env.SDD_TEST_MODE = 'true';
  process.env.SDD_GUARD_MODE = 'warn';
  fs.writeFileSync(process.env.SDD_TASKS_PATH, '* [ ] Task-1: Test Task (Scope: `src/**`)', 'utf-8');
};

describe('state-utils atomic rename', () => {
  const createSampleState = (id: string = 'test-task'): StateInput => ({
    version: 1,
    activeTaskId: id,
    activeTaskTitle: `Title for ${id}`,
    allowedScopes: ['src/**'],
    startedAt: new Date().toISOString(),
    startedBy: 'tester',
    validationAttempts: 0,
    role: null
  });

  test('writeState performs atomic rename and leaves no tmp file', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const state = createSampleState();
      const statePath = getStatePath();
      const pid = process.pid;
      const expectedTmpPath = `${statePath}.${pid}.tmp`;

      await writeState(state);

      expect(fs.existsSync(statePath)).toBe(true);
      const writtenState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(writtenState.activeTaskId).toBe(state.activeTaskId);

      expect(fs.existsSync(expectedTmpPath)).toBe(false);

      const files = fs.readdirSync(tmpDir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  test('multiple rapid writeState calls clean up all tmp files', async () => {
    await withTempDir(async (tmpDir) => {
      setupEnv(tmpDir);
      const iterations = 20;
      const statePath = getStatePath();
      const pid = process.pid;
      const expectedTmpPath = `${statePath}.${pid}.tmp`;

      for (let i = 0; i < iterations; i++) {
        const state = createSampleState(`task-${i}`);
        await writeState(state);
        
        const currentContent = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        expect(currentContent.activeTaskId).toBe(`task-${i}`);
        
        expect(fs.existsSync(expectedTmpPath)).toBe(false);
      }

      const files = fs.readdirSync(tmpDir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
      
      const finalState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(finalState.activeTaskId).toBe(`task-${iterations - 1}`);
    });
  });
});
