import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
import * as __typia_transform__accessExpressionAsString from "typia/lib/internal/_accessExpressionAsString";
import type { KeyPatterns } from "@zaly/tui";
import type { Settings, TypiaSettings } from "../../types.ts";
import { canonical } from "@zaly/tui";
const validator = (() => { const _io0 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.$schema || "string" === typeof input.$schema) && (undefined === input.model || "string" === typeof input.model) && (undefined === input.reasoning || "off" === input.reasoning || "minimal" === input.reasoning || "low" === input.reasoning || "medium" === input.reasoning || "high" === input.reasoning || "xhigh" === input.reasoning) && (undefined === input.tools || Array.isArray(input.tools) && input.tools.every((elem: any, _index1: number) => "string" === typeof elem)) && (undefined === input.theme || "string" === typeof input.theme) && (undefined === input.permissions || "object" === typeof input.permissions && null !== input.permissions && false === Array.isArray(input.permissions) && _io1(input.permissions, true && _exceptionable)) && (undefined === input.resources || "object" === typeof input.resources && null !== input.resources && false === Array.isArray(input.resources) && _io2(input.resources, true && _exceptionable)) && (undefined === input.bindings || "object" === typeof input.bindings && null !== input.bindings && false === Array.isArray(input.bindings) && _io3(input.bindings, true && _exceptionable)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["$schema", "model", "reasoning", "tools", "theme", "permissions", "resources", "bindings"].some((prop: any) => key === prop))
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
})); const _io2 = (input: any, _exceptionable: boolean = true): boolean => null !== input.packs && (undefined === input.packs || false === input.packs || Array.isArray(input.packs) && input.packs.every((elem: any, _index5: number) => "string" === typeof elem)) && (null !== input.plugins && (undefined === input.plugins || false === input.plugins || Array.isArray(input.plugins) && input.plugins.every((elem: any, _index6: number) => "string" === typeof elem))) && (null !== input.skills && (undefined === input.skills || false === input.skills || Array.isArray(input.skills) && input.skills.every((elem: any, _index7: number) => "string" === typeof elem))) && (null !== input.themes && (undefined === input.themes || false === input.themes || Array.isArray(input.themes) && input.themes.every((elem: any, _index8: number) => "string" === typeof elem))) && (null !== input.prompts && (undefined === input.prompts || false === input.prompts || Array.isArray(input.prompts) && input.prompts.every((elem: any, _index9: number) => "string" === typeof elem))) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["packs", "plugins", "skills", "themes", "prompts"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io3 = (input: any, _exceptionable: boolean = true): boolean => null !== input["input.cursorDown"] && (undefined === input["input.cursorDown"] || "string" === typeof input["input.cursorDown"] || Array.isArray(input["input.cursorDown"]) && input["input.cursorDown"].every((elem: any, _index10: number) => "string" === typeof elem)) && (null !== input["input.cursorLeft"] && (undefined === input["input.cursorLeft"] || "string" === typeof input["input.cursorLeft"] || Array.isArray(input["input.cursorLeft"]) && input["input.cursorLeft"].every((elem: any, _index11: number) => "string" === typeof elem))) && (null !== input["input.cursorLineEnd"] && (undefined === input["input.cursorLineEnd"] || "string" === typeof input["input.cursorLineEnd"] || Array.isArray(input["input.cursorLineEnd"]) && input["input.cursorLineEnd"].every((elem: any, _index12: number) => "string" === typeof elem))) && (null !== input["input.cursorLineStart"] && (undefined === input["input.cursorLineStart"] || "string" === typeof input["input.cursorLineStart"] || Array.isArray(input["input.cursorLineStart"]) && input["input.cursorLineStart"].every((elem: any, _index13: number) => "string" === typeof elem))) && (null !== input["input.cursorRight"] && (undefined === input["input.cursorRight"] || "string" === typeof input["input.cursorRight"] || Array.isArray(input["input.cursorRight"]) && input["input.cursorRight"].every((elem: any, _index14: number) => "string" === typeof elem))) && (null !== input["input.cursorUp"] && (undefined === input["input.cursorUp"] || "string" === typeof input["input.cursorUp"] || Array.isArray(input["input.cursorUp"]) && input["input.cursorUp"].every((elem: any, _index15: number) => "string" === typeof elem))) && (null !== input["input.deleteCharBack"] && (undefined === input["input.deleteCharBack"] || "string" === typeof input["input.deleteCharBack"] || Array.isArray(input["input.deleteCharBack"]) && input["input.deleteCharBack"].every((elem: any, _index16: number) => "string" === typeof elem))) && (null !== input["input.deleteCharForward"] && (undefined === input["input.deleteCharForward"] || "string" === typeof input["input.deleteCharForward"] || Array.isArray(input["input.deleteCharForward"]) && input["input.deleteCharForward"].every((elem: any, _index17: number) => "string" === typeof elem))) && (null !== input["input.deleteWordBack"] && (undefined === input["input.deleteWordBack"] || "string" === typeof input["input.deleteWordBack"] || Array.isArray(input["input.deleteWordBack"]) && input["input.deleteWordBack"].every((elem: any, _index18: number) => "string" === typeof elem))) && (null !== input["input.insertNewline"] && (undefined === input["input.insertNewline"] || "string" === typeof input["input.insertNewline"] || Array.isArray(input["input.insertNewline"]) && input["input.insertNewline"].every((elem: any, _index19: number) => "string" === typeof elem))) && (null !== input["input.insertTab"] && (undefined === input["input.insertTab"] || "string" === typeof input["input.insertTab"] || Array.isArray(input["input.insertTab"]) && input["input.insertTab"].every((elem: any, _index20: number) => "string" === typeof elem))) && (null !== input["input.paste"] && (undefined === input["input.paste"] || "string" === typeof input["input.paste"] || Array.isArray(input["input.paste"]) && input["input.paste"].every((elem: any, _index21: number) => "string" === typeof elem))) && (null !== input["input.submit"] && (undefined === input["input.submit"] || "string" === typeof input["input.submit"] || Array.isArray(input["input.submit"]) && input["input.submit"].every((elem: any, _index22: number) => "string" === typeof elem))) && (null !== input["menu.cancel"] && (undefined === input["menu.cancel"] || "string" === typeof input["menu.cancel"] || Array.isArray(input["menu.cancel"]) && input["menu.cancel"].every((elem: any, _index23: number) => "string" === typeof elem))) && (null !== input["menu.first"] && (undefined === input["menu.first"] || "string" === typeof input["menu.first"] || Array.isArray(input["menu.first"]) && input["menu.first"].every((elem: any, _index24: number) => "string" === typeof elem))) && (null !== input["menu.last"] && (undefined === input["menu.last"] || "string" === typeof input["menu.last"] || Array.isArray(input["menu.last"]) && input["menu.last"].every((elem: any, _index25: number) => "string" === typeof elem))) && (null !== input["menu.next"] && (undefined === input["menu.next"] || "string" === typeof input["menu.next"] || Array.isArray(input["menu.next"]) && input["menu.next"].every((elem: any, _index26: number) => "string" === typeof elem))) && (null !== input["menu.prev"] && (undefined === input["menu.prev"] || "string" === typeof input["menu.prev"] || Array.isArray(input["menu.prev"]) && input["menu.prev"].every((elem: any, _index27: number) => "string" === typeof elem))) && (null !== input["menu.select"] && (undefined === input["menu.select"] || "string" === typeof input["menu.select"] || Array.isArray(input["menu.select"]) && input["menu.select"].every((elem: any, _index28: number) => "string" === typeof elem))) && (null !== input["global.quit"] && (undefined === input["global.quit"] || "string" === typeof input["global.quit"] || Array.isArray(input["global.quit"]) && input["global.quit"].every((elem: any, _index29: number) => "string" === typeof elem))) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["input.cursorDown", "input.cursorLeft", "input.cursorLineEnd", "input.cursorLineStart", "input.cursorRight", "input.cursorUp", "input.deleteCharBack", "input.deleteCharForward", "input.deleteWordBack", "input.insertNewline", "input.insertTab", "input.paste", "input.submit", "menu.cancel", "menu.first", "menu.last", "menu.next", "menu.prev", "menu.select", "global.quit"].some((prop: any) => key === prop))
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
}, _errorFactory)) && (undefined === input.reasoning || "off" === input.reasoning || "minimal" === input.reasoning || "low" === input.reasoning || "medium" === input.reasoning || "high" === input.reasoning || "xhigh" === input.reasoning || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoning",
    expected: "(\"high\" | \"low\" | \"medium\" | \"minimal\" | \"off\" | \"xhigh\" | undefined)",
    value: input.reasoning
}, _errorFactory)) && (undefined === input.tools || (Array.isArray(input.tools) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools",
    expected: "(Array<string> | undefined)",
    value: input.tools
}, _errorFactory)) && input.tools.every((elem: any, _index30: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools[" + _index30 + "]",
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
}, _errorFactory)) && (undefined === input.bindings || ("object" === typeof input.bindings && null !== input.bindings && false === Array.isArray(input.bindings) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".bindings",
    expected: "(Partial<Record<\"input.cursorDown\" | \"input.cursorLeft\" | \"input.cursorLineEnd\" | \"input.cursorLineStart\" | \"input.cursorRight\" | \"input.cursorUp\" | \"input.deleteCharBack\" | \"input.deleteCharForward\" | ... 11 more ... | \"global.quit\", string | string[]>> | undefined)",
    value: input.bindings
}, _errorFactory)) && _ao3(input.bindings, _path + ".bindings", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".bindings",
    expected: "(Partial<Record<\"input.cursorDown\" | \"input.cursorLeft\" | \"input.cursorLineEnd\" | \"input.cursorLineStart\" | \"input.cursorRight\" | \"input.cursorUp\" | \"input.deleteCharBack\" | \"input.deleteCharForward\" | ... 11 more ... | \"global.quit\", string | string[]>> | undefined)",
    value: input.bindings
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["$schema", "model", "reasoning", "tools", "theme", "permissions", "resources", "bindings"].some((prop: any) => key === prop))
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
}, _errorFactory)) && input.allow.every((elem: any, _index31: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".allow[" + _index31 + "]",
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
}, _errorFactory)) && input.deny.every((elem: any, _index32: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".deny[" + _index32 + "]",
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
}, _errorFactory)) && input.ask.every((elem: any, _index33: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ask[" + _index33 + "]",
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
}, _errorFactory)) && input.packs.every((elem: any, _index34: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs[" + _index34 + "]",
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
}, _errorFactory)) && input.plugins.every((elem: any, _index35: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins[" + _index35 + "]",
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
}, _errorFactory)) && input.skills.every((elem: any, _index36: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills[" + _index36 + "]",
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
}, _errorFactory)) && input.themes.every((elem: any, _index37: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes[" + _index37 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes",
    expected: "(Array<string> | false | undefined)",
    value: input.themes
}, _errorFactory))) && ((null !== input.prompts || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts",
    expected: "(Array<string> | false | undefined)",
    value: input.prompts
}, _errorFactory)) && (undefined === input.prompts || false === input.prompts || (Array.isArray(input.prompts) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts",
    expected: "(Array<string> | false | undefined)",
    value: input.prompts
}, _errorFactory)) && input.prompts.every((elem: any, _index38: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts[" + _index38 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".prompts",
    expected: "(Array<string> | false | undefined)",
    value: input.prompts
}, _errorFactory))) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
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
}))); const _ao3 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (null !== input["input.cursorDown"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorDown\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorDown"]
}, _errorFactory)) && (undefined === input["input.cursorDown"] || "string" === typeof input["input.cursorDown"] || (Array.isArray(input["input.cursorDown"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorDown\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorDown"]
}, _errorFactory)) && input["input.cursorDown"].every((elem: any, _index39: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorDown\"][" + _index39 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorDown\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorDown"]
}, _errorFactory)) && ((null !== input["input.cursorLeft"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLeft\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLeft"]
}, _errorFactory)) && (undefined === input["input.cursorLeft"] || "string" === typeof input["input.cursorLeft"] || (Array.isArray(input["input.cursorLeft"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLeft\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLeft"]
}, _errorFactory)) && input["input.cursorLeft"].every((elem: any, _index40: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLeft\"][" + _index40 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLeft\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLeft"]
}, _errorFactory))) && ((null !== input["input.cursorLineEnd"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLineEnd\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLineEnd"]
}, _errorFactory)) && (undefined === input["input.cursorLineEnd"] || "string" === typeof input["input.cursorLineEnd"] || (Array.isArray(input["input.cursorLineEnd"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLineEnd\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLineEnd"]
}, _errorFactory)) && input["input.cursorLineEnd"].every((elem: any, _index41: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLineEnd\"][" + _index41 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLineEnd\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLineEnd"]
}, _errorFactory))) && ((null !== input["input.cursorLineStart"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLineStart\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLineStart"]
}, _errorFactory)) && (undefined === input["input.cursorLineStart"] || "string" === typeof input["input.cursorLineStart"] || (Array.isArray(input["input.cursorLineStart"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLineStart\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLineStart"]
}, _errorFactory)) && input["input.cursorLineStart"].every((elem: any, _index42: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLineStart\"][" + _index42 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorLineStart\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorLineStart"]
}, _errorFactory))) && ((null !== input["input.cursorRight"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorRight\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorRight"]
}, _errorFactory)) && (undefined === input["input.cursorRight"] || "string" === typeof input["input.cursorRight"] || (Array.isArray(input["input.cursorRight"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorRight\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorRight"]
}, _errorFactory)) && input["input.cursorRight"].every((elem: any, _index43: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorRight\"][" + _index43 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorRight\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorRight"]
}, _errorFactory))) && ((null !== input["input.cursorUp"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorUp\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorUp"]
}, _errorFactory)) && (undefined === input["input.cursorUp"] || "string" === typeof input["input.cursorUp"] || (Array.isArray(input["input.cursorUp"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorUp\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorUp"]
}, _errorFactory)) && input["input.cursorUp"].every((elem: any, _index44: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorUp\"][" + _index44 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.cursorUp\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.cursorUp"]
}, _errorFactory))) && ((null !== input["input.deleteCharBack"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteCharBack\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteCharBack"]
}, _errorFactory)) && (undefined === input["input.deleteCharBack"] || "string" === typeof input["input.deleteCharBack"] || (Array.isArray(input["input.deleteCharBack"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteCharBack\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteCharBack"]
}, _errorFactory)) && input["input.deleteCharBack"].every((elem: any, _index45: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteCharBack\"][" + _index45 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteCharBack\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteCharBack"]
}, _errorFactory))) && ((null !== input["input.deleteCharForward"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteCharForward\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteCharForward"]
}, _errorFactory)) && (undefined === input["input.deleteCharForward"] || "string" === typeof input["input.deleteCharForward"] || (Array.isArray(input["input.deleteCharForward"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteCharForward\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteCharForward"]
}, _errorFactory)) && input["input.deleteCharForward"].every((elem: any, _index46: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteCharForward\"][" + _index46 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteCharForward\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteCharForward"]
}, _errorFactory))) && ((null !== input["input.deleteWordBack"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteWordBack\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteWordBack"]
}, _errorFactory)) && (undefined === input["input.deleteWordBack"] || "string" === typeof input["input.deleteWordBack"] || (Array.isArray(input["input.deleteWordBack"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteWordBack\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteWordBack"]
}, _errorFactory)) && input["input.deleteWordBack"].every((elem: any, _index47: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteWordBack\"][" + _index47 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.deleteWordBack\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.deleteWordBack"]
}, _errorFactory))) && ((null !== input["input.insertNewline"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.insertNewline\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.insertNewline"]
}, _errorFactory)) && (undefined === input["input.insertNewline"] || "string" === typeof input["input.insertNewline"] || (Array.isArray(input["input.insertNewline"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.insertNewline\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.insertNewline"]
}, _errorFactory)) && input["input.insertNewline"].every((elem: any, _index48: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.insertNewline\"][" + _index48 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.insertNewline\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.insertNewline"]
}, _errorFactory))) && ((null !== input["input.insertTab"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.insertTab\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.insertTab"]
}, _errorFactory)) && (undefined === input["input.insertTab"] || "string" === typeof input["input.insertTab"] || (Array.isArray(input["input.insertTab"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.insertTab\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.insertTab"]
}, _errorFactory)) && input["input.insertTab"].every((elem: any, _index49: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.insertTab\"][" + _index49 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.insertTab\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.insertTab"]
}, _errorFactory))) && ((null !== input["input.paste"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.paste\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.paste"]
}, _errorFactory)) && (undefined === input["input.paste"] || "string" === typeof input["input.paste"] || (Array.isArray(input["input.paste"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.paste\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.paste"]
}, _errorFactory)) && input["input.paste"].every((elem: any, _index50: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.paste\"][" + _index50 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.paste\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.paste"]
}, _errorFactory))) && ((null !== input["input.submit"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.submit\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.submit"]
}, _errorFactory)) && (undefined === input["input.submit"] || "string" === typeof input["input.submit"] || (Array.isArray(input["input.submit"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.submit\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.submit"]
}, _errorFactory)) && input["input.submit"].every((elem: any, _index51: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.submit\"][" + _index51 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"input.submit\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["input.submit"]
}, _errorFactory))) && ((null !== input["menu.cancel"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.cancel\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.cancel"]
}, _errorFactory)) && (undefined === input["menu.cancel"] || "string" === typeof input["menu.cancel"] || (Array.isArray(input["menu.cancel"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.cancel\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.cancel"]
}, _errorFactory)) && input["menu.cancel"].every((elem: any, _index52: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.cancel\"][" + _index52 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.cancel\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.cancel"]
}, _errorFactory))) && ((null !== input["menu.first"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.first\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.first"]
}, _errorFactory)) && (undefined === input["menu.first"] || "string" === typeof input["menu.first"] || (Array.isArray(input["menu.first"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.first\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.first"]
}, _errorFactory)) && input["menu.first"].every((elem: any, _index53: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.first\"][" + _index53 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.first\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.first"]
}, _errorFactory))) && ((null !== input["menu.last"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.last\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.last"]
}, _errorFactory)) && (undefined === input["menu.last"] || "string" === typeof input["menu.last"] || (Array.isArray(input["menu.last"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.last\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.last"]
}, _errorFactory)) && input["menu.last"].every((elem: any, _index54: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.last\"][" + _index54 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.last\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.last"]
}, _errorFactory))) && ((null !== input["menu.next"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.next\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.next"]
}, _errorFactory)) && (undefined === input["menu.next"] || "string" === typeof input["menu.next"] || (Array.isArray(input["menu.next"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.next\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.next"]
}, _errorFactory)) && input["menu.next"].every((elem: any, _index55: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.next\"][" + _index55 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.next\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.next"]
}, _errorFactory))) && ((null !== input["menu.prev"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.prev\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.prev"]
}, _errorFactory)) && (undefined === input["menu.prev"] || "string" === typeof input["menu.prev"] || (Array.isArray(input["menu.prev"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.prev\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.prev"]
}, _errorFactory)) && input["menu.prev"].every((elem: any, _index56: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.prev\"][" + _index56 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.prev\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.prev"]
}, _errorFactory))) && ((null !== input["menu.select"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.select\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.select"]
}, _errorFactory)) && (undefined === input["menu.select"] || "string" === typeof input["menu.select"] || (Array.isArray(input["menu.select"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.select\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.select"]
}, _errorFactory)) && input["menu.select"].every((elem: any, _index57: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.select\"][" + _index57 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"menu.select\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["menu.select"]
}, _errorFactory))) && ((null !== input["global.quit"] || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"global.quit\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["global.quit"]
}, _errorFactory)) && (undefined === input["global.quit"] || "string" === typeof input["global.quit"] || (Array.isArray(input["global.quit"]) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"global.quit\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["global.quit"]
}, _errorFactory)) && input["global.quit"].every((elem: any, _index58: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"global.quit\"][" + _index58 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + "[\"global.quit\"]",
    expected: "(Array<string> | string | undefined)",
    value: input["global.quit"]
}, _errorFactory))) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["input.cursorDown", "input.cursorLeft", "input.cursorLineEnd", "input.cursorLineStart", "input.cursorRight", "input.cursorUp", "input.deleteCharBack", "input.deleteCharForward", "input.deleteWordBack", "input.insertNewline", "input.insertTab", "input.paste", "input.submit", "menu.cancel", "menu.first", "menu.last", "menu.next", "menu.prev", "menu.select", "global.quit"].some((prop: any) => key === prop))
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
}))); const __is = (input: any, _exceptionable: boolean = true): input is TypiaSettings => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input, true); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): TypiaSettings => {
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
    const bindings: Record<string, KeyPatterns> = {};
    for (const [action, pattern] of Object.entries(ret.bindings ?? {})) {
        if (typeof pattern === "string")
            bindings[action] = canonical(pattern);
        else if (Array.isArray(pattern))
            bindings[action] = pattern.map(canonical);
        else
            throw new TypeError(`invalid key pattern for action ${action}`);
    }
    return { ...ret, bindings };
}
