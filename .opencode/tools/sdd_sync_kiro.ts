import { tool } from '../lib/plugin-stub';
import fs from 'fs';
import path from 'path';
import { parseSddTasks, parseKiroTasks, SddTask } from '../lib/tasks_markdown';

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

    // 3. Root タスク読み込み (AST)
    const rootContent = fs.readFileSync(rootTasksPath, 'utf-8');
    // Sync時はScopeの厳密な検証は不要（タスクIDとステータスが重要）
    const { tasks: rootTasks } = parseSddTasks(rootContent, { validateScopes: false });
    const rootTaskMap = new Map(rootTasks.map(t => [t.id, t]));

    // 4. Kiro specs スキャン
    const features = fs.readdirSync(specsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (features.length === 0) {
      return `ℹ️ 情報: Kiro仕様が見つかりません`;
    }

    const results: string[] = [];
    const newTasksToImport: Array<{ feature: string, task: SddTask }> = [];

    // 5. Feature ごとに同期処理
    for (const feature of features) {
      const kiroTasksPath = path.join(specsDir, feature, 'tasks.md');
      if (!fs.existsSync(kiroTasksPath)) {
        continue;
      }

      const kiroContent = fs.readFileSync(kiroTasksPath, 'utf-8');
      const { tasks: kiroTasks } = parseKiroTasks(kiroContent);
      
      const kiroLines = kiroContent.split('\n');
      const newKiroLines = [...kiroLines];
      let kiroModified = false;

      // 行番号でマップ化 (ASTは1-based line number)
      const kiroTaskMapByLine = new Map(kiroTasks.map(t => [t.line, t]));

      for (let i = 0; i < kiroLines.length; i++) {
        const lineNo = i + 1;
        const kiroTask = kiroTaskMapByLine.get(lineNo);

        // タスク行でない場合はそのまま
        if (!kiroTask) {
          continue;
        }

        const rootTask = rootTaskMap.get(kiroTask.id);
        if (rootTask) {
          // Root→Kiro: ステータス同期
          if (rootTask.checked !== kiroTask.checked) {
            const newCheckbox = rootTask.checked ? 'x' : ' ';
            // Kiroは通常 "- [ ]" 形式
            const newLine = `- [${newCheckbox}] ${kiroTask.id}: ${kiroTask.description}`;
            newKiroLines[i] = newLine;
            kiroModified = true;
            results.push(`[SYNC] ${feature}/${kiroTask.id} → ${rootTask.checked ? 'DONE' : 'TODO'}`);
          }
        } else {
          // Kiro→Root: 新規タスクインポート
          newTasksToImport.push({ feature, task: kiroTask });
          results.push(`[IMPORT] ${feature}/${kiroTask.id}: ${kiroTask.description}`);
        }
      }

      // Kiro ファイルを更新
      if (kiroModified) {
        fs.writeFileSync(kiroTasksPath, newKiroLines.join('\n'));
      }
    }

    // 6. 新規タスクを Root に追加
    if (newTasksToImport.length > 0) {
      const linesToAppend = newTasksToImport.map(({ feature, task }) => {
        const checkbox = task.checked ? 'x' : ' ';
        // Rootは "* [ ]" 形式 (Scope付き)
        return `* [${checkbox}] ${task.id}: ${task.description} (Scope: \`${feature}\`)`;
      });

      const needsNewline = rootContent.length > 0 && !rootContent.endsWith('\n');
      const appendContent = (needsNewline ? '\n' : '') + linesToAppend.join('\n') + '\n';
      
      fs.appendFileSync(rootTasksPath, appendContent);
    }

    return results.length > 0
      ? results.join('\n')
      : `✅ すべて同期済み (Features: ${features.join(', ')})`;
  }
});

