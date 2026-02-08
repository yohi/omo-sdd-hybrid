import { profileCommand } from "./definitions/profile.js";
import { implCommand } from "./definitions/impl.js";
import { validateCommand } from "./definitions/validate.js";
import { BuiltinCommand } from "./types.js";

export const builtinCommands: Record<string, BuiltinCommand> = {
    [profileCommand.name]: profileCommand,
    [implCommand.name]: implCommand,
    [validateCommand.name]: validateCommand,
};

export function getBuiltinCommand(name: string): BuiltinCommand | undefined {
    return builtinCommands[name];
}

export function getAllBuiltinCommands(): BuiltinCommand[] {
    return Object.values(builtinCommands);
}
