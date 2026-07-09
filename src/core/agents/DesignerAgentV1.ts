import readline from "readline/promises";
import {
  Character,
  CharacterName,
  GameDefinition,
  GameDefinitionManager,
  Location,
  LocationName,
  NewScene,
  printCharacterName,
  printLocationName,
  printSceneId,
  SceneId,
} from "@/core/ontology";
import {
  makeAgentTool,
  type TialwfAgentConfig,
  type TialwfAgentImpl,
  type TialwfFeedback,
} from "@/core/TialwfAgent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";
import fs from "fs";
import { Type } from "typebox";
import Schema from "typebox/schema";
import { argument, choice, object, or } from "@optique/core";
import { run } from "@optique/run";

export type Init = Type.Static<typeof Init>;
export const Init = Type.Object({
  startDescription: Type.String(),
  storyInstructions: Type.Optional(Type.String()),
  initialPrompt: Type.Optional(Type.String()),
  thinkingLevel: Type.Optional(
    Type.Enum(["minimal", "low", "medium", "high", "xhigh"])
  ),
  minimumCheckpointsSpacing: Type.Optional(Type.Integer()),
  thresholdFrontierCheckpointsCount: Type.Optional(Type.Integer()),
  maximumDistanceFromCheckpoint: Type.Optional(Type.Integer()),
  minimumDistanceToFinalEnding: Type.Optional(Type.Integer()),
});

export type State = Type.Static<typeof StateSchema>;

export type StateSchema = typeof StateSchema;
export const StateSchema = Type.Object({
  gameDefinition: GameDefinition,
});

export class BasicDesignerAgentImpl implements TialwfAgentImpl<StateSchema> {
  name: string = "BasicDesignerAgentImplV1";
  thinkingLevel: ThinkingLevel;
  systemPrompt: string;

  stateSchema: StateSchema;
  initialState: State;
  state: State;
  gameDefinitionManager: GameDefinitionManager;
  stateFilepath: string;

