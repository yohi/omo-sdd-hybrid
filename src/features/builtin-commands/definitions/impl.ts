import { BuiltinCommand } from "../types";

export const implCommand: BuiltinCommand = {
    name: "impl",
    description: "Implementer role: Coding & Implementation",
    argumentHint: "（引数は不要です）",
    template: `
<command-instruction>
By using the available tool \`sdd_kiro\`, execute the \`impl\` command.
Argument: \`{"command": "impl"}\`
</command-instruction>
  `.trim()
};
