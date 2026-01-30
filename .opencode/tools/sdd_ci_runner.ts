import { tool } from '../lib/plugin-stub';
import { parseSddTasks } from '../lib/tasks_markdown';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CI環境での検証を行うランナー
 * scripts/sdd_ci_validate.ts から呼び出されることを想定
 */

// Phase 3 Guard: 変更が許可されるディレクトリプレフィックス
// Phase 3では src/ 等の変更を禁止し、SDD基盤（specs, .opencode）とCI周辺のみを許可する
const ALLOWED_DIRS = ['specs/', '.opencode/', 'scripts/', '.github/'];

function getChangedFiles(): string[] {
  // CI判定: GitHub Actions または 明示的なフラグ
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true' || process.env.SDD_CI_MODE === 'true';

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

function validatePhase3Guard(files: string[]) {
  const violations = files.filter(file => {
    // specs/ または .opencode/ で始まるファイルはOK
    // .github/ workflows も許可
    // scripts/ も許可
    return !ALLOWED_DIRS.some(dir => file.startsWith(dir));
  });

  if (violations.length > 0) {
    const errorMsg = [
      '\n❌ Phase 3 Guard Violation:',
      '以下のファイルは現在のフェーズで変更が許可されていません（ALLOWED_DIRS に含まれるパスのみ変更可能）:',
      ...violations.map(f => `  - ${f}`)
    ].join('\n');
    throw new Error(errorMsg);
  }

  console.log('✅ Phase 3 Guard: OK (変更範囲は適切です)');
}

function validateTasksMarkdown() {
  const tasksPath = path.resolve('..', 'specs', 'tasks.md');

  if (!fs.existsSync(tasksPath)) {
    throw new Error(`❌ Tasks definition not found: ${tasksPath}`);
  }

  const content = fs.readFileSync(tasksPath, 'utf-8');
  const { errors } = parseSddTasks(content);

  if (errors.length > 0) {
    const errorMsg = [
      '\n❌ tasks.md Validation Failed:',
      ...errors.map(e => `  Line ${e.line}: ${e.reason}${e.content ? ` ("${e.content}")` : ''}`)
    ].join('\n');
    throw new Error(errorMsg);
  }

  console.log('✅ tasks.md Validation: OK');
}

const sddCiRunnerTool = tool({
  description: 'CI検証ランナー（tasks.md整合性チェックおよび変更範囲ガード）',
  args: {},
  async execute() {
    console.log('--- SDD CI Runner ---');

    // 1. tasks.md の構文チェック
    validateTasksMarkdown();

    // 2. 変更ファイルのスコープチェック (Phase 3 Guard)
    const changedFiles = getChangedFiles();
    if (changedFiles.length > 0) {
      validatePhase3Guard(changedFiles);
    } else {
      console.log('ℹ️ No changed files detected.');
    }

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
