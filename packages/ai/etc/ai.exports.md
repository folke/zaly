# @zaly/ai (159)

## Classes (5)

- AiError
- AuthManager
- ContentTransform
- Model
- ModelCatalog

## Functions (50)

- attachmentToMeta
- compressImages
- createTransform
- defineTool
- downloadCatalog
- dropAttachments
- errorToMeta
- errorToMetaPart
- extractToolCalls
- extractToolResults
- fileToMetaPart
- getModel
- hasAttachments
- inlineFile
- inlineFileSources
- isAttachment
- isContentPart
- isContextOverflow
- isErrorInfo
- isStreamable
- justText
- loadCatalog
- loadModel
- metaToText
- metaToTextPart
- modelCollection
- pairedToolIds
- parseJson
- parseModelId
- reasoningLevels
- renderMetaPart
- resolveApiKey
- resolveModels
- resolveReasoning
- runTool
- safeParseToolParams
- sanitizeText
- stringifyContent
- toAttachment
- toContent
- toErrorPart
- toErrorResult
- toImagePart
- toModelSpec
- toParts
- toPdfPart
- toXml
- transformMeta
- truncateText
- withRetry

## Constants (3)

- DEFAULT_CONTEXT_SIZE
- DEFAULT_MAX_TOKENS
- zalyUserAgent

## Types Classes (1)

- ModelCollection

## Types Functions (3)

- collect
- filterModel
- filterModels

## Types (97)

- AnyContent
- AnyPart
- AnyType
- ApiKey
- ApiKeySecret
- AssistantMessage
- Attachment
- AudioPart
- AuthLogin
- AuthLoginMethod
- AuthManagerOpts
- AuthSecret
- AuthSecrets
- AuthSource
- CatalogModel
- CollectOptions
- Content
- ContentPart
- Context
- Cost
- ErrorCode
- ErrorInfo
- ErrorPart
- FetchLike
- FilePart
- FilePartSource
- FinishReason
- ImagePart
- Inlined
- JsonValue
- LoginCallbacks
- Message
- MetaOf
- MetaPart
- Modality
- ModelCtx
- ModelFilter
- ModelInfo
- ModelOpts
- ModelProvider
- ModelSpec
- ModelStreamOptions
- ModelsJson
- OAuthBrowserLogin
- OAuthBrowserOpts
- OAuthCallbacks
- OAuthDeviceCode
- OAuthDeviceLogin
- OAuthDeviceOpts
- OAuthExchangeCodeRequest
- OAuthLogin
- OAuthLoginCtx
- OAuthMethod
- OAuthOptions
- OAuthProvider
- OAuthRequest
- OAuthResponse
- OAuthSecret
- OAuthToken
- OAuthTokenRequest
- OAuthTokenResponse
- OverflowCheck
- ParamsOf
- ParseResult
- PdfPart
- Provider
- ProviderApiKey
- ProviderOptions
- ProviderOverride
- ProviderRequest
- Quirks
- ReasoningEffort
- ReasoningOption
- ReasoningPart
- ResponseFormat
- ResultOf
- RetryOptions
- Role
- SafeParamsOf
- StaticOf
- StreamEvent
- StreamOptions
- Streamable
- TextPart
- TokenCount
- Tool
- ToolCallPart
- ToolChoice
- ToolContext
- ToolDef
- ToolResult
- ToolResultPart
- Usage
- VideoPart
- WirePart
- WithPart
- WithoutPart
