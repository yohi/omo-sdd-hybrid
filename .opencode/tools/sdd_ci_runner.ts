import { tool } from '@opencode-ai/plugin';
import { parseSddTasks } from '../lib/tasks_markdown';
import { matchesScope } from '../lib/glob-utils';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';

/**
 * CI環境での検証を行うランナー
 * scripts/sdd_ci_validate.ts から呼び出されることを想定
 */

const ALWAYS_ALLOW_PREFIXES = ['specs/', '.opencode/', '.kiro/', 'spec.md', 'README.md', 'AGENTS.md'];

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
      logger.info(`🔍 CI Mode (PR): Checking diff between origin/${baseRef} and HEAD`);
      args = ['diff', '--name-only', `origin/${baseRef}...HEAD`];
    } else {
      // Push: 直前のコミットとの差分
      // HEAD~1 の存在を確認し、存在しない場合(初回コミット)はフォールバック
      const verifyResult = spawnSync('git', ['-C', '..', 'rev-parse', '--verify', 'HEAD~1'], {
        encoding: 'utf-8'
      });

      if (verifyResult.status === 0) {
        // HEAD~1 が存在する場合: 通常の差分
        logger.info('🔍 CI Mode (Push): Checking diff for HEAD');
        args = ['diff', '--name-only', 'HEAD~1...HEAD'];
      } else {
        // HEAD~1 が存在しない場合: 初回コミットのファイル一覧
        logger.info('🔍 CI Mode (Push, initial commit): Listing files in HEAD');
        
        // Use 'ls-tree' to list all files tracked in current commit
        // This is more reliable than 'show' for initial commit file listing
        // Note: ls-tree with -r --name-only returns paths relative to repo root
        const lsTreeResult = spawnSync('git', ['-C', '..', 'ls-tree', '-r', '--name-only', 'HEAD'], {
          encoding: 'utf-8'
        });

        if (lsTreeResult.status !== 0) {
          throw new Error(`Git ls-tree failed: ${lsTreeResult.stderr}`);
        }

        return lsTreeResult.stdout.split('\n').filter(line => line.trim().length > 0);
      }
    }
  } else {
    // Local: Staged files (pre-commit)
    logger.info('🔍 Local Mode: Checking staged files (pre-commit)');
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

function loadTaskScopes(): { scopes: string[]; sources: string[] } {
  const defaultKiroDir = '.kiro';
  let kiroDir = process.env.SDD_KIRO_DIR || defaultKiroDir;

  // path.resolve を使用してCWD非依存のパス解決を行う
  if (!process.env.SDD_KIRO_DIR) {
    const defaultPath = path.resolve(kiroDir, 'specs');
    const fallbackPath = path.resolve('../.kiro/specs');
    
    if (!fs.existsSync(defaultPath) && fs.existsSync(fallbackPath)) {
      kiroDir = path.resolve('../.kiro');
    } else {
      kiroDir = path.resolve(kiroDir);
    }
  } else {
    kiroDir = path.resolve(kiroDir);
  }

  const scopes: string[] = [];
  const sources: string[] = [];

  const scopeRoot = path.join(kiroDir, 'specs');
  let kiroScopesFound = false;

  if (fs.existsSync(scopeRoot)) {
    const scopeFiles = fs.readdirSync(scopeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(scopeRoot, entry.name, 'scope.md'))
      .filter((scopePath) => fs.existsSync(scopePath));

    for (const scopePath of scopeFiles) {
      const scopeContent = fs.readFileSync(scopePath, 'utf-8');
      const parsed = parseSddTasks(scopeContent, { validateScopes: true });
      if (parsed.errors.length > 0) {
        throw new Error(`scope.md Validation Failed: ${scopePath}`);
      }

      const fileScopes = parsed.tasks.flatMap((task) => task.scopes);
      if (fileScopes.length > 0) {
        scopes.push(...fileScopes);
        sources.push(scopePath);
        kiroScopesFound = true;
      }
    }
  }

  // Legacy/Compatibility: specs/tasks.md からも Scope を読み込む
  const envTasksPath = process.env.SDD_TASKS_PATH;
  if (envTasksPath && !fs.existsSync(path.resolve(envTasksPath))) {
    throw new Error(`E_CONFIG_ERROR: SDD_TASKS_PATH で指定されたファイルが見つかりません: ${envTasksPath}`);
  }

  const tasksPath = envTasksPath ? path.resolve(envTasksPath) : path.resolve('../specs/tasks.md');
  if (fs.existsSync(tasksPath)) {
    const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
    const parsed = parseSddTasks(tasksContent, { validateScopes: true });
    
    if (parsed.errors.length > 0) {
      logger.warn(`⚠️ tasks.md Validation Warnings: ${tasksPath}`);
      parsed.errors.forEach(e => logger.warn(`  Line ${e.line}: ${e.reason}`));
    }

    const tasksScopes = parsed.tasks.flatMap(t => t.scopes);
    if (tasksScopes.length > 0) {
      scopes.push(...tasksScopes);
      sources.push(tasksPath);
    }
  }

  if (scopes.length === 0) {
    // logger.errorでメッセージを出力し、throw Errorでは簡潔なメッセージを投げる
    // PII Maskerによるスタックトレース出力を避けるため
    logger.error('❌ scope.md または tasks.md に有効な Scope が定義されていません');
    throw new Error('Scope definition not found');
  }

  const uniqueScopes = Array.from(new Set(scopes));

  logger.info(`✅ Scope 検証: OK (${sources.length} ファイルから読込み)`);
  sources.forEach((src) => {
    const type = path.basename(src);
    logger.info(`  - ${src} (${type})`);
  });

  return {
    scopes: uniqueScopes,
    sources
  };
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

  logger.info('✅ Scope Guard: OK (変更範囲は適切です)');
}

const sddCiRunnerTool = tool({
  description: 'CI検証ランナー（scope.md整合性チェックおよび変更範囲ガード）',
  args: {},
  async execute() {
    logger.info('--- SDD CI Runner ---');

    const options = parseCliFlags(process.argv.slice(2));

    // 1. scope.md の構文チェック
    const { scopes } = loadTaskScopes();

    // 2. 変更ファイルのスコープチェック
    const changedFiles = getChangedFiles();
    const isCI = isCiMode();
    const untrackedFiles = isCI ? getUntrackedFiles() : [];
    if (changedFiles.length === 0) {
      logger.info('ℹ️ No changed files detected.');
    }

    if (untrackedFiles.length > 0 && options.allowUntracked) {
      logger.info('ℹ️ 未追跡ファイルを許可しました（--allow-untracked）');
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
    logger.info(`\n${res}`);
    process.exit(0);
  }).catch((err: any) => {
    // logger.error(err) は PII Masker (logger.ts) の再帰呼び出しでクラッシュする可能性があるため、
    // 致命的なエラー時は直接 console.error を使用する
    if (err instanceof Error) {
      console.error(`\n❌ Error: ${err.message}`);
      // スタックトレースはデバッグ時のみ
      if (process.env.SDD_DEBUG === 'true' && err.stack) {
        console.error(err.stack);
      }
    } else {
      console.error(`\n❌ Unknown Error: ${String(err)}`);
    }
    process.exit(1);
  });
}
