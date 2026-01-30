import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const projectRoot = process.cwd();
const opencodeDir = path.join(projectRoot, '.opencode');

// Ensure .opencode directory exists
if (!fs.existsSync(opencodeDir)) {
  console.error('Error: .opencode directory not found');
  process.exit(1);
}

console.log('Running SDD CI Validation...');

// Execute the runner inside .opencode context to resolve dependencies
const result = spawnSync('bun', ['run', 'tools/sdd_ci_runner.ts'], {
  cwd: opencodeDir,
  stdio: 'inherit',
  env: { 
    ...process.env, 
  }
});

if (result.error) {
  console.error('Failed to start validator:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
