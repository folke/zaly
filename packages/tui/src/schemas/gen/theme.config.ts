import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
import * as __typia_transform__accessExpressionAsString from "typia/lib/internal/_accessExpressionAsString";
import type { Style } from "../../style/ansi.ts";
import type { AnsiColorName, BrightAnsiColorName, Color, ColorStep, HexColor, ThemeKey, } from "../../style/color.ts";
import type { ShikiTheme, Theme } from "../../style/index.ts";
import { createAssert, createAssertEquals, createIs } from "typia";
type UserStyle = Omit<Style, "fg" | "bg"> & {
    fg?: string;
    bg?: string;
};
type UserTheme = {
    $schema?: string;
    shiki?: ShikiTheme;
} & Record<string, string | UserStyle>;
type ColorKeys<T> = {
    [K in keyof T]-?: [
        T[K]
    ] extends [
        Color
    ] ? K : never;
}[keyof T];
const toBaseColor = (() => { const _iv1 = new Set(["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "gray", "grey", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite", "brightGray", "brightGrey", "shiki", "fg", "bg", "primary", "accent", "dim", "muted", "success", "info", "warn", "error", "title", "border", "borderTitle", "line", "mdBold", "mdItalic", "mdStrikethrough", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHr", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdTable", "mdTableHeader", "menuLabel", "menuHint", "menuActive", "code", "codeTitle", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle", "inherit"]); const _av2 = new Set(["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "gray", "grey", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite", "brightGray", "brightGrey", "shiki", "fg", "bg", "primary", "accent", "dim", "muted", "success", "info", "warn", "error", "title", "border", "borderTitle", "line", "mdBold", "mdItalic", "mdStrikethrough", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHr", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdTable", "mdTableHeader", "menuLabel", "menuHint", "menuActive", "code", "codeTitle", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle", "inherit"]); const __is = (input: any): input is HexColor | AnsiColorName | BrightAnsiColorName | ThemeKey | "inherit" => null !== input && undefined !== input && (true === _iv1.has(input) || "string" === typeof input && RegExp(/^#(.*)/).test(input)); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): HexColor | AnsiColorName | BrightAnsiColorName | ThemeKey | "inherit" => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => (null !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "(\"accent\" | \"bg\" | \"black\" | \"blue\" | \"border\" | \"borderTitle\" | \"brightBlack\" | \"brightBlue\" | \"brightCyan\" | \"brightGray\" | \"brightGreen\" | \"brightGrey\" | \"brightMagenta\" | \"brightRed\" | \"brightWhite\" | \"brightYellow\" | \"code\" | \"codeTitle\" | \"cyan\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"dim\" | \"error\" | \"fg\" | \"gray\" | \"green\" | \"grey\" | \"info\" | \"inherit\" | \"line\" | \"magenta\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"menuActive\" | \"menuHint\" | \"menuLabel\" | \"muted\" | \"primary\" | \"red\" | \"shiki\" | \"success\" | \"title\" | \"warn\" | \"white\" | \"yellow\" | `#${string}`)",
            value: input
        }, _errorFactory)) && (undefined !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "(\"accent\" | \"bg\" | \"black\" | \"blue\" | \"border\" | \"borderTitle\" | \"brightBlack\" | \"brightBlue\" | \"brightCyan\" | \"brightGray\" | \"brightGreen\" | \"brightGrey\" | \"brightMagenta\" | \"brightRed\" | \"brightWhite\" | \"brightYellow\" | \"code\" | \"codeTitle\" | \"cyan\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"dim\" | \"error\" | \"fg\" | \"gray\" | \"green\" | \"grey\" | \"info\" | \"inherit\" | \"line\" | \"magenta\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"menuActive\" | \"menuHint\" | \"menuLabel\" | \"muted\" | \"primary\" | \"red\" | \"shiki\" | \"success\" | \"title\" | \"warn\" | \"white\" | \"yellow\" | `#${string}`)",
            value: input
        }, _errorFactory)) && (true === _av2.has(input) || "string" === typeof input && RegExp(/^#(.*)/).test(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "(\"accent\" | \"bg\" | \"black\" | \"blue\" | \"border\" | \"borderTitle\" | \"brightBlack\" | \"brightBlue\" | \"brightCyan\" | \"brightGray\" | \"brightGreen\" | \"brightGrey\" | \"brightMagenta\" | \"brightRed\" | \"brightWhite\" | \"brightYellow\" | \"code\" | \"codeTitle\" | \"cyan\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"dim\" | \"error\" | \"fg\" | \"gray\" | \"green\" | \"grey\" | \"info\" | \"inherit\" | \"line\" | \"magenta\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"menuActive\" | \"menuHint\" | \"menuLabel\" | \"muted\" | \"primary\" | \"red\" | \"shiki\" | \"success\" | \"title\" | \"warn\" | \"white\" | \"yellow\" | `#${string}`)",
            value: input
        }, _errorFactory)))(input, "$input", true);
    }
    return input;
}; })();
const toStepColor = (() => { const _iv1 = new Set(["shiki", "fg", "bg", "primary", "accent", "dim", "muted", "success", "info", "warn", "error", "title", "border", "borderTitle", "line", "mdBold", "mdItalic", "mdStrikethrough", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHr", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdTable", "mdTableHeader", "menuLabel", "menuHint", "menuActive", "code", "codeTitle", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle"]); const _av2 = new Set(["shiki", "fg", "bg", "primary", "accent", "dim", "muted", "success", "info", "warn", "error", "title", "border", "borderTitle", "line", "mdBold", "mdItalic", "mdStrikethrough", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHr", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdTable", "mdTableHeader", "menuLabel", "menuHint", "menuActive", "code", "codeTitle", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle"]); const __is = (input: any): input is HexColor | ThemeKey => null !== input && undefined !== input && (true === _iv1.has(input) || "string" === typeof input && RegExp(/^#(.*)/).test(input)); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): HexColor | ThemeKey => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => (null !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "(\"accent\" | \"bg\" | \"border\" | \"borderTitle\" | \"code\" | \"codeTitle\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"dim\" | \"error\" | \"fg\" | \"info\" | \"line\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"menuActive\" | \"menuHint\" | \"menuLabel\" | \"muted\" | \"primary\" | \"shiki\" | \"success\" | \"title\" | \"warn\" | `#${string}`)",
            value: input
        }, _errorFactory)) && (undefined !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "(\"accent\" | \"bg\" | \"border\" | \"borderTitle\" | \"code\" | \"codeTitle\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"dim\" | \"error\" | \"fg\" | \"info\" | \"line\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"menuActive\" | \"menuHint\" | \"menuLabel\" | \"muted\" | \"primary\" | \"shiki\" | \"success\" | \"title\" | \"warn\" | `#${string}`)",
            value: input
        }, _errorFactory)) && (true === _av2.has(input) || "string" === typeof input && RegExp(/^#(.*)/).test(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "(\"accent\" | \"bg\" | \"border\" | \"borderTitle\" | \"code\" | \"codeTitle\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"dim\" | \"error\" | \"fg\" | \"info\" | \"line\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"menuActive\" | \"menuHint\" | \"menuLabel\" | \"muted\" | \"primary\" | \"shiki\" | \"success\" | \"title\" | \"warn\" | `#${string}`)",
            value: input
        }, _errorFactory)))(input, "$input", true);
    }
    return input;
}; })();
const toAlphaColor = (() => { const _iv1 = new Set(["shiki", "fg", "bg", "primary", "accent", "dim", "muted", "success", "info", "warn", "error", "title", "border", "borderTitle", "line", "mdBold", "mdItalic", "mdStrikethrough", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHr", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdTable", "mdTableHeader", "menuLabel", "menuHint", "menuActive", "code", "codeTitle", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle"]); const _av2 = new Set(["shiki", "fg", "bg", "primary", "accent", "dim", "muted", "success", "info", "warn", "error", "title", "border", "borderTitle", "line", "mdBold", "mdItalic", "mdStrikethrough", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHr", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdTable", "mdTableHeader", "menuLabel", "menuHint", "menuActive", "code", "codeTitle", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle"]); const __is = (input: any): input is ThemeKey => true === _iv1.has(input); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): ThemeKey => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => true === _av2.has(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "(\"accent\" | \"bg\" | \"border\" | \"borderTitle\" | \"code\" | \"codeTitle\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"dim\" | \"error\" | \"fg\" | \"info\" | \"line\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"menuActive\" | \"menuHint\" | \"menuLabel\" | \"muted\" | \"primary\" | \"shiki\" | \"success\" | \"title\" | \"warn\")",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
const toStyle = (() => { const _io0 = (input: any): boolean => (undefined === input.dim || "boolean" === typeof input.dim) && (undefined === input.bold || "boolean" === typeof input.bold) && (undefined === input.italic || "boolean" === typeof input.italic) && (undefined === input.underline || "boolean" === typeof input.underline) && (undefined === input.inverse || "boolean" === typeof input.inverse) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough) && (undefined === input.fg || "string" === typeof input.fg) && (undefined === input.bg || "string" === typeof input.bg); const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.dim || "boolean" === typeof input.dim || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssert",
    path: _path + ".dim",
    expected: "(boolean | undefined)",
    value: input.dim
}, _errorFactory)) && (undefined === input.bold || "boolean" === typeof input.bold || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssert",
    path: _path + ".bold",
    expected: "(boolean | undefined)",
    value: input.bold
}, _errorFactory)) && (undefined === input.italic || "boolean" === typeof input.italic || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssert",
    path: _path + ".italic",
    expected: "(boolean | undefined)",
    value: input.italic
}, _errorFactory)) && (undefined === input.underline || "boolean" === typeof input.underline || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssert",
    path: _path + ".underline",
    expected: "(boolean | undefined)",
    value: input.underline
}, _errorFactory)) && (undefined === input.inverse || "boolean" === typeof input.inverse || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssert",
    path: _path + ".inverse",
    expected: "(boolean | undefined)",
    value: input.inverse
}, _errorFactory)) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssert",
    path: _path + ".strikethrough",
    expected: "(boolean | undefined)",
    value: input.strikethrough
}, _errorFactory)) && (undefined === input.fg || "string" === typeof input.fg || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssert",
    path: _path + ".fg",
    expected: "(string | undefined)",
    value: input.fg
}, _errorFactory)) && (undefined === input.bg || "string" === typeof input.bg || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssert",
    path: _path + ".bg",
    expected: "(string | undefined)",
    value: input.bg
}, _errorFactory)); const __is = (input: any): input is UserStyle => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): UserStyle => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "UserStyle",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "UserStyle",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
const toStep = (() => { const _iv1 = new Set(["100", "200", "300", "400", "50", "500", "600", "700", "800", "900", "950"]); const _av2 = new Set(["100", "200", "300", "400", "50", "500", "600", "700", "800", "900", "950"]); const __is = (input: any): input is ColorStep => true === _iv1.has(input); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): ColorStep => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => true === _av2.has(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssert",
            path: _path + "",
            expected: "(\"100\" | \"200\" | \"300\" | \"400\" | \"50\" | \"500\" | \"600\" | \"700\" | \"800\" | \"900\" | \"950\")",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
const isColorKey = (() => { const _iv1 = new Set(["fg", "bg", "primary", "accent", "dim", "muted", "success", "info", "warn", "error"]); return (input: any): input is ColorKeys<Theme> => true === _iv1.has(input); })();
function toColor(value: unknown) {
    if (typeof value !== "string")
        return toBaseColor(value); // will throw
    const color = value.replace(/\/\d+/, "").replace(/-\d+/, "");
    if (value.match(/\/\d+/))
        toAlphaColor(color);
    const step = value.match(/-(\d+)/);
    if (step) {
        toStep(step[1]);
        return toStepColor(color);
    }
    return toBaseColor(color);
}
const validator = (() => { const _iv1 = new Set(["red", "andromeeda", "aurora-x", "ayu-dark", "ayu-light", "ayu-mirage", "catppuccin-frappe", "catppuccin-latte", "catppuccin-macchiato", "catppuccin-mocha", "dark-plus", "dracula", "dracula-soft", "everforest-dark", "everforest-light", "github-dark", "github-dark-default", "github-dark-dimmed", "github-dark-high-contrast", "github-light", "github-light-default", "github-light-high-contrast", "gruvbox-dark-hard", "gruvbox-dark-medium", "gruvbox-dark-soft", "gruvbox-light-hard", "gruvbox-light-medium", "gruvbox-light-soft", "horizon", "horizon-bright", "houston", "kanagawa-dragon", "kanagawa-lotus", "kanagawa-wave", "laserwave", "light-plus", "material-theme", "material-theme-darker", "material-theme-lighter", "material-theme-ocean", "material-theme-palenight", "min-dark", "min-light", "monokai", "night-owl", "night-owl-light", "nord", "one-dark-pro", "one-light", "plastic", "poimandres", "rose-pine", "rose-pine-dawn", "rose-pine-moon", "slack-dark", "slack-ochin", "snazzy-light", "solarized-dark", "solarized-light", "synthwave-84", "tokyo-night", "vesper", "vitesse-black", "vitesse-dark", "vitesse-light"]); const _av2 = new Set(["red", "andromeeda", "aurora-x", "ayu-dark", "ayu-light", "ayu-mirage", "catppuccin-frappe", "catppuccin-latte", "catppuccin-macchiato", "catppuccin-mocha", "dark-plus", "dracula", "dracula-soft", "everforest-dark", "everforest-light", "github-dark", "github-dark-default", "github-dark-dimmed", "github-dark-high-contrast", "github-light", "github-light-default", "github-light-high-contrast", "gruvbox-dark-hard", "gruvbox-dark-medium", "gruvbox-dark-soft", "gruvbox-light-hard", "gruvbox-light-medium", "gruvbox-light-soft", "horizon", "horizon-bright", "houston", "kanagawa-dragon", "kanagawa-lotus", "kanagawa-wave", "laserwave", "light-plus", "material-theme", "material-theme-darker", "material-theme-lighter", "material-theme-ocean", "material-theme-palenight", "min-dark", "min-light", "monokai", "night-owl", "night-owl-light", "nord", "one-dark-pro", "one-light", "plastic", "poimandres", "rose-pine", "rose-pine-dawn", "rose-pine-moon", "slack-dark", "slack-ochin", "snazzy-light", "solarized-dark", "solarized-light", "synthwave-84", "tokyo-night", "vesper", "vitesse-black", "vitesse-dark", "vitesse-light"]); const _io0 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema) && (undefined === input.shiki || true === _iv1.has(input.shiki)) && Object.keys(input).every((key: any) => {
    if (["$schema", "shiki"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return null !== value && (undefined === value || "string" === typeof value || "object" === typeof value && null !== value && false === Array.isArray(value) && _io1(value, true && _exceptionable));
}); const _io1 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.dim || "boolean" === typeof input.dim) && (undefined === input.bold || "boolean" === typeof input.bold) && (undefined === input.italic || "boolean" === typeof input.italic) && (undefined === input.underline || "boolean" === typeof input.underline) && (undefined === input.inverse || "boolean" === typeof input.inverse) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough) && (undefined === input.fg || "string" === typeof input.fg) && (undefined === input.bg || "string" === typeof input.bg) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["dim", "bold", "italic", "underline", "inverse", "strikethrough", "fg", "bg"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".$schema",
    expected: "(string | undefined)",
    value: input.$schema
}, _errorFactory)) && (undefined === input.shiki || true === _av2.has(input.shiki) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".shiki",
    expected: "(\"andromeeda\" | \"aurora-x\" | \"ayu-dark\" | \"ayu-light\" | \"ayu-mirage\" | \"catppuccin-frappe\" | \"catppuccin-latte\" | \"catppuccin-macchiato\" | \"catppuccin-mocha\" | \"dark-plus\" | \"dracula\" | \"dracula-soft\" | \"everforest-dark\" | \"everforest-light\" | \"github-dark\" | \"github-dark-default\" | \"github-dark-dimmed\" | \"github-dark-high-contrast\" | \"github-light\" | \"github-light-default\" | \"github-light-high-contrast\" | \"gruvbox-dark-hard\" | \"gruvbox-dark-medium\" | \"gruvbox-dark-soft\" | \"gruvbox-light-hard\" | \"gruvbox-light-medium\" | \"gruvbox-light-soft\" | \"horizon\" | \"horizon-bright\" | \"houston\" | \"kanagawa-dragon\" | \"kanagawa-lotus\" | \"kanagawa-wave\" | \"laserwave\" | \"light-plus\" | \"material-theme\" | \"material-theme-darker\" | \"material-theme-lighter\" | \"material-theme-ocean\" | \"material-theme-palenight\" | \"min-dark\" | \"min-light\" | \"monokai\" | \"night-owl\" | \"night-owl-light\" | \"nord\" | \"one-dark-pro\" | \"one-light\" | \"plastic\" | \"poimandres\" | \"red\" | \"rose-pine\" | \"rose-pine-dawn\" | \"rose-pine-moon\" | \"slack-dark\" | \"slack-ochin\" | \"snazzy-light\" | \"solarized-dark\" | \"solarized-light\" | \"synthwave-84\" | \"tokyo-night\" | \"vesper\" | \"vitesse-black\" | \"vitesse-dark\" | \"vitesse-light\" | undefined)",
    value: input.shiki
}, _errorFactory)) && (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["$schema", "shiki"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return (null !== value || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(UserStyle | string | undefined)",
        value: value
    }, _errorFactory)) && (undefined === value || "string" === typeof value || ("object" === typeof value && null !== value && false === Array.isArray(value) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(UserStyle | string | undefined)",
        value: value
    }, _errorFactory)) && _ao1(value, _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key), true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(UserStyle | string | undefined)",
        value: value
    }, _errorFactory));
})); const _ao1 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.dim || "boolean" === typeof input.dim || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".dim",
    expected: "(boolean | undefined)",
    value: input.dim
}, _errorFactory)) && (undefined === input.bold || "boolean" === typeof input.bold || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".bold",
    expected: "(boolean | undefined)",
    value: input.bold
}, _errorFactory)) && (undefined === input.italic || "boolean" === typeof input.italic || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".italic",
    expected: "(boolean | undefined)",
    value: input.italic
}, _errorFactory)) && (undefined === input.underline || "boolean" === typeof input.underline || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".underline",
    expected: "(boolean | undefined)",
    value: input.underline
}, _errorFactory)) && (undefined === input.inverse || "boolean" === typeof input.inverse || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".inverse",
    expected: "(boolean | undefined)",
    value: input.inverse
}, _errorFactory)) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".strikethrough",
    expected: "(boolean | undefined)",
    value: input.strikethrough
}, _errorFactory)) && (undefined === input.fg || "string" === typeof input.fg || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".fg",
    expected: "(string | undefined)",
    value: input.fg
}, _errorFactory)) && (undefined === input.bg || "string" === typeof input.bg || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "createAssertEquals",
    path: _path + ".bg",
    expected: "(string | undefined)",
    value: input.bg
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["dim", "bold", "italic", "underline", "inverse", "strikethrough", "fg", "bg"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "undefined",
        value: value
    }, _errorFactory);
}))); const __is = (input: any, _exceptionable: boolean = true): input is Partial<UserTheme> => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input, true); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): Partial<UserTheme> => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssertEquals",
            path: _path + "",
            expected: "Partial<UserTheme>",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "createAssertEquals",
            path: _path + "",
            expected: "Partial<UserTheme>",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
export function validateTheme(input: unknown): Partial<UserTheme> {
    const out = validator(input);
    for (const [slot, value] of Object.entries(out)) {
        if (slot === "$schema" || slot === "shiki" || value === undefined)
            continue;
        if (typeof value === "string" && toColor(value))
            continue;
        if (isColorKey(slot))
            toColor(value);
        const style = toStyle(value);
        if (style.fg !== undefined)
            toColor(style.fg);
        if (style.bg !== undefined)
            toColor(style.bg);
    }
    return out as unknown as Partial<Theme> & {
        $schema?: string;
    };
}
