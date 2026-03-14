import type { CommandDef } from "../command.js";
export declare const command: CommandDef;
export declare function publishCommand(source: string, options: {
    registry?: string;
    github?: boolean;
    dryRun?: boolean;
}): Promise<void>;
//# sourceMappingURL=publish.d.ts.map