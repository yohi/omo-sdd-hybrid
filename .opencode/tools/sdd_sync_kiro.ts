import { tool } from '../lib/plugin-stub';
import fs from 'fs';
import path from 'path';

// Task parser
interface ParsedTask {
  id: string;
  title: string;
  done: boolean;
  scopes?: string[];
}

// Kiro のタスク形式: - [ ] TaskID: Title
const kiroTaskRegex = /^- \[([ x])\] ([A-Za-z][A-Za-z0-9_-]*-\d+): (.+)$/;
// Root のタスク形式: * [ ] TaskID: Title (Scope: `...`)
const rootTaskRegex = /^\* \[([ x])\] ([A-Za-z][A-Za-z0-9_-]*-\d+): (.+?) \(Scope: (.+)\)$/;

function parseKiroTask(line: string): ParsedTask | null {
  const match = line.match(kiroTaskRegex);
  if (!match) return null;
  const [, doneStr, id, title] = match;
  return {
    id,
    title,
    done: doneStr === 'x'
  };
}

function parseRootTask(line: string): ParsedTask | null {
  const match = line.match(rootTaskRegex);
  if (!match) return null;
  const [, doneStr, id, title, scopeStr] = match;
  const backtickRegex = /`([^`]*)`/g;
  const scopes = [...scopeStr.matchAll(backtickRegex)].map(m => m[1]).filter(s => s.trim());
  return {
    id,
    title,
    done: doneStr === 'x',
    scopes
  };
}

function parseTasksFromContent(content: string, isKiro: boolean): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  for (const line of lines) {
    const task = isKiro ? parseKiroTask(line) : parseRootTask(line);
    if (task) {
      tasks.push(task);
    }
  }
  return tasks;
}

export default tool({
  description: 'Kiro仕様とRoot tasks.md を同期します',
  args: {},
  async execute() {
    const rootTasksPath = process.env.SDD_TASKS_PATH || 'specs/tasks.md';
    const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
    const specsDir = path.join(kiroDir, 'specs');

    // 1. Root tasks.md の存在確認
    if (!fs.existsSync(rootTasksPath)) {
      return `❌ エラー: Root tasks.md が見つかりません (${rootTasksPath})`;
    }

    // 2. Kiro specs ディレクトリの存在確認
    if (!fs.existsSync(specsDir)) {
      return `ℹ️ 情報: Kiro仕様が見つかりません (${specsDir})`;
    }

    // 3. Root タスク読み込み
    const rootContent = fs.readFileSync(rootTasksPath, 'utf-8');
    const rootTasks = parseTasksFromContent(rootContent, false);
    const rootTaskMap = new Map(rootTasks.map(t => [t.id, t]));

    // 4. Kiro specs スキャン
    const features = fs.readdirSync(specsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (features.length === 0) {
      return `ℹ️ 情報: Kiro仕様が見つかりません`;
    }

    const results: string[] = [];
    const newTasksToImport: Array<{ feature: string, task: ParsedTask }> = [];

    // 5. Feature ごとに同期処理
    for (const feature of features) {
      const kiroTasksPath = path.join(specsDir, feature, 'tasks.md');
      if (!fs.existsSync(kiroTasksPath)) {
        continue;
      }

      const kiroContent = fs.readFileSync(kiroTasksPath, 'utf-8');
      const kiroTasks = parseTasksFromContent(kiroContent, true);
      let kiroModified = false;
      const newKiroLines: string[] = [];

      for (const line of kiroContent.split('\n')) {
        const kiroTask = parseKiroTask(line);
        if (!kiroTask) {
          newKiroLines.push(line);
          continue;
        }

        const rootTask = rootTaskMap.get(kiroTask.id);
        if (rootTask) {
          // Root→Kiro: ステータス同期
          if (rootTask.done !== kiroTask.done) {
            const newCheckbox = rootTask.done ? 'x' : ' ';
            const newLine = `- [${newCheckbox}] ${kiroTask.id}: ${kiroTask.title}`;
            newKiroLines.push(newLine);
            kiroModified = true;
            results.push(`[SYNC] ${feature}/${kiroTask.id} → ${rootTask.done ? 'DONE' : 'TODO'}`);
          } else {
            newKiroLines.push(line);
          }
        } else {
          // Kiro→Root: 新規タスクインポート
          newTasksToImport.push({ feature, task: kiroTask });
          newKiroLines.push(line);
          results.push(`[IMPORT] ${feature}/${kiroTask.id}: ${kiroTask.title}`);
        }
      }

      // Kiro ファイルを更新
      if (kiroModified) {
        fs.writeFileSync(kiroTasksPath, newKiroLines.join('\n'));
      }
    }

    // 6. 新規タスクを Root に追加
    if (newTasksToImport.length > 0) {
      const newRootLines = rootContent.trimEnd().split('\n');
      for (const { feature, task } of newTasksToImport) {
        const checkbox = task.done ? 'x' : ' ';
        const newLine = `* [${checkbox}] ${task.id}: ${task.title} (Scope: \`${feature}\`)`;
        newRootLines.push(newLine);
      }
      fs.writeFileSync(rootTasksPath, newRootLines.join('\n') + '\n');
    }

    return results.length > 0
      ? results.join('\n')
      : `✅ すべて同期済み (Features: ${features.join(', ')})`;
  }
});
