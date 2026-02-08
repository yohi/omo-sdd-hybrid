import { tool } from '@opencode-ai/plugin';
import { readState } from '../lib/state-utils';
import fs from 'fs';
import path from 'path';

export default tool({
  description: '発見された不具合をバグ票として報告します',
  args: {
    title: tool.schema.string().describe('バグの件名（概要）'),
    reproSteps: tool.schema.string().optional().describe('再現手順'),
    expected: tool.schema.string().optional().describe('期待結果'),
    actual: tool.schema.string().optional().describe('実結果'),
    logs: tool.schema.string().optional().describe('関連するログやエラーメッセージ'),
    impact: tool.schema.string().optional().describe('影響範囲'),
    suggestion: tool.schema.string().optional().describe('修正案やヒント')
  },
  async execute({ title, reproSteps, expected, actual, logs, impact, suggestion }) {
    const result = await readState();
    if (result.status !== 'ok' && result.status !== 'recovered') {
      throw new Error(`E_STATE_INVALID: アクティブなタスクがありません (Status: ${result.status})`);
    }

    const { state } = result;

    // ロール制約: implementer, architect, null (ロールなし), undefined は許可
    const allowedRoles = ['implementer', 'architect', null, undefined];
    if (!allowedRoles.includes(state.role)) {
      throw new Error(`E_PERMISSION_DENIED: このコマンドは現在のロールでは実行できません (Current role: ${state.role})`);
    }

    const activeTaskId = state.activeTaskId || 'NO-TASK-ID';

    const kiroDir = process.env.SDD_KIRO_DIR || '.kiro';
    const bugsDir = path.join(kiroDir, 'bugs');

    if (!fs.existsSync(bugsDir)) {
      fs.mkdirSync(bugsDir, { recursive: true });
    }

    // ファイル名生成 (bug-<YYYYMMDD>-<slug>.md)
    const date = new Date();
    const timestamp = date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    // 安全なスラッグ生成: 英数字のみを残し、スペースをハイフンに、それ以外を削除
    const safeSlug = title
      .trim()
      .toLowerCase()
      .replace(/[\s\t\n]+/g, '-')     // 空白をハイフンに
      .replace(/[^a-z0-9-]/g, '')     // 英数字とハイフン以外削除
      .replace(/-+/g, '-')            // 連続ハイフンを単一化
      .replace(/^-|-$/g, '')          // 先頭末尾のハイフン削除
      .slice(0, 50);                  // 長さ制限

    // スラッグが空になった場合のフォールバック
    const finalSlug = safeSlug || 'untitled-bug';

    // ユニーク性を担保するためにミリ秒を追加してもよいが、要件にはないためシンプルにタイムスタンプ+スラッグ
    // ただし、同日に同じタイトルだと被る可能性はある。
    // 要件「タイムスタンプ + タイトルから安全化したslug」
    // 一意性を高めるため、ファイル名にはフルタイムスタンプを使う実装にする（sdd_request_spec_changeと同様のアプローチ）
    const fullTimestamp = date.toISOString().replace(/[:.]/g, '-');
    const filename = `bug-${fullTimestamp}-${finalSlug}.md`;
    const filePath = path.join(bugsDir, filename);

    const content = `# Bug: ${title}

- **Task ID**: ${activeTaskId}
- **Date**: ${date.toISOString()}
- **Author**: ${state.role || 'Unknown'}

## 概要
${title}

## 再現手順
${reproSteps || '(未記入)'}

## 期待結果
${expected || '(未記入)'}

## 実結果
${actual || '(未記入)'}

## ログ抜粋
\`\`\`text
${logs || '(なし)'}
\`\`\`

## 影響範囲
${impact || '(未記入)'}

## 推奨修正案（推測）
${suggestion || '(なし)'}
`;

    fs.writeFileSync(filePath, content, 'utf-8');

    return `バグ票を作成しました:
Path: ${filePath}
Task: ${activeTaskId}
Title: ${title}`;
  }
});
