import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { setupTestState, cleanupTestState } from '../helpers/test-harness';
import { readGuardModeState, getGuardModePath } from '../../.opencode/lib/state-utils';
import fs from 'fs';
import path from 'path';
import sddSetGuardMode from '../../.opencode/tools/sdd_set_guard_mode';

import { waitForFile } from '../helpers/test-harness';

describe('sdd_set_guard_mode', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    setupTestState();
    const guardPath = getGuardModePath();
    if (fs.existsSync(guardPath)) fs.unlinkSync(guardPath);
  });

  afterEach(() => {
    const guardPath = getGuardModePath();
    if (fs.existsSync(guardPath)) fs.unlinkSync(guardPath);
    cleanupTestState();
    process.env = originalEnv;
  });

  test('sets guard mode to warn', async () => {
    const result = await sddSetGuardMode.execute({ mode: 'warn' }, {} as any);
    expect(result).toContain("ガードモードを 'warn' に設定しました");

    const guardPath = getGuardModePath();
    await waitForFile(guardPath);

    const state = await readGuardModeState();
    if (!state) {
      // DEBUG LOGGING KEPT (BUT SHOULD BE FIXED BY WAITFORFILE)
      console.error(`[DEBUG] readGuardModeState returned null. Path: ${guardPath}`);
      if (fs.existsSync(guardPath)) {
        console.error(`[DEBUG] File content: ${fs.readFileSync(guardPath, 'utf-8')}`);
      } else {
        console.error('[DEBUG] File does not exist.');
        const dir = process.env.SDD_STATE_DIR;
        if (dir && fs.existsSync(dir)) {
             console.error(`[DEBUG] Dir content: ${fs.readdirSync(dir).join(', ')}`);
        }
      }
    }
    expect(state).not.toBeNull();
    expect(state?.mode).toBe('warn');
  });

  test('sets guard mode to block', async () => {
    const result = await sddSetGuardMode.execute({ mode: 'block' }, {} as any);
    expect(result).toContain("ガードモードを 'block' に設定しました");

    await waitForFile(getGuardModePath());
    const state = await readGuardModeState();
    expect(state).not.toBeNull();
    expect(state?.mode).toBe('block');
  });

  test('sets guard mode to disabled', async () => {
    const result = await sddSetGuardMode.execute({ mode: 'disabled' }, {} as any);
    expect(result).toContain("ガードモードを 'disabled' に設定しました");
    
    await waitForFile(getGuardModePath());
    const state = await readGuardModeState();
    expect(state).not.toBeNull();
    expect(state?.mode).toBe('disabled');
  });

  test('rejects invalid mode', async () => {
    const result = await sddSetGuardMode.execute({ mode: 'invalid' }, {} as any);
    expect(result).toContain('エラー: mode は "warn", "block" または "disabled" を指定してください');
  });
});
