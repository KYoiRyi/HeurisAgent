import { clearApiProviders, registerApiProvider } from "../api-registry";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	Context,
	Model,
	SimpleStreamOptions,
	StreamFunction,
	StreamOptions,
} from "../types";
import { AssistantMessageEventStream } from "../utils/event-stream";
import type { AnthropicOptions } from "./anthropic";
import type { GoogleOptions } from "./google";
import type { GoogleVertexOptions } from "./google-vertex";
import type { MistralOptions } from "./mistral";
import type { OpenAICompletionsOptions } from "./openai-completions";
import type { OpenAIResponsesOptions } from "./openai-responses";

interface LazyProviderModule<
	TApi extends Api,
	TOptions extends StreamOptions,
	TSimpleOptions extends SimpleStreamOptions,
> {
	stream: (model: Model<TApi>, context: Context, options?: TOptions) => AsyncIterable<AssistantMessageEvent>;
	streamSimple: (
		model: Model<TApi>,
		context: Context,
		options?: TSimpleOptions,
	) => AsyncIterable<AssistantMessageEvent>;
}

interface AnthropicProviderModule {
	streamAnthropic: StreamFunction<"anthropic-messages", AnthropicOptions>;
	streamSimpleAnthropic: StreamFunction<"anthropic-messages", SimpleStreamOptions>;
}

interface GoogleProviderModule {
	streamGoogle: StreamFunction<"google-generative-ai", GoogleOptions>;
	streamSimpleGoogle: StreamFunction<"google-generative-ai", SimpleStreamOptions>;
}

interface GoogleVertexProviderModule {
	streamGoogleVertex: StreamFunction<"google-vertex", GoogleVertexOptions>;
	streamSimpleGoogleVertex: StreamFunction<"google-vertex", SimpleStreamOptions>;
}

interface MistralProviderModule {
	streamMistral: StreamFunction<"mistral-conversations", MistralOptions>;
	streamSimpleMistral: StreamFunction<"mistral-conversations", SimpleStreamOptions>;
}

interface OpenAICompletionsProviderModule {
	streamOpenAICompletions: StreamFunction<"openai-completions", OpenAICompletionsOptions>;
	streamSimpleOpenAICompletions: StreamFunction<"openai-completions", SimpleStreamOptions>;
}

interface OpenAIResponsesProviderModule {
	streamOpenAIResponses: StreamFunction<"openai-responses", OpenAIResponsesOptions>;
	streamSimpleOpenAIResponses: StreamFunction<"openai-responses", SimpleStreamOptions>;
}

let anthropicProviderModulePromise:
	| Promise<LazyProviderModule<"anthropic-messages", AnthropicOptions, SimpleStreamOptions>>
	| undefined;
let googleProviderModulePromise:
	| Promise<LazyProviderModule<"google-generative-ai", GoogleOptions, SimpleStreamOptions>>
	| undefined;
let googleVertexProviderModulePromise:
	| Promise<LazyProviderModule<"google-vertex", GoogleVertexOptions, SimpleStreamOptions>>
	| undefined;
let mistralProviderModulePromise:
	| Promise<LazyProviderModule<"mistral-conversations", MistralOptions, SimpleStreamOptions>>
	| undefined;
let openAICompletionsProviderModulePromise:
	| Promise<LazyProviderModule<"openai-completions", OpenAICompletionsOptions, SimpleStreamOptions>>
	| undefined;
let openAIResponsesProviderModulePromise:
	| Promise<LazyProviderModule<"openai-responses", OpenAIResponsesOptions, SimpleStreamOptions>>
	| undefined;

function forwardStream(target: AssistantMessageEventStream, source: AsyncIterable<AssistantMessageEvent>): void {
	(async () => {
		for await (const event of source) {
			target.push(event);
		}
		target.end();
	})();
}

function createLazyLoadErrorMessage<TApi extends Api>(model: Model<TApi>, error: unknown): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "error",
		errorMessage: error instanceof Error ? error.message : String(error),
		timestamp: Date.now(),
	};
}

function createLazyStream<TApi extends Api, TOptions extends StreamOptions, TSimpleOptions extends SimpleStreamOptions>(
	loadModule: () => Promise<LazyProviderModule<TApi, TOptions, TSimpleOptions>>,
): StreamFunction<TApi, TOptions> {
	return (model, context, options) => {
		const outer = new AssistantMessageEventStream();

		loadModule()
			.then((module) => {
				const inner = module.stream(model, context, options);
				forwardStream(outer, inner);
			})
			.catch((error) => {
				const message = createLazyLoadErrorMessage(model, error);
				outer.push({ type: "error", reason: "error", error: message });
				outer.end(message);
			});

		return outer;
	};
}

function createLazySimpleStream<
	TApi extends Api,
	TOptions extends StreamOptions,
	TSimpleOptions extends SimpleStreamOptions,
>(loadModule: () => Promise<LazyProviderModule<TApi, TOptions, TSimpleOptions>>): StreamFunction<TApi, TSimpleOptions> {
	return (model, context, options) => {
		const outer = new AssistantMessageEventStream();

		loadModule()
			.then((module) => {
				const inner = module.streamSimple(model, context, options);
				forwardStream(outer, inner);
			})
			.catch((error) => {
				const message = createLazyLoadErrorMessage(model, error);
				outer.push({ type: "error", reason: "error", error: message });
				outer.end(message);
			});

		return outer;
	};
}

