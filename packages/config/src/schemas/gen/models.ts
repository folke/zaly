import * as __typia_transform__accessExpressionAsString from "typia/lib/internal/_accessExpressionAsString";
import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
// IMPORTANT: always use typia import directly, otherwise generates code will
// contain actual typia imports
// oxlint-disable import/no-named-as-default-member
import type { ModelsJson } from "@zaly/ai";
const validator = (() => { const _io0 = (input: any, _exceptionable: boolean = true): boolean => Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return "object" === typeof value && null !== value && false === Array.isArray(value) && _io1(value, true && _exceptionable);
}); const _io1 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.name || "string" === typeof input.name) && (undefined === input.api || "string" === typeof input.api) && (undefined === input.apiKey || "string" === typeof input.apiKey) && (undefined === input.baseUrl || "string" === typeof input.baseUrl) && (undefined === input.doc || "string" === typeof input.doc) && (undefined === input.env || Array.isArray(input.env) && input.env.every((elem: any, _index1: number) => "string" === typeof elem)) && (undefined === input.headers || "object" === typeof input.headers && null !== input.headers && false === Array.isArray(input.headers) && _io2(input.headers, true && _exceptionable)) && (undefined === input.quirks || "object" === typeof input.quirks && null !== input.quirks && false === Array.isArray(input.quirks) && _io3(input.quirks, true && _exceptionable)) && (undefined === input.models || Array.isArray(input.models) && input.models.every((elem: any, _index2: number) => "object" === typeof elem && null !== elem && _io4(elem, true && _exceptionable))) && (undefined === input.source || "models.dev" === input.source || "builtin" === input.source || "custom" === input.source) && (undefined === input.replaceModels || "boolean" === typeof input.replaceModels) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["name", "api", "apiKey", "baseUrl", "doc", "env", "headers", "quirks", "models", "source", "replaceModels"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io2 = (input: any, _exceptionable: boolean = true): boolean => Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return "string" === typeof value;
}); const _io3 = (input: any, _exceptionable: boolean = true): boolean => (undefined === input.maxTokensField || "max_tokens" === input.maxTokensField || "max_completion_tokens" === input.maxTokensField || "max_output_tokens" === input.maxTokensField || "none" === input.maxTokensField) && (undefined === input.thinkingFormat || "openai" === input.thinkingFormat || "openrouter" === input.thinkingFormat || "deepseek" === input.thinkingFormat || "zai" === input.thinkingFormat || "qwen" === input.thinkingFormat || "qwen-chat-template" === input.thinkingFormat) && (undefined === input.reasoningLevels || Array.isArray(input.reasoningLevels) && input.reasoningLevels.every((elem: any, _index3: number) => "off" === elem || "minimal" === elem || "low" === elem || "medium" === elem || "high" === elem || "xhigh" === elem || "max" === elem)) && (undefined === input.reasoningField || "reasoning" === input.reasoningField || "reasoning_content" === input.reasoningField || "reasoning_details" === input.reasoningField) && (undefined === input.temperatureSupported || "boolean" === typeof input.temperatureSupported) && (undefined === input.strictTools || "boolean" === typeof input.strictTools) && (undefined === input.responsesStore || "boolean" === typeof input.responsesStore) && (undefined === input.responsesInclude || Array.isArray(input.responsesInclude) && input.responsesInclude.every((elem: any, _index4: number) => "string" === typeof elem)) && (undefined === input.responsesSystemAs || "input" === input.responsesSystemAs || "instructions" === input.responsesSystemAs) && (undefined === input.responsesReasoningSummary || "off" === input.responsesReasoningSummary || "auto" === input.responsesReasoningSummary || "concise" === input.responsesReasoningSummary || "detailed" === input.responsesReasoningSummary) && (undefined === input.friendlyErrors || "codex" === input.friendlyErrors) && (undefined === input.toolCallExtraContent || "string" === typeof input.toolCallExtraContent) && (0 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["maxTokensField", "thinkingFormat", "reasoningLevels", "reasoningField", "temperatureSupported", "strictTools", "responsesStore", "responsesInclude", "responsesSystemAs", "responsesReasoningSummary", "friendlyErrors", "toolCallExtraContent"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io4 = (input: any, _exceptionable: boolean = true): boolean => "string" === typeof input.id && (undefined === input.name || "string" === typeof input.name) && (undefined === input.baseUrl || "string" === typeof input.baseUrl) && (undefined === input.api || "string" === typeof input.api) && (undefined === input.input || Array.isArray(input.input) && input.input.every((elem: any, _index5: number) => "text" === elem || "audio" === elem || "image" === elem || "video" === elem || "pdf" === elem)) && (undefined === input.output || Array.isArray(input.output) && input.output.every((elem: any, _index6: number) => "text" === elem || "audio" === elem || "image" === elem || "video" === elem || "pdf" === elem)) && (undefined === input.maxTokens || "number" === typeof input.maxTokens) && (undefined === input.contextSize || "number" === typeof input.contextSize) && (undefined === input.reasoning || "boolean" === typeof input.reasoning) && (undefined === input.knowledge || "string" === typeof input.knowledge) && (undefined === input.release_date || "string" === typeof input.release_date) && (undefined === input.last_updated || "string" === typeof input.last_updated) && (undefined === input.open_weights || "boolean" === typeof input.open_weights) && (undefined === input.cost || "object" === typeof input.cost && null !== input.cost && _io5(input.cost, true && _exceptionable)) && (undefined === input.tool_call || "boolean" === typeof input.tool_call) && (1 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["id", "name", "baseUrl", "api", "input", "output", "maxTokens", "contextSize", "reasoning", "knowledge", "release_date", "last_updated", "open_weights", "cost", "tool_call"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io5 = (input: any, _exceptionable: boolean = true): boolean => "number" === typeof input.input && "number" === typeof input.output && (undefined === input.reasoning || "number" === typeof input.reasoning) && (undefined === input.cache_read || "number" === typeof input.cache_read) && (undefined === input.cache_write || "number" === typeof input.cache_write) && (undefined === input.input_audio || "number" === typeof input.input_audio) && (undefined === input.output_audio || "number" === typeof input.output_audio) && (undefined === input.context_over_200k || "object" === typeof input.context_over_200k && null !== input.context_over_200k && _io6(input.context_over_200k, true && _exceptionable)) && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["input", "output", "reasoning", "cache_read", "cache_write", "input_audio", "output_audio", "context_over_200k"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _io6 = (input: any, _exceptionable: boolean = true): boolean => "number" === typeof input.input && "number" === typeof input.output && (undefined === input.reasoning || "number" === typeof input.reasoning) && (undefined === input.cache_read || "number" === typeof input.cache_read) && (undefined === input.cache_write || "number" === typeof input.cache_write) && (undefined === input.input_audio || "number" === typeof input.input_audio) && (undefined === input.output_audio || "number" === typeof input.output_audio) && (2 === Object.keys(input).length || Object.keys(input).every((key: any) => {
    if (["input", "output", "reasoning", "cache_read", "cache_write", "input_audio", "output_audio"].some((prop: any) => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _ao0 = (input: any, _path: string, _exceptionable: boolean = true): boolean => false === _exceptionable || Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return ("object" === typeof value && null !== value && false === Array.isArray(value) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "__type",
        value: value
    }, _errorFactory)) && _ao1(value, _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key), true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "__type",
        value: value
    }, _errorFactory);
}); const _ao1 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.name || "string" === typeof input.name || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".name",
    expected: "(string | undefined)",
    value: input.name
}, _errorFactory)) && (undefined === input.api || "string" === typeof input.api || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".api",
    expected: "(string | undefined)",
    value: input.api
}, _errorFactory)) && (undefined === input.apiKey || "string" === typeof input.apiKey || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".apiKey",
    expected: "(string | undefined)",
    value: input.apiKey
}, _errorFactory)) && (undefined === input.baseUrl || "string" === typeof input.baseUrl || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".baseUrl",
    expected: "(string | undefined)",
    value: input.baseUrl
}, _errorFactory)) && (undefined === input.doc || "string" === typeof input.doc || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".doc",
    expected: "(string | undefined)",
    value: input.doc
}, _errorFactory)) && (undefined === input.env || (Array.isArray(input.env) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".env",
    expected: "(Array<string> | undefined)",
    value: input.env
}, _errorFactory)) && input.env.every((elem: any, _index7: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".env[" + _index7 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".env",
    expected: "(Array<string> | undefined)",
    value: input.env
}, _errorFactory)) && (undefined === input.headers || ("object" === typeof input.headers && null !== input.headers && false === Array.isArray(input.headers) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".headers",
    expected: "(Record<string, string> | undefined)",
    value: input.headers
}, _errorFactory)) && _ao2(input.headers, _path + ".headers", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".headers",
    expected: "(Record<string, string> | undefined)",
    value: input.headers
}, _errorFactory)) && (undefined === input.quirks || ("object" === typeof input.quirks && null !== input.quirks && false === Array.isArray(input.quirks) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".quirks",
    expected: "(Quirks | undefined)",
    value: input.quirks
}, _errorFactory)) && _ao3(input.quirks, _path + ".quirks", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".quirks",
    expected: "(Quirks | undefined)",
    value: input.quirks
}, _errorFactory)) && (undefined === input.models || (Array.isArray(input.models) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".models",
    expected: "(Array<ModelInfo> | undefined)",
    value: input.models
}, _errorFactory)) && input.models.every((elem: any, _index8: number) => ("object" === typeof elem && null !== elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".models[" + _index8 + "]",
    expected: "ModelInfo",
    value: elem
}, _errorFactory)) && _ao4(elem, _path + ".models[" + _index8 + "]", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".models[" + _index8 + "]",
    expected: "ModelInfo",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".models",
    expected: "(Array<ModelInfo> | undefined)",
    value: input.models
}, _errorFactory)) && (undefined === input.source || "models.dev" === input.source || "builtin" === input.source || "custom" === input.source || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".source",
    expected: "(\"builtin\" | \"custom\" | \"models.dev\" | undefined)",
    value: input.source
}, _errorFactory)) && (undefined === input.replaceModels || "boolean" === typeof input.replaceModels || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".replaceModels",
    expected: "(boolean | undefined)",
    value: input.replaceModels
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["name", "api", "apiKey", "baseUrl", "doc", "env", "headers", "quirks", "models", "source", "replaceModels"].some((prop: any) => key === prop))
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
}))); const _ao2 = (input: any, _path: string, _exceptionable: boolean = true): boolean => false === _exceptionable || Object.keys(input).every((key: any) => {
    const value = input[key];
    if (undefined === value)
        return true;
    return "string" === typeof value || __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "string",
        value: value
    }, _errorFactory);
}); const _ao3 = (input: any, _path: string, _exceptionable: boolean = true): boolean => (undefined === input.maxTokensField || "max_tokens" === input.maxTokensField || "max_completion_tokens" === input.maxTokensField || "max_output_tokens" === input.maxTokensField || "none" === input.maxTokensField || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".maxTokensField",
    expected: "(\"max_completion_tokens\" | \"max_output_tokens\" | \"max_tokens\" | \"none\" | undefined)",
    value: input.maxTokensField
}, _errorFactory)) && (undefined === input.thinkingFormat || "openai" === input.thinkingFormat || "openrouter" === input.thinkingFormat || "deepseek" === input.thinkingFormat || "zai" === input.thinkingFormat || "qwen" === input.thinkingFormat || "qwen-chat-template" === input.thinkingFormat || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".thinkingFormat",
    expected: "(\"deepseek\" | \"openai\" | \"openrouter\" | \"qwen\" | \"qwen-chat-template\" | \"zai\" | undefined)",
    value: input.thinkingFormat
}, _errorFactory)) && (undefined === input.reasoningLevels || (Array.isArray(input.reasoningLevels) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoningLevels",
    expected: "(Array<\"off\" | \"minimal\" | \"low\" | \"medium\" | \"high\" | \"xhigh\" | \"max\"> | undefined)",
    value: input.reasoningLevels
}, _errorFactory)) && input.reasoningLevels.every((elem: any, _index9: number) => "off" === elem || "minimal" === elem || "low" === elem || "medium" === elem || "high" === elem || "xhigh" === elem || "max" === elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoningLevels[" + _index9 + "]",
    expected: "(\"high\" | \"low\" | \"max\" | \"medium\" | \"minimal\" | \"off\" | \"xhigh\")",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoningLevels",
    expected: "(Array<\"off\" | \"minimal\" | \"low\" | \"medium\" | \"high\" | \"xhigh\" | \"max\"> | undefined)",
    value: input.reasoningLevels
}, _errorFactory)) && (undefined === input.reasoningField || "reasoning" === input.reasoningField || "reasoning_content" === input.reasoningField || "reasoning_details" === input.reasoningField || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoningField",
    expected: "(\"reasoning\" | \"reasoning_content\" | \"reasoning_details\" | undefined)",
    value: input.reasoningField
}, _errorFactory)) && (undefined === input.temperatureSupported || "boolean" === typeof input.temperatureSupported || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".temperatureSupported",
    expected: "(boolean | undefined)",
    value: input.temperatureSupported
}, _errorFactory)) && (undefined === input.strictTools || "boolean" === typeof input.strictTools || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".strictTools",
    expected: "(boolean | undefined)",
    value: input.strictTools
}, _errorFactory)) && (undefined === input.responsesStore || "boolean" === typeof input.responsesStore || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".responsesStore",
    expected: "(boolean | undefined)",
    value: input.responsesStore
}, _errorFactory)) && (undefined === input.responsesInclude || (Array.isArray(input.responsesInclude) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".responsesInclude",
    expected: "(Array<string> | undefined)",
    value: input.responsesInclude
}, _errorFactory)) && input.responsesInclude.every((elem: any, _index10: number) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".responsesInclude[" + _index10 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".responsesInclude",
    expected: "(Array<string> | undefined)",
    value: input.responsesInclude
}, _errorFactory)) && (undefined === input.responsesSystemAs || "input" === input.responsesSystemAs || "instructions" === input.responsesSystemAs || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".responsesSystemAs",
    expected: "(\"input\" | \"instructions\" | undefined)",
    value: input.responsesSystemAs
}, _errorFactory)) && (undefined === input.responsesReasoningSummary || "off" === input.responsesReasoningSummary || "auto" === input.responsesReasoningSummary || "concise" === input.responsesReasoningSummary || "detailed" === input.responsesReasoningSummary || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".responsesReasoningSummary",
    expected: "(\"auto\" | \"concise\" | \"detailed\" | \"off\" | undefined)",
    value: input.responsesReasoningSummary
}, _errorFactory)) && (undefined === input.friendlyErrors || "codex" === input.friendlyErrors || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".friendlyErrors",
    expected: "(\"codex\" | undefined)",
    value: input.friendlyErrors
}, _errorFactory)) && (undefined === input.toolCallExtraContent || "string" === typeof input.toolCallExtraContent || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".toolCallExtraContent",
    expected: "(string | undefined)",
    value: input.toolCallExtraContent
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["maxTokensField", "thinkingFormat", "reasoningLevels", "reasoningField", "temperatureSupported", "strictTools", "responsesStore", "responsesInclude", "responsesSystemAs", "responsesReasoningSummary", "friendlyErrors", "toolCallExtraContent"].some((prop: any) => key === prop))
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
}))); const _ao4 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("string" === typeof input.id || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".id",
    expected: "string",
    value: input.id
}, _errorFactory)) && (undefined === input.name || "string" === typeof input.name || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".name",
    expected: "(string | undefined)",
    value: input.name
}, _errorFactory)) && (undefined === input.baseUrl || "string" === typeof input.baseUrl || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".baseUrl",
    expected: "(string | undefined)",
    value: input.baseUrl
}, _errorFactory)) && (undefined === input.api || "string" === typeof input.api || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".api",
    expected: "(string | undefined)",
    value: input.api
}, _errorFactory)) && (undefined === input.input || (Array.isArray(input.input) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".input",
    expected: "(Array<Modality> | undefined)",
    value: input.input
}, _errorFactory)) && input.input.every((elem: any, _index11: number) => "text" === elem || "audio" === elem || "image" === elem || "video" === elem || "pdf" === elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".input[" + _index11 + "]",
    expected: "(\"audio\" | \"image\" | \"pdf\" | \"text\" | \"video\")",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".input",
    expected: "(Array<Modality> | undefined)",
    value: input.input
}, _errorFactory)) && (undefined === input.output || (Array.isArray(input.output) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".output",
    expected: "(Array<Modality> | undefined)",
    value: input.output
}, _errorFactory)) && input.output.every((elem: any, _index12: number) => "text" === elem || "audio" === elem || "image" === elem || "video" === elem || "pdf" === elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".output[" + _index12 + "]",
    expected: "(\"audio\" | \"image\" | \"pdf\" | \"text\" | \"video\")",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".output",
    expected: "(Array<Modality> | undefined)",
    value: input.output
}, _errorFactory)) && (undefined === input.maxTokens || "number" === typeof input.maxTokens || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".maxTokens",
    expected: "(number | undefined)",
    value: input.maxTokens
}, _errorFactory)) && (undefined === input.contextSize || "number" === typeof input.contextSize || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".contextSize",
    expected: "(number | undefined)",
    value: input.contextSize
}, _errorFactory)) && (undefined === input.reasoning || "boolean" === typeof input.reasoning || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoning",
    expected: "(boolean | undefined)",
    value: input.reasoning
}, _errorFactory)) && (undefined === input.knowledge || "string" === typeof input.knowledge || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".knowledge",
    expected: "(string | undefined)",
    value: input.knowledge
}, _errorFactory)) && (undefined === input.release_date || "string" === typeof input.release_date || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".release_date",
    expected: "(string | undefined)",
    value: input.release_date
}, _errorFactory)) && (undefined === input.last_updated || "string" === typeof input.last_updated || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".last_updated",
    expected: "(string | undefined)",
    value: input.last_updated
}, _errorFactory)) && (undefined === input.open_weights || "boolean" === typeof input.open_weights || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".open_weights",
    expected: "(boolean | undefined)",
    value: input.open_weights
}, _errorFactory)) && (undefined === input.cost || ("object" === typeof input.cost && null !== input.cost || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".cost",
    expected: "(Cost & { context_over_200k?: Cost | undefined; } | undefined)",
    value: input.cost
}, _errorFactory)) && _ao5(input.cost, _path + ".cost", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".cost",
    expected: "(Cost & { context_over_200k?: Cost | undefined; } | undefined)",
    value: input.cost
}, _errorFactory)) && (undefined === input.tool_call || "boolean" === typeof input.tool_call || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".tool_call",
    expected: "(boolean | undefined)",
    value: input.tool_call
}, _errorFactory)) && (1 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["id", "name", "baseUrl", "api", "input", "output", "maxTokens", "contextSize", "reasoning", "knowledge", "release_date", "last_updated", "open_weights", "cost", "tool_call"].some((prop: any) => key === prop))
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
}))); const _ao5 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("number" === typeof input.input || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".input",
    expected: "number",
    value: input.input
}, _errorFactory)) && ("number" === typeof input.output || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".output",
    expected: "number",
    value: input.output
}, _errorFactory)) && (undefined === input.reasoning || "number" === typeof input.reasoning || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoning",
    expected: "(number | undefined)",
    value: input.reasoning
}, _errorFactory)) && (undefined === input.cache_read || "number" === typeof input.cache_read || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".cache_read",
    expected: "(number | undefined)",
    value: input.cache_read
}, _errorFactory)) && (undefined === input.cache_write || "number" === typeof input.cache_write || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".cache_write",
    expected: "(number | undefined)",
    value: input.cache_write
}, _errorFactory)) && (undefined === input.input_audio || "number" === typeof input.input_audio || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".input_audio",
    expected: "(number | undefined)",
    value: input.input_audio
}, _errorFactory)) && (undefined === input.output_audio || "number" === typeof input.output_audio || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".output_audio",
    expected: "(number | undefined)",
    value: input.output_audio
}, _errorFactory)) && (undefined === input.context_over_200k || ("object" === typeof input.context_over_200k && null !== input.context_over_200k || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".context_over_200k",
    expected: "(Cost | undefined)",
    value: input.context_over_200k
}, _errorFactory)) && _ao6(input.context_over_200k, _path + ".context_over_200k", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".context_over_200k",
    expected: "(Cost | undefined)",
    value: input.context_over_200k
}, _errorFactory)) && (2 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["input", "output", "reasoning", "cache_read", "cache_write", "input_audio", "output_audio", "context_over_200k"].some((prop: any) => key === prop))
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
}))); const _ao6 = (input: any, _path: string, _exceptionable: boolean = true): boolean => ("number" === typeof input.input || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".input",
    expected: "number",
    value: input.input
}, _errorFactory)) && ("number" === typeof input.output || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".output",
    expected: "number",
    value: input.output
}, _errorFactory)) && (undefined === input.reasoning || "number" === typeof input.reasoning || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".reasoning",
    expected: "(number | undefined)",
    value: input.reasoning
}, _errorFactory)) && (undefined === input.cache_read || "number" === typeof input.cache_read || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".cache_read",
    expected: "(number | undefined)",
    value: input.cache_read
}, _errorFactory)) && (undefined === input.cache_write || "number" === typeof input.cache_write || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".cache_write",
    expected: "(number | undefined)",
    value: input.cache_write
}, _errorFactory)) && (undefined === input.input_audio || "number" === typeof input.input_audio || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".input_audio",
    expected: "(number | undefined)",
    value: input.input_audio
}, _errorFactory)) && (undefined === input.output_audio || "number" === typeof input.output_audio || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".output_audio",
    expected: "(number | undefined)",
    value: input.output_audio
}, _errorFactory)) && (2 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every((key: any) => {
    if (["input", "output", "reasoning", "cache_read", "cache_write", "input_audio", "output_audio"].some((prop: any) => key === prop))
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
}))); const __is = (input: any, _exceptionable: boolean = true): input is ModelsJson => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input, true); let _errorFactory: any; return (input: any, errorFactory?: (p: import("typia").TypeGuardError.IProps) => Error): ModelsJson => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input: any, _path: string, _exceptionable: boolean = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "ModelsJson",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "ModelsJson",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
export function validateModels(input: unknown): ModelsJson {
    return validator(input);
}