  constructor(args: { init: Init; stateFilepath: string }) {
    this.stateSchema = StateSchema;
    this.thinkingLevel =
      args.init.thinkingLevel !== undefined
        ? args.init.thinkingLevel
        : "medium";
    this.systemPrompt = `
You are a professional game designer working on a new choose-your-own-adventure game. Design the game according to the user's instructions. You must continue developing the game until you meet all the user's requirements. Note that the game state has been initialized with some initial content (like scene stubs, locations, or characters). You must use your tools to inspect the current state first (e.g., using the tools "get_all_scene_stubs", "inspect_scenes", etc.) to discover and read the existing scene descriptions and current progress before developing further.

## Implementing Scenes

You can implement new scenes at existing scene stubs using the "implement_scene_stub" tool. When you create a new scene, you also define the choices available to the player at that scene. A choice can either target new scene stubs (in which case you must provide a description for the scene stub), or a choice can target an existing scene.

### Checkpoints and Story Expansion

The game uses a checkpoint system to force story development to be performed in batches:

- **Creating Frontier Checkpoints**: You can flag any new scene you implement as a frontier checkpoint by setting "isCheckpoint: true".
- **Spacing Requirements**: New checkpoints must be spaced out by at least "minimumCheckpointsSpacing" steps from any previous checkpoints.
- **Frontier Limit**: There can be at most "thresholdFrontierCheckpointsCount" many frontier checkpoints at a time (excluding final endings with no choices).
- **Distance Restrictions**: All new scenes can be at most "maximumDistanceFromCheckpoint" steps away from their nearest previous checkpoint along that story path. At these scenes, it's best to figure out how to connect them to existing scenes, or, to figure out how to make them proper endings (which have no choices from them).
- **Locking Choice Targets**: When a scene is created as a frontier checkpoint, any scene stubs immediately targeted by its choices are locked and *CANNOT* be implemented as full scenes.
- **Refreshing Checkpoints**: Once you have implemented all other scene stubs that are *NOT* immediately targeted by choices of a frontier checkpoint, the frontier checkpoints are automatically converted to "interior" checkpoints. This refreshes the checkpoint state, unlocks those choices, and allows you to continue expanding the story in the next batch.

Use the tool "list_scene_stubs" periodically to keep track of which scene stubs still need to be implemented for the current story expansion batch.

## The player themselves is *NOT* a character in the story

The player themselves is *NOT* a character in the story. All characters act as themselves independently from the player. The player just chooses how the story progresses at the end of each scene.

## Endings

Story endings are scenes that have 0 choices. There are two types of endings:

- **Final Endings**: These are scenes that are both endings (0 choices) and checkpoints ("isCheckpoint: true"). They can only appear further on in the story, at a distance of at least "minimumDistanceToFinalEnding" from the start scene.
- **Early Endings**: These are scenes that are endings (0 choices) but NOT checkpoints ("isCheckpoint: false"). They can appear earlier in the story.

To enforce sufficient story expansion, there are additional validation rules when creating endings or checkpoints:
- **Batched Endings**: A new ending scene can only be created if there are already "thresholdFrontierCheckpointsCount" many frontier checkpoints (or if this is a final ending checkpoint that brings the count to the threshold). This ensures that enough frontier checkpoints are created each batch.
- **Minimum Open Stubs**: Implementing a new scene must always keep the total number of open scene stubs (stubs not targeted by frontier checkpoints) and final endings at least "thresholdFrontierCheckpointsCount" minus the current number of frontier checkpoints. This ensures you always have enough open stubs (or final endings) to make enough new frontier checkpoints to reach the threshold count.
- **Frontier Checkpoints Near Start**: When a new frontier checkpoint is attempted to be created, if it is less than "minimumDistanceToFinalEnding" steps from the start scene, it must have at least 1 choice with "create-new-scene-stub" to ensure the branch can be continued.

${
  args.init.storyInstructions === undefined
    ? ""
    : `
## Instructions for this specific story

${args.init.storyInstructions}
`.trim()
}
`.trim();
    this.initialState = {
      gameDefinition: {
        story: {
          start: "start",
          scenes: {
            start: {
              type: "stub",
              scene: {
                id: "start",
                description: args.init.startDescription,
              },
            },
          },
          locations: {},
          characters: {},
        },
        minimumCheckpointsSpacing:
          args.init.minimumCheckpointsSpacing !== undefined
            ? args.init.minimumCheckpointsSpacing
            : 2,
        thresholdFrontierCheckpointsCount:
          args.init.thresholdFrontierCheckpointsCount !== undefined
            ? args.init.thresholdFrontierCheckpointsCount
            : 3,
        maximumDistanceFromCheckpoint:
          args.init.maximumDistanceFromCheckpoint !== undefined
            ? args.init.maximumDistanceFromCheckpoint
            : 2,
        minimumDistanceToFinalEnding:
          args.init.minimumDistanceToFinalEnding !== undefined
            ? args.init.minimumDistanceToFinalEnding
            : 6,
      },
    };
    this.stateFilepath = args.stateFilepath;

    // --------------------------------

    if (!fs.existsSync(this.stateFilepath)) {
      fs.writeFileSync(
        this.stateFilepath,
        JSON.stringify(this.initialState, null, 4),
        {
          encoding: "utf-8",
        }
      );
    }
    this.state = Schema.Compile(this.stateSchema).Parse(
      JSON.parse(fs.readFileSync(this.stateFilepath, { encoding: "utf-8" }))
    );
    this.gameDefinitionManager = new GameDefinitionManager(
      this.state.gameDefinition
    );
  }

