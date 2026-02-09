import { describe, it, expect } from 'bun:test';
import SddConfigCommands from '../../.opencode/plugins/sdd-config-commands.js';

describe('SddConfigCommands', () => {
  it('config hook が config.command に SDD コマンドを注入すること', async () => {
    // プラグインの初期化（モックコンテキスト）
    const plugin = await SddConfigCommands({});
    
    // モックの config オブジェクト
    const mockConfig: any = {
      command: {}
    };

    // config hook の実行
    if (plugin.config) {
      await plugin.config(mockConfig);
    } else {
      throw new Error('plugin.config が定義されていません');
    }

    // 登録されたコマンド名の取得
    const commandNames = Object.keys(mockConfig.command);
    
    // 指定された4つのコマンドが含まれているか検証
    expect(commandNames).toContain('profile');
    expect(commandNames).toContain('impl');
    expect(commandNames).toContain('validate');
    expect(commandNames).toContain('guard');
  });
});
