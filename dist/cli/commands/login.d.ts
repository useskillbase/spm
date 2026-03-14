import type { CommandDef } from "../command.js";
export declare const commands: CommandDef[];
export declare function loginCommand(registryUrl: string | undefined, options: {
    name?: string;
    github?: boolean;
}): Promise<void>;
export declare function addRegistryCommand(registryUrl: string, options: {
    name?: string;
    token?: string;
    scope?: string;
}): Promise<void>;
//# sourceMappingURL=login.d.ts.map