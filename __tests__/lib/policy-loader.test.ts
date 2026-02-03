import { describe, test, expect, beforeAll, afterAll, beforeEach, spyOn } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { logger } from '../../.opencode/lib/logger';

const TEST_POLICY_PATH = path.join(os.tmpdir(), `sdd-test-policy-${randomUUID()}.json`);

describe('policy-loader', () => {
  const originalEnv = process.env.SDD_POLICY_PATH;

  beforeAll(() => {
    process.env.SDD_POLICY_PATH = TEST_POLICY_PATH;
  });

  afterAll(() => {
    if (originalEnv) {
      process.env.SDD_POLICY_PATH = originalEnv;
    } else {
      delete process.env.SDD_POLICY_PATH;
    }
    if (fs.existsSync(TEST_POLICY_PATH)) {
      fs.unlinkSync(TEST_POLICY_PATH);
    }
  });

  beforeEach(async () => {
    // Reset the logged state before each test
    const mod = await import('../../.opencode/lib/policy-loader');
    if (mod._resetPolicyLogged) {
        mod._resetPolicyLogged();
    }
  });

  test('returns default policy when file does not exist', async () => {
    if (fs.existsSync(TEST_POLICY_PATH)) fs.unlinkSync(TEST_POLICY_PATH);
    const { loadPolicyConfig, DEFAULT_POLICY } = await import('../../.opencode/lib/policy-loader');
    
    const config = loadPolicyConfig();
    expect(config).toEqual(DEFAULT_POLICY);
  });

  test('loads custom policy from JSON', async () => {
    const customConfig = {
      alwaysAllow: ['custom-allowed/'],
      destructiveBash: ['rm -rf /']
    };
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify(customConfig));
    
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    
    const config = loadPolicyConfig();
    expect(config.alwaysAllow).toEqual(['custom-allowed/']);
    expect(config.destructiveBash).toEqual(['rm -rf /']);
  });

  test('falls back to default on invalid JSON', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, '{ invalid json }');
    
    const { loadPolicyConfig, DEFAULT_POLICY } = await import('../../.opencode/lib/policy-loader');
    const config = loadPolicyConfig();
    
    // Should warn and return default
    expect(config).toEqual(DEFAULT_POLICY);
  });

  test('falls back to default for missing keys', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['foo/'] }));
    
    const { loadPolicyConfig, DEFAULT_POLICY } = await import('../../.opencode/lib/policy-loader');
    const config = loadPolicyConfig();
    
    expect(config.alwaysAllow).toEqual(['foo/']);
    expect(config.destructiveBash).toEqual(DEFAULT_POLICY.destructiveBash);
  });

  // --- New Security Tests ---

  test('throws error for empty string in alwaysAllow', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: [''] }));
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    expect(() => loadPolicyConfig()).toThrow('E_POLICY_DANGEROUS_VALUE');
  });

  test('throws error for whitespace-only string', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['   '] }));
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    expect(() => loadPolicyConfig()).toThrow('E_POLICY_DANGEROUS_VALUE');
  });

  test('throws error for root directory (/)', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['/'] }));
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    expect(() => loadPolicyConfig()).toThrow('E_POLICY_DANGEROUS_VALUE');
  });

  test('throws error for current directory (.)', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['.'] }));
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    expect(() => loadPolicyConfig()).toThrow('E_POLICY_DANGEROUS_VALUE');
  });

  test('throws error for parent directory (..)', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['../parent'] }));
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    expect(() => loadPolicyConfig()).toThrow('E_POLICY_DANGEROUS_VALUE');
  });

  test('throws error for glob pattern (*)', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['src/*'] }));
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    expect(() => loadPolicyConfig()).toThrow('E_POLICY_DANGEROUS_VALUE');
  });

  test('throws error for recursive glob (**)', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['**'] }));
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    expect(() => loadPolicyConfig()).toThrow('E_POLICY_DANGEROUS_VALUE');
  });

  test('normalizes backslashes and trims whitespace', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['  windows\\path\\  '] }));
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    const config = loadPolicyConfig();
    expect(config.alwaysAllow).toEqual(['windows/path/']);
  });

  test('logs policy summary on first load', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['foo/'] }));
    const infoSpy = spyOn(logger, 'info');
    
    const { loadPolicyConfig } = await import('../../.opencode/lib/policy-loader');
    
    loadPolicyConfig();
    expect(infoSpy).toHaveBeenCalled();
    expect(infoSpy.mock.calls[0][0]).toContain('Loaded policy');
    
    infoSpy.mockClear();
    loadPolicyConfig(); // Second call should not log
    expect(infoSpy).not.toHaveBeenCalled();
    
    infoSpy.mockRestore();
  });
});
