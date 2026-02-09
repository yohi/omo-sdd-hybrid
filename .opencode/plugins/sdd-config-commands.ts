import { getAllBuiltinCommands } from "../lib/builtin-commands/index.js";

/**
 * SDD スラッシュコマンドを OpenCode 設定に注入するプラグイン。
 * /profile, /impl, /validate および /guard コマンドを登録する。
 */
export default function SddConfigCommands(ctx: any) {
  return {
    name: "sdd-config-commands",
    
    /**
     * config hook: OpenCode の設定にカスタムコマンドを追加する。
     */
    config: async (config: any) => {
      if (!config.command) {
        config.command = [];
      }

      // Builtin コマンド (profile, impl, validate) を注入
      const builtinCommands = getAllBuiltinCommands();
      for (const cmd of builtinCommands) {
        config.command.push({
          name: cmd.name,
          description: cmd.description,
          template: cmd.template,
        });
      }

      // guard コマンドを手動で追加
      config.command.push({
        name: "guard",
        description: "Set Gatekeeper guard mode",
        template: "Gatekeeperのモード設定を変更します (引数: warn | block)",
      });

      return config;
    },
  };
}