  async config(): Promise<TialwfAgentConfig> {
    return {
      systemPrompt: this.systemPrompt,
      thinkingLevel: this.thinkingLevel,
      tools: [
        makeAgentTool({
          name: "list_characters",
          description: "List all character names.",
          parameters: Type.Object({}),
          execute: async () => {
            const characters = Object.keys(
              this.gameDefinitionManager.gameDefinition.story.characters
            );
            if (characters.length === 0) {
              return {
                text: "There are no characters in the story.",
              };
            }
            return {
              text: `Characters:\n\n${characters.map((name) => `- ${printCharacterName(name)}`).join("\n")}`,
            };
          },
        }),
        makeAgentTool({
          name: "list_locations",
          description: "List all location names.",
          parameters: Type.Object({}),
          execute: async () => {
            const locations = Object.keys(
              this.gameDefinitionManager.gameDefinition.story.locations
            );
            if (locations.length === 0) {
              return {
                text: "There are no locations in the story.",
              };
            }
            return {
              text: `Locations:\n\n${locations.map((name) => `- ${printLocationName(name)}`).join("\n")}`,
            };
          },
        }),
        makeAgentTool({
          name: "list_scenes",
          description: "List all scene IDs.",
          parameters: Type.Object({}),
          execute: async () => {
            const scenes = Object.keys(
              this.gameDefinitionManager.gameDefinition.story.scenes
            );
            if (scenes.length === 0) {
              return {
                text: "There are no scenes in the story.",
              };
            }
            const start = this.gameDefinitionManager.gameDefinition.story.start;
            const scenesList = scenes
              .map((id) => {
                const entry = this.gameDefinitionManager.getSceneEntry(id);
                const suffix =
                  entry.type === "impl" && entry.scene.checkpoint === "frontier"
                    ? " (frontier checkpoint)"
                    : "";
                return `- ${printSceneId(id)}${suffix}`;
              })
              .join("\n");
            return {
              text: `Scenes (start scene: ${printSceneId(start)}):\n\n${scenesList}`,
            };
          },
        }),
        makeAgentTool({
          name: "inspect_characters",
          description: "Inspect details of the specified characters.",
          parameters: Type.Object({
            characters: Type.Array(CharacterName),
          }),
          execute: async (args) => {
            return {
              text: args.characters
                .map((name) => this.gameDefinitionManager.printCharacter(name))
                .join("\n\n"),
            };
          },
        }),
        makeAgentTool({
          name: "inspect_locations",
          description: "Inspect details the specified location.",
          parameters: Type.Object({
            locations: Type.Array(LocationName),
          }),
          execute: async (args) => {
            return {
              text: args.locations
                .map((name) => this.gameDefinitionManager.printLocation(name))
                .join("\n\n"),
            };
          },
        }),
        makeAgentTool({
          name: "inspect_scenes",
          description: "Inspect details of the specified scenes.",
          parameters: Type.Object({
            scenes: Type.Array(SceneId),
          }),
          execute: async (args) => {
            return {
              text: args.scenes
                .map((id) => this.gameDefinitionManager.printSceneEntry(id))
                .join("\n\n"),
            };
          },
        }),
        makeAgentTool({
          name: "implement_scene_stub",
          description:
            "Implement an existing scene stub by replacing it with a full scene.",
          parameters: NewScene,
          execute: async (input) => {
            const newScene = input;
            const result = this.gameDefinitionManager.addNewScene(newScene);
            let text = `Successfully implemented the scene stub ${printSceneId(newScene.id)} as a full scene.`;

            const newSceneStubs = newScene.choices.flatMap((c) =>
              c.targetSceneMode === "create-new-scene-stub"
                ? [printSceneId(c.targetScene)]
                : []
            );
            if (newSceneStubs.length > 0) {
              text += ` The new scene implementation had choices that created the following scene stubs: ${newSceneStubs.join(", ")}.`;
            }

            if (result.refreshedCheckpoints) {
              text += ` Since enough new checkpoints have been created and all other loose endings have been handled, the checkpoints have been refreshed. You can now use "implement_scene_stub" at any scene stub, and you may create ${this.gameDefinitionManager.gameDefinition.thresholdFrontierCheckpointsCount} more new checkpoints.`;
            }

            const rawNewSceneStubs = newScene.choices.flatMap((c) =>
              c.targetSceneMode === "create-new-scene-stub"
                ? [c.targetScene]
                : []
            );

            const hasStubAtMaxDistance = rawNewSceneStubs.some(
              (stubId) =>
                this.gameDefinitionManager.getShortestDistanceFromCheckpoint(
                  stubId
                ) ===
                this.gameDefinitionManager.gameDefinition
                  .maximumDistanceFromCheckpoint
            );

            if (hasStubAtMaxDistance) {
              text += ` Warning: Each of those new scene stubs must either (1) be checkpoints, (2) be endings, or (3) target only existing scenes.`;
            }

            if (newScene.isCheckpoint && !result.refreshedCheckpoints) {
              text += ` Warning: Any new scene stubs just created are locked until all other non-locked scene stubs are implemented.`;
            }

            return {
              text,
            };
          },
        }),
        makeAgentTool({
          name: "create_character",
          description: "Create a new character.",
          parameters: Character,
          execute: async (input) => {
            const newCharacter = input;
            this.gameDefinitionManager.addNewCharacter(newCharacter);
            return {
              text: `Successfully created new character ${printCharacterName(newCharacter.name)}.`,
            };
          },
        }),
        makeAgentTool({
          name: "create_location",
          description: "Create a new location.",
          parameters: Location,
          execute: async (input) => {
            const newLocation = input;
            this.gameDefinitionManager.addNewLocation(newLocation);
            return {
              text: `Successfully created new location ${printLocationName(newLocation.name)}.`,
            };
          },
        }),
        makeAgentTool({
          name: "list_scene_stubs",
          description:
            "List all scene stubs, which have been sketched out but not yet implemented.",
          parameters: Type.Object({}),
          execute: async () => {
            const stubs = Array.from(
              this.gameDefinitionManager.getSceneStubs()
            );

            if (stubs.length === 0) {
              return {
                text: "There are no scene stubs.",
              };
            }

            const lockedStubs = stubs.filter((id) =>
              this.gameDefinitionManager.isTargetOfFrontierCheckpoint(id)
            );

            const openStubs = stubs.filter((id) => !lockedStubs.includes(id));

            const threshold =
              this.gameDefinitionManager.gameDefinition
                .thresholdFrontierCheckpointsCount;
            const current =
              this.gameDefinitionManager.getFrontierCheckpointScenes().size;
            const needed = Math.max(0, threshold - current);

            const getStubDetails = (id: string): string => {
              const distCheckpoint =
                this.gameDefinitionManager.getShortestDistanceFromCheckpoint(
                  id
                );
              const spacing =
                this.gameDefinitionManager.gameDefinition
                  .minimumCheckpointsSpacing;
              const isFarEnough = distCheckpoint >= spacing;

              const distStart =
                this.gameDefinitionManager.getShortestDistanceFromStart(id);
              const minEnding =
                this.gameDefinitionManager.gameDefinition
                  .minimumDistanceToFinalEnding;

              const unmetEndingReqs: string[] = [];
              if (distStart < minEnding) {
                unmetEndingReqs.push(
                  `must be at least ${minEnding} steps from start (currently ${distStart})`
                );
              }

              if (distCheckpoint < spacing) {
                unmetEndingReqs.push(
                  `must be at least ${spacing} steps from nearest previous checkpoint (currently ${distCheckpoint})`
                );
              }

              const checkpointStatus = isFarEnough
                ? `Ready to be a checkpoint (distance from previous checkpoint: ${distCheckpoint} >= ${spacing})`
                : `Too close to be a checkpoint (distance from previous checkpoint: ${distCheckpoint} < ${spacing})`;

              const endingStatus =
                unmetEndingReqs.length === 0
                  ? `Ready to be implemented as a final ending`
                  : `Cannot be implemented as a final ending yet (${unmetEndingReqs.join(", ")})`;

              return [
                `- **${printSceneId(id)}**`,
                `  - *Checkpoint eligibility*: ${checkpointStatus}`,
                `  - *Final ending eligibility*: ${endingStatus}`,
              ].join("\n");
            };

            const lockedStubsList =
              lockedStubs.length === 0
                ? "There are no locked scene stubs."
                : lockedStubs.map(getStubDetails).join("\n");

            const openStubsList =
              openStubs.length === 0
                ? "There are no open stubs."
                : openStubs.map(getStubDetails).join("\n");

            return {
              text: `
## Frontier Checkpoints Progress

- Current Frontier Checkpoints Count: ${current}
- Threshold Frontier Checkpoints Count: ${threshold}
- Frontier Checkpoints needed to reach threshold: ${needed}

## Open Scene Stubs

These scene stubs are *open*, meaning that they are ready to be implemented using "implement_scene_stub".

${openStubsList}

## Locked Scene Stubs

These scene stubs are *locked*, meaning that they *cannot* be implemented until all open stubs are implemented and enough new checkpoints have been created.

${lockedStubsList}
`.trim(),
            };
          },
        }),
        makeAgentTool({
          name: "inspect_scene_context",
          description:
            "Get the surrounding context of the specified scene in the story.",
          parameters: Type.Object({
            id: SceneId,
          }),
          execute: async (input) => {
            try {
              const context = this.gameDefinitionManager.printStoryUpToScene(
                input.id
              );
              return {
                text: context,
              };
            } catch (error) {
              if (error instanceof Error) {
                return {
                  text: `Error getting context for scene ${printSceneId(input.id)}: ${error.message}`,
                };
              }
              throw error;
            }
          },
        }),
      ],
    };
  }

  async feedback(): Promise<TialwfFeedback> {
    if (false) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        while (true) {
          const input = (await rl.question("Feedback: ")).trim();

          if (input.startsWith("/")) {
            const command = input.substring(1);
            const feedbackCommandParser = or(
              object({
                name: argument(choice(["quit", "exit", "stop"])),
              })
            );
            const args = run(feedbackCommandParser, {
              args: command.split(" "),
              help: "command",
            });

            switch (args.name) {
              case "exit":
              case "quit":
              case "stop":
                console.log("Stopping agent ...");
                return { done: true };

              default:
                console.log(`Unimplemented command: ${args.name as string}`);
                continue;
            }
          } else {
            const prompt = input;
            console.log("Submitting feedback ...");
            return {
              done: false,
              prompt,
            };
          }
        }
      } finally {
        rl.close();
      }
    } else {
      const stubs = this.gameDefinitionManager.getSceneStubs();
      if (stubs.size == 0) {
        return {
          done: true,
        };
      }

      return {
        done: false,
        prompt: `There are still some scene stubs that need to be implemented: ${Array.from(
          stubs
        )
          .map((stub) => printSceneId(stub))
          .join(", ")}\n\nContinue flushing out the story.`,
      };
    }
  }
}
