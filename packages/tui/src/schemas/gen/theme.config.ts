import * as _assertGuard_1 from "typia/lib/internal/_assertGuard";
import * as _accessExpressionAsString_1 from "typia/lib/internal/_accessExpressionAsString";
const __typia_transform__accessExpressionAsString = _accessExpressionAsString_1._accessExpressionAsString;
// oxlint-disable import/no-named-as-default-member
import type { ShikiTheme } from "../../shiki/types.ts";
import type { AnsiColorName, BrightAnsiColorName, Color, HexColor, Style, ThemeKey, } from "../../style/types.ts";
import type { Theme } from "../../themes/types.ts";
type UserStyle = Omit<Style, "fg" | "bg" | "style"> & {
    fg?: string;
    bg?: string;
};
type UserTheme = {
    $schema?: string;
    shiki?: ShikiTheme;
    id: string;
    name?: string;
} & Record<string, string | UserStyle>;
type ColorKeys<T> = {
    [K in keyof T]-?: [
        T[K]
    ] extends [
        Color
    ] ? K : never;
}[keyof T];
const toBaseColor = (() => {
    const _iv0 = new Set(["accent", "black", "blue", "border", "borderTitle", "brightBlack", "brightBlue", "brightCyan", "brightGray", "brightGreen", "brightGrey", "brightMagenta", "brightRed", "brightWhite", "brightYellow", "code", "codeTitle", "comment", "cyan", "delim", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle", "divider", "error", "gray", "green", "grey", "gutter", "highlight", "id", "info", "inherit", "magenta", "mdBold", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdHr", "mdItalic", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdStrikethrough", "mdTable", "mdTableHeader", "muted", "name", "optionActive", "optionDesc", "optionName", "overlay", "primary", "prompt", "quiet", "red", "selection", "shiki", "subtle", "success", "syntaxBoolean", "syntaxBracket", "syntaxConstant", "syntaxDelimiter", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "text", "title", "ui", "warn", "white", "yellow"]);
    const _av0 = new Set(["accent", "black", "blue", "border", "borderTitle", "brightBlack", "brightBlue", "brightCyan", "brightGray", "brightGreen", "brightGrey", "brightMagenta", "brightRed", "brightWhite", "brightYellow", "code", "codeTitle", "comment", "cyan", "delim", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle", "divider", "error", "gray", "green", "grey", "gutter", "highlight", "id", "info", "inherit", "magenta", "mdBold", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdHr", "mdItalic", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdStrikethrough", "mdTable", "mdTableHeader", "muted", "name", "optionActive", "optionDesc", "optionName", "overlay", "primary", "prompt", "quiet", "red", "selection", "shiki", "subtle", "success", "syntaxBoolean", "syntaxBracket", "syntaxConstant", "syntaxDelimiter", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "text", "title", "ui", "warn", "white", "yellow"]);
    const _ae0 = "(\"accent\" | \"black\" | \"blue\" | \"border\" | \"borderTitle\" | \"brightBlack\" | \"brightBlue\" | \"brightCyan\" | \"brightGray\" | \"brightGreen\" | \"brightGrey\" | \"brightMagenta\" | \"brightRed\" | \"brightWhite\" | \"brightYellow\" | \"code\" | \"codeTitle\" | \"comment\" | \"cyan\" | \"delim\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"divider\" | \"error\" | \"gray\" | \"green\" | \"grey\" | \"gutter\" | \"highlight\" | \"id\" | \"info\" | \"inherit\" | \"magenta\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"muted\" | \"name\" | \"optionActive\" | \"optionDesc\" | \"optionName\" | \"overlay\" | \"primary\" | \"prompt\" | \"quiet\" | \"red\" | \"selection\" | \"shiki\" | \"subtle\" | \"success\" | \"syntaxBoolean\" | \"syntaxBracket\" | \"syntaxConstant\" | \"syntaxDelimiter\" | \"syntaxField\" | \"syntaxFunction\" | \"syntaxNumber\" | \"syntaxSpecial\" | \"syntaxString\" | \"text\" | \"title\" | \"ui\" | \"warn\" | \"white\" | \"yellow\" | `#${string}`)";
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
    const _iv0 = new Set(["accent", "border", "borderTitle", "code", "codeTitle", "comment", "delim", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle", "divider", "error", "gutter", "highlight", "id", "info", "mdBold", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdHr", "mdItalic", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdStrikethrough", "mdTable", "mdTableHeader", "muted", "name", "optionActive", "optionDesc", "optionName", "overlay", "primary", "prompt", "quiet", "selection", "shiki", "subtle", "success", "syntaxBoolean", "syntaxBracket", "syntaxConstant", "syntaxDelimiter", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "text", "title", "ui", "warn"]);
    const _av0 = new Set(["accent", "border", "borderTitle", "code", "codeTitle", "comment", "delim", "diffAdd", "diffContext", "diffDel", "diffLine", "diffTitle", "divider", "error", "gutter", "highlight", "id", "info", "mdBold", "mdCode", "mdCodeBlock", "mdCodeBlockTitle", "mdHeading", "mdHeading1", "mdHeading2", "mdHeading3", "mdHeading4", "mdHeading5", "mdHeading6", "mdHr", "mdItalic", "mdLink", "mdListBullet", "mdListChecked", "mdListUnchecked", "mdQuote", "mdStrikethrough", "mdTable", "mdTableHeader", "muted", "name", "optionActive", "optionDesc", "optionName", "overlay", "primary", "prompt", "quiet", "selection", "shiki", "subtle", "success", "syntaxBoolean", "syntaxBracket", "syntaxConstant", "syntaxDelimiter", "syntaxField", "syntaxFunction", "syntaxNumber", "syntaxSpecial", "syntaxString", "text", "title", "ui", "warn"]);
    const _ae0 = "(\"accent\" | \"border\" | \"borderTitle\" | \"code\" | \"codeTitle\" | \"comment\" | \"delim\" | \"diffAdd\" | \"diffContext\" | \"diffDel\" | \"diffLine\" | \"diffTitle\" | \"divider\" | \"error\" | \"gutter\" | \"highlight\" | \"id\" | \"info\" | \"mdBold\" | \"mdCode\" | \"mdCodeBlock\" | \"mdCodeBlockTitle\" | \"mdHeading\" | \"mdHeading1\" | \"mdHeading2\" | \"mdHeading3\" | \"mdHeading4\" | \"mdHeading5\" | \"mdHeading6\" | \"mdHr\" | \"mdItalic\" | \"mdLink\" | \"mdListBullet\" | \"mdListChecked\" | \"mdListUnchecked\" | \"mdQuote\" | \"mdStrikethrough\" | \"mdTable\" | \"mdTableHeader\" | \"muted\" | \"name\" | \"optionActive\" | \"optionDesc\" | \"optionName\" | \"overlay\" | \"primary\" | \"prompt\" | \"quiet\" | \"selection\" | \"shiki\" | \"subtle\" | \"success\" | \"syntaxBoolean\" | \"syntaxBracket\" | \"syntaxConstant\" | \"syntaxDelimiter\" | \"syntaxField\" | \"syntaxFunction\" | \"syntaxNumber\" | \"syntaxSpecial\" | \"syntaxString\" | \"text\" | \"title\" | \"ui\" | \"warn\" | `#${string}`)";
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
    return (input: any): input is ColorKeys<Theme> => "accent" === input || "error" === input || "info" === input || "primary" === input || "success" === input || "text" === input || "warn" === input;
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
    const _iv0 = new Set(["andromeeda", "aurora-x", "ayu-dark", "ayu-light", "ayu-mirage", "catppuccin-frappe", "catppuccin-latte", "catppuccin-macchiato", "catppuccin-mocha", "dark-plus", "dracula", "dracula-soft", "everforest-dark", "everforest-light", "github-dark", "github-dark-default", "github-dark-dimmed", "github-dark-high-contrast", "github-light", "github-light-default", "github-light-high-contrast", "gruvbox-dark-hard", "gruvbox-dark-medium", "gruvbox-dark-soft", "gruvbox-light-hard", "gruvbox-light-medium", "gruvbox-light-soft", "horizon", "horizon-bright", "houston", "kanagawa-dragon", "kanagawa-lotus", "kanagawa-wave", "laserwave", "light-plus", "material-theme", "material-theme-darker", "material-theme-lighter", "material-theme-ocean", "material-theme-palenight", "min-dark", "min-light", "monokai", "night-owl", "night-owl-light", "nord", "one-dark-pro", "one-light", "plastic", "poimandres", "red", "rose-pine", "rose-pine-dawn", "rose-pine-moon", "slack-dark", "slack-ochin", "snazzy-light", "solarized-dark", "solarized-light", "synthwave-84", "tokyo-night", "vesper", "vitesse-black", "vitesse-dark", "vitesse-light"]);
    const _av0 = new Set(["andromeeda", "aurora-x", "ayu-dark", "ayu-light", "ayu-mirage", "catppuccin-frappe", "catppuccin-latte", "catppuccin-macchiato", "catppuccin-mocha", "dark-plus", "dracula", "dracula-soft", "everforest-dark", "everforest-light", "github-dark", "github-dark-default", "github-dark-dimmed", "github-dark-high-contrast", "github-light", "github-light-default", "github-light-high-contrast", "gruvbox-dark-hard", "gruvbox-dark-medium", "gruvbox-dark-soft", "gruvbox-light-hard", "gruvbox-light-medium", "gruvbox-light-soft", "horizon", "horizon-bright", "houston", "kanagawa-dragon", "kanagawa-lotus", "kanagawa-wave", "laserwave", "light-plus", "material-theme", "material-theme-darker", "material-theme-lighter", "material-theme-ocean", "material-theme-palenight", "min-dark", "min-light", "monokai", "night-owl", "night-owl-light", "nord", "one-dark-pro", "one-light", "plastic", "poimandres", "red", "rose-pine", "rose-pine-dawn", "rose-pine-moon", "slack-dark", "slack-ochin", "snazzy-light", "solarized-dark", "solarized-light", "synthwave-84", "tokyo-night", "vesper", "vitesse-black", "vitesse-dark", "vitesse-light"]);
    const _ae0 = "(\"andromeeda\" | \"aurora-x\" | \"ayu-dark\" | \"ayu-light\" | \"ayu-mirage\" | \"catppuccin-frappe\" | \"catppuccin-latte\" | \"catppuccin-macchiato\" | \"catppuccin-mocha\" | \"dark-plus\" | \"dracula\" | \"dracula-soft\" | \"everforest-dark\" | \"everforest-light\" | \"github-dark\" | \"github-dark-default\" | \"github-dark-dimmed\" | \"github-dark-high-contrast\" | \"github-light\" | \"github-light-default\" | \"github-light-high-contrast\" | \"gruvbox-dark-hard\" | \"gruvbox-dark-medium\" | \"gruvbox-dark-soft\" | \"gruvbox-light-hard\" | \"gruvbox-light-medium\" | \"gruvbox-light-soft\" | \"horizon\" | \"horizon-bright\" | \"houston\" | \"kanagawa-dragon\" | \"kanagawa-lotus\" | \"kanagawa-wave\" | \"laserwave\" | \"light-plus\" | \"material-theme\" | \"material-theme-darker\" | \"material-theme-lighter\" | \"material-theme-ocean\" | \"material-theme-palenight\" | \"min-dark\" | \"min-light\" | \"monokai\" | \"night-owl\" | \"night-owl-light\" | \"nord\" | \"one-dark-pro\" | \"one-light\" | \"plastic\" | \"poimandres\" | \"red\" | \"rose-pine\" | \"rose-pine-dawn\" | \"rose-pine-moon\" | \"slack-dark\" | \"slack-ochin\" | \"snazzy-light\" | \"solarized-dark\" | \"solarized-light\" | \"synthwave-84\" | \"tokyo-night\" | \"vesper\" | \"vitesse-black\" | \"vitesse-dark\" | \"vitesse-light\" | undefined)";
    const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".$schema",
        expected: "(string | undefined)",
        value: input.$schema
    }, _errorFactory)) && (undefined === input.shiki || true === _av0.has(input.shiki) || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".shiki",
        expected: _ae0,
        value: input.shiki
    }, _errorFactory)) && (undefined === input.id || "string" === typeof input.id || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".id",
        expected: "(string | undefined)",
        value: input.id
    }, _errorFactory)) && (undefined === input.name || "string" === typeof input.name || _assertGuard_1._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + ".name",
        expected: "(string | undefined)",
        value: input.name
    }, _errorFactory)) && (false === _exceptionable || Object.keys(input).every((key: any) => {
        if (["$schema", "shiki", "id", "name"].some((prop: any) => key === prop))
            return true;
        const value = input[key];
        if (undefined === value)
            return true;
        return (null !== value || _assertGuard_1._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path + __typia_transform__accessExpressionAsString(key),
            expected: "(UserStyle | string | undefined)",
            value: value
        }, _errorFactory)) && (undefined === value || "string" === typeof value || ("object" === typeof value && null !== value && false === Array.isArray(value) || _assertGuard_1._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path + __typia_transform__accessExpressionAsString(key),
            expected: "(UserStyle | string | undefined)",
            value: value
        }, _errorFactory)) && _ao1(value, _path + __typia_transform__accessExpressionAsString(key), true && _exceptionable) || _assertGuard_1._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path + __typia_transform__accessExpressionAsString(key),
            expected: "(UserStyle | string | undefined)",
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
    const _io0 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema) && (undefined === input.shiki || true === _iv0.has(input.shiki)) && (undefined === input.id || "string" === typeof input.id) && (undefined === input.name || "string" === typeof input.name) && Object.keys(input).every((key: any) => {
        if (["$schema", "shiki", "id", "name"].some((prop: any) => key === prop))
            return true;
        const value = input[key];
        if (undefined === value)
            return true;
        return null !== value && (undefined === value || "string" === typeof value || "object" === typeof value && null !== value && false === Array.isArray(value) && _io1(value, true && _exceptionable));
    });
    const _io1 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.bold || "boolean" === typeof input.bold) && (undefined === input.dim || "boolean" === typeof input.dim) && (undefined === input.italic || "boolean" === typeof input.italic) && (undefined === input.underline || "boolean" === typeof input.underline) && (undefined === input.inverse || "boolean" === typeof input.inverse) && (undefined === input.strikethrough || "boolean" === typeof input.strikethrough) && (undefined === input.fg || "string" === typeof input.fg) && (undefined === input.bg || "string" === typeof input.bg) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
        if (["bold", "dim", "italic", "underline", "inverse", "strikethrough", "fg", "bg"].some((prop: any) => key === prop))
            return true;
        const value = input[key];
        if (undefined === value)
            return true;
        return false;
    }));
    const __is = (input: any, _exceptionable: boolean = true): input is Partial<UserTheme> => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input, true);
    let _errorFactory: any;
    return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): Partial<UserTheme> => {
        if (false === __is(input)) {
            _errorFactory = errorFactory;
            ((input: any, _path: string, _exceptionable: boolean = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssertEquals",
                path: _path + "",
                expected: "Partial<UserTheme>",
                value: input
            }, _errorFactory)) && _ao0(input, _path + "", true) || _assertGuard_1._assertGuard(true, {
                method: "typia.createAssertEquals",
                path: _path + "",
                expected: "Partial<UserTheme>",
                value: input
            }, _errorFactory))(input, "$input", true);
        }
        return input;
    };
})();
const skipSlots = new Set(["$schema", "shiki", "id", "name"]);
export function validateTheme(input: unknown): Partial<UserTheme> {
    const out = validator(input);
    for (const [slot, value] of Object.entries(out)) {
        if (skipSlots.has(slot) || value === undefined)
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
