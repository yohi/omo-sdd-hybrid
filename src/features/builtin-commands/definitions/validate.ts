import { BuiltinCommand } from "../types";

export const validateCommand: BuiltinCommand = {
    name: "validate",
    description: "Reviewer role: Validation & QA",
    argumentHint: "（引数は不要です）",
    template: `
<command-instruction>
By using the available tool \`sdd_kiro\`, execute the \`validate-design\` command.
Argument: \`{"command": "validate-design"}\`
</command-instruction>
  `.trim()
};
