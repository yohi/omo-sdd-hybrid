import { BuiltinCommand } from "../types";

export const validateCommand: BuiltinCommand = {
    name: "validate",
    description: "Reviewer role: Validation & QA",
    argumentHint: "[feature]",
    template: `
<command-instruction>
By using the available tool \`sdd_kiro\`, execute the \`validate-design\` command.
Target feature: "{{feature}}"
(If the feature is "(not specified)", omit the feature argument)
</command-instruction>
  `.trim()
};
