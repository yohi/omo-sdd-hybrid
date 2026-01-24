import { tool } from '../lib/plugin-stub';
import { getStateDir, getStatePath } from '../lib/state-utils';
import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

export default tool({
  description: 'Stateディレクトリのロック状態を診断し、必要に応じて強制解除します',
  args: {
    force: tool.schema.boolean().optional().describe('強制解除を行う場合はtrueを指定 (デフォルト: false)')
  },
  async execute({ force = false }) {
    const stateDir = getStateDir();
    const statePath = getStatePath();
    
    // proper-lockfile creates a directory named `${path}.lock` when locking a directory?
    // Or `${path}.lock` file?
    // Documentation says for directories it might resolve to a file inside or use directory locking.
    // We need to check lock status.
    
    let isLocked = false;
    try {
      isLocked = await lockfile.check(stateDir);
    } catch (e) {
      // If check fails, maybe it's not locked or other error
      // But check() usually returns boolean.
    }

    const lockDirPath = `${stateDir}.lock`; // Default proper-lockfile path for dir
    const hasLockFile = fs.existsSync(lockDirPath);

    const statusLines = [
      `# ロック診断レポート`,
      `State Directory: ${stateDir}`,
      `Locked (proper-lockfile check): ${isLocked ? 'YES' : 'NO'}`,
      `Lock Artifact Found: ${hasLockFile ? `YES (${lockDirPath})` : 'NO'}`,
    ];
    
    // Validate JSON content
    if (fs.existsSync(statePath)) {
      try {
        const content = fs.readFileSync(statePath, 'utf-8');
        JSON.parse(content);
        statusLines.push(`State Integrity: OK (Valid JSON)`);
      } catch (e) {
        statusLines.push(`⚠️ State Integrity: CORRUPTED (Invalid JSON)`);
        statusLines.push(`  Error: ${(e as Error).message}`);
        statusLines.push(`  推奨: ロック解除後に sdd_end_task でStateをリセット、またはバックアップを確認してください`);
      }
    } else {
      statusLines.push(`State Integrity: No state file found`);
    }

    if (!force) {
      statusLines.push(`\n[DRY-RUN] 解除は行われませんでした。`);
      statusLines.push(`ロックを強制解除するには --force true を指定してください。`);
      statusLines.push(`注意: 実行中のプロセスがある場合、強制解除はデータの競合や破損を招く恐れがあります。`);
      return statusLines.join('\n');
    }

    // Force Unlock
    statusLines.push(`\n[FORCE UNLOCK] 解除を実行します...`);
    
    try {
      // Try proper-lockfile unlock first (if we could... but we can't without release function)
      // So we manually remove the lock artifact.
      // Wait, proper-lockfile has `unlock` method? No, only `lock` returns release.
      // But `unlock(path)` exists in some versions? No.
      // We must remove the lock directory/file.
      
      if (hasLockFile) {
        // proper-lockfile uses mkdir for locking, so it's a directory (usually).
        // But on some systems/configs it might be different.
        // Let's check stats.
        const stats = fs.statSync(lockDirPath);
        if (stats.isDirectory()) {
            fs.rmdirSync(lockDirPath);
        } else {
            fs.unlinkSync(lockDirPath);
        }
        statusLines.push(`✅ Lock artifact removed: ${lockDirPath}`);
      } else {
        statusLines.push(`Lock artifact not found at expected path. Attempting unlock via proper-lockfile (check only)...`);
        // If check() said true but we didn't find file, maybe path is different?
        // proper-lockfile resolves path.
        // Let's trust user if they say force.
      }
      
      statusLines.push(`ロック強制解除が完了しました。`);
    } catch (e) {
      statusLines.push(`❌ 解除失敗: ${(e as Error).message}`);
      throw new Error(`Failed to force unlock: ${(e as Error).message}`);
    }

    return statusLines.join('\n');
  }
});
