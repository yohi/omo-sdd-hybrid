import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

let hasLoggedPolicy = false;

export interface PolicyConfig {
  alwaysAllow: string[];
  destructiveBash: string[];
}

export const DEFAULT_POLICY: PolicyConfig = {
  alwaysAllow: ['specs/', '.opencode/'],
  destructiveBash: []
};

export const _resetPolicyLogged = () => {
  hasLoggedPolicy = false;
};

export function getPolicyConfigPath(): string {
  return process.env.SDD_POLICY_PATH || '.opencode/policy.json';
}

export function loadPolicyConfig(): PolicyConfig {
  const configPath = getPolicyConfigPath();
  
  if (!fs.existsSync(configPath)) {
    if (!hasLoggedPolicy) {
      logger.debug(`[SDD] Loaded policy: alwaysAllow=${JSON.stringify(DEFAULT_POLICY.alwaysAllow)} (DEFAULT)`);
      hasLoggedPolicy = true;
    }
    return DEFAULT_POLICY;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(content);
    
    // We override arrays instead of merging to give user full control
    const alwaysAllowRaw = Array.isArray(userConfig.alwaysAllow) ? userConfig.alwaysAllow : DEFAULT_POLICY.alwaysAllow;
    
    // Validate and Normalize alwaysAllow
    const alwaysAllowNormalized = alwaysAllowRaw.map((entry: unknown) => {
      if (typeof entry !== 'string') {
        throw new Error(`E_POLICY_INVALID_TYPE: alwaysAllow entries must be strings`);
      }

      // Normalize: trim and unify separators
      const trimmed = entry.trim().replace(/\\/g, '/');

      // Validation: Empty check
      if (trimmed === '') {
        throw new Error(`E_POLICY_DANGEROUS_VALUE: alwaysAllow includes empty or whitespace-only value`);
      }

      // Validation: Glob check
      if (trimmed.includes('*')) {
        throw new Error(`E_POLICY_DANGEROUS_VALUE: alwaysAllow includes glob patterns ('${entry}'). Only simple prefixes are supported.`);
      }

      // Validation: Root check
      // Matches: "/", ".", "./", and patterns starting with "./"
      if (trimmed === '/' || trimmed === '.' || trimmed.startsWith('./')) {
        throw new Error(`E_POLICY_DANGEROUS_VALUE: alwaysAllow includes root directory match ('${entry}'). This effectively disables SDD.`);
      }

      // Validation: Parent directory traversal check
      // Check for ".." segments
      const parts = trimmed.split('/');
      if (parts.includes('..')) {
        throw new Error(`E_POLICY_DANGEROUS_VALUE: alwaysAllow includes parent directory traversal ('..'): "${entry}"`);
      }

      return trimmed;
    });

    const policy = {
      alwaysAllow: alwaysAllowNormalized,
      destructiveBash: Array.isArray(userConfig.destructiveBash) ? userConfig.destructiveBash : DEFAULT_POLICY.destructiveBash
    };

    if (!hasLoggedPolicy) {
      logger.debug(`[SDD] Loaded policy: alwaysAllow=${JSON.stringify(policy.alwaysAllow)}`);
      hasLoggedPolicy = true;
    }

    return policy;
  } catch (error) {
    let msg: string;
    if (typeof error === 'string') {
      msg = error;
    } else if (error !== null && typeof error === 'object' && 'message' in error) {
      msg = String((error as any).message);
    } else {
      msg = String(error);
    }

    // Rethrow explicit policy validation errors (Fail-Closed)
    if (msg.startsWith('E_POLICY_')) {
      throw error;
    }

    // Fallback for missing/corrupt config (Fail-Safe)
    logger.warn(`[SDD] Failed to load policy config from ${configPath}: ${msg}. Using defaults.`);
    if (!hasLoggedPolicy) {
      logger.debug(`[SDD] Loaded policy: alwaysAllow=${JSON.stringify(DEFAULT_POLICY.alwaysAllow)} (DEFAULT via fallback)`);
      hasLoggedPolicy = true;
    }
    return DEFAULT_POLICY;
  }
}
