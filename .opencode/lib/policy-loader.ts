import fs from 'fs';
import path from 'path';

export interface PolicyConfig {
  alwaysAllow: string[];
  destructiveBash: string[];
}

export const DEFAULT_POLICY: PolicyConfig = {
  alwaysAllow: ['specs/', '.opencode/'],
  destructiveBash: ['rm ', 'rm -', 'git push', 'reset --hard', 'git apply']
};

export function getPolicyConfigPath(): string {
  return process.env.SDD_POLICY_PATH || '.opencode/policy.json';
}

export function loadPolicyConfig(): PolicyConfig {
  const configPath = getPolicyConfigPath();
  
  if (!fs.existsSync(configPath)) {
    return DEFAULT_POLICY;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(content);
    
    // We override arrays instead of merging to give user full control (e.g. to remove a default restriction)
    // If they want to keep defaults, they should explicitly include them in their json
    return {
      alwaysAllow: Array.isArray(userConfig.alwaysAllow) ? userConfig.alwaysAllow : DEFAULT_POLICY.alwaysAllow,
      destructiveBash: Array.isArray(userConfig.destructiveBash) ? userConfig.destructiveBash : DEFAULT_POLICY.destructiveBash
    };
  } catch (error) {
    console.warn(`[SDD] Failed to load policy config from ${configPath}: ${(error as Error).message}. Using defaults.`);
    return DEFAULT_POLICY;
  }
}
