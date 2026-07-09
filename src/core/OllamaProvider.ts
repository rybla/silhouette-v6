import type {
  Model,
  Provider
} from "@earendil-works/pi-ai";

export type OllamaApiType = "openai-completions";

export class OllamaProvider implements Provider<OllamaApiType> {
  readonly id = "ollama";
  readonly name = "ollama";
  readonly baseUrl = "http://127.0.0.1:11434";
  readonly auth = {
    apiKey: {
      name: "ollama",
      resolve: async () => ({
        auth: {
          apiKey: "ollama-ambient-token",
        },
      }),
    },
  };
  readonly provider = "ollama";
  readonly completions: OllamaApiType = "openai-completions";

  getModels(): readonly Model<OllamaApiType>[] {
    return [
      {
        id: "gemma4:26b-mlx",
        name: "gemma4:26b-mlx",
        api: this.completions,
        provider: this.provider,
        baseUrl: this.baseUrl,
        reasoning: false,
        input: [],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        contextWindow: 131072,
        maxTokens: 131072 * 2,
      },
    ];
  }

  stream(model, context, options) {
    throw new Error("Function not implemented.");
  }

  streamSimple(model, context, options) {
    throw new Error("Function not implemented.");
  }
}
