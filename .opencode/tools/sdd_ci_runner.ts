import { tool } from '../lib/plugin-stub';
import { parseSddTasks } from '../lib/tasks_markdown';
import { matchesScope } from '../lib/glob-utils';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CI環境での検証を行うランナー
 * scripts/sdd_ci_validate.ts から呼び出されることを想定
 */

const ALWAYS_ALLOW_PREFIXES = ['specs/', '.opencode/'];

type RunnerOptions = {
  strict: boolean;
  allowUntracked: boolean;
};

function parseCliFlags(argv: string[]): RunnerOptions {
  return {
    strict: argv.includes('--strict'),
    allowUntracked: argv.includes('--allow-untracked')
  };
}

function isCiMode(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true' || process.env.SDD_CI_MODE === 'true';
}

function getChangedFiles(): string[] {
  // CI判定: GitHub Actions または 明示的なフラグ
  const isCI = isCiMode();

  let args: string[];

  if (isCI) {
    if (process.env.GITHUB_BASE_REF) {
      // PR: Baseブランチとの差分 (3点リーダーでmerge-baseからの差分をとる)
      const baseRef = process.env.GITHUB_BASE_REF;
      console.log(`🔍 CI Mode (PR): Checking diff between origin/${baseRef} and HEAD`);
      args = ['diff', '--name-only', `origin/${baseRef}...HEAD`];
    } else {
      // Push: 直前のコミットとの差分
      // HEAD~1 の存在を確認し、存在しない場合(初回コミット)はフォールバック
      const verifyResult = spawnSync('git', ['-C', '..', 'rev-parse', '--verify', 'HEAD~1'], {
        encoding: 'utf-8'
      });

      if (verifyResult.status === 0) {
        // HEAD~1 が存在する場合: 通常の差分
        console.log('🔍 CI Mode (Push): Checking diff for HEAD');
        args = ['diff', '--name-only', 'HEAD~1...HEAD'];
      } else {
        // HEAD~1 が存在しない場合: 初回コミットのファイル一覧
        console.log('🔍 CI Mode (Push, initial commit): Listing files in HEAD');
        args = ['show', '--name-only', '--pretty=', 'HEAD'];
      }
    }
  } else {
    // Local: Staged files (pre-commit)
    console.log('🔍 Local Mode: Checking staged files (pre-commit)');
    args = ['diff', '--cached', '--name-only'];
  }

  // CWDは .opencode なので、親ディレクトリでgitコマンドを実行
  const result = spawnSync('git', ['-C', '..', ...args], {
    encoding: 'utf-8'
  });

  if (result.error || result.status !== 0) {
    throw new Error(`Git command failed: ${result.error?.message || result.stderr}`);
  }

  return result.stdout.split('\n').filter(line => line.trim().length > 0);
}

function getUntrackedFiles(): string[] {
  const result = spawnSync('git', ['-C', '..', 'ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf-8'
  });

  if (result.error || result.status !== 0) {
    throw new Error(`Git command failed: ${result.error?.message || result.stderr}`);
  }

  return result.stdout.split('\n').filter(line => line.trim().length > 0);
}

function loadTaskScopes(): string[] {
  const tasksPath = path.resolve('..', 'specs', 'tasks.md');

  if (!fs.existsSync(tasksPath)) {
    throw new Error(`❌ Tasks definition not found: ${tasksPath}`);
  }

  const content = fs.readFileSync(tasksPath, 'utf-8');
  const { tasks, errors } = parseSddTasks(content);

  if (errors.length > 0) {
    const errorMsg = [
      '\n❌ tasks.md Validation Failed:',
      ...errors.map(e => `  Line ${e.line}: ${e.reason}${e.content ? ` ("${e.content}")` : ''}`)
    ].join('\n');
    throw new Error(errorMsg);
  }

  console.log('✅ tasks.md Validation: OK');

  const scopes = tasks.flatMap(task => task.scopes).map(scope => scope.trim()).filter(scope => scope.length > 0);
  if (scopes.length === 0) {
    throw new Error('❌ tasks.md に有効な Scope が定義されていません');
  }

  return scopes;
}

function validateScopeGuard(files: string[], scopes: string[], options: RunnerOptions, untrackedFiles: string[]) {
  const scopeViolations: string[] = [];

  for (const file of files) {
    if (!options.strict && ALWAYS_ALLOW_PREFIXES.some(prefix => file.startsWith(prefix))) {
      continue;
    }
    if (!matchesScope(file, scopes)) {
      scopeViolations.push(file);
    }
  }

  const untrackedViolations = options.allowUntracked ? [] : untrackedFiles;

  if (scopeViolations.length > 0 || untrackedViolations.length > 0) {
    const errorMsg = [
      '\n❌ SDD Scope Guard Violation:',
      scopeViolations.length > 0 ? '以下のファイルはタスクScopeに含まれていません:' : null,
      ...scopeViolations.map(file => `  - ${file}`),
      untrackedViolations.length > 0 ? '未追跡ファイルが検出されました（--allow-untracked で許可できます）:' : null,
      ...untrackedViolations.map(file => `  - ${file}`)
    ].filter(line => line !== null).join('\n');
    throw new Error(errorMsg);
  }

  console.log('✅ Scope Guard: OK (変更範囲は適切です)');
}

const sddCiRunnerTool = tool({
  description: 'CI検証ランナー（tasks.md整合性チェックおよび変更範囲ガード）',
  args: {},
  async execute() {
    console.log('--- SDD CI Runner ---');

    const options = parseCliFlags(process.argv.slice(2));

    // 1. tasks.md の構文チェック
    const scopes = loadTaskScopes();

    // 2. 変更ファイルのスコープチェック
    const changedFiles = getChangedFiles();
    const isCI = isCiMode();
    const untrackedFiles = isCI ? getUntrackedFiles() : [];
    if (changedFiles.length === 0) {
      console.log('ℹ️ No changed files detected.');
    }

    if (untrackedFiles.length > 0 && options.allowUntracked) {
      console.log('ℹ️ 未追跡ファイルを許可しました（--allow-untracked）');
    }

    validateScopeGuard(changedFiles, scopes, options, untrackedFiles);

    return 'CI Validation Passed';
  }
});

export default sddCiRunnerTool;

// 直接実行された場合のエントリーポイント
if (import.meta.main) {
  // @ts-ignore
  sddCiRunnerTool.execute({}, {} as any).then((res: string) => {
    console.log(`\n${res}`);
    process.exit(0);
  }).catch((err: any) => {
    console.error(err);
    process.exit(1);
  });
}
