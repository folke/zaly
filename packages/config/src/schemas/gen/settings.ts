import * as __typia_transform__accessExpressionAsString from "typia/lib/internal/_accessExpressionAsString";
import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
import type { KeyPatterns } from "@zaly/tui";
import type { Settings, TypiaSettings } from "../../types.ts";
import { canonical } from "@zaly/tui";
const validator = (() => { const _io0 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema) && (undefined === input.model || "string" === typeof input.model) && (undefined === input.reasoning || "off" === input.reasoning || "minimal" === input.reasoning || "low" === input.reasoning || "medium" === input.reasoning || "high" === input.reasoning || "xhigh" === input.reasoning || "max" === input.reasoning) && (undefined === input.tools || Array.isArray(input.tools) && input.tools.every((elem: any, _index1: number) => "string" === typeof elem)) && (undefined === input.theme || "string" === typeof input.theme) && (undefined === input.permissions || "object" === typeof input.permissions && null !== input.permissions && false === Array.isArray(input.permissions) && _io1(input.permissions, true && _exceptionable)) && (undefined === input.resources || "object" === typeof input.resources && null !== input.resources && false === Array.isArray(input.resources) && _io2(input.resources, true && _exceptionable)) && (undefined === input.secrets || "object" === typeof input.secrets && null !== input.secrets && false === Array.isArray(input.secrets) && _io3(input.secrets, true && _exceptionable)) && (undefined === input.keymap || "object" === typeof input.keymap && null !== input.keymap && false === Array.isArray(input.keymap) && _io8(input.keymap, true && _exceptionable)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["$schema", "model", "reasoning", "tools", "theme", "permissions", "resources", "secrets", "keymap"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io1 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.preset || "strict" === input.preset || "readonly" === input.preset || "permissive" === input.preset || "yolo" === input.preset) && (undefined === input.allow || Array.isArray(input.allow) && input.allow.every((elem: any, _index2: number) => "string" === typeof elem)) && (undefined === input.deny || Array.isArray(input.deny) && input.deny.every((elem: any, _index3: number) => "string" === typeof elem)) && (undefined === input.ask || Array.isArray(input.ask) && input.ask.every((elem: any, _index4: number) => "string" === typeof elem)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["preset", "allow", "deny", "ask"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io2 = (input: any, _exceptionable: boolean = true): boolean => null !== input.packs && (undefined === input.packs || false === input.packs || Array.isArray(input.packs) && input.packs.every((elem: any, _index5: number) => "string" === typeof elem)) && (null !== input.plugins && (undefined === input.plugins || false === input.plugins || Array.isArray(input.plugins) && input.plugins.every((elem: any, _index6: number) => "string" === typeof elem))) && (null !== input.skills && (undefined === input.skills || false === input.skills || Array.isArray(input.skills) && input.skills.every((elem: any, _index7: number) => "string" === typeof elem))) && (null !== input.themes && (undefined === input.themes || false === input.themes || Array.isArray(input.themes) && input.themes.every((elem: any, _index8: number) => "string" === typeof elem))) && (null !== input.commands && (undefined === input.commands || false === input.commands || Array.isArray(input.commands) && input.commands.every((elem: any, _index9: number) => "string" === typeof elem))) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["packs", "plugins", "skills", "themes", "commands"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io3 = (input: any, _exceptionable: boolean = true): boolean => Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return "object" === typeof value && null !== value && _iu0(value, true && _exceptionable);
}); const _io4 = (input: any, _exceptionable: boolean = true): boolean => "env" === input.source && "string" === typeof input.key && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["source", "key"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io5 = (input: any, _exceptionable: boolean = true): boolean => "exec" === input.source && "string" === typeof input.cmd && (undefined === input.args || Array.isArray(input.args) && input.args.every((elem: any, _index10: number) => "string" === typeof elem)) && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["source", "cmd", "args"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io6 = (input: any, _exceptionable: boolean = true): boolean => "file" === input.source && "string" === typeof input.path && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["source", "path"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io7 = (input: any, _exceptionable: boolean = true): boolean => "literal" === input.source && "string" === typeof input.value && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["source", "value"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io8 = (input: any, _exceptionable: boolean = true): boolean => Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return null !== value && undefined !== value && ("string" === typeof value || Array.isArray(value) && value.every((elem: any, _index11: number) => "string" === typeof elem));
}); const _iu0 = (input: any, _exceptionable: boolean = true): any => (() => {
    if ("env" === input.source)
        return _io4(input, true && _exceptionable);
    else if ("exec" === input.source)
        return _io5(input, true && _exceptionable);
    else if ("file" === input.source)
        return _io6(input, true && _exceptionable);
    else if ("literal" === input.source)
        return _io7(input, true && _exceptionable);
    else
        return false;
})(); const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".$schema",
    expected: "(string | undefined)",
    value: input.$schema
}, _errorFactory)) && (undefined === input.model || "string" === typeof input.model || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".model",
    expected: "(string | undefined)",
    value: input.model
}, _errorFactory)) && (undefined === input.reasoning || "off" === input.reasoning || "minimal" === input.reasoning || "low" === input.reasoning || "medium" === input.reasoning || "high" === input.reasoning || "xhigh" === input.reasoning || "max" === input.reasoning || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoning",
    expected: "(\"high\" | \"low\" | \"max\" | \"medium\" | \"minimal\" | \"off\" | \"xhigh\" | undefined)",
    value: input.reasoning
}, _errorFactory)) && (undefined === input.tools || (Array.isArray(input.tools) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools",
    expected: "(Array<string> | undefined)",
    value: input.tools
}, _errorFactory)) && input.tools.every((elem: any, _index12: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools[" + _index12 + "]",
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
}, _errorFactory)) && (undefined === input.permissions || ("object" === typeof input.permissions && null !== input.permissions && false === Array.isArray(input.permissions) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".permissions",
    expected: "(__type | undefined)",
    value: input.permissions
}, _errorFactory)) && _ao1(input.permissions, _path + ".permissions", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".permissions",
    expected: "(__type | undefined)",
    value: input.permissions
}, _errorFactory)) && (undefined === input.resources || ("object" === typeof input.resources && null !== input.resources && false === Array.isArray(input.resources) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".resources",
    expected: "(__type.o1 | undefined)",
    value: input.resources
}, _errorFactory)) && _ao2(input.resources, _path + ".resources", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".resources",
    expected: "(__type.o1 | undefined)",
    value: input.resources
}, _errorFactory)) && (undefined === input.secrets || ("object" === typeof input.secrets && null !== input.secrets && false === Array.isArray(input.secrets) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".secrets",
    expected: "(AuthSecrets | undefined)",
    value: input.secrets
}, _errorFactory)) && _ao3(input.secrets, _path + ".secrets", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".secrets",
    expected: "(AuthSecrets | undefined)",
    value: input.secrets
}, _errorFactory)) && (undefined === input.keymap || ("object" === typeof input.keymap && null !== input.keymap && false === Array.isArray(input.keymap) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".keymap",
    expected: "(Record<string, string | string[]> | undefined)",
    value: input.keymap
}, _errorFactory)) && _ao8(input.keymap, _path + ".keymap", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".keymap",
    expected: "(Record<string, string | string[]> | undefined)",
    value: input.keymap
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["$schema", "model", "reasoning", "tools", "theme", "permissions", "resources", "secrets", "keymap"].some((prop: any) => key === prop))
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
}))); const _ao1 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.preset || "strict" === input.preset || "readonly" === input.preset || "permissive" === input.preset || "yolo" === input.preset || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".preset",
    expected: "(\"permissive\" | \"readonly\" | \"strict\" | \"yolo\" | undefined)",
    value: input.preset
}, _errorFactory)) && (undefined === input.allow || (Array.isArray(input.allow) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".allow",
    expected: "(Array<string> | undefined)",
    value: input.allow
}, _errorFactory)) && input.allow.every((elem: any, _index13: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".allow[" + _index13 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".allow",
    expected: "(Array<string> | undefined)",
    value: input.allow
}, _errorFactory)) && (undefined === input.deny || (Array.isArray(input.deny) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".deny",
    expected: "(Array<string> | undefined)",
    value: input.deny
}, _errorFactory)) && input.deny.every((elem: any, _index14: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".deny[" + _index14 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".deny",
    expected: "(Array<string> | undefined)",
    value: input.deny
}, _errorFactory)) && (undefined === input.ask || (Array.isArray(input.ask) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ask",
    expected: "(Array<string> | undefined)",
    value: input.ask
}, _errorFactory)) && input.ask.every((elem: any, _index15: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ask[" + _index15 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ask",
    expected: "(Array<string> | undefined)",
    value: input.ask
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["preset", "allow", "deny", "ask"].some((prop: any) => key === prop))
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
}))); const _ao2 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (null !== input.packs || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs",
    expected: "(Array<string> | false | undefined)",
    value: input.packs
}, _errorFactory)) && (undefined === input.packs || false === input.packs || (Array.isArray(input.packs) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs",
    expected: "(Array<string> | false | undefined)",
    value: input.packs
}, _errorFactory)) && input.packs.every((elem: any, _index16: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs[" + _index16 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs",
    expected: "(Array<string> | false | undefined)",
    value: input.packs
}, _errorFactory)) && ((null !== input.plugins || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins",
    expected: "(Array<string> | false | undefined)",
    value: input.plugins
}, _errorFactory)) && (undefined === input.plugins || false === input.plugins || (Array.isArray(input.plugins) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins",
    expected: "(Array<string> | false | undefined)",
    value: input.plugins
}, _errorFactory)) && input.plugins.every((elem: any, _index17: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins[" + _index17 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins",
    expected: "(Array<string> | false | undefined)",
    value: input.plugins
}, _errorFactory))) && ((null !== input.skills || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills",
    expected: "(Array<string> | false | undefined)",
    value: input.skills
}, _errorFactory)) && (undefined === input.skills || false === input.skills || (Array.isArray(input.skills) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills",
    expected: "(Array<string> | false | undefined)",
    value: input.skills
}, _errorFactory)) && input.skills.every((elem: any, _index18: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills[" + _index18 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills",
    expected: "(Array<string> | false | undefined)",
    value: input.skills
}, _errorFactory))) && ((null !== input.themes || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes",
    expected: "(Array<string> | false | undefined)",
    value: input.themes
}, _errorFactory)) && (undefined === input.themes || false === input.themes || (Array.isArray(input.themes) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes",
    expected: "(Array<string> | false | undefined)",
    value: input.themes
}, _errorFactory)) && input.themes.every((elem: any, _index19: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes[" + _index19 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes",
    expected: "(Array<string> | false | undefined)",
    value: input.themes
}, _errorFactory))) && ((null !== input.commands || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".commands",
    expected: "(Array<string> | false | undefined)",
    value: input.commands
}, _errorFactory)) && (undefined === input.commands || false === input.commands || (Array.isArray(input.commands) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".commands",
    expected: "(Array<string> | false | undefined)",
    value: input.commands
}, _errorFactory)) && input.commands.every((elem: any, _index20: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".commands[" + _index20 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".commands",
    expected: "(Array<string> | false | undefined)",
    value: input.commands
}, _errorFactory))) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["packs", "plugins", "skills", "themes", "commands"].some((prop: any) => key === prop))
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
}))); const _ao3 = (input: any, _path: string, _exceptionable: boolean = true): boolean => false === _exceptionable || Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return ("object" === typeof value && null !== value || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(__type.o2 | __type.o3 | __type.o4 | __type.o5)",
        value: value
    }, _errorFactory)) && _au0(value, _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key), true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(__type.o2 | __type.o3 | __type.o4 | __type.o5)",
        value: value
    }, _errorFactory);
}); const _ao4 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("env" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".source",
    expected: "\"env\"",
    value: input.source
}, _errorFactory)) && ("string" === typeof input.key || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".key",
    expected: "string",
    value: input.key
}, _errorFactory)) && (2 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["source", "key"].some((prop: any) => key === prop))
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
}))); const _ao5 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("exec" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".source",
    expected: "\"exec\"",
    value: input.source
}, _errorFactory)) && ("string" === typeof input.cmd || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".cmd",
    expected: "string",
    value: input.cmd
}, _errorFactory)) && (undefined === input.args || (Array.isArray(input.args) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".args",
    expected: "(Array<string> | undefined)",
    value: input.args
}, _errorFactory)) && input.args.every((elem: any, _index21: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".args[" + _index21 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".args",
    expected: "(Array<string> | undefined)",
    value: input.args
}, _errorFactory)) && (2 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["source", "cmd", "args"].some((prop: any) => key === prop))
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
}))); const _ao6 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("file" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".source",
    expected: "\"file\"",
    value: input.source
}, _errorFactory)) && ("string" === typeof input.path || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".path",
    expected: "string",
    value: input.path
}, _errorFactory)) && (2 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["source", "path"].some((prop: any) => key === prop))
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
}))); const _ao7 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("literal" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".source",
    expected: "\"literal\"",
    value: input.source
}, _errorFactory)) && ("string" === typeof input.value || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".value",
    expected: "string",
    value: input.value
}, _errorFactory)) && (2 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["source", "value"].some((prop: any) => key === prop))
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
}))); const _ao8 = (input: any, _path: string, _exceptionable: boolean = true): boolean => false === _exceptionable || Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return (null !== value || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(Array<string> | string)",
        value: value
    }, _errorFactory)) && (undefined !== value || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(Array<string> | string)",
        value: value
    }, _errorFactory)) && ("string" === typeof value || (Array.isArray(value) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(Array<string> | string)",
        value: value
    }, _errorFactory)) && value.every((elem: any, _index22: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key) + "[" + _index22 + "]",
        expected: "string",
        value: elem
    }, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(Array<string> | string)",
        value: value
    }, _errorFactory));
}); const _au0 = (input: any, _path: string, _exceptionable: boolean = true): any => (() => {
    if ("env" === input.source)
        return _ao4(input, _path, true && _exceptionable);
    else if ("exec" === input.source)
        return _ao5(input, _path, true && _exceptionable);
    else if ("file" === input.source)
        return _ao6(input, _path, true && _exceptionable);
    else if ("literal" === input.source)
        return _ao7(input, _path, true && _exceptionable);
    else
        return __typia_transform__assertGuard._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path,
            expected: "(__type.o2 | __type.o3 | __type.o4 | __type.o5)",
            value: input
        }, _errorFactory);
})(); const __is = (input: any, _exceptionable: boolean = true): input is TypiaSettings => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input, true); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): TypiaSettings => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "TypiaSettings",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "TypiaSettings",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
export function validateSettings(input: unknown): Settings {
    const ret = validator(input);
    const keymap: Record<string, KeyPatterns> = {};
    for (const [action, pattern] of Object.entries(ret.keymap ?? {})) {
        if (typeof pattern === "string")
            keymap[action] = canonical(pattern);
        else if (Array.isArray(pattern))
            keymap[action] = pattern.map(canonical);
        else
            throw new TypeError(`invalid key pattern for action ${action}`);
    }
    return { ...ret, keymap };
}
