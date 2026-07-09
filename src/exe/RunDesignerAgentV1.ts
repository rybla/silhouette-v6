import { BasicDesignerAgentImpl, Init } from "@/core/agents/DesignerAgentV1";
import { TialwfAgent } from "@/core/TialwfAgent";
import { Agent } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { object, option } from "@optique/core";
import { path, run } from "@optique/run";
import dotenv from "dotenv";
import fs from "fs";
import Schema from "typebox/schema";

const cliParser = object({
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

  // models.setProvider(new OllamaProvider());

  const agent = new TialwfAgent({
    agent: new Agent({
      initialState: {
        // model: models.getModel("google", "gemini-flash-latest"),
        model: models.getModel("ollama", "gemma4"),
        // model: models.getModel("openrouter", "deepseek/deepseek-v4-flash"),
      },
      getApiKey: (provider) => {
        switch (provider) {
          case "google":
            return process.env["GOOGLE_API_KEY"]!;
          case "openrouter":
            return process.env["OPENROUTER_API_KEY"]!;
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
