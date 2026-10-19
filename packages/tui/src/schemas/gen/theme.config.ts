import * as _assertGuard_1 from "typia/lib/internal/_assertGuard";
import * as _accessExpressionAsString_1 from "typia/lib/internal/_accessExpressionAsString";
const __typia_transform__accessExpressionAsString = _accessExpressionAsString_1._accessExpressionAsString;
// oxlint-disable import/no-named-as-default-member
import type { ShikiSelection } from "../../shiki/types.ts";
import type { AnsiColorName, BrightAnsiColorName, Color, HexColor, Style, ThemeKey, } from "../../style/types.ts";
import type { CustomTheme } from "../../themes/default.ts";
import type { Theme } from "../../themes/types.ts";
type UserStyle = Omit<Style, "fg" | "bg" | "style"> & {
    fg?: string;
    bg?: string;
};
// Preserve required slots without expanding the full color/style unions in the validator.
type RequiredThemeFields = {
    [K in keyof CustomTheme as {} extends Pick<CustomTheme, K> ? never : K]-?: string | UserStyle;
};
type UserTheme = {
    $schema?: string;
    shiki?: ShikiSelection;
    id: string;
    name?: string;
    mode?: Theme["mode"];
} & RequiredThemeFields & Record<string, string | UserStyle>;
type ColorKeys<T> = {
    [K in keyof T]-?: [
        T[K]
    ] extends [
        Color
    ] ? K : never;
}[keyof T];
const toBaseColor = (() => {
    const _iv0 = new Set(["accent", "bg", "black", "blue", "border", "borderTitle", "brightBlack", "brightBlue", "brightCyan", "brightGray", "brightGreen", "brightGrey", "brightMagenta", "brightRed", "brightWhite", "brightYellow", "code", "codeTitle", "comment", "cyan", "delim", "diffAdd", "diffAddNum", "diffContext", "diffContextNum", "diffDel", "diffDelNum", "divider", "error", "fg", "gray", "green", "grey", "gutter", "highlight", "info", "inherit", "magenta", "mdBold", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdHr", "mdItalic", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdStrikethrough", "mdTable", "mdTableHeader", "muted", "optionActive", "optionDesc", "optionName", "overlay", "primary", "prompt", "quiet", "red", "selection", "success", "syntaxBoolean", "syntaxBracket", "syntaxConstant", "syntaxDelimiter", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "title", "ui", "warn", "white", "yellow"]);
    const _av0 = new Set(["accent", "bg", "black", "blue", "border", "borderTitle", "brightBlack", "brightBlue", "brightCyan", "brightGray", "brightGreen", "brightGrey", "brightMagenta", "brightRed", "brightWhite", "brightYellow", "code", "codeTitle", "comment", "cyan", "delim", "diffAdd", "diffAddNum", "diffContext", "diffContextNum", "diffDel", "diffDelNum", "divider", "error", "fg", "gray", "green", "grey", "gutter", "highlight", "info", "inherit", "magenta", "mdBold", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdHr", "mdItalic", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdStrikethrough", "mdTable", "mdTableHeader", "muted", "optionActive", "optionDesc", "optionName", "overlay", "primary", "prompt", "quiet", "red", "selection", "success", "syntaxBoolean", "syntaxBracket", "syntaxConstant", "syntaxDelimiter", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "title", "ui", "warn", "white", "yellow"]);
    const _ae0 = "(\"accent\" | \"bg\" | \"black\" | \"blue\" | \"border\" | \"borderTitle\" | \"brightBlack\" | \"brightBlue\" | \"brightCyan\" | \"brightGray\" | \"brightGreen\" | \"brightGrey\" | \"brightMagenta\" | \"brightRed\" | \"brightWhite\" | \"brightYellow\" | \"code\" | \"codeTitle\" | \"comment\" | \"cyan\" | \"delim\" | \"diffAdd\" | \"diffAddNum\" | \"diffContext\" | \"diffContextNum\" | \"diffDel\" | \"diffDelNum\" | \"divider\" | \"error\" | \"fg\" | \"gray\" | \"green\" | \"grey\" | \"gutter\" | \"highlight\" | \"info\" | \"inherit\" | \"magenta\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"muted\" | \"optionActive\" | \"optionDesc\" | \"optionName\" | \"overlay\" | \"primary\" | \"prompt\" | \"quiet\" | \"red\" | \"selection\" | \"success\" | \"syntaxBoolean\" | \"syntaxBracket\" | \"syntaxConstant\" | \"syntaxDelimiter\" | \"syntaxField\" | \"syntaxFunction\" | \"syntaxNumber\" | \"syntaxSpecial\" | \"syntaxString\" | \"title\" | \"ui\" | \"warn\" | \"white\" | \"yellow\" | `#${string}`)";
    const __is = (input: any): input is HexColor | AnsiColorName | BrightAnsiColorName | ThemeKey | "inherit" => null !== input && undefined !== input && (true === _iv0.has(input) || "string" === typeof input && RegExp(/^#(.*)/).test(input));
    let _errorFactory: any;
    return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): HexColor | AnsiColorName | BrightAnsiColorName | ThemeKey | "inherit" => {
        if (false === __is(input)) {
            _errorFactory = errorFactory;
            ((input: any, _path: string, _exceptionable: boolean = true) => (null !== input || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssert",
                path: _path + "",
                expected: _ae0,
                value: input
            }, _errorFactory)) && (undefined !== input || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssert",
                path: _path + "",
                expected: _ae0,
                value: input
            }, _errorFactory)) && (true === _av0.has(input) || "string" === typeof input && RegExp(/^#(.*)/).test(input) || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssert",
                path: _path + "",
                expected: _ae0,
                value: input
            }, _errorFactory)))(input, "$input", true);
        }
        return input;
    };
})();
const toLightnessColor = (() => {
    const _iv0 = new Set(["accent", "bg", "border", "borderTitle", "code", "codeTitle", "comment", "delim", "diffAdd", "diffAddNum", "diffContext", "diffContextNum", "diffDel", "diffDelNum", "divider", "error", "fg", "gutter", "highlight", "info", "mdBold", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdHr", "mdItalic", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdStrikethrough", "mdTable", "mdTableHeader", "muted", "optionActive", "optionDesc", "optionName", "overlay", "primary", "prompt", "quiet", "selection", "success", "syntaxBoolean", "syntaxBracket", "syntaxConstant", "syntaxDelimiter", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "title", "ui", "warn"]);
    const _av0 = new Set(["accent", "bg", "border", "borderTitle", "code", "codeTitle", "comment", "delim", "diffAdd", "diffAddNum", "diffContext", "diffContextNum", "diffDel", "diffDelNum", "divider", "error", "fg", "gutter", "highlight", "info", "mdBold", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdHr", "mdItalic", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdStrikethrough", "mdTable", "mdTableHeader", "muted", "optionActive", "optionDesc", "optionName", "overlay", "primary", "prompt", "quiet", "selection", "success", "syntaxBoolean", "syntaxBracket", "syntaxConstant", "syntaxDelimiter", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "title", "ui", "warn"]);
    const _ae0 = "(\"accent\" | \"bg\" | \"border\" | \"borderTitle\" | \"code\" | \"codeTitle\" | \"comment\" | \"delim\" | \"diffAdd\" | \"diffAddNum\" | \"diffContext\" | \"diffContextNum\" | \"diffDel\" | \"diffDelNum\" | \"divider\" | \"error\" | \"fg\" | \"gutter\" | \"highlight\" | \"info\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"muted\" | \"optionActive\" | \"optionDesc\" | \"optionName\" | \"overlay\" | \"primary\" | \"prompt\" | \"quiet\" | \"selection\" | \"success\" | \"syntaxBoolean\" | \"syntaxBracket\" | \"syntaxConstant\" | \"syntaxDelimiter\" | \"syntaxField\" | \"syntaxFunction\" | \"syntaxNumber\" | \"syntaxSpecial\" | \"syntaxString\" | \"title\" | \"ui\" | \"warn\" | `#${string}`)";
    const __is = (input: any): input is HexColor | ThemeKey => null !== input && undefined !== input && (true === _iv0.has(input) || "string" === typeof input && RegExp(/^#(.*)/).test(input));
    let _errorFactory: any;
    return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): HexColor | ThemeKey => {
        if (false === __is(input)) {
            _errorFactory = errorFactory;
            ((input: any, _path: string, _exceptionable: boolean = true) => (null !== input || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssert",
                path: _path + "",
                expected: _ae0,
                value: input
            }, _errorFactory)) && (undefined !== input || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssert",
                path: _path + "",
                expected: _ae0,
                value: input
            }, _errorFactory)) && (true === _av0.has(input) || "string" === typeof input && RegExp(/^#(.*)/).test(input) || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssert",
                path: _path + "",
                expected: _ae0,
                value: input
            }, _errorFactory)))(input, "$input", true);
        }
        return input;
    };
})();
const toStyle = (() => {
    const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => _ao1(input, _path, true && _exceptionable) && ((undefined === input.fg || "string" === typeof input.fg || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssert",
        path: _path + ".fg",
        expected: "(string | undefined)",
        value: input.fg
    }, _errorFactory)) && (undefined === input.bg || "string" === typeof input.bg || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssert",
        path: _path + ".bg",
        expected: "(string | undefined)",
        value: input.bg
    }, _errorFactory)));
    const _ao1 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.bold || "boolean" === typeof input.bold || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssert",
        path: _path + ".bold",
        expected: "(boolean | undefined)",
        value: input.bold
    }, _errorFactory)) && (undefined === input.dim || "boolean" === typeof input.dim || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssert",
        path: _path + ".dim",
        expected: "(boolean | undefined)",
        value: input.dim
    }, _errorFactory)) && (undefined === input.italic || "boolean" === typeof input.italic || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssert",
        path: _path + ".italic",
        expected: "(boolean | undefined)",
        value: input.italic
    }, _errorFactory)) && (undefined === input.underline || "boolean" === typeof input.underline || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssert",
        path: _path + ".underline",
        expected: "(boolean | undefined)",
        value: input.underline
    }, _errorFactory)) && (undefined === input.inverse || "boolean" === typeof input.inverse || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssert",
        path: _path + ".inverse",
        expected: "(boolean | undefined)",
        value: input.inverse
    }, _errorFactory)) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssert",
        path: _path + ".strikethrough",
        expected: "(boolean | undefined)",
        value: input.strikethrough
    }, _errorFactory));
    const _io0 = (input: any): boolean => _io1(input) && ((undefined === input.fg || "string" === typeof input.fg) && (undefined === input.bg || "string" === typeof input.bg));
    const _io1 = (input: any): boolean => (undefined === input.bold || "boolean" === typeof input.bold) && (undefined === input.dim || "boolean" === typeof input.dim) && (undefined === input.italic || "boolean" === typeof input.italic) && (undefined === input.underline || "boolean" === typeof input.underline) && (undefined === input.inverse || "boolean" === typeof input.inverse) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough);
    const __is = (input: any): input is UserStyle => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input);
    let _errorFactory: any;
    return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): UserStyle => {
        if (false === __is(input)) {
            _errorFactory = errorFactory;
            ((input: any, _path: string, _exceptionable: boolean = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssert",
                path: _path + "",
                expected: "UserStyle",
                value: input
            }, _errorFactory)) && _ao0(input, _path + "", true) || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssert",
                path: _path + "",
                expected: "UserStyle",
                value: input
            }, _errorFactory))(input, "$input", true);
        }
        return input;
    };
})();
const isColorKey = (() => {
    return (input: any): input is ColorKeys<Theme> => "accent" === input || "bg" === input || "error" === input || "fg" === input || "info" === input || "primary" === input || "success" === input || "warn" === input;
})();
function toColor(value: unknown) {
    if (typeof value !== "string")
        return toBaseColor(value); // will throw
    const color = value.replace(/[+-]\d+/, "");
    if (value.match(/[+-]\d+/))
        toLightnessColor(color);
    return toBaseColor(color);
}
const validator = (() => {
    const _iv0 = new Set(["andromeeda", "aurora-x", "auto", "ayu-dark", "ayu-light", "ayu-mirage", "catppuccin-frappe", "catppuccin-latte", "catppuccin-macchiato", "catppuccin-mocha", "dark-plus", "dracula", "dracula-soft", "everforest-dark", "everforest-light", "github-dark", "github-dark-default", "github-dark-dimmed", "github-dark-high-contrast", "github-light", "github-light-default", "github-light-high-contrast", "gruvbox-dark-hard", "gruvbox-dark-medium", "gruvbox-dark-soft", "gruvbox-light-hard", "gruvbox-light-medium", "gruvbox-light-soft", "horizon", "horizon-bright", "houston", "kanagawa-dragon", "kanagawa-lotus", "kanagawa-wave", "laserwave", "light-plus", "material-theme", "material-theme-darker", "material-theme-lighter", "material-theme-ocean", "material-theme-palenight", "min-dark", "min-light", "monokai", "night-owl", "night-owl-light", "nord", "one-dark-pro", "one-light", "plastic", "poimandres", "red", "rose-pine", "rose-pine-dawn", "rose-pine-moon", "slack-dark", "slack-ochin", "snazzy-light", "solarized-dark", "solarized-light", "synthwave-84", "tokyo-night", "vesper", "vitesse-black", "vitesse-dark", "vitesse-light"]);
    const _av0 = new Set(["andromeeda", "aurora-x", "auto", "ayu-dark", "ayu-light", "ayu-mirage", "catppuccin-frappe", "catppuccin-latte", "catppuccin-macchiato", "catppuccin-mocha", "dark-plus", "dracula", "dracula-soft", "everforest-dark", "everforest-light", "github-dark", "github-dark-default", "github-dark-dimmed", "github-dark-high-contrast", "github-light", "github-light-default", "github-light-high-contrast", "gruvbox-dark-hard", "gruvbox-dark-medium", "gruvbox-dark-soft", "gruvbox-light-hard", "gruvbox-light-medium", "gruvbox-light-soft", "horizon", "horizon-bright", "houston", "kanagawa-dragon", "kanagawa-lotus", "kanagawa-wave", "laserwave", "light-plus", "material-theme", "material-theme-darker", "material-theme-lighter", "material-theme-ocean", "material-theme-palenight", "min-dark", "min-light", "monokai", "night-owl", "night-owl-light", "nord", "one-dark-pro", "one-light", "plastic", "poimandres", "red", "rose-pine", "rose-pine-dawn", "rose-pine-moon", "slack-dark", "slack-ochin", "snazzy-light", "solarized-dark", "solarized-light", "synthwave-84", "tokyo-night", "vesper", "vitesse-black", "vitesse-dark", "vitesse-light"]);
    const _ae0 = "(\"andromeeda\" | \"aurora-x\" | \"auto\" | \"ayu-dark\" | \"ayu-light\" | \"ayu-mirage\" | \"catppuccin-frappe\" | \"catppuccin-latte\" | \"catppuccin-macchiato\" | \"catppuccin-mocha\" | \"dark-plus\" | \"dracula\" | \"dracula-soft\" | \"everforest-dark\" | \"everforest-light\" | \"github-dark\" | \"github-dark-default\" | \"github-dark-dimmed\" | \"github-dark-high-contrast\" | \"github-light\" | \"github-light-default\" | \"github-light-high-contrast\" | \"gruvbox-dark-hard\" | \"gruvbox-dark-medium\" | \"gruvbox-dark-soft\" | \"gruvbox-light-hard\" | \"gruvbox-light-medium\" | \"gruvbox-light-soft\" | \"horizon\" | \"horizon-bright\" | \"houston\" | \"kanagawa-dragon\" | \"kanagawa-lotus\" | \"kanagawa-wave\" | \"laserwave\" | \"light-plus\" | \"material-theme\" | \"material-theme-darker\" | \"material-theme-lighter\" | \"material-theme-ocean\" | \"material-theme-palenight\" | \"min-dark\" | \"min-light\" | \"monokai\" | \"night-owl\" | \"night-owl-light\" | \"nord\" | \"one-dark-pro\" | \"one-light\" | \"plastic\" | \"poimandres\" | \"red\" | \"rose-pine\" | \"rose-pine-dawn\" | \"rose-pine-moon\" | \"slack-dark\" | \"slack-ochin\" | \"snazzy-light\" | \"solarized-dark\" | \"solarized-light\" | \"synthwave-84\" | \"tokyo-night\" | \"vesper\" | \"vitesse-black\" | \"vitesse-dark\" | \"vitesse-light\" | undefined)";
    const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (null !== input.fg || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".fg",
        expected: "(UserStyle | string)",
        value: input.fg
    }, _errorFactory)) && (undefined !== input.fg || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".fg",
        expected: "(UserStyle | string)",
        value: input.fg
    }, _errorFactory)) && ("string" === typeof input.fg || ("object" === typeof input.fg && null !== input.fg && false === Array.isArray(input.fg) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".fg",
        expected: "(UserStyle | string)",
        value: input.fg
    }, _errorFactory)) && _ao1(input.fg, _path + ".fg", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".fg",
        expected: "(UserStyle | string)",
        value: input.fg
    }, _errorFactory)) && ((null !== input.bg || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".bg",
        expected: "(UserStyle | string)",
        value: input.bg
    }, _errorFactory)) && (undefined !== input.bg || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".bg",
        expected: "(UserStyle | string)",
        value: input.bg
    }, _errorFactory)) && ("string" === typeof input.bg || ("object" === typeof input.bg && null !== input.bg && false === Array.isArray(input.bg) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".bg",
        expected: "(UserStyle | string)",
        value: input.bg
    }, _errorFactory)) && _ao1(input.bg, _path + ".bg", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".bg",
        expected: "(UserStyle | string)",
        value: input.bg
    }, _errorFactory))) && ((null !== input.primary || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".primary",
        expected: "(UserStyle | string)",
        value: input.primary
    }, _errorFactory)) && (undefined !== input.primary || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".primary",
        expected: "(UserStyle | string)",
        value: input.primary
    }, _errorFactory)) && ("string" === typeof input.primary || ("object" === typeof input.primary && null !== input.primary && false === Array.isArray(input.primary) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".primary",
        expected: "(UserStyle | string)",
        value: input.primary
    }, _errorFactory)) && _ao1(input.primary, _path + ".primary", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".primary",
        expected: "(UserStyle | string)",
        value: input.primary
    }, _errorFactory))) && ((null !== input.accent || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".accent",
        expected: "(UserStyle | string)",
        value: input.accent
    }, _errorFactory)) && (undefined !== input.accent || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".accent",
        expected: "(UserStyle | string)",
        value: input.accent
    }, _errorFactory)) && ("string" === typeof input.accent || ("object" === typeof input.accent && null !== input.accent && false === Array.isArray(input.accent) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".accent",
        expected: "(UserStyle | string)",
        value: input.accent
    }, _errorFactory)) && _ao1(input.accent, _path + ".accent", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".accent",
        expected: "(UserStyle | string)",
        value: input.accent
    }, _errorFactory))) && ((null !== input.selection || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".selection",
        expected: "(UserStyle | string)",
        value: input.selection
    }, _errorFactory)) && (undefined !== input.selection || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".selection",
        expected: "(UserStyle | string)",
        value: input.selection
    }, _errorFactory)) && ("string" === typeof input.selection || ("object" === typeof input.selection && null !== input.selection && false === Array.isArray(input.selection) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".selection",
        expected: "(UserStyle | string)",
        value: input.selection
    }, _errorFactory)) && _ao1(input.selection, _path + ".selection", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".selection",
        expected: "(UserStyle | string)",
        value: input.selection
    }, _errorFactory))) && ((null !== input.success || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".success",
        expected: "(UserStyle | string)",
        value: input.success
    }, _errorFactory)) && (undefined !== input.success || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".success",
        expected: "(UserStyle | string)",
        value: input.success
    }, _errorFactory)) && ("string" === typeof input.success || ("object" === typeof input.success && null !== input.success && false === Array.isArray(input.success) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".success",
        expected: "(UserStyle | string)",
        value: input.success
    }, _errorFactory)) && _ao1(input.success, _path + ".success", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".success",
        expected: "(UserStyle | string)",
        value: input.success
    }, _errorFactory))) && ((null !== input.info || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".info",
        expected: "(UserStyle | string)",
        value: input.info
    }, _errorFactory)) && (undefined !== input.info || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".info",
        expected: "(UserStyle | string)",
        value: input.info
    }, _errorFactory)) && ("string" === typeof input.info || ("object" === typeof input.info && null !== input.info && false === Array.isArray(input.info) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".info",
        expected: "(UserStyle | string)",
        value: input.info
    }, _errorFactory)) && _ao1(input.info, _path + ".info", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".info",
        expected: "(UserStyle | string)",
        value: input.info
    }, _errorFactory))) && ((null !== input.warn || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".warn",
        expected: "(UserStyle | string)",
        value: input.warn
    }, _errorFactory)) && (undefined !== input.warn || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".warn",
        expected: "(UserStyle | string)",
        value: input.warn
    }, _errorFactory)) && ("string" === typeof input.warn || ("object" === typeof input.warn && null !== input.warn && false === Array.isArray(input.warn) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".warn",
        expected: "(UserStyle | string)",
        value: input.warn
    }, _errorFactory)) && _ao1(input.warn, _path + ".warn", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".warn",
        expected: "(UserStyle | string)",
        value: input.warn
    }, _errorFactory))) && ((null !== input.error || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".error",
        expected: "(UserStyle | string)",
        value: input.error
    }, _errorFactory)) && (undefined !== input.error || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".error",
        expected: "(UserStyle | string)",
        value: input.error
    }, _errorFactory)) && ("string" === typeof input.error || ("object" === typeof input.error && null !== input.error && false === Array.isArray(input.error) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".error",
        expected: "(UserStyle | string)",
        value: input.error
    }, _errorFactory)) && _ao1(input.error, _path + ".error", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".error",
        expected: "(UserStyle | string)",
        value: input.error
    }, _errorFactory))) && ((null !== input.syntaxBoolean || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxBoolean",
        expected: "(UserStyle | string)",
        value: input.syntaxBoolean
    }, _errorFactory)) && (undefined !== input.syntaxBoolean || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxBoolean",
        expected: "(UserStyle | string)",
        value: input.syntaxBoolean
    }, _errorFactory)) && ("string" === typeof input.syntaxBoolean || ("object" === typeof input.syntaxBoolean && null !== input.syntaxBoolean && false === Array.isArray(input.syntaxBoolean) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxBoolean",
        expected: "(UserStyle | string)",
        value: input.syntaxBoolean
    }, _errorFactory)) && _ao1(input.syntaxBoolean, _path + ".syntaxBoolean", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxBoolean",
        expected: "(UserStyle | string)",
        value: input.syntaxBoolean
    }, _errorFactory))) && ((null !== input.syntaxConstant || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxConstant",
        expected: "(UserStyle | string)",
        value: input.syntaxConstant
    }, _errorFactory)) && (undefined !== input.syntaxConstant || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxConstant",
        expected: "(UserStyle | string)",
        value: input.syntaxConstant
    }, _errorFactory)) && ("string" === typeof input.syntaxConstant || ("object" === typeof input.syntaxConstant && null !== input.syntaxConstant && false === Array.isArray(input.syntaxConstant) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxConstant",
        expected: "(UserStyle | string)",
        value: input.syntaxConstant
    }, _errorFactory)) && _ao1(input.syntaxConstant, _path + ".syntaxConstant", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxConstant",
        expected: "(UserStyle | string)",
        value: input.syntaxConstant
    }, _errorFactory))) && ((null !== input.syntaxField || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxField",
        expected: "(UserStyle | string)",
        value: input.syntaxField
    }, _errorFactory)) && (undefined !== input.syntaxField || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxField",
        expected: "(UserStyle | string)",
        value: input.syntaxField
    }, _errorFactory)) && ("string" === typeof input.syntaxField || ("object" === typeof input.syntaxField && null !== input.syntaxField && false === Array.isArray(input.syntaxField) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxField",
        expected: "(UserStyle | string)",
        value: input.syntaxField
    }, _errorFactory)) && _ao1(input.syntaxField, _path + ".syntaxField", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxField",
        expected: "(UserStyle | string)",
        value: input.syntaxField
    }, _errorFactory))) && ((null !== input.syntaxFunction || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxFunction",
        expected: "(UserStyle | string)",
        value: input.syntaxFunction
    }, _errorFactory)) && (undefined !== input.syntaxFunction || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxFunction",
        expected: "(UserStyle | string)",
        value: input.syntaxFunction
    }, _errorFactory)) && ("string" === typeof input.syntaxFunction || ("object" === typeof input.syntaxFunction && null !== input.syntaxFunction && false === Array.isArray(input.syntaxFunction) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxFunction",
        expected: "(UserStyle | string)",
        value: input.syntaxFunction
    }, _errorFactory)) && _ao1(input.syntaxFunction, _path + ".syntaxFunction", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxFunction",
        expected: "(UserStyle | string)",
        value: input.syntaxFunction
    }, _errorFactory))) && ((null !== input.syntaxNumber || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxNumber",
        expected: "(UserStyle | string)",
        value: input.syntaxNumber
    }, _errorFactory)) && (undefined !== input.syntaxNumber || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxNumber",
        expected: "(UserStyle | string)",
        value: input.syntaxNumber
    }, _errorFactory)) && ("string" === typeof input.syntaxNumber || ("object" === typeof input.syntaxNumber && null !== input.syntaxNumber && false === Array.isArray(input.syntaxNumber) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxNumber",
        expected: "(UserStyle | string)",
        value: input.syntaxNumber
    }, _errorFactory)) && _ao1(input.syntaxNumber, _path + ".syntaxNumber", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxNumber",
        expected: "(UserStyle | string)",
        value: input.syntaxNumber
    }, _errorFactory))) && ((null !== input.syntaxSpecial || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxSpecial",
        expected: "(UserStyle | string)",
        value: input.syntaxSpecial
    }, _errorFactory)) && (undefined !== input.syntaxSpecial || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxSpecial",
        expected: "(UserStyle | string)",
        value: input.syntaxSpecial
    }, _errorFactory)) && ("string" === typeof input.syntaxSpecial || ("object" === typeof input.syntaxSpecial && null !== input.syntaxSpecial && false === Array.isArray(input.syntaxSpecial) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxSpecial",
        expected: "(UserStyle | string)",
        value: input.syntaxSpecial
    }, _errorFactory)) && _ao1(input.syntaxSpecial, _path + ".syntaxSpecial", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxSpecial",
        expected: "(UserStyle | string)",
        value: input.syntaxSpecial
    }, _errorFactory))) && ((null !== input.syntaxString || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxString",
        expected: "(UserStyle | string)",
        value: input.syntaxString
    }, _errorFactory)) && (undefined !== input.syntaxString || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxString",
        expected: "(UserStyle | string)",
        value: input.syntaxString
    }, _errorFactory)) && ("string" === typeof input.syntaxString || ("object" === typeof input.syntaxString && null !== input.syntaxString && false === Array.isArray(input.syntaxString) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxString",
        expected: "(UserStyle | string)",
        value: input.syntaxString
    }, _errorFactory)) && _ao1(input.syntaxString, _path + ".syntaxString", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".syntaxString",
        expected: "(UserStyle | string)",
        value: input.syntaxString
    }, _errorFactory))) && ((null !== input.diffAdd || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".diffAdd",
        expected: "(UserStyle | string)",
        value: input.diffAdd
    }, _errorFactory)) && (undefined !== input.diffAdd || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".diffAdd",
        expected: "(UserStyle | string)",
        value: input.diffAdd
    }, _errorFactory)) && ("string" === typeof input.diffAdd || ("object" === typeof input.diffAdd && null !== input.diffAdd && false === Array.isArray(input.diffAdd) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".diffAdd",
        expected: "(UserStyle | string)",
        value: input.diffAdd
    }, _errorFactory)) && _ao1(input.diffAdd, _path + ".diffAdd", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".diffAdd",
        expected: "(UserStyle | string)",
        value: input.diffAdd
    }, _errorFactory))) && ((null !== input.diffDel || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".diffDel",
        expected: "(UserStyle | string)",
        value: input.diffDel
    }, _errorFactory)) && (undefined !== input.diffDel || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".diffDel",
        expected: "(UserStyle | string)",
        value: input.diffDel
    }, _errorFactory)) && ("string" === typeof input.diffDel || ("object" === typeof input.diffDel && null !== input.diffDel && false === Array.isArray(input.diffDel) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".diffDel",
        expected: "(UserStyle | string)",
        value: input.diffDel
    }, _errorFactory)) && _ao1(input.diffDel, _path + ".diffDel", true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".diffDel",
        expected: "(UserStyle | string)",
        value: input.diffDel
    }, _errorFactory))) && (undefined === input.$schema || "string" === typeof input.$schema || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".$schema",
        expected: "(string | undefined)",
        value: input.$schema
    }, _errorFactory)) && (undefined === input.shiki || true === _av0.has(input.shiki) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".shiki",
        expected: _ae0,
        value: input.shiki
    }, _errorFactory)) && ("string" === typeof input.id || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".id",
        expected: "string",
        value: input.id
    }, _errorFactory)) && (undefined === input.name || "string" === typeof input.name || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".name",
        expected: "(string | undefined)",
        value: input.name
    }, _errorFactory)) && (undefined === input.mode || "dark" === input.mode || "light" === input.mode || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".mode",
        expected: "(\"dark\" | \"light\" | undefined)",
        value: input.mode
    }, _errorFactory)) && (false === _exceptionable || Object.keys(input).every((key: any) => {
        if (["fg", "bg", "primary", "accent", "selection", "success", "info", "warn", "error", "syntaxBoolean", "syntaxConstant", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "diffAdd", "diffDel", "$schema", "shiki", "id", "name", "mode"].some((prop: any) => key === prop))
            return true;
        const value = input[key];
        if (undefined === value)
            return true;
        return (null !== value || _assertGuard_1._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path + __typia_transform__accessExpressionAsString(key),
            expected: "(UserStyle | string)",
            value: value
        }, _errorFactory)) && (undefined !== value || _assertGuard_1._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path + __typia_transform__accessExpressionAsString(key),
            expected: "(UserStyle | string)",
            value: value
        }, _errorFactory)) && ("string" === typeof value || ("object" === typeof value && null !== value && false === Array.isArray(value) || _assertGuard_1._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path + __typia_transform__accessExpressionAsString(key),
            expected: "(UserStyle | string)",
            value: value
        }, _errorFactory)) && _ao1(value, _path + __typia_transform__accessExpressionAsString(key), true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path + __typia_transform__accessExpressionAsString(key),
            expected: "(UserStyle | string)",
            value: value
        }, _errorFactory));
    }));
    const _ao1 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.bold || "boolean" === typeof input.bold || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".bold",
        expected: "(boolean | undefined)",
        value: input.bold
    }, _errorFactory)) && (undefined === input.dim || "boolean" === typeof input.dim || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".dim",
        expected: "(boolean | undefined)",
        value: input.dim
    }, _errorFactory)) && (undefined === input.italic || "boolean" === typeof input.italic || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".italic",
        expected: "(boolean | undefined)",
        value: input.italic
    }, _errorFactory)) && (undefined === input.underline || "boolean" === typeof input.underline || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".underline",
        expected: "(boolean | undefined)",
        value: input.underline
    }, _errorFactory)) && (undefined === input.inverse || "boolean" === typeof input.inverse || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".inverse",
        expected: "(boolean | undefined)",
        value: input.inverse
    }, _errorFactory)) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".strikethrough",
        expected: "(boolean | undefined)",
        value: input.strikethrough
    }, _errorFactory)) && (undefined === input.fg || "string" === typeof input.fg || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".fg",
        expected: "(string | undefined)",
        value: input.fg
    }, _errorFactory)) && (undefined === input.bg || "string" === typeof input.bg || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".bg",
        expected: "(string | undefined)",
        value: input.bg
    }, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
        if (["bold", "dim", "italic", "underline", "inverse", "strikethrough", "fg", "bg"].some((prop: any) => key === prop))
            return true;
        const value = input[key];
        if (undefined === value)
            return true;
        return _assertGuard_1._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path + _accessExpressionAsString_1._accessExpressionAsString(key),
            expected: "undefined",
            value: value
        }, _errorFactory);
    })));
    const _io0 = (input: any, _exceptionable: boolean = true): boolean => null !== input.fg && undefined !== input.fg && ("string" === typeof input.fg || "object" === typeof input.fg && null !== input.fg && false === Array.isArray(input.fg) && _io1(input.fg, true && _exceptionable)) && (null !== input.bg && undefined !== input.bg && ("string" === typeof input.bg || "object" === typeof input.bg && null !== input.bg && false === Array.isArray(input.bg) && _io1(input.bg, true && _exceptionable))) && (null !== input.primary && undefined !== input.primary && ("string" === typeof input.primary || "object" === typeof input.primary && null !== input.primary && false === Array.isArray(input.primary) && _io1(input.primary, true && _exceptionable))) && (null !== input.accent && undefined !== input.accent && ("string" === typeof input.accent || "object" === typeof input.accent && null !== input.accent && false === Array.isArray(input.accent) && _io1(input.accent, true && _exceptionable))) && (null !== input.selection && undefined !== input.selection && ("string" === typeof input.selection || "object" === typeof input.selection && null !== input.selection && false === Array.isArray(input.selection) && _io1(input.selection, true && _exceptionable))) && (null !== input.success && undefined !== input.success && ("string" === typeof input.success || "object" === typeof input.success && null !== input.success && false === Array.isArray(input.success) && _io1(input.success, true && _exceptionable))) && (null !== input.info && undefined !== input.info && ("string" === typeof input.info || "object" === typeof input.info && null !== input.info && false === Array.isArray(input.info) && _io1(input.info, true && _exceptionable))) && (null !== input.warn && undefined !== input.warn && ("string" === typeof input.warn || "object" === typeof input.warn && null !== input.warn && false === Array.isArray(input.warn) && _io1(input.warn, true && _exceptionable))) && (null !== input.error && undefined !== input.error && ("string" === typeof input.error || "object" === typeof input.error && null !== input.error && false === Array.isArray(input.error) && _io1(input.error, true && _exceptionable))) && (null !== input.syntaxBoolean && undefined !== input.syntaxBoolean && ("string" === typeof input.syntaxBoolean || "object" === typeof input.syntaxBoolean && null !== input.syntaxBoolean && false === Array.isArray(input.syntaxBoolean) && _io1(input.syntaxBoolean, true && _exceptionable))) && (null !== input.syntaxConstant && undefined !== input.syntaxConstant && ("string" === typeof input.syntaxConstant || "object" === typeof input.syntaxConstant && null !== input.syntaxConstant && false === Array.isArray(input.syntaxConstant) && _io1(input.syntaxConstant, true && _exceptionable))) && (null !== input.syntaxField && undefined !== input.syntaxField && ("string" === typeof input.syntaxField || "object" === typeof input.syntaxField && null !== input.syntaxField && false === Array.isArray(input.syntaxField) && _io1(input.syntaxField, true && _exceptionable))) && (null !== input.syntaxFunction && undefined !== input.syntaxFunction && ("string" === typeof input.syntaxFunction || "object" === typeof input.syntaxFunction && null !== input.syntaxFunction && false === Array.isArray(input.syntaxFunction) && _io1(input.syntaxFunction, true && _exceptionable))) && (null !== input.syntaxNumber && undefined !== input.syntaxNumber && ("string" === typeof input.syntaxNumber || "object" === typeof input.syntaxNumber && null !== input.syntaxNumber && false === Array.isArray(input.syntaxNumber) && _io1(input.syntaxNumber, true && _exceptionable))) && (null !== input.syntaxSpecial && undefined !== input.syntaxSpecial && ("string" === typeof input.syntaxSpecial || "object" === typeof input.syntaxSpecial && null !== input.syntaxSpecial && false === Array.isArray(input.syntaxSpecial) && _io1(input.syntaxSpecial, true && _exceptionable))) && (null !== input.syntaxString && undefined !== input.syntaxString && ("string" === typeof input.syntaxString || "object" === typeof input.syntaxString && null !== input.syntaxString && false === Array.isArray(input.syntaxString) && _io1(input.syntaxString, true && _exceptionable))) && (null !== input.diffAdd && undefined !== input.diffAdd && ("string" === typeof input.diffAdd || "object" === typeof input.diffAdd && null !== input.diffAdd && false === Array.isArray(input.diffAdd) && _io1(input.diffAdd, true && _exceptionable))) && (null !== input.diffDel && undefined !== input.diffDel && ("string" === typeof input.diffDel || "object" === typeof input.diffDel && null !== input.diffDel && false === Array.isArray(input.diffDel) && _io1(input.diffDel, true && _exceptionable))) && (undefined === input.$schema || "string" === typeof input.$schema) && (undefined === input.shiki || true === _iv0.has(input.shiki)) && "string" === typeof input.id && (undefined === input.name || "string" === typeof input.name) && (undefined === input.mode || "dark" === input.mode || "light" === input.mode) && Object.keys(input).every((key: any) => {
        if (["fg", "bg", "primary", "accent", "selection", "success", "info", "warn", "error", "syntaxBoolean", "syntaxConstant", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "diffAdd", "diffDel", "$schema", "shiki", "id", "name", "mode"].some((prop: any) => key === prop))
            return true;
        const value = input[key];
        if (undefined === value)
            return true;
        return null !== value && undefined !== value && ("string" === typeof value || "object" === typeof value && null !== value && false === Array.isArray(value) && _io1(value, true && _exceptionable));
    });
    const _io1 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.bold || "boolean" === typeof input.bold) && (undefined === input.dim || "boolean" === typeof input.dim) && (undefined === input.italic || "boolean" === typeof input.italic) && (undefined === input.underline || "boolean" === typeof input.underline) && (undefined === input.inverse || "boolean" === typeof input.inverse) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough) && (undefined === input.fg || "string" === typeof input.fg) && (undefined === input.bg || "string" === typeof input.bg) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
        if (["bold", "dim", "italic", "underline", "inverse", "strikethrough", "fg", "bg"].some((prop: any) => key === prop))
            return true;
        const value = input[key];
        if (undefined === value)
            return true;
        return false;
    }));
    const __is = (input: any, _exceptionable: boolean = true): input is UserTheme => "object" === typeof input && null !== input && _io0(input, true);
    let _errorFactory: any;
    return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): UserTheme => {
        if (false === __is(input)) {
            _errorFactory = errorFactory;
            ((input: any, _path: string, _exceptionable: boolean = true) => ("object" === typeof input && null !== input || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssertEquals",
                path: _path + "",
                expected: "UserTheme",
                value: input
            }, _errorFactory)) && _ao0(input, _path + "", true) || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssertEquals",
                path: _path + "",
                expected: "UserTheme",
                value: input
            }, _errorFactory))(input, "$input", true);
        }
        return input;
    };
})();
const skipSlots = new Set(["$schema", "shiki", "id", "name", "mode"]);
export function validateTheme(input: unknown): CustomTheme {
    const out = validator(input);
    for (const [slot, value] of Object.entries(out)) {
        if (skipSlots.has(slot))
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
    return out as CustomTheme;
}
