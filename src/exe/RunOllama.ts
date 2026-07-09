import { OllamaProvider } from "@/core/OllamaProvider";
import { Agent } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();

models.setProvider(new OllamaProvider());

const agent = new Agent({
  initialState: {
    model: models.getModel("ollama", "gemma4:26b-mlx"),
  },
  getApiKey: (provider) => {
    switch (provider) {
      case "ollama":
        return "ollama-ambient-key";
      default:
        throw new Error(`No API key for provider: ${provider}`);
    }
  },
});

agent.subscribe((event) => {
  console.log(JSON.stringify(event, null, 4));
});

await agent.prompt("Hello!");
