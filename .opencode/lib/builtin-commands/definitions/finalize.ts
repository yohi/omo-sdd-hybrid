import { BuiltinCommand } from "../types";

export const finalizeCommand: BuiltinCommand = {
    name: "finalize",
    description: "Architect role: Finalize specs & Prepare for Translation",
    argumentHint: "[feature]",
    template: `
<command-instruction>
By using the available tool \`sdd_kiro\`, execute the \`finalize\` command.
Target feature: "{{feature}}"
(If the feature is "(not specified)", omit the feature argument)
</command-instruction>
  `.trim()
};
