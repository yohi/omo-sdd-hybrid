/**
 * SDD Gatekeeper Plugin
 * 
 * Phase 0: warn モード
 * タスクスコープ外のファイル編集を警告するプラグイン
 * 
 * TODO: Task 4 で実装予定
 * - tool.execute.before フックでインターセプト
 * - Rule 0-4 の実装
 * - State ファイルの読み込みとスコープチェック
 */

import type { Plugin } from '../lib/plugin-stub';

/**
 * SDD Gatekeeper Plugin (スタブ)
 * 
 * このファイルは現在スタブです。
 * Task 4 の実装時に、以下の機能を追加します：
 * - Rule 0: specs/**, .opencode/** は常に許可
 * - Rule 1: State なしの場合は警告
 * - Rule 2: Scope 外ファイルの編集を警告
 * - Rule 3: worktree 外パスを警告
 * - Rule 4: 破壊的 bash コマンドを警告
 */
const sddGatekeeperPlugin: Plugin = async ({ client }) => {
  // TODO: Task 4 で実装
  // 現在は何もしない（起動エラー防止のためのスタブ）
  return {
    // 'tool.execute.before': async (event) => {
    //   // Gatekeeper ロジックをここに実装
    // }
  };
};

export default sddGatekeeperPlugin;