function loadAnthropicProviderModule(): Promise<
	LazyProviderModule<"anthropic-messages", AnthropicOptions, SimpleStreamOptions>
> {
	anthropicProviderModulePromise ||= import("./anthropic").then((module) => {
		const provider = module as AnthropicProviderModule;
		return {
			stream: provider.streamAnthropic,
			streamSimple: provider.streamSimpleAnthropic,
		};
	});
	return anthropicProviderModulePromise;
}

function loadGoogleProviderModule(): Promise<
	LazyProviderModule<"google-generative-ai", GoogleOptions, SimpleStreamOptions>
> {
	googleProviderModulePromise ||= import("./google").then((module) => {
		const provider = module as GoogleProviderModule;
		return {
			stream: provider.streamGoogle,
			streamSimple: provider.streamSimpleGoogle,
		};
	});
	return googleProviderModulePromise;
}

function loadGoogleVertexProviderModule(): Promise<
	LazyProviderModule<"google-vertex", GoogleVertexOptions, SimpleStreamOptions>
> {
	googleVertexProviderModulePromise ||= import("./google-vertex").then((module) => {
		const provider = module as GoogleVertexProviderModule;
		return {
			stream: provider.streamGoogleVertex,
			streamSimple: provider.streamSimpleGoogleVertex,
		};
	});
	return googleVertexProviderModulePromise;
}

function loadMistralProviderModule(): Promise<
	LazyProviderModule<"mistral-conversations", MistralOptions, SimpleStreamOptions>
> {
	mistralProviderModulePromise ||= import("./mistral").then((module) => {
		const provider = module as MistralProviderModule;
		return {
			stream: provider.streamMistral,
			streamSimple: provider.streamSimpleMistral,
		};
	});
	return mistralProviderModulePromise;
}

function loadOpenAICompletionsProviderModule(): Promise<
	LazyProviderModule<"openai-completions", OpenAICompletionsOptions, SimpleStreamOptions>
> {
	openAICompletionsProviderModulePromise ||= import("./openai-completions").then((module) => {
		const provider = module as OpenAICompletionsProviderModule;
		return {
			stream: provider.streamOpenAICompletions,
			streamSimple: provider.streamSimpleOpenAICompletions,
		};
	});
	return openAICompletionsProviderModulePromise;
}

function loadOpenAIResponsesProviderModule(): Promise<
	LazyProviderModule<"openai-responses", OpenAIResponsesOptions, SimpleStreamOptions>
> {
	openAIResponsesProviderModulePromise ||= import("./openai-responses").then((module) => {
		const provider = module as OpenAIResponsesProviderModule;
		return {
			stream: provider.streamOpenAIResponses,
			streamSimple: provider.streamSimpleOpenAIResponses,
		};
	});
	return openAIResponsesProviderModulePromise;
}

export const streamAnthropic = createLazyStream(loadAnthropicProviderModule);
export const streamSimpleAnthropic = createLazySimpleStream(loadAnthropicProviderModule);
export const streamGoogle = createLazyStream(loadGoogleProviderModule);
export const streamSimpleGoogle = createLazySimpleStream(loadGoogleProviderModule);
export const streamGoogleVertex = createLazyStream(loadGoogleVertexProviderModule);
export const streamSimpleGoogleVertex = createLazySimpleStream(loadGoogleVertexProviderModule);
export const streamMistral = createLazyStream(loadMistralProviderModule);
export const streamSimpleMistral = createLazySimpleStream(loadMistralProviderModule);
export const streamOpenAICompletions = createLazyStream(loadOpenAICompletionsProviderModule);
export const streamSimpleOpenAICompletions = createLazySimpleStream(loadOpenAICompletionsProviderModule);
export const streamOpenAIResponses = createLazyStream(loadOpenAIResponsesProviderModule);
export const streamSimpleOpenAIResponses = createLazySimpleStream(loadOpenAIResponsesProviderModule);

export function registerBuiltInApiProviders(): void {
	registerApiProvider({
		api: "anthropic-messages",
		stream: streamAnthropic,
		streamSimple: streamSimpleAnthropic,
	});

	registerApiProvider({
		api: "openai-completions",
		stream: streamOpenAICompletions,
		streamSimple: streamSimpleOpenAICompletions,
	});

	registerApiProvider({
		api: "mistral-conversations",
		stream: streamMistral,
		streamSimple: streamSimpleMistral,
	});

	registerApiProvider({
		api: "openai-responses",
		stream: streamOpenAIResponses,
		streamSimple: streamSimpleOpenAIResponses,
	});

	registerApiProvider({
		api: "google-generative-ai",
		stream: streamGoogle,
		streamSimple: streamSimpleGoogle,
	});

	registerApiProvider({
		api: "google-vertex",
		stream: streamGoogleVertex,
		streamSimple: streamSimpleGoogleVertex,
	});
}

export function resetApiProviders(): void {
	clearApiProviders();
	registerBuiltInApiProviders();
}

registerBuiltInApiProviders();
