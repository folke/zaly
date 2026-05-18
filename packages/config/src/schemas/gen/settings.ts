import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
import * as __typia_transform__accessExpressionAsString from "typia/lib/internal/_accessExpressionAsString";
import type { Settings } from "../../types.ts";
const validator = (() => { const _io0 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema) && (undefined === input.agent || "object" === typeof input.agent && null !== input.agent && false === Array.isArray(input.agent) && _io1(input.agent, true && _exceptionable)) && (undefined === input.ui || "object" === typeof input.ui && null !== input.ui && false === Array.isArray(input.ui) && _io2(input.ui, true && _exceptionable)) && (undefined === input.resources || "object" === typeof input.resources && null !== input.resources && false === Array.isArray(input.resources) && _io3(input.resources, true && _exceptionable)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["$schema", "agent", "ui", "resources"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io1 = (input: any, _exceptionable: boolean = true): boolean => 0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
}); const _io2 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.theme || "string" === typeof input.theme) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["theme"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io3 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.packs || Array.isArray(input.packs) && input.packs.every((elem: any, _index1: number) => "string" === typeof elem)) && (undefined === input.plugins || Array.isArray(input.plugins) && input.plugins.every((elem: any, _index2: number) => "string" === typeof elem)) && (undefined === input.skills || Array.isArray(input.skills) && input.skills.every((elem: any, _index3: number) => "string" === typeof elem)) && (undefined === input.themes || Array.isArray(input.themes) && input.themes.every((elem: any, _index4: number) => "string" === typeof elem)) && (undefined === input.prompts || Array.isArray(input.prompts) && input.prompts.every((elem: any, _index5: number) => "string" === typeof elem)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["packs", "plugins", "skills", "themes", "prompts"].some((prop: any) => key === prop))
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
}, _errorFactory)) && (undefined === input.agent || ("object" === typeof input.agent && null !== input.agent && false === Array.isArray(input.agent) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".agent",
    expected: "(__type | undefined)",
    value: input.agent
}, _errorFactory)) && _ao1(input.agent, _path + ".agent", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".agent",
    expected: "(__type | undefined)",
    value: input.agent
}, _errorFactory)) && (undefined === input.ui || ("object" === typeof input.ui && null !== input.ui && false === Array.isArray(input.ui) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ui",
    expected: "(__type.o1 | undefined)",
    value: input.ui
}, _errorFactory)) && _ao2(input.ui, _path + ".ui", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ui",
    expected: "(__type.o1 | undefined)",
    value: input.ui
}, _errorFactory)) && (undefined === input.resources || ("object" === typeof input.resources && null !== input.resources && false === Array.isArray(input.resources) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".resources",
    expected: "(__type.o2 | undefined)",
    value: input.resources
}, _errorFactory)) && _ao3(input.resources, _path + ".resources", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".resources",
    expected: "(__type.o2 | undefined)",
    value: input.resources
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["$schema", "agent", "ui", "resources"].some((prop: any) => key === prop))
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
}))); const _ao1 = (input: any, _path: string, _exceptionable: boolean = true): boolean => 0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "undefined",
        value: value
    }, _errorFactory);
})); const _ao2 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.theme || "string" === typeof input.theme || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".theme",
    expected: "(string | undefined)",
    value: input.theme
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["theme"].some((prop: any) => key === prop))
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
}))); const _ao3 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.packs || (Array.isArray(input.packs) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs",
    expected: "(Array<string> | undefined)",
    value: input.packs
}, _errorFactory)) && input.packs.every((elem: any, _index6: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs[" + _index6 + "]",
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
}, _errorFactory)) && input.plugins.every((elem: any, _index7: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins[" + _index7 + "]",
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
}, _errorFactory)) && input.skills.every((elem: any, _index8: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills[" + _index8 + "]",
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
}, _errorFactory)) && input.themes.every((elem: any, _index9: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes[" + _index9 + "]",
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
}, _errorFactory)) && input.prompts.every((elem: any, _index10: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts[" + _index10 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts",
    expected: "(Array<string> | undefined)",
    value: input.prompts
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["packs", "plugins", "skills", "themes", "prompts"].some((prop: any) => key === prop))
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
