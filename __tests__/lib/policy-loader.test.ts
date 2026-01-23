import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

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
    
    expect(config).toEqual(DEFAULT_POLICY);
  });

  test('falls back to default for missing keys', async () => {
    fs.writeFileSync(TEST_POLICY_PATH, JSON.stringify({ alwaysAllow: ['foo/'] }));
    
    const { loadPolicyConfig, DEFAULT_POLICY } = await import('../../.opencode/lib/policy-loader');
    const config = loadPolicyConfig();
    
    expect(config.alwaysAllow).toEqual(['foo/']);
    expect(config.destructiveBash).toEqual(DEFAULT_POLICY.destructiveBash);
  });
});
