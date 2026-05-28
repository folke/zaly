import type { parseArgs, ParseArgsConfig, ParseArgsOptionsConfig } from "node:util";
export type ParsedArgs<T extends ParseArgsConfig> = ReturnType<typeof parseArgs<T>>;
export type ArgsOpts = ParseArgsOptionsConfig;
export type ParsedArgsResult<T extends ParseArgsConfig> = ParsedArgs<T>["values"] & {
    _: string[];
    $: string;
};
export type ArgsResult<T extends ArgsOpts> = ParsedArgsResult<{
    allowPositionals: true;
    options: T;
}>;
export declare function argsParse<T extends ArgsOpts>(cmd: string, options: T): Promise<ArgsResult<T>>;
export declare function argsUsage(name: string, opts: ParseArgsOptionsConfig): string;
//# sourceMappingURL=args.d.ts.map