import { tool } from '../lib/plugin-stub';
import { getStateDir, getStatePath, readLockInfo, LockInfo } from '../lib/state-utils';
import fs from 'fs';
import path from 'path';
import os from 'os';
import lockfile from 'proper-lockfile';

export default tool({
  description: 'Stateディレクトリのロック状態を診断し、必要に応じて強制解除します',
  args: {
    force: tool.schema.boolean().optional().describe('強制解除を行う場合はtrueを指定 (デフォルト: false)'),
    overrideOwner: tool.schema.boolean().optional().describe('owner不一致時でも強制解除する場合はtrueを指定 (デフォルト: false)')
  },
  async execute({ force = false, overrideOwner = false }) {
    const stateDir = getStateDir();
    const statePath = getStatePath();
    const statusLines: string[] = [];

    // Check lock status
    let isLocked = false;
    try {
      isLocked = await lockfile.check(stateDir);
    } catch (e) {
      statusLines.push(`Lock check failed for stateDir: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Check lock artifacts (both proper-lockfile and directory-based)
    const lockDirPath = `${stateDir}.lock`;
    const internalLockPath = path.join(stateDir, '.lock');
    const lockInfoPath = path.join(stateDir, '.lock-info.json');
    const hasLockFile = fs.existsSync(lockDirPath);
    const hasInternalLock = fs.existsSync(internalLockPath);
    const hasLockInfo = fs.existsSync(lockInfoPath);

    statusLines.push(`# ロック診断レポート`);
    statusLines.push(`State Directory: ${stateDir}`);
    statusLines.push(`Locked (proper-lockfile check): ${isLocked ? 'YES' : 'NO'}`);
    statusLines.push(`Lock Artifact Found: ${hasLockFile ? `YES (${lockDirPath})` : 'NO'}`);
    statusLines.push(`Internal Lock Dir: ${hasInternalLock ? 'YES' : 'NO'}`);
    statusLines.push(`Lock Info File: ${hasLockInfo ? 'YES' : 'NO'}`);

    // Read and display owner information
    const lockInfo = readLockInfo();
    const currentPid = process.pid;
    const currentHost = os.hostname();
    let isOwnerMatch = false;

    if (lockInfo) {
      statusLines.push(`\n## Owner情報`);
      statusLines.push(`Task ID: ${lockInfo.taskId ?? '(none)'}`);
      statusLines.push(`PID: ${lockInfo.pid}`);
      statusLines.push(`Host: ${lockInfo.host}`);
      statusLines.push(`Started At: ${lockInfo.startedAt}`);

      // Check owner match
      isOwnerMatch = lockInfo.pid === currentPid && lockInfo.host === currentHost;
      statusLines.push(`\n## Owner一致確認`);
      statusLines.push(`Current PID: ${currentPid}`);
      statusLines.push(`Current Host: ${currentHost}`);
      statusLines.push(`Owner Match: ${isOwnerMatch ? '✅ YES' : '❌ NO'}`);
    } else {
      statusLines.push(`\n## Owner情報: なし`);
    }

    // Validate JSON content
    if (fs.existsSync(statePath)) {
      try {
        const content = fs.readFileSync(statePath, 'utf-8');
        JSON.parse(content);
        statusLines.push(`\nState Integrity: OK (Valid JSON)`);
      } catch (e) {
        statusLines.push(`\n⚠️ State Integrity: CORRUPTED (Invalid JSON)`);
        statusLines.push(`  Error: ${(e as Error).message}`);
        statusLines.push(`  推奨: ロック解除後に sdd_end_task でStateをリセット、またはバックアップを確認してください`);
      }
    } else {
      statusLines.push(`\nState Integrity: No state file found`);
    }

    if (!force) {
      statusLines.push(`\n[DRY-RUN] 解除は行われませんでした。`);
      statusLines.push(`ロックを強制解除するには --force true を指定してください。`);
      statusLines.push(`注意: 実行中のプロセスがある場合、強制解除はデータの競合や破損を招く恐れがあります。`);
      return statusLines.join('\n');
    }

    // Owner mismatch check - force dry-run unless overrideOwner is set
    if (lockInfo && !isOwnerMatch && !overrideOwner) {
      statusLines.push(`\n⚠️ [OWNER MISMATCH - DRY-RUN強制]`);
      statusLines.push(`Ownerが一致しないため、安全弁として強制的にDRY-RUNモードに切り替えました。`);
      statusLines.push(`別のプロセス（PID: ${lockInfo.pid}, Host: ${lockInfo.host}）がロックを保持しています。`);
      statusLines.push(`\nロックを強制解除するには以下のオプションを使用してください:`);
      statusLines.push(`  --force true --overrideOwner true`);
      statusLines.push(`\n⚠️ 警告: 他プロセスが実行中の場合、データ競合や破損のリスクがあります。`);
      return statusLines.join('\n');
    }

    // Force Unlock
    if (lockInfo && !isOwnerMatch && overrideOwner) {
      statusLines.push(`\n⚠️ [OVERRIDE WARNING] Owner不一致ですが、--overrideOwnerにより強制解除を実行します。`);
    }
    statusLines.push(`\n[FORCE UNLOCK] 解除を実行します...`);

    try {
      // First, attempt to unlock using the library
      await lockfile.unlock(stateDir);
      statusLines.push(`✅ Unlocked via proper-lockfile`);

      // Clean up internal artifacts even on successful unlock
      if (hasLockInfo) {
        try {
          fs.unlinkSync(lockInfoPath);
          statusLines.push(`✅ Lock info file removed: ${lockInfoPath}`);
        } catch (infoError) {
          statusLines.push(`⚠️ Lock info removal failed: ${(infoError as Error).message}`);
        }
      }
      if (hasInternalLock) {
        try {
          fs.rmdirSync(internalLockPath);
          statusLines.push(`✅ Internal lock dir removed: ${internalLockPath}`);
        } catch (internalError) {
          statusLines.push(`⚠️ Internal lock dir removal failed: ${(internalError as Error).message}`);
        }
      }
    } catch (e) {
      statusLines.push(`⚠️ proper-lockfile unlock failed: ${(e as Error).message}`);
      statusLines.push(`Attempting manual removal as fallback...`);

      // Fallback: Manual safe removal for cases where library unlock fails (e.g. foreign lock)
      let manualSuccess = false;

      // Remove lock info file first
      if (hasLockInfo) {
        try {
          fs.unlinkSync(lockInfoPath);
          statusLines.push(`✅ Lock info file removed: ${lockInfoPath}`);
          manualSuccess = true;
        } catch (infoError) {
          statusLines.push(`⚠️ Lock info removal failed: ${(infoError as Error).message}`);
        }
      }

      // Remove internal lock directory
      if (hasInternalLock) {
        try {
          fs.rmdirSync(internalLockPath);
          statusLines.push(`✅ Internal lock dir removed: ${internalLockPath}`);
          manualSuccess = true;
        } catch (internalError) {
          statusLines.push(`⚠️ Internal lock dir removal failed: ${(internalError as Error).message}`);
        }
      }

      // Remove proper-lockfile lock
      if (hasLockFile) {
        try {
          const stats = fs.lstatSync(lockDirPath);

          if (stats.isSymbolicLink()) {
            fs.unlinkSync(lockDirPath);
          } else if (stats.isDirectory()) {
            fs.rmSync(lockDirPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(lockDirPath);
          }
          statusLines.push(`✅ Lock artifact manually removed: ${lockDirPath}`);
          manualSuccess = true;
        } catch (manualError) {
          statusLines.push(`❌ Manual removal failed: ${(manualError as Error).message}`);
        }
      }

      if (!manualSuccess && !hasLockFile && !hasInternalLock && !hasLockInfo) {
        statusLines.push(`Lock artifacts not found. Cannot force unlock manually.`);
        throw new Error(`Failed to force unlock: Lock artifacts not found and library unlock failed.`);
      }
    }

    statusLines.push(`\nロック強制解除が完了しました。`);
    return statusLines.join('\n');
  }
});
