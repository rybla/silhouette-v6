import { BasicDesignerAgentImpl, Init } from "@/core/agents/DesignerAgentV1";
import { OllamaProvider } from "@/core/OllamaProvider";
import { TialwfAgent } from "@/core/TialwfAgent";
import { switchEnum } from "@/utilities";
import { Agent } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { choice, object, option } from "@optique/core";
import { path, run } from "@optique/run";
import dotenv from "dotenv";
import fs from "fs";
import Schema from "typebox/schema";

const cliParser = object({
  model: option("--model", choice([
    "gemini-3.5-flash",
    "deepseek-v4",
    "gemma-4"
  ])),
  state: option(
    "--state",
    path({ extensions: [".json"], mustExist: false, allowCreate: true })
  ),
  init: option("--init", path({ extensions: [".json"], mustExist: true })),
});

async function main() {
  dotenv.config();

  const cliArgs = run(cliParser, { help: "both" });

  const init = Schema.Compile(Init).Parse(
    JSON.parse(fs.readFileSync(cliArgs.init, { encoding: "utf-8" }))
  );

  const impl = new BasicDesignerAgentImpl({
    init,
    stateFilepath: cliArgs.state,
  });

  const models = builtinModels();

  models.setProvider(new OllamaProvider());

  const agent = new TialwfAgent({
    agent: new Agent({
      initialState: {
        model: switchEnum(cliArgs.model, {
          "gemini-3.5-flash": () => models.getModel("google", "gemini-flash-latest"),
          "deepseek-v4": () => models.getModel("openrouter", "deepseek/deepseek-v4-flash"),
          "gemma-4": () => models.getModel("ollama", "gemma4:26b-mlx")
        })
      },
      getApiKey: (provider) => {
        switch (provider) {
          case "google":
            return process.env["GOOGLE_API_KEY"]!;
          case "openrouter":
            return process.env["OPENROUTER_API_KEY"]!;
          case "ollama":
            return "ollama-ambient-key";
          default:
            throw new Error(`No API key for provider: ${provider}`);
        }
      },
    }),
    impl,
  });

  await agent.run(
    init.initialPrompt !== undefined
      ? init.initialPrompt
      : "Using the tools available to you, design a third-person choose-your-own adventure game based on the given scene descriptions."
  );
}

await main();
