import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';

const STATE_DIR = '.opencode/state';
const STATE_PATH = `${STATE_DIR}/current_context.json`;

describe('state-utils', () => {
  beforeEach(() => {
    if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  });

  describe('writeState and readState', () => {
    test('writes and reads state correctly', async () => {
      const { writeState, readState } = await import('../../.opencode/lib/state-utils');
      
      const state = {
        version: 1,
        activeTaskId: 'Task-1',
        activeTaskTitle: 'Test Task',
        allowedScopes: ['src/auth/**'],
        startedAt: new Date().toISOString(),
        startedBy: 'test',
        validationAttempts: 0
      };
      
      await writeState(state);
      
      const result = readState();
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.state.activeTaskId).toBe('Task-1');
        expect(result.state.allowedScopes).toEqual(['src/auth/**']);
      }
    });

    test('returns not_found when state file does not exist', async () => {
      const { readState } = await import('../../.opencode/lib/state-utils');
      
      const result = readState();
      expect(result.status).toBe('not_found');
    });

    test('returns corrupted for invalid JSON', async () => {
      const { readState } = await import('../../.opencode/lib/state-utils');
      
      if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_PATH, '{ invalid json');
      
      const result = readState();
      expect(result.status).toBe('corrupted');
    });

    test('returns corrupted for missing required fields', async () => {
      const { readState } = await import('../../.opencode/lib/state-utils');
      
      if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_PATH, JSON.stringify({ version: 1 }));
      
      const result = readState();
      expect(result.status).toBe('corrupted');
    });
  });

  describe('clearState', () => {
    test('deletes state file', async () => {
      const { writeState, clearState, readState } = await import('../../.opencode/lib/state-utils');
      
      const state = {
        version: 1,
        activeTaskId: 'Task-1',
        activeTaskTitle: 'Test',
        allowedScopes: ['src/**'],
        startedAt: new Date().toISOString(),
        startedBy: 'test',
        validationAttempts: 0
      };
      
      await writeState(state);
      expect(fs.existsSync(STATE_PATH)).toBe(true);
      
      clearState();
      expect(fs.existsSync(STATE_PATH)).toBe(false);
      
      const result = readState();
      expect(result.status).toBe('not_found');
    });

    test('does not throw when file does not exist', async () => {
      const { clearState } = await import('../../.opencode/lib/state-utils');
      
      expect(() => clearState()).not.toThrow();
    });
  });
});
