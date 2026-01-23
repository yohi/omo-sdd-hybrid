import fs from 'fs';
import path from 'path';
import { tool } from '../lib/plugin-stub';
import { findKiroSpecs, loadKiroSpec, updateKiroSpecTasks } from '../lib/kiro-utils';
import { parseTasksFile, updateTaskStatusInContent, extractTaskIdFromLine } from '../lib/tasks-parser';

export default tool({
  description: 'Kiro仕様とRoot tasks.md を同期します',
  args: {},
  async execute() {
    const ROOT_TASKS_PATH = process.env.SDD_TASKS_PATH || 'tasks.md';
    const lines: string[] = [];
    lines.push('🔄 Kiro ↔ Root Tasks 同期開始...');

    if (!fs.existsSync(ROOT_TASKS_PATH)) {
      return 'エラー: Root tasks.md が見つかりません';
    }
    
    let rootContent = fs.readFileSync(ROOT_TASKS_PATH, 'utf-8');
    const rootTasks = parseTasksFile(rootContent);
    const rootTaskMap = new Map(rootTasks.map(t => [t.id, t]));
    
    let updatedRoot = false;
    const kiroSpecs = findKiroSpecs();

    if (kiroSpecs.length === 0) {
      return '情報: Kiro仕様が見つかりません (.kiro/specs/)';
    }

    for (const feature of kiroSpecs) {
      const spec = loadKiroSpec(feature);
      if (!spec || !spec.tasks) continue;

      lines.push(`\n機能: ${feature}`);
      
      const kiroLines = spec.tasks.split('\n');
      let kiroContentChanged = false;
      const newKiroLines = [...kiroLines];

      for (let i = 0; i < kiroLines.length; i++) {
        const line = kiroLines[i];
        const taskId = extractTaskIdFromLine(line);
        
        if (taskId) {
          const rootTask = rootTaskMap.get(taskId);
          
          if (!rootTask) {
            lines.push(`  [IMPORT] ${taskId} → Root に追加`);
            const titleMatch = line.match(/:\s*(.+)$/);
            const title = titleMatch ? titleMatch[1].replace(/\(Scope:.*\)/, '').trim() : 'Imported Task';
            
            const newTaskLine = `* [ ] ${taskId}: ${title} (Scope: \`${feature}\`)`;
            
            if (!rootContent.endsWith('\n')) rootContent += '\n';
            rootContent += `${newTaskLine}\n`;
            
            rootTaskMap.set(taskId, { id: taskId, title, scopes: [feature], done: false });
            updatedRoot = true;
          } else {
            const isKiroDone = line.includes('[x]');
            if (rootTask.done !== isKiroDone) {
              lines.push(`  [SYNC] ${taskId} → ${rootTask.done ? 'DONE' : 'TODO'}`);
              newKiroLines[i] = line.replace(/\[[ x]\]/, rootTask.done ? '[x]' : '[ ]');
              kiroContentChanged = true;
            }
          }
        }
      }

      if (kiroContentChanged) {
        updateKiroSpecTasks(feature, newKiroLines.join('\n'));
        lines.push(`  ✅ Kiro tasks.md 更新完了`);
      }
    }

    if (updatedRoot) {
      fs.writeFileSync(ROOT_TASKS_PATH, rootContent, 'utf-8');
      lines.push('\n✅ Root tasks.md 更新完了');
    } else {
      lines.push('\n✨ Root tasks.md は最新です');
    }

    return lines.join('\n');
  }
});
