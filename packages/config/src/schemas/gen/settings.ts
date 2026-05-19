import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
import * as __typia_transform__accessExpressionAsString from "typia/lib/internal/_accessExpressionAsString";
import type { Settings } from "../../types.ts";
const validator = (() => { const _io0 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema) && (undefined === input.model || "string" === typeof input.model) && true && (undefined === input.tools || Array.isArray(input.tools) && input.tools.every((elem: any, _index1: number) => "string" === typeof elem)) && (undefined === input.theme || "string" === typeof input.theme) && (undefined === input.packs || Array.isArray(input.packs) && input.packs.every((elem: any, _index2: number) => "string" === typeof elem)) && (undefined === input.plugins || Array.isArray(input.plugins) && input.plugins.every((elem: any, _index3: number) => "string" === typeof elem)) && (undefined === input.skills || Array.isArray(input.skills) && input.skills.every((elem: any, _index4: number) => "string" === typeof elem)) && (undefined === input.themes || Array.isArray(input.themes) && input.themes.every((elem: any, _index5: number) => "string" === typeof elem)) && (undefined === input.prompts || Array.isArray(input.prompts) && input.prompts.every((elem: any, _index6: number) => "string" === typeof elem)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["$schema", "model", "reasoning", "tools", "theme", "packs", "plugins", "skills", "themes", "prompts"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".$schema",
    expected: "(string | undefined)",
    value: input.$schema
}, _errorFactory)) && (undefined === input.model || "string" === typeof input.model || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".model",
    expected: "(string | undefined)",
    value: input.model
}, _errorFactory)) && true && (undefined === input.tools || (Array.isArray(input.tools) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools",
    expected: "(Array<string> | undefined)",
    value: input.tools
}, _errorFactory)) && input.tools.every((elem: any, _index7: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools[" + _index7 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools",
    expected: "(Array<string> | undefined)",
    value: input.tools
}, _errorFactory)) && (undefined === input.theme || "string" === typeof input.theme || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".theme",
    expected: "(string | undefined)",
    value: input.theme
}, _errorFactory)) && (undefined === input.packs || (Array.isArray(input.packs) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs",
    expected: "(Array<string> | undefined)",
    value: input.packs
}, _errorFactory)) && input.packs.every((elem: any, _index8: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs[" + _index8 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs",
    expected: "(Array<string> | undefined)",
    value: input.packs
}, _errorFactory)) && (undefined === input.plugins || (Array.isArray(input.plugins) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins",
    expected: "(Array<string> | undefined)",
    value: input.plugins
}, _errorFactory)) && input.plugins.every((elem: any, _index9: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins[" + _index9 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins",
    expected: "(Array<string> | undefined)",
    value: input.plugins
}, _errorFactory)) && (undefined === input.skills || (Array.isArray(input.skills) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills",
    expected: "(Array<string> | undefined)",
    value: input.skills
}, _errorFactory)) && input.skills.every((elem: any, _index10: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills[" + _index10 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills",
    expected: "(Array<string> | undefined)",
    value: input.skills
}, _errorFactory)) && (undefined === input.themes || (Array.isArray(input.themes) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes",
    expected: "(Array<string> | undefined)",
    value: input.themes
}, _errorFactory)) && input.themes.every((elem: any, _index11: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes[" + _index11 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes",
    expected: "(Array<string> | undefined)",
    value: input.themes
}, _errorFactory)) && (undefined === input.prompts || (Array.isArray(input.prompts) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts",
    expected: "(Array<string> | undefined)",
    value: input.prompts
}, _errorFactory)) && input.prompts.every((elem: any, _index12: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts[" + _index12 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts",
    expected: "(Array<string> | undefined)",
    value: input.prompts
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["$schema", "model", "reasoning", "tools", "theme", "packs", "plugins", "skills", "themes", "prompts"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "undefined",
        value: value
    }, _errorFactory);
}))); const __is = (input: any, _exceptionable: boolean = true): input is Settings => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input, true); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): Settings => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "Settings",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "Settings",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
export function validateSettings(input: unknown): Settings {
    return validator(input);
}
