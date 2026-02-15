import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('sdd_ci_runner', () => {
  let tmpDir: string;
  let origCwd: string;
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-ci-test-'));
    origCwd = process.cwd();
    origEnv = { ...process.env };

    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.opencode', 'tools'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.opencode', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.kiro', 'specs', 'default'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'specs'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

    spawnSync('git', ['init'], { cwd: tmpDir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });
    spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir });

    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\n');

    copySourceFiles(tmpDir);

    const initialFile = path.join(tmpDir, 'README.md');
    fs.writeFileSync(initialFile, '# Test Project\n');
    spawnSync('git', ['add', '.'], { cwd: tmpDir });
    spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });
  });

  afterEach(() => {
    process.chdir(origCwd);
    Object.keys(process.env).forEach(k => {
      delete process.env[k];
    });
    Object.assign(process.env, origEnv);

    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function copySourceFiles(targetDir: string) {
    const realOpenCodeDir = path.join(origCwd, '.opencode');

    const runnerSrc = path.join(realOpenCodeDir, 'tools', 'sdd_ci_runner.ts');
    const runnerDst = path.join(targetDir, '.opencode', 'tools', 'sdd_ci_runner.ts');
    fs.copyFileSync(runnerSrc, runnerDst);

    const stubSrc = path.join(realOpenCodeDir, 'lib', 'plugin-stub.ts');
    const stubDst = path.join(targetDir, '.opencode', 'lib', 'plugin-stub.ts');
    fs.copyFileSync(stubSrc, stubDst);

    const tasksMdSrc = path.join(realOpenCodeDir, 'lib', 'tasks_markdown.ts');
    const tasksMdDst = path.join(targetDir, '.opencode', 'lib', 'tasks_markdown.ts');
    fs.copyFileSync(tasksMdSrc, tasksMdDst);

    const scopeResolverSrc = path.join(realOpenCodeDir, 'lib', 'scope-resolver.ts');
    const scopeResolverDst = path.join(targetDir, '.opencode', 'lib', 'scope-resolver.ts');
    fs.copyFileSync(scopeResolverSrc, scopeResolverDst);

    const globUtilsSrc = path.join(realOpenCodeDir, 'lib', 'glob-utils.ts');
    const globUtilsDst = path.join(targetDir, '.opencode', 'lib', 'glob-utils.ts');
    fs.copyFileSync(globUtilsSrc, globUtilsDst);

    const loggerSrc = path.join(realOpenCodeDir, 'lib', 'logger.ts');
    const loggerDst = path.join(targetDir, '.opencode', 'lib', 'logger.ts');
    fs.copyFileSync(loggerSrc, loggerDst);

    const realNodeModules = path.join(origCwd, 'node_modules');
    const nodeModulesLink = path.join(targetDir, 'node_modules');
    if (!fs.existsSync(nodeModulesLink)) {
      fs.symlinkSync(realNodeModules, nodeModulesLink, 'dir');
    }

    const realOpenCodeNodeModules = path.join(origCwd, '.opencode', 'node_modules');
    const opencodeNodeModulesLink = path.join(targetDir, '.opencode', 'node_modules');
    if (fs.existsSync(realOpenCodeNodeModules) && !fs.existsSync(opencodeNodeModulesLink)) {
      fs.symlinkSync(realOpenCodeNodeModules, opencodeNodeModulesLink, 'dir');
    }
  }

  async function runCiValidator(args: string[] = []): Promise<{ code: number; output: string }> {
    const env = { ...origEnv };
    // CI環境変数がテストに干渉しないように削除
    delete env.GITHUB_BASE_REF;
    delete env.GITHUB_HEAD_REF;
    delete env.GITHUB_REF_NAME;
    
    const result = spawnSync('bun', ['run', 'tools/sdd_ci_runner.ts', ...args], {
      cwd: path.join(tmpDir, '.opencode'),
      encoding: 'utf-8',
      env: {
        ...env,
        SDD_CI_MODE: 'true',
        NODE_ENV: 'test',
      },
    });

    if (result.status !== 0) {
      console.error('[DEBUG] sdd_ci_runner failed');
      console.error('STDOUT:', result.stdout);
      console.error('STDERR:', result.stderr);
    }

    return {
      code: result.status ?? 1,
      output: (result.stdout || '') + (result.stderr || ''),
    };
  }

  function writeScope(content: string, feature = 'default') {
    const scopeDir = path.join(tmpDir, '.kiro', 'specs', feature);
    fs.mkdirSync(scopeDir, { recursive: true });
    fs.writeFileSync(path.join(scopeDir, 'scope.md'), content);
  }

  function commitChange(filePath: string, content: string, message: string) {
    const fullPath = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    spawnSync('git', ['add', '.'], { cwd: tmpDir });
    spawnSync('git', ['commit', '-m', message], { cwd: tmpDir });
  }

  test('許可Scope内の変更のみ: PASS', async () => {
    writeScope('* [ ] Task-1: Auth (Scope: `src/auth/**`)');
    commitChange('src/auth/login.ts', 'export function login() {}', 'Add auth');

    const res = await runCiValidator();
    expect(res.code).toBe(0);
    expect(res.output).toContain('Scope Guard: OK');
  });

  test('Scope外変更を含む: FAIL（Fail-Closed）', async () => {
    writeScope('* [ ] Task-1: Auth (Scope: `src/auth/**`)');
    commitChange('src/database/db.ts', 'export const db = {};', 'Add db');

    const res = await runCiValidator();
    expect(res.code).toBe(1);
    expect(res.output).toContain('SDD Scope Guard Violation');
    expect(res.output).toContain('src/database/db.ts');
  });

  test('specs/** と .opencode/** の変更: PASS（Always Allow, 非strict）', async () => {
    writeScope('* [ ] Task-1: Core (Scope: `src/core/**`)');
    commitChange('specs/design.md', '# Design', 'Add design doc');
    commitChange('.opencode/lib/util.ts', 'export {}', 'Add util');

    const res = await runCiValidator();
    expect(res.code).toBe(0);
    expect(res.output).toContain('Scope Guard: OK');
  });

  test('--strict では Always Allow が無効になり、specs/** でもScope外なら FAIL', async () => {
    writeScope('* [ ] Task-1: Auth (Scope: `src/auth/**`)');
    commitChange('specs/design.md', '# Design', 'Add design');

    const res = await runCiValidator(['--strict']);
    expect(res.code).toBe(1);
    expect(res.output).toContain('SDD Scope Guard Violation');
    expect(res.output).toContain('specs/design.md');
  });

  test('CIモードで未追跡ファイルがある場合: FAIL', async () => {
    writeScope('* [ ] Task-1: Auth (Scope: `src/auth/**`)');
    commitChange('src/auth/login.ts', 'export {}', 'Add auth');

    fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'test');

    const res = await runCiValidator();
    expect(res.code).toBe(1);
    expect(res.output).toContain('未追跡ファイルが検出されました');
    expect(res.output).toContain('untracked.txt');
  });

  test('CIモードで未追跡ファイルがあり --allow-untracked 指定: PASS', async () => {
    writeScope('* [ ] Task-1: Auth (Scope: `src/auth/**`)');
    commitChange('src/auth/login.ts', 'export {}', 'Add auth');

    fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'test');

    const res = await runCiValidator(['--allow-untracked']);
    expect(res.code).toBe(0);
    expect(res.output).toContain('未追跡ファイルを許可しました');
  });

  test('複数Scopeのいずれかにマッチすれば PASS', async () => {
    writeScope('* [ ] Task-1: Multi (Scope: `src/auth/**`, `src/db/**`)');
    commitChange('src/auth/login.ts', 'export {}', 'Auth');
    commitChange('src/db/schema.ts', 'export {}', 'DB');

    const res = await runCiValidator();
    expect(res.code).toBe(0);
    expect(res.output).toContain('Scope Guard: OK');
  });

  test('scope.md に構文エラーがある場合: FAIL', async () => {
    writeScope('* [ ] Broken Task without scope\n* Invalid line format');
    commitChange('src/auth/login.ts', 'export {}', 'Add auth');

    const res = await runCiValidator();
    expect(res.code).toBe(1);
    expect(res.output).toContain('scope.md Validation Failed');
  });

  test('scope.md が存在しない場合: FAIL', async () => {
    fs.rmSync(path.join(tmpDir, '.kiro', 'specs', 'default', 'scope.md'), { force: true });
    commitChange('src/auth/login.ts', 'export {}', 'Add auth');

    const res = await runCiValidator();
    expect(res.code).toBe(1);
    expect(res.output).toContain('Scope definition not found');
  });

  test('初回コミット（HEAD~1 なし）でも動作する', async () => {
    const testOrigCwd = process.cwd();
    const newTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-ci-initial-'));
    fs.mkdirSync(path.join(newTmpDir, '.opencode', 'tools'), { recursive: true });
    fs.mkdirSync(path.join(newTmpDir, '.opencode', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(newTmpDir, '.kiro', 'specs', 'default'), { recursive: true });
    fs.mkdirSync(path.join(newTmpDir, 'src', 'auth'), { recursive: true });

    spawnSync('git', ['init'], { cwd: newTmpDir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: newTmpDir });
    spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: newTmpDir });

    const realOpenCodeDir = path.join(testOrigCwd, '.opencode');
    const runnerSrc = path.join(realOpenCodeDir, 'tools', 'sdd_ci_runner.ts');
    fs.copyFileSync(runnerSrc, path.join(newTmpDir, '.opencode', 'tools', 'sdd_ci_runner.ts'));
    const stubSrc = path.join(realOpenCodeDir, 'lib', 'plugin-stub.ts');
    fs.copyFileSync(stubSrc, path.join(newTmpDir, '.opencode', 'lib', 'plugin-stub.ts'));
    const tasksMdSrc = path.join(realOpenCodeDir, 'lib', 'tasks_markdown.ts');
    fs.copyFileSync(tasksMdSrc, path.join(newTmpDir, '.opencode', 'lib', 'tasks_markdown.ts'));
    const scopeResolverSrc = path.join(realOpenCodeDir, 'lib', 'scope-resolver.ts');
    fs.copyFileSync(scopeResolverSrc, path.join(newTmpDir, '.opencode', 'lib', 'scope-resolver.ts'));
    const globUtilsSrc = path.join(realOpenCodeDir, 'lib', 'glob-utils.ts');
    fs.copyFileSync(globUtilsSrc, path.join(newTmpDir, '.opencode', 'lib', 'glob-utils.ts'));

    const loggerSrc = path.join(realOpenCodeDir, 'lib', 'logger.ts');
    fs.copyFileSync(loggerSrc, path.join(newTmpDir, '.opencode', 'lib', 'logger.ts'));

    fs.writeFileSync(path.join(newTmpDir, '.kiro', 'specs', 'default', 'scope.md'), '* [ ] Task-1: Auth (Scope: `src/auth/**`, `.opencode/**`, `specs/**`)');
    fs.writeFileSync(path.join(newTmpDir, 'src', 'auth', 'login.ts'), 'export {}');

    spawnSync('git', ['add', '.'], { cwd: newTmpDir });
    spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: newTmpDir });

    const realNodeModules = path.join(testOrigCwd, 'node_modules');
    fs.symlinkSync(realNodeModules, path.join(newTmpDir, 'node_modules'), 'dir');
    const realOpenCodeNodeModules = path.join(testOrigCwd, '.opencode', 'node_modules');
    if (fs.existsSync(realOpenCodeNodeModules)) {
      fs.symlinkSync(realOpenCodeNodeModules, path.join(newTmpDir, '.opencode', 'node_modules'), 'dir');
    }

    const result = spawnSync('bun', ['run', 'tools/sdd_ci_runner.ts', '--allow-untracked'], {
      cwd: path.join(newTmpDir, '.opencode'),
      encoding: 'utf-8',
      env: { ...origEnv, SDD_CI_MODE: 'true', NODE_ENV: 'test' },
    });

    expect(result.status).toBe(0);

    fs.rmSync(newTmpDir, { recursive: true, force: true });
  });

  test('Globパターン（ワイルドカード）が正しく動作する', async () => {
    writeScope('* [ ] Task-1: Components (Scope: `src/components/**/*.tsx`)');
    commitChange('src/components/Button.tsx', 'export {}', 'Add Button');
    commitChange('src/components/Input.tsx', 'export {}', 'Add Input');

    const res = await runCiValidator();
    expect(res.code).toBe(0);
  });

  test('Globパターンに一致しないファイルは FAIL', async () => {
    writeScope('* [ ] Task-1: Components (Scope: `src/components/**/*.tsx`)');
    commitChange('src/components/util.ts', 'export {}', 'Add util (not .tsx)');

    const res = await runCiValidator();
    expect(res.code).toBe(1);
    expect(res.output).toContain('src/components/util.ts');
  });

  test('複数タスクのScope統合が正しく動作する', async () => {
    writeScope(`* [ ] Task-1: Auth (Scope: \`src/auth/**\`)
* [ ] Task-2: DB (Scope: \`src/db/**\`)`);
    commitChange('src/auth/login.ts', 'export {}', 'Auth');
    commitChange('src/db/schema.ts', 'export {}', 'DB');

    const res = await runCiValidator();
    expect(res.code).toBe(0);
  });

  test('変更ファイルが存在しない場合でもエラーにならない', async () => {
    writeScope('* [ ] Task-1: Auth (Scope: `src/auth/**`)');
    spawnSync('git', ['add', '.kiro'], { cwd: tmpDir });
    spawnSync('git', ['commit', '-m', 'Add scope'], { cwd: tmpDir });

    const res = await runCiValidator();
    expect(res.code).toBe(0);
  });
});
