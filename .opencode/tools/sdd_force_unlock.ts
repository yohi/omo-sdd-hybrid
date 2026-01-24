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
      statusLines.push(`Lock check failed for stateDir: ${e instanceof Error ? e.message : String(e)}`);
    }

    const lockDirPath = `${stateDir}.lock`; 
    const hasLockFile = fs.existsSync(lockDirPath);

    const statusLines = [
    statusLines.push(`State Directory: ${stateDir}`);
    statusLines.push(`Locked (proper-lockfile check): ${isLocked ? 'YES' : 'NO'}`);
    statusLines.push(`Lock Artifact Found: ${hasLockFile ? `YES (${lockDirPath})` : 'NO'}`);
    
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
      // First, attempt to unlock using the library
      await lockfile.unlock(stateDir);
      statusLines.push(`✅ Unlocked via proper-lockfile`);
    } catch (e) {
      statusLines.push(`⚠️ proper-lockfile unlock failed: ${(e as Error).message}`);
      statusLines.push(`Attempting manual removal as fallback...`);

      // Fallback: Manual safe removal for cases where library unlock fails (e.g. foreign lock)
      if (fs.existsSync(lockDirPath)) {
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
        } catch (manualError) {
           statusLines.push(`❌ Manual removal failed: ${(manualError as Error).message}`);
           throw new Error(`Failed to force unlock (both library and manual): ${(e as Error).message} / ${(manualError as Error).message}`);
        }
      } else {
         statusLines.push(`Lock artifact not found at ${lockDirPath}. Cannot force unlock manually.`);
         throw new Error(`Failed to force unlock: Lock artifact not found and library unlock failed.`);
      }
    }
    
    statusLines.push(`ロック強制解除が完了しました。`);
    return statusLines.join('\n');
  }
});
