import * as __typia_transform__accessExpressionAsString from "typia/lib/internal/_accessExpressionAsString";
import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
import type { KeyPatterns } from "@zaly/tui";
import type { Settings, TypiaSettings } from "../../types.ts";
import { canonical } from "@zaly/tui";
const validator = (() => { const _io0 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.model || "string" === typeof input.model) && (undefined === input.reasoning || "off" === input.reasoning || "minimal" === input.reasoning || "low" === input.reasoning || "medium" === input.reasoning || "high" === input.reasoning || "xhigh" === input.reasoning || "max" === input.reasoning) && (undefined === input.tools || Array.isArray(input.tools) && input.tools.every((elem: any, _index1: number) => "string" === typeof elem)) && (undefined === input.ui || "object" === typeof input.ui && null !== input.ui && false === Array.isArray(input.ui) && _io1(input.ui, true && _exceptionable)) && (undefined === input.actions || "object" === typeof input.actions && null !== input.actions && false === Array.isArray(input.actions) && _io2(input.actions, true && _exceptionable)) && (undefined === input.compaction || "object" === typeof input.compaction && null !== input.compaction && false === Array.isArray(input.compaction) && _io3(input.compaction, true && _exceptionable)) && (undefined === input.permissions || "object" === typeof input.permissions && null !== input.permissions && false === Array.isArray(input.permissions) && _io4(input.permissions, true && _exceptionable)) && (undefined === input.resources || "object" === typeof input.resources && null !== input.resources && false === Array.isArray(input.resources) && _io5(input.resources, true && _exceptionable)) && (undefined === input.secrets || "object" === typeof input.secrets && null !== input.secrets && false === Array.isArray(input.secrets) && _io6(input.secrets, true && _exceptionable)) && (undefined === input.system || "object" === typeof input.system && null !== input.system && false === Array.isArray(input.system) && _io11(input.system, true && _exceptionable)) && (undefined === input.$schema || "string" === typeof input.$schema) && (undefined === input.keymap || "object" === typeof input.keymap && null !== input.keymap && false === Array.isArray(input.keymap) && _io12(input.keymap, true && _exceptionable)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["model", "reasoning", "tools", "ui", "actions", "compaction", "permissions", "resources", "secrets", "system", "$schema", "keymap"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io1 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.collapsedTools || Array.isArray(input.collapsedTools) && input.collapsedTools.every((elem: any, _index2: number) => "string" === typeof elem)) && (undefined === input.images || "boolean" === typeof input.images) && (undefined === input.listHeight || "number" === typeof input.listHeight) && (undefined === input.reasoning || "boolean" === typeof input.reasoning) && (undefined === input.theme || "string" === typeof input.theme) && (undefined === input.tree || Array.isArray(input.tree) && input.tree.every((elem: any, _index3: number) => "reasoning" === elem || "tools" === elem || "system" === elem || "assistant" === elem)) && (undefined === input.treeHeight || "number" === typeof input.treeHeight) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["collapsedTools", "images", "listHeight", "reasoning", "theme", "tree", "treeHeight"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io2 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.commandPrefix || "boolean" === typeof input.commandPrefix) && (undefined === input.skillPrefix || "boolean" === typeof input.skillPrefix) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["commandPrefix", "skillPrefix"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io3 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.enabled || "boolean" === typeof input.enabled) && (undefined === input.keepTokens || "number" === typeof input.keepTokens) && (undefined === input.reasoning || "off" === input.reasoning || "minimal" === input.reasoning || "low" === input.reasoning || "medium" === input.reasoning || "high" === input.reasoning || "xhigh" === input.reasoning || "max" === input.reasoning) && (undefined === input.summaryTokens || "number" === typeof input.summaryTokens) && (undefined === input.threshold || "number" === typeof input.threshold) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["enabled", "keepTokens", "reasoning", "summaryTokens", "threshold"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io4 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.preset || "strict" === input.preset || "readonly" === input.preset || "permissive" === input.preset || "yolo" === input.preset) && (undefined === input.allow || Array.isArray(input.allow) && input.allow.every((elem: any, _index4: number) => "string" === typeof elem)) && (undefined === input.deny || Array.isArray(input.deny) && input.deny.every((elem: any, _index5: number) => "string" === typeof elem)) && (undefined === input.ask || Array.isArray(input.ask) && input.ask.every((elem: any, _index6: number) => "string" === typeof elem)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["preset", "allow", "deny", "ask"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io5 = (input: any, _exceptionable: boolean = true): boolean => null !== input.packs && (undefined === input.packs || false === input.packs || Array.isArray(input.packs) && input.packs.every((elem: any, _index7: number) => "string" === typeof elem)) && (null !== input.plugins && (undefined === input.plugins || false === input.plugins || Array.isArray(input.plugins) && input.plugins.every((elem: any, _index8: number) => "string" === typeof elem))) && (null !== input.skills && (undefined === input.skills || false === input.skills || Array.isArray(input.skills) && input.skills.every((elem: any, _index9: number) => "string" === typeof elem))) && (null !== input.themes && (undefined === input.themes || false === input.themes || Array.isArray(input.themes) && input.themes.every((elem: any, _index10: number) => "string" === typeof elem))) && (null !== input.commands && (undefined === input.commands || false === input.commands || Array.isArray(input.commands) && input.commands.every((elem: any, _index11: number) => "string" === typeof elem))) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["packs", "plugins", "skills", "themes", "commands"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io6 = (input: any, _exceptionable: boolean = true): boolean => Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return "object" === typeof value && null !== value && _iu0(value, true && _exceptionable);
}); const _io7 = (input: any, _exceptionable: boolean = true): boolean => "env" === input.source && "string" === typeof input.key && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["source", "key"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io8 = (input: any, _exceptionable: boolean = true): boolean => "exec" === input.source && "string" === typeof input.cmd && (undefined === input.args || Array.isArray(input.args) && input.args.every((elem: any, _index12: number) => "string" === typeof elem)) && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["source", "cmd", "args"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io9 = (input: any, _exceptionable: boolean = true): boolean => "file" === input.source && "string" === typeof input.path && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["source", "path"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io10 = (input: any, _exceptionable: boolean = true): boolean => "literal" === input.source && "string" === typeof input.value && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["source", "value"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io11 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.bash || Array.isArray(input.bash) && input.bash.every((elem: any, _index13: number) => "string" === typeof elem)) && (undefined === input.git || Array.isArray(input.git) && input.git.every((elem: any, _index14: number) => "string" === typeof elem)) && (undefined === input.npm || Array.isArray(input.npm) && input.npm.every((elem: any, _index15: number) => "string" === typeof elem)) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["bash", "git", "npm"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io12 = (input: any, _exceptionable: boolean = true): boolean => Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return null !== value && undefined !== value && ("string" === typeof value || Array.isArray(value) && value.every((elem: any, _index16: number) => "string" === typeof elem));
}); const _iu0 = (input: any, _exceptionable: boolean = true): any => (() => {
    if ("env" === input.source)
        return _io7(input, true && _exceptionable);
    else if ("exec" === input.source)
        return _io8(input, true && _exceptionable);
    else if ("file" === input.source)
        return _io9(input, true && _exceptionable);
    else if ("literal" === input.source)
        return _io10(input, true && _exceptionable);
    else
        return false;
})(); const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.model || "string" === typeof input.model || __typia_transform__assertGuard._assertGuard(_exceptionable, {
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
}, _errorFactory)) && input.tools.every((elem: any, _index17: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools[" + _index17 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tools",
    expected: "(Array<string> | undefined)",
    value: input.tools
}, _errorFactory)) && (undefined === input.ui || ("object" === typeof input.ui && null !== input.ui && false === Array.isArray(input.ui) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ui",
    expected: "(__type | undefined)",
    value: input.ui
}, _errorFactory)) && _ao1(input.ui, _path + ".ui", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ui",
    expected: "(__type | undefined)",
    value: input.ui
}, _errorFactory)) && (undefined === input.actions || ("object" === typeof input.actions && null !== input.actions && false === Array.isArray(input.actions) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".actions",
    expected: "(__type.o2 | undefined)",
    value: input.actions
}, _errorFactory)) && _ao2(input.actions, _path + ".actions", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".actions",
    expected: "(__type.o2 | undefined)",
    value: input.actions
}, _errorFactory)) && (undefined === input.compaction || ("object" === typeof input.compaction && null !== input.compaction && false === Array.isArray(input.compaction) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".compaction",
    expected: "(__type.o3 | undefined)",
    value: input.compaction
}, _errorFactory)) && _ao3(input.compaction, _path + ".compaction", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".compaction",
    expected: "(__type.o3 | undefined)",
    value: input.compaction
}, _errorFactory)) && (undefined === input.permissions || ("object" === typeof input.permissions && null !== input.permissions && false === Array.isArray(input.permissions) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".permissions",
    expected: "(__type.o4 | undefined)",
    value: input.permissions
}, _errorFactory)) && _ao4(input.permissions, _path + ".permissions", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".permissions",
    expected: "(__type.o4 | undefined)",
    value: input.permissions
}, _errorFactory)) && (undefined === input.resources || ("object" === typeof input.resources && null !== input.resources && false === Array.isArray(input.resources) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".resources",
    expected: "(__type.o5 | undefined)",
    value: input.resources
}, _errorFactory)) && _ao5(input.resources, _path + ".resources", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".resources",
    expected: "(__type.o5 | undefined)",
    value: input.resources
}, _errorFactory)) && (undefined === input.secrets || ("object" === typeof input.secrets && null !== input.secrets && false === Array.isArray(input.secrets) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".secrets",
    expected: "(AuthSecrets | undefined)",
    value: input.secrets
}, _errorFactory)) && _ao6(input.secrets, _path + ".secrets", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".secrets",
    expected: "(AuthSecrets | undefined)",
    value: input.secrets
}, _errorFactory)) && (undefined === input.system || ("object" === typeof input.system && null !== input.system && false === Array.isArray(input.system) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".system",
    expected: "(__type.o10 | undefined)",
    value: input.system
}, _errorFactory)) && _ao11(input.system, _path + ".system", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".system",
    expected: "(__type.o10 | undefined)",
    value: input.system
}, _errorFactory)) && (undefined === input.$schema || "string" === typeof input.$schema || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".$schema",
    expected: "(string | undefined)",
    value: input.$schema
}, _errorFactory)) && (undefined === input.keymap || ("object" === typeof input.keymap && null !== input.keymap && false === Array.isArray(input.keymap) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".keymap",
    expected: "(Record<string, string | string[]> | undefined)",
    value: input.keymap
}, _errorFactory)) && _ao12(input.keymap, _path + ".keymap", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".keymap",
    expected: "(Record<string, string | string[]> | undefined)",
    value: input.keymap
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["model", "reasoning", "tools", "ui", "actions", "compaction", "permissions", "resources", "secrets", "system", "$schema", "keymap"].some((prop: any) => key === prop))
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
}))); const _ao1 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.collapsedTools || (Array.isArray(input.collapsedTools) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".collapsedTools",
    expected: "(Array<AnyTool> | undefined)",
    value: input.collapsedTools
}, _errorFactory)) && input.collapsedTools.every((elem: any, _index18: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".collapsedTools[" + _index18 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".collapsedTools",
    expected: "(Array<AnyTool> | undefined)",
    value: input.collapsedTools
}, _errorFactory)) && (undefined === input.images || "boolean" === typeof input.images || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".images",
    expected: "(boolean | undefined)",
    value: input.images
}, _errorFactory)) && (undefined === input.listHeight || "number" === typeof input.listHeight || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".listHeight",
    expected: "(number | undefined)",
    value: input.listHeight
}, _errorFactory)) && (undefined === input.reasoning || "boolean" === typeof input.reasoning || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoning",
    expected: "(boolean | undefined)",
    value: input.reasoning
}, _errorFactory)) && (undefined === input.theme || "string" === typeof input.theme || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".theme",
    expected: "(string | undefined)",
    value: input.theme
}, _errorFactory)) && (undefined === input.tree || (Array.isArray(input.tree) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tree",
    expected: "(Array<\"reasoning\" | \"tools\" | \"system\" | \"assistant\"> | undefined)",
    value: input.tree
}, _errorFactory)) && input.tree.every((elem: any, _index19: number) => "reasoning" === elem || "tools" === elem || "system" === elem || "assistant" === elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tree[" + _index19 + "]",
    expected: "(\"assistant\" | \"reasoning\" | \"system\" | \"tools\")",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tree",
    expected: "(Array<\"reasoning\" | \"tools\" | \"system\" | \"assistant\"> | undefined)",
    value: input.tree
}, _errorFactory)) && (undefined === input.treeHeight || "number" === typeof input.treeHeight || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".treeHeight",
    expected: "(number | undefined)",
    value: input.treeHeight
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["collapsedTools", "images", "listHeight", "reasoning", "theme", "tree", "treeHeight"].some((prop: any) => key === prop))
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
}))); const _ao2 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.commandPrefix || "boolean" === typeof input.commandPrefix || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".commandPrefix",
    expected: "(boolean | undefined)",
    value: input.commandPrefix
}, _errorFactory)) && (undefined === input.skillPrefix || "boolean" === typeof input.skillPrefix || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skillPrefix",
    expected: "(boolean | undefined)",
    value: input.skillPrefix
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["commandPrefix", "skillPrefix"].some((prop: any) => key === prop))
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
}))); const _ao3 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.enabled || "boolean" === typeof input.enabled || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".enabled",
    expected: "(boolean | undefined)",
    value: input.enabled
}, _errorFactory)) && (undefined === input.keepTokens || "number" === typeof input.keepTokens || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".keepTokens",
    expected: "(number | undefined)",
    value: input.keepTokens
}, _errorFactory)) && (undefined === input.reasoning || "off" === input.reasoning || "minimal" === input.reasoning || "low" === input.reasoning || "medium" === input.reasoning || "high" === input.reasoning || "xhigh" === input.reasoning || "max" === input.reasoning || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoning",
    expected: "(\"high\" | \"low\" | \"max\" | \"medium\" | \"minimal\" | \"off\" | \"xhigh\" | undefined)",
    value: input.reasoning
}, _errorFactory)) && (undefined === input.summaryTokens || "number" === typeof input.summaryTokens || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".summaryTokens",
    expected: "(number | undefined)",
    value: input.summaryTokens
}, _errorFactory)) && (undefined === input.threshold || "number" === typeof input.threshold || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".threshold",
    expected: "(number | undefined)",
    value: input.threshold
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["enabled", "keepTokens", "reasoning", "summaryTokens", "threshold"].some((prop: any) => key === prop))
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
}))); const _ao4 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.preset || "strict" === input.preset || "readonly" === input.preset || "permissive" === input.preset || "yolo" === input.preset || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".preset",
    expected: "(\"permissive\" | \"readonly\" | \"strict\" | \"yolo\" | undefined)",
    value: input.preset
}, _errorFactory)) && (undefined === input.allow || (Array.isArray(input.allow) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".allow",
    expected: "(Array<string> | undefined)",
    value: input.allow
}, _errorFactory)) && input.allow.every((elem: any, _index20: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".allow[" + _index20 + "]",
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
}, _errorFactory)) && input.deny.every((elem: any, _index21: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".deny[" + _index21 + "]",
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
}, _errorFactory)) && input.ask.every((elem: any, _index22: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".ask[" + _index22 + "]",
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
}))); const _ao5 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (null !== input.packs || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs",
    expected: "(Array<string> | false | undefined)",
    value: input.packs
}, _errorFactory)) && (undefined === input.packs || false === input.packs || (Array.isArray(input.packs) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs",
    expected: "(Array<string> | false | undefined)",
    value: input.packs
}, _errorFactory)) && input.packs.every((elem: any, _index23: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".packs[" + _index23 + "]",
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
}, _errorFactory)) && input.plugins.every((elem: any, _index24: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".plugins[" + _index24 + "]",
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
}, _errorFactory)) && input.skills.every((elem: any, _index25: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".skills[" + _index25 + "]",
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
}, _errorFactory)) && input.themes.every((elem: any, _index26: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".themes[" + _index26 + "]",
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
}, _errorFactory)) && input.commands.every((elem: any, _index27: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".commands[" + _index27 + "]",
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
}))); const _ao6 = (input: any, _path: string, _exceptionable: boolean = true): boolean => false === _exceptionable || Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return ("object" === typeof value && null !== value || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(__type.o6 | __type.o7 | __type.o8 | __type.o9)",
        value: value
    }, _errorFactory)) && _au0(value, _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key), true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "(__type.o6 | __type.o7 | __type.o8 | __type.o9)",
        value: value
    }, _errorFactory);
}); const _ao7 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("env" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
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
}))); const _ao8 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("exec" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
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
}, _errorFactory)) && input.args.every((elem: any, _index28: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".args[" + _index28 + "]",
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
}))); const _ao9 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("file" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
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
}))); const _ao10 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("literal" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
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
}))); const _ao11 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.bash || (Array.isArray(input.bash) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".bash",
    expected: "(Array<string> | undefined)",
    value: input.bash
}, _errorFactory)) && input.bash.every((elem: any, _index29: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".bash[" + _index29 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".bash",
    expected: "(Array<string> | undefined)",
    value: input.bash
}, _errorFactory)) && (undefined === input.git || (Array.isArray(input.git) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".git",
    expected: "(Array<string> | undefined)",
    value: input.git
}, _errorFactory)) && input.git.every((elem: any, _index30: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".git[" + _index30 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".git",
    expected: "(Array<string> | undefined)",
    value: input.git
}, _errorFactory)) && (undefined === input.npm || (Array.isArray(input.npm) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".npm",
    expected: "(Array<string> | undefined)",
    value: input.npm
}, _errorFactory)) && input.npm.every((elem: any, _index31: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".npm[" + _index31 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".npm",
    expected: "(Array<string> | undefined)",
    value: input.npm
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["bash", "git", "npm"].some((prop: any) => key === prop))
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
}))); const _ao12 = (input: any, _path: string, _exceptionable: boolean = true): boolean => false === _exceptionable || Object.keys(input).every((key: any) => {
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
    }, _errorFactory)) && value.every((elem: any, _index32: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key) + "[" + _index32 + "]",
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
        return _ao7(input, _path, true && _exceptionable);
    else if ("exec" === input.source)
        return _ao8(input, _path, true && _exceptionable);
    else if ("file" === input.source)
        return _ao9(input, _path, true && _exceptionable);
    else if ("literal" === input.source)
        return _ao10(input, _path, true && _exceptionable);
    else
        return __typia_transform__assertGuard._assertGuard(_exceptionable, {
            method: "typia.createAssertEquals",
            path: _path,
            expected: "(__type.o6 | __type.o7 | __type.o8 | __type.o9)",
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
