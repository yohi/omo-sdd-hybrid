import { BuiltinCommand } from "../types";

export const implCommand: BuiltinCommand = {
    name: "impl",
    description: "Implementer role: Coding & Implementation",
    argumentHint: "[feature]",
    template: `
<command-instruction>
By using the available tool \`sdd_kiro\`, execute the \`impl\` command.
Target feature: "{{feature}}"
(If the feature is "(not specified)", omit the feature argument)
</command-instruction>
  `.trim()
};
