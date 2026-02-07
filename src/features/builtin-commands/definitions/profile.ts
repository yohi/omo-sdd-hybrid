import { BuiltinCommand } from "../types";

export const profileCommand: BuiltinCommand = {
    name: "profile",
    description: "Architect role: Specification & Design",
    argumentHint: "（引数は不要です）",
    template: `
<command-instruction>
By using the available tool \`sdd_kiro\`, execute the \`profile\` command.
Argument: \`{"command": "profile"}\`
</command-instruction>
  `.trim()
};
