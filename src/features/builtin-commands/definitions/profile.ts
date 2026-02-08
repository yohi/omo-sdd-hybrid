import { BuiltinCommand } from "../types";

export const profileCommand: BuiltinCommand = {
    name: "profile",
    description: "Architect role: Specification & Design",
    argumentHint: "[feature]",
    template: `
<command-instruction>
By using the available tool \`sdd_kiro\`, execute the \`profile\` command.
Target feature: "{{feature}}"
(If the feature is "(not specified)", omit the feature argument)
</command-instruction>
  `.trim()
};
