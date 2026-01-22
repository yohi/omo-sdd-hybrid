import fs from 'fs';

/**
 * バックアップファイルのローテーションを実行
 * 既存ファイルを .bak → .bak.1 → .bak.2 とシフトし、最古のバックアップを削除
 */
export function rotateBackup(filePath: string, generations: number = 3): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const deleteOldestBackup = (gen: number) => {
    const oldestPath = gen === 1 ? `${filePath}.bak` : `${filePath}.bak.${gen - 1}`;
    if (fs.existsSync(oldestPath)) {
      fs.unlinkSync(oldestPath);
    }
  };

  const shiftBackups = (gen: number) => {
    for (let i = gen - 1; i >= 1; i--) {
      const currentPath = i === 1 ? `${filePath}.bak` : `${filePath}.bak.${i - 1}`;
      const nextPath = `${filePath}.bak.${i}`;
      
      if (fs.existsSync(currentPath)) {
        if (fs.existsSync(nextPath)) {
          fs.unlinkSync(nextPath);
        }
        fs.renameSync(currentPath, nextPath);
      }
    }
  };

  deleteOldestBackup(generations);
  shiftBackups(generations);
  fs.copyFileSync(filePath, `${filePath}.bak`);
}

export type RestoreResult = 
  | { restored: true; fromBackup: string }
  | { restored: false; reason: 'no_backup' };

export function getBackupPaths(filePath: string, generations: number = 3): string[] {
  return [
    `${filePath}.bak`,
    ...Array.from({ length: generations - 1 }, (_, i) => `${filePath}.bak.${i + 1}`)
  ];
}

export function restoreFromBackup(filePath: string, generations: number = 3): RestoreResult {
  const backupPaths = getBackupPaths(filePath, generations);

  for (const backupPath of backupPaths) {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
      return { restored: true, fromBackup: backupPath };
    }
  }

  return { restored: false, reason: 'no_backup' };
}
