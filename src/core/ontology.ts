import { slugify, switchDiscriminatedUnion } from "@/utilities";
import {
  Data64URIWriter,
  TextWriter,
  ZipReader,
  type ReadableReader,
} from "@zip.js/zip.js";
import Type from "typebox";
import Schema from "typebox/schema";

// --------------------------------
// core types
// --------------------------------

export type MarkdownText = string;
export const MarkdownText = (options?: { description?: string }) =>
  Type.String({
    description: `${options?.description === undefined ? "" : `${options.description} `}Content is in Markdown format.`,
  });

export type LocationName = Type.Static<typeof LocationName>;
export const LocationName = Type.String({
  description: "The name of a location.",
});

export type CharacterName = Type.Static<typeof CharacterName>;
export const CharacterName = Type.String({
  description: "The name of a character",
});

export type SceneId = Type.Static<typeof SceneId>;
export const SceneId = Type.String({ description: "The ID of a scene." });

export type ChoiceLabel = Type.Static<typeof ChoiceLabel>;
export const ChoiceLabel = MarkdownText({
  description: "One-sentence label for this choice.",
});

export function printLocationName(name: LocationName): string {
  return `"${name}"`;
}

export function printCharacterName(name: CharacterName): string {
  return `"${name}"`;
}

export function printSceneId(id: SceneId): string {
  return `"${id}"`;
}

export function printChoiceLabel(label: ChoiceLabel): string {
  return `"${label}"`;
}

// --------------------------------
// effects
// --------------------------------

export type InstantLocationEffect = Type.Static<typeof InstantLocationEffect>;
export const InstantLocationEffect = Type.Enum(["shake"]);

export type PassiveLocationEffect = Type.Static<typeof PassiveLocationEffect>;
export const PassiveLocationEffect = Type.Enum([
  "dark",
  "sunny",
  "snow",
  "rain",
  "wind",
  "shake",
]);

export type InstantCharacterEffect = Type.Static<typeof InstantCharacterEffect>;
export const InstantCharacterEffect = Type.Enum([
  "shake",
  "spin",
  "float",
  "jump",
  "fall",
  "run",
  "walk",
  "happy",
  "sad",
  "angry",
  "shy",
]);

export type PassiveCharacterEffect = Type.Static<typeof PassiveCharacterEffect>;
export const PassiveCharacterEffect = Type.Enum(["float", "spin", "shake"]);

// --------------------------------
// scripts
// --------------------------------

export type ScriptPart = Type.Static<typeof ScriptPart>;
export const ScriptPart = Type.Union([
  Type.Object({
    type: Type.Literal("narration"),
    content: MarkdownText({
      description:
        "A narrative passage written in the third-person point of view.",
    }),
    instantLocationEffects: Type.Array(InstantLocationEffect, {
      description:
        "An array of effects that apply to the location at the beginning of the scene.",
    }),
    instantCharacterEffects: Type.Array(
      Type.Object({
        character: CharacterName,
        effect: InstantCharacterEffect,
      }),
      {
        description:
          "An array of effects that apply to characters at the beginning of the scene.",
      }
    ),
  }),
  Type.Object({
    type: Type.Literal("dialogue"),
    character: CharacterName,
    content: MarkdownText({
      description:
        "A passage of dialogue written in the first person point of view from the perspective of the speaking character.",
    }),
    instantLocationEffects: Type.Array(InstantLocationEffect, {
      description:
        "An array of effects that apply to the location at the beginning of the scene.",
    }),
    instantCharacterEffects: Type.Array(
      Type.Object({
        character: CharacterName,
        effect: InstantCharacterEffect,
      }),
      {
        description:
          "An array of effects that apply to characters at the beginning of the scene.",
      }
    ),
  }),
  Type.Object({
    type: Type.Literal("internal_dialogue"),
    character: CharacterName,
    content: MarkdownText({
      description:
        "A passage of inner thoughts written in the first person point of view from the perspective of the character thinking it.",
    }),
    instantLocationEffects: Type.Array(InstantLocationEffect, {
      description:
        "An array of effects that apply to the location at the beginning of the scene.",
    }),
    instantCharacterEffects: Type.Array(
      Type.Object({
        character: CharacterName,
        effect: InstantCharacterEffect,
      }),
      {
        description:
          "An array of effects that apply to characters at the beginning of the scene.",
      }
    ),
  }),
]);

export type Script = Type.Static<typeof Script>;

export const Script = Type.Array(ScriptPart);

// --------------------------------
// choice
// --------------------------------

export type Choice = Type.Static<typeof Choice>;
export const Choice = Type.Object({
  description: MarkdownText({
    description: "One-paragraph description of this choice.",
  }),
  label: MarkdownText({
    description: "One-sentence label for this choice.",
  }),
  targetScene: SceneId,
});

export type NewChoice = Type.Static<typeof NewChoice>;
export const NewChoice = Type.Union([
  Type.Object({
    description: MarkdownText({
      description: "One-paragraph description of this choice.",
    }),
    label: MarkdownText({
      description: "One-sentence label for this choice.",
    }),
    targetSceneMode: Type.Enum(["create-new-scene-stub"]),
    targetScene: SceneId,
    targetSceneDescription: MarkdownText({
      description:
        "A high-level one-paragraph description of what will happen in the new scene.",
    }),
  }),
  Type.Object({
    description: MarkdownText({
      description: "One-paragraph description of this choice.",
    }),
    label: MarkdownText({
      description: "One-sentence label for this choice.",
    }),
    targetSceneMode: Type.Enum(["reference-existing-scene"]),
    targetScene: SceneId,
  }),
]);

// --------------------------------
// checkpoint
// --------------------------------

export const CheckpointStatus = Type.Enum(["frontier", "interior"]);

// --------------------------------
// scene
// --------------------------------

export type Scene = Type.Static<typeof Scene>;
export const Scene = Type.Object({
  id: SceneId,
  location: LocationName,
  passiveLocationEffects: Type.Array(PassiveLocationEffect),
  passiveCharacterEffects: Type.Array(
    Type.Object({
      character: CharacterName,
      effect: PassiveCharacterEffect,
    })
  ),
  script: Script,
  choices: Type.Array(Choice),
  isCheckpoint: Type.Boolean({
    description: "Flags whether or not this scene is a checkpoint",
    default: false,
  }),
  checkpoint: Type.Optional(CheckpointStatus),
});

export type NewScene = Type.Static<typeof NewScene>;
export const NewScene = Type.Object({
  id: SceneId,
  location: LocationName,
  passiveLocationEffects: Type.Array(PassiveLocationEffect),
  passiveCharacterEffects: Type.Array(
    Type.Object({
      character: CharacterName,
      effect: PassiveCharacterEffect,
    })
  ),
  script: Script,
  choices: Type.Array(NewChoice),
  isCheckpoint: Type.Boolean({
    description: "Flags whether or not this scene is a checkpoint",
    default: false,
  }),
});

export type SceneStub = Type.Static<typeof SceneStub>;
export const SceneStub = Type.Object({
  id: SceneId,
  description: Type.String(),
});

export type SceneEntry = Type.Static<typeof SceneEntry>;
export const SceneEntry = Type.Union([
  Type.Object({
    type: Type.Literal("stub"),
    scene: SceneStub,
  }),
  Type.Object({
    type: Type.Literal("impl"),
    scene: Scene,
  }),
]);

// --------------------------------
// location
// --------------------------------

export type Location = Type.Static<typeof Location>;
export const Location = Type.Object({
  name: LocationName,
  vignette: MarkdownText({
    description:
      "A one-paragraph vignette introducing the essential characteristics of this location.",
  }),
  appearanceDescription: MarkdownText({
    description:
      "A visual description of the location's appearance only described the location itself.",
  }),
  backstoryDescription: MarkdownText({
    description: "A one-paragraph description of the location's backstory.",
  }),
});

// --------------------------------
// character
// --------------------------------

export type Character = Type.Static<typeof Character>;
export const Character = Type.Object({
  name: CharacterName,
  vignette: MarkdownText({
    description:
      "A one-paragraph vignette introducing the essential characteristics of this character.",
  }),
  appearanceDescription: MarkdownText({
    description:
      "A visual description of the character's appearance. Only describe the character themselves.",
  }),
  backstoryDescription: MarkdownText({
    description: "A one-paragraph description of the character's backstory.",
  }),
});

// --------------------------------
// story
// --------------------------------

export type Story = Type.Static<typeof Story>;
export const Story = Type.Object({
  start: SceneId,
  scenes: Type.Record(SceneId, SceneEntry),
  locations: Type.Record(LocationName, Location),
  characters: Type.Record(CharacterName, Character),
});

// --------------------------------
// GameDefinition
// --------------------------------

export type GameDefinition = Type.Static<typeof GameDefinition>;
export const GameDefinition = Type.Object({
  story: Story,
  minimumCheckpointsSpacing: Type.Integer({
    description: "The minimum distance between checkpoints",
  }),
  thresholdFrontierCheckpointsCount: Type.Integer({
    description:
      "When the number of checkpoints reaches this threshold then no more new checkpoints can be created.",
  }),
  maximumDistanceFromCheckpoint: Type.Integer({
    description:
      "The maximum distance that a branch can stem from a checkpoint.",
  }),
  minimumDistanceToFinalEnding: Type.Integer({
    description: "The minimum distance from the start scene to a final ending.",
  }),
});

export type GameState = Type.Static<typeof GameState>;
export const GameState = Type.Object({
  currentScene: SceneId,
  history: Type.Array(
    Type.Object({
      scene: SceneId,
      choice: ChoiceLabel,
    })
  ),
});

// --------------------------------
// views of objects
// --------------------------------

export function getCharactersInScene(scene: Scene): Set<CharacterName> {
  return scene.script.reduce((charNames, part) => {
    switchDiscriminatedUnion("type", part, {
      dialogue: (part) => charNames.add(part.character),
      internal_dialogue: (part) => charNames.add(part.character),
      narration: () => {},
    });
    return charNames;
  }, new Set<CharacterName>());
}

// --------------------------------
// GameDefinitionManager
// --------------------------------

export class GameDefinitionManager {
  gameDefinition: GameDefinition;

  constructor(gameDefinition: GameDefinition) {
    this.gameDefinition = gameDefinition;
  }

  // --------------------------------
  // get objects
  // --------------------------------

  getCharacter(name: CharacterName): Character {
    const character = this.gameDefinition.story.characters[name];
    if (character === undefined) {
      throw new OntologyError(`Unknown character: ${name}`);
    }
    return character;
  }

  getLocation(name: LocationName): Location {
    const location = this.gameDefinition.story.locations[name];
    if (location === undefined) {
      throw new OntologyError(`Unknown location: ${name}`);
    }
    return location;
  }

  getSceneEntry(id: SceneId): SceneEntry {
    const scene = this.gameDefinition.story.scenes[id];
    if (scene === undefined) {
      throw new OntologyError(`Unknown scene: ${id}`);
    }
    return scene;
  }

  /**
   * Gets an array that for each choice that targets scene with the specified
   * ID, has the ID of the scene with that choice and the choice's label.
   */
  getIncomingChoices(id: SceneId): { sceneId: SceneId; label: ChoiceLabel }[] {
    const incoming: { sceneId: SceneId; label: ChoiceLabel }[] = [];
    for (const [, entry] of Object.entries(this.gameDefinition.story.scenes)) {
      if (entry.type === "impl") {
        for (const choice of entry.scene.choices) {
          if (choice.targetScene === id) {
            incoming.push({ sceneId: entry.scene.id, label: choice.label });
          }
        }
      }
    }
    return incoming;
  }

  /**
   * Gets an array that for each choice at a scene with the specified ID, has
   * the ID of the scene that choice is targeting and the choice's label.
   */
  getOutgoingChoices(id: SceneId): { sceneId: SceneId; label: ChoiceLabel }[] {
    const entry = this.getSceneEntry(id);
    if (entry.type !== "impl") {
      return [];
    }
    return entry.scene.choices.map((choice) => ({
      sceneId: choice.targetScene,
      label: choice.label,
    }));
  }

  /**
   * Gets am array of the IDs of all the characters that appear in a scene.
   */
  getCharactersInScene(id: SceneId): Set<CharacterName> {
    const sceneEntry = this.getSceneEntry(id);
    if (sceneEntry.type !== "impl") return new Set<CharacterName>();
    return getCharactersInScene(sceneEntry.scene);
  }

  /**
   * Get all the orphan scenes in the story, which are scenes that have 0
   * incoming choices.
   */
  getOrphanScenes(): Set<SceneId> {
    const hasIncoming = new Set<SceneId>();
    for (const entry of Object.values(this.gameDefinition.story.scenes)) {
      if (entry.type === "impl") {
        for (const choice of entry.scene.choices) {
          hasIncoming.add(choice.targetScene);
        }
      }
    }

    const orphans = new Set<SceneId>();
    for (const id of Object.keys(this.gameDefinition.story.scenes)) {
      if (!hasIncoming.has(id)) {
        orphans.add(id);
      }
    }
    return orphans;
  }

  /**
   * Get all the scene stubs in the story.
   */
  getSceneStubs(): Set<SceneId> {
    const stubs = new Set<SceneId>();
    for (const [id, entry] of Object.entries(
      this.gameDefinition.story.scenes
    )) {
      if (entry.type === "stub") {
        stubs.add(id);
      }
    }
    return stubs;
  }

  // --------------------------------
  // validate objects
  // --------------------------------

  static validateGameDefinition(gameDefinition: GameDefinition) {
    const startId = gameDefinition.story.start;
    const initialEntry = gameDefinition.story.scenes[startId];
    if (initialEntry === undefined) {
      throw new OntologyError(`Start scene "${startId}" not found in story.`);
    }
    if (initialEntry.type === "impl") {
      if (
        !initialEntry.scene.isCheckpoint &&
        initialEntry.scene.checkpoint !== "frontier" &&
        initialEntry.scene.checkpoint !== "interior"
      ) {
        throw new OntologyError(
          `The start scene "${startId}" must be flagged as a checkpoint.`
        );
      }
    }
    if (
      gameDefinition.minimumCheckpointsSpacing >
      gameDefinition.maximumDistanceFromCheckpoint
    ) {
      throw new OntologyError(
        `Invalid game definition: minimumCheckpointsSpacing (${gameDefinition.minimumCheckpointsSpacing}) cannot be greater than maximumDistanceFromCheckpoint (${gameDefinition.maximumDistanceFromCheckpoint}).`
      );
    }
  }

  validateNewScene(newScene: NewScene) {
    const errors: OntologyError[] = [];

    const accumulateErrors = (k: () => void): void => {
      try {
        k();
      } catch (error) {
        if (error instanceof OntologyError) {
          errors.push(error);
        } else {
          throw error;
        }
      }
    };

    const entry = this.gameDefinition.story.scenes[newScene.id];
    if (entry === undefined) {
      throw new OntologyError(`Scene stub not found for ID: ${newScene.id}`);
    }
    if (entry.type !== "stub") {
      throw new OntologyError(
        `Scene with ID ${newScene.id} is already implemented.`
      );
    }

    accumulateErrors(() => {
      this.validateLocationName(newScene.location);
    });

    for (const effect of newScene.passiveLocationEffects) {
      accumulateErrors(() => {
        this.validatePassiveLocationEffect(effect);
      });
    }

    for (const {
      character: charName,
      effect,
    } of newScene.passiveCharacterEffects) {
      accumulateErrors(() => {
        this.validateCharacterName(charName);
        this.validatePassiveCharacterEffect(effect);
      });
    }

    accumulateErrors(() => {
      this.validateScript(newScene.script);
    });

    if (
      newScene.id === this.gameDefinition.story.start &&
      !newScene.isCheckpoint
    ) {
      errors.push(
        new OntologyError(
          `The start scene ${printSceneId(newScene.id)} must be a checkpoint`
        )
      );
    }

    const checkpointDistance = newScene.isCheckpoint
      ? 0
      : this.getNearestCheckpoint(newScene.id).distance;

    for (const choice of newScene.choices) {
      switchDiscriminatedUnion("targetSceneMode", choice, {
        "create-new-scene-stub": (choice) => {
          if (
            this.gameDefinition.story.scenes[choice.targetScene] !== undefined
          ) {
            errors.push(
              new OntologyError(
                `The choice "${choice.label}" was marked as targeting a new scene stub with a given ID, but there is already a scene with that ID. Either choose a different ID or mark that this choice is actually targeting the existing scene instead.`
              )
            );
          }

          if (
            !(
              checkpointDistance + 1 <=
              this.gameDefinition.maximumDistanceFromCheckpoint
            )
          ) {
            errors.push(
              new OntologyError(
                `The scene stub ${printSceneId(choice.targetScene)} that would be created by the choice ${printChoiceLabel(choice.label)} cannot be created implemented because it would be further than ${this.gameDefinition.maximumDistanceFromCheckpoint} steps from the nearest previous checkpoint (which is ${printSceneId(newScene.id)}). You must either target an existing scene or omit this choice.`
              )
            );
          }
        },
        "reference-existing-scene": (choice) => {
          if (
            this.gameDefinition.story.scenes[choice.targetScene] === undefined
          ) {
            errors.push(
              new OntologyError(
                `The choice "${choice.label}" was marked as targeting an existing scene with a given ID, but there is *no* scene with that ID. Either choose an ID of an existing scene or mark that this choice is actually targeting a new scene stub instead.`
              )
            );
          }
        },
      });
    }

    if (!(newScene.id === this.gameDefinition.story.start)) {
      if (this.isTargetOfFrontierCheckpoint(newScene.id)) {
        errors.push(
          new OntologyError(
            `This scene cannot be implemented yet because it is immediately targeted by a choice of a frontier checkpoint scene. You must first implement all other outstanding scene stubs (thought not targeted by frontier checkpoints) to refresh the checkpoints before you can implement this scene.`
          )
        );
      }

      if (newScene.isCheckpoint) {
        const distance = this.getShortestDistanceFromCheckpoint(newScene.id);
        if (distance < this.gameDefinition.minimumCheckpointsSpacing) {
          const nearest = this.getNearestCheckpoint(newScene.id);
          errors.push(
            new OntologyError(
              `This scene *cannot* be flagged as a checkpoint because other checkpoints can reach it in too few steps. In order to flag a scene as a checkpoint, it must be at least ${this.gameDefinition.minimumCheckpointsSpacing} steps away from any previous checkpoint. The nearest previous checkpoint that can reach ${printSceneId(newScene.id)} is ${printSceneId(nearest.id)}, which is only ${distance} steps away.`
            )
          );
        }
      }

      if (newScene.isCheckpoint && newScene.choices.length > 0) {
        const frontierCheckpointsCount =
          this.getFrontierCheckpointScenes().size;
        if (
          frontierCheckpointsCount >=
          this.gameDefinition.thresholdFrontierCheckpointsCount
        ) {
          errors.push(
            new OntologyError(
              `This scene *cannot* be flagged as a checkpoint (unless it is a final ending with no choices) because there are already ${frontierCheckpointsCount} frontier checkpoints (maximum allowed is ${this.gameDefinition.thresholdFrontierCheckpointsCount}). You must first implement all other outstanding scene stubs first to refresh the checkpoints before you can create more.`
            )
          );
        }
      }
    }

    const isEnding = newScene.choices.length === 0;
    if (isEnding && !newScene.isCheckpoint) {
      const frontierCheckpointsCount = this.getFrontierCheckpointScenes().size;
      const simulatedFrontierCheckpointsCount =
        frontierCheckpointsCount + (newScene.isCheckpoint ? 1 : 0);
      if (
        simulatedFrontierCheckpointsCount <
        this.gameDefinition.thresholdFrontierCheckpointsCount
      ) {
        errors.push(
          new OntologyError(
            `A new ending scene can only be created if there are already ${this.gameDefinition.thresholdFrontierCheckpointsCount} frontier checkpoints (or if this is a final ending checkpoint that brings the count to the threshold). Currently, there are only ${frontierCheckpointsCount} frontier checkpoints.`
          )
        );
      }
    }

    if (newScene.isCheckpoint) {
      const distance = this.getShortestDistanceFromStart(newScene.id);
      if (distance < this.gameDefinition.minimumDistanceToFinalEnding) {
        const hasStubChoice = newScene.choices.some(
          (c) => c.targetSceneMode === "create-new-scene-stub"
        );
        if (!hasStubChoice) {
          errors.push(
            new OntologyError(
              `The scene ${printSceneId(newScene.id)} is a frontier checkpoint less than ${this.gameDefinition.minimumDistanceToFinalEnding} steps from the start (current distance: ${distance}), so it must have at least one choice with 'create-new-scene-stub'.`
            )
          );
        }
      }
    }

    // Enforce the requirement that implementing the new scene always keeps the number of open scene stubs and final endings at least threshold - frontierCheckpointScenes.size
    const currentFrontierCheckpointsCount =
      this.getFrontierCheckpointScenes().size;
    const requiredOpenStubs =
      this.gameDefinition.thresholdFrontierCheckpointsCount -
      currentFrontierCheckpointsCount;

    // Simulate the state after implementing the new scene
    const clonedScenes: Record<SceneId, SceneEntry> = {};
    for (const [id, entry] of Object.entries(
      this.gameDefinition.story.scenes
    )) {
      if (entry.type === "impl") {
        clonedScenes[id] = {
          type: "impl" as const,
          scene: {
            ...entry.scene,
          },
        };
      } else {
        clonedScenes[id] = {
          type: "stub" as const,
          scene: {
            ...entry.scene,
          },
        };
      }
    }

    // Apply new scene implementation in simulated state
    clonedScenes[newScene.id] = {
      type: "impl" as const,
      scene: {
        ...newScene,
        checkpoint: newScene.isCheckpoint ? ("frontier" as const) : undefined,
      },
    };

    // Add new stubs from choices in simulated state
    for (const choice of newScene.choices) {
      if (choice.targetSceneMode === "create-new-scene-stub") {
        clonedScenes[choice.targetScene] = {
          type: "stub" as const,
          scene: {
            id: choice.targetScene,
            description: choice.description,
          },
        };
      }
    }

    const getIncomingChoicesFromCloned = (
      id: SceneId
    ): { sceneId: SceneId; label: ChoiceLabel }[] => {
      const incoming: { sceneId: SceneId; label: ChoiceLabel }[] = [];
      for (const [, entry] of Object.entries(clonedScenes)) {
        if (entry.type === "impl") {
          for (const choice of entry.scene.choices) {
            if (choice.targetScene === id) {
              incoming.push({ sceneId: entry.scene.id, label: choice.label });
            }
          }
        }
      }
      return incoming;
    };

    const isTargetOfFrontierCheckpointInCloned = (id: SceneId): boolean => {
      const incoming = getIncomingChoicesFromCloned(id);
      return incoming.some((choice) => {
        const entry = clonedScenes[choice.sceneId];
        return (
          entry !== undefined &&
          entry.type === "impl" &&
          entry.scene.checkpoint === "frontier"
        );
      });
    };

    const getFrontierCheckpointScenesFromCloned = (): Set<SceneId> => {
      return new Set(
        Object.entries(clonedScenes)
          .filter(
            ([_, entry]) =>
              entry.type === "impl" && entry.scene.checkpoint === "frontier"
          )
          .map(([id, _]) => id)
      );
    };

    const getSceneStubsFromCloned = (): Set<SceneId> => {
      const stubs = new Set<SceneId>();
      for (const [id, entry] of Object.entries(clonedScenes)) {
        if (entry.type === "stub") {
          stubs.add(id);
        }
      }
      return stubs;
    };

    const updateCheckpointsInCloned = (): boolean => {
      const stubs = Array.from(getSceneStubsFromCloned()).filter(
        (id) =>
          clonedScenes[id]?.type === "stub" &&
          !isTargetOfFrontierCheckpointInCloned(id)
      );

      const checkpoints = getFrontierCheckpointScenesFromCloned();

      if (checkpoints.size > 0 && stubs.length === 0) {
        for (const id of checkpoints) {
          const sceneEntry = clonedScenes[id];
          if (sceneEntry && sceneEntry.type === "impl") {
            sceneEntry.scene.checkpoint = "interior";
          }
        }
        return true;
      }

      return false;
    };

    // Run simulated checkpoint updates
    updateCheckpointsInCloned();

    // Calculate open stubs and final endings in the simulated state
    const openStubsInCloned = Array.from(getSceneStubsFromCloned()).filter(
      (id) => !isTargetOfFrontierCheckpointInCloned(id)
    );
    const finalEndingsCount =
      Object.values(clonedScenes).filter(
        (entry) =>
          entry.type === "impl" &&
          entry.scene.choices.length === 0 &&
          entry.scene.isCheckpoint
      ).length +
      // if this is a final ending scene, then would count towards final endings count
      (newScene.isCheckpoint && newScene.choices.length == 0 ? 1 : 0);
    const openStubsCountAfter = openStubsInCloned.length + finalEndingsCount;

    if (
      openStubsCountAfter < requiredOpenStubs &&
      getSceneStubsFromCloned().size > 0
    ) {
      errors.push(
        new OntologyError(
          `Implementing this scene would leave only ${openStubsCountAfter} open scene stubs and final endings, but you must keep at least ${requiredOpenStubs} open scene stubs or final endings (threshold of ${this.gameDefinition.thresholdFrontierCheckpointsCount} minus ${currentFrontierCheckpointsCount} current frontier checkpoints). This is to ensure you can always make enough new frontier checkpoints to reach the threshold.`
        )
      );
    }

    if (errors.length > 0) throw new OntologyError(errors.join("\n\n"));
  }

  isCheckpointScene(id: SceneId): boolean {
    const entry = this.gameDefinition.story.scenes[id];
    if (!entry || entry.type !== "impl") {
      return id === this.gameDefinition.story.start;
    }
    return (
      entry.scene.checkpoint === "frontier" ||
      entry.scene.checkpoint === "interior" ||
      entry.scene.isCheckpoint === true ||
      id === this.gameDefinition.story.start
    );
  }

  /**
   * Checks if a scene is a target of a choice of a checkpoint scene.
   */
  isTargetOfCheckpoint(id: SceneId): boolean {
    const incoming = this.getIncomingChoices(id);
    return incoming.some((choice) => this.isCheckpointScene(choice.sceneId));
  }

  /**
   * Checks if a scene is a target of a choice of a frontier checkpoint scene.
   */
  isTargetOfFrontierCheckpoint(id: SceneId): boolean {
    const incoming = this.getIncomingChoices(id);
    return incoming.some((choice) => {
      const entry = this.gameDefinition.story.scenes[choice.sceneId];
      return (
        entry !== undefined &&
        entry.type === "impl" &&
        entry.scene.checkpoint === "frontier"
      );
    });
  }

  /**
   * Compute the shortest length among all paths that lead from a checkpoint to
   * this scene. Handles cycles.
   */
  getShortestDistanceFromCheckpoint(id: SceneId): number {
    return this.getNearestCheckpoint(id).distance;
  }

  /**
   * Compute the shortest length among all paths that lead from the start to
   * this scene. Handles cycles.
   */
  getShortestDistanceFromStart(id: SceneId): number {
    const startId = this.gameDefinition.story.start;
    if (id === startId) {
      return 0;
    }

    const queue: { currentId: SceneId; distance: number }[] = [
      { currentId: startId, distance: 0 },
    ];
    const visited = new Set<SceneId>([startId]);

    while (queue.length > 0) {
      const { currentId, distance } = queue.shift()!;

      if (currentId === id) {
        return distance;
      }

      const entry = this.gameDefinition.story.scenes[currentId];
      if (entry && entry.type === "impl") {
        for (const choice of entry.scene.choices) {
          const target = choice.targetScene;
          if (!visited.has(target)) {
            visited.add(target);
            queue.push({ currentId: target, distance: distance + 1 });
          }
        }
      }
    }

    return Infinity;
  }

  /**
   * Find the checkpoint (and the distance from that checkpoint) that has the
   * shortest path from that checkpoint to this scene. Handles cycles.
   */
  getNearestCheckpoint(id: SceneId): { id: SceneId; distance: number } {
    const queue: { currentId: SceneId; distance: number }[] = [
      { currentId: id, distance: 0 },
    ];
    const visited = new Set<SceneId>([id]);

    while (queue.length > 0) {
      const { currentId, distance } = queue.shift()!;

      if (distance > 0 && this.isCheckpointScene(currentId)) {
        return { id: currentId, distance };
      }

      const incoming = this.getIncomingChoices(currentId);
      for (const choice of incoming) {
        if (!visited.has(choice.sceneId)) {
          visited.add(choice.sceneId);
          queue.push({ currentId: choice.sceneId, distance: distance + 1 });
        }
      }
    }

    return { id: "", distance: Infinity };
  }

  validateNewSceneStub(scene: SceneStub) {
    if (this.gameDefinition.story.scenes[scene.id] !== undefined) {
      throw new OntologyError(`Scene ID is already taken: ${scene.id}`);
    }
  }

  validateLocationName(name: LocationName) {
    if (this.gameDefinition.story.locations[name] === undefined) {
      throw new OntologyError(`Unknown location: ${name}`);
    }
  }

  validateCharacterName(name: CharacterName) {
    if (this.gameDefinition.story.characters[name] === undefined) {
      throw new OntologyError(`Unknown character: ${name}`);
    }
  }

  validateSceneId(id: SceneId) {
    if (this.gameDefinition.story.scenes[id] === undefined) {
      throw new OntologyError(`Unknown scene: ${id}`);
    }
  }

  validatePassiveLocationEffect(_effect: PassiveLocationEffect) {
    // no validation checks yet
  }

  validatePassiveCharacterEffect(_effect: PassiveCharacterEffect) {
    // no validation checks yet
  }

  validateInstantLocationEffect(_effect: InstantLocationEffect) {
    // no validation checks yet
  }

  validateInstantCharacterEffect(_effect: InstantCharacterEffect) {
    // no validation checks yet
  }

  validateScript(script: Script) {
    const errors: OntologyError[] = [];

    const accumulateErrors = (k: () => void): void => {
      try {
        k();
      } catch (error) {
        if (error instanceof OntologyError) {
          errors.push(error);
        } else {
          throw error;
        }
      }
    };

    for (const part of script) {
      switchDiscriminatedUnion("type", part, {
        narration: (part) => {
          for (const effect of part.instantLocationEffects) {
            accumulateErrors(() => {
              this.validateInstantLocationEffect(effect);
            });
          }
          for (const {
            character: charName,
            effect,
          } of part.instantCharacterEffects) {
            accumulateErrors(() => {
              this.validateCharacterName(charName);
              this.validateInstantCharacterEffect(effect);
            });
          }
        },
        dialogue: (part) => {
          accumulateErrors(() => {
            this.validateCharacterName(part.character);
          });
          for (const effect of part.instantLocationEffects) {
            accumulateErrors(() => {
              this.validateInstantLocationEffect(effect);
            });
          }
          for (const {
            character: charName,
            effect,
          } of part.instantCharacterEffects) {
            accumulateErrors(() => {
              this.validateCharacterName(charName);
              this.validateInstantCharacterEffect(effect);
            });
          }
        },
        internal_dialogue: (part) => {
          accumulateErrors(() => {
            this.validateCharacterName(part.character);
          });
          for (const effect of part.instantLocationEffects) {
            accumulateErrors(() => {
              this.validateInstantLocationEffect(effect);
            });
          }
          for (const {
            character: charName,
            effect,
          } of part.instantCharacterEffects) {
            accumulateErrors(() => {
              this.validateCharacterName(charName);
              this.validateInstantCharacterEffect(effect);
            });
          }
        },
      });
    }

    if (errors.length > 0) {
      throw new OntologyError(errors.join("\n\n"));
    }
  }

  validateChoice(choice: Choice) {
    this.validateSceneId(choice.targetScene);
  }

  // --------------------------------
  // add new objects
  // --------------------------------

  /**
   * Add a new scene to the story, which replaces an existing scene stub.
   */
  addNewScene(newScene: NewScene): { refreshedCheckpoints: boolean } {
    this.validateNewScene(newScene);

    this.gameDefinition.story.scenes[newScene.id] = {
      type: "impl",
      scene: {
        ...newScene,
        checkpoint: newScene.isCheckpoint ? "frontier" : undefined,
      },
    };

    for (const choice of newScene.choices) {
      switchDiscriminatedUnion("targetSceneMode", choice, {
        "create-new-scene-stub": (choice) => {
          this.gameDefinition.story.scenes[choice.targetScene] = {
            type: "stub",
            scene: {
              id: choice.targetScene,
              description: choice.description,
            },
          };
        },
        "reference-existing-scene": () => {},
      });
    }

    const refreshedCheckpoints = this.updateCheckpoints();

    return {
      refreshedCheckpoints,
    };
  }

  /**
   * Add a new scene stub to the story.
   */
  addSceneStub(scene: SceneStub) {
    this.validateNewSceneStub(scene);
    this.gameDefinition.story.scenes[scene.id] = { type: "stub", scene };
  }

  /**
   * Add a new character to the story.
   */
  addNewCharacter(character: Character) {
    this.validateNewCharacter(character);
    this.gameDefinition.story.characters[character.name] = character;
  }

  validateNewCharacter(character: Character) {
    if (this.gameDefinition.story.characters[character.name] !== undefined) {
      throw new OntologyError(
        `Character name already taken: ${character.name}`
      );
    }
  }

  /**
   * Add a new location to the story.
   */
  addNewLocation(location: Location) {
    this.validateNewLocation(location);
    this.gameDefinition.story.locations[location.name] = location;
  }

  validateNewLocation(location: Location) {
    if (this.gameDefinition.story.locations[location.name] !== undefined) {
      throw new OntologyError(`Location name already taken: ${location.name}`);
    }
  }

  /**
   * If there are no scene stubs other than those targeted by frontier
   * checkpoint scenes, then mark all frontier checkpoint scenes as interior.
   *
   * If all checkpoint scenes were marked as interior then return true,
   * otherwise return false.
   */
  updateCheckpoints(): boolean {
    // Stubs that are not targeted by frontier checkpoint scenes
    const stubs = Array.from(this.getSceneStubs()).filter(
      (id) =>
        this.getSceneEntry(id).type === "stub" &&
        !this.isTargetOfFrontierCheckpoint(id)
    );

    const checkpoints = this.getFrontierCheckpointScenes();

    if (checkpoints.size > 0 && stubs.length === 0) {
      for (const id of checkpoints) {
        const sceneEntry = this.getSceneEntry(id);
        if (sceneEntry.type === "impl") {
          sceneEntry.scene.checkpoint = "interior";
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Get the IDs of all frontier checkpoint scenes.
   */
  getFrontierCheckpointScenes(): Set<SceneId> {
    return new Set(
      Object.entries(this.gameDefinition.story.scenes)
        .filter(
          ([_, scene]) =>
            scene.type === "impl" && scene.scene.checkpoint === "frontier"
        )
        .map(([id, _]) => id)
    );
  }

  // --------------------------------
  // edit existing objects
  // --------------------------------

  removeScene(id: SceneId) {
    this.validateSceneId(id);
    delete this.gameDefinition.story.scenes[id];
  }

  // --------------------------------
  // print objects
  // --------------------------------

  /**
   * Print a Markdown-format report on a character.
   */
  printCharacter(name: CharacterName): string {
    const character = this.getCharacter(name);
    const scenes = Object.entries(this.gameDefinition.story.scenes).filter(
      ([_sceneId, entry]) =>
        entry.type === "impl" &&
        getCharactersInScene(entry.scene).has(character.name)
    );

    return `
## Character ${printCharacterName(character.name)}

${character.vignette}

### Backstory of ${printCharacterName(character.name)}

${character.backstoryDescription}

### Scenes with ${printCharacterName(character.name)}

${
  scenes.length === 0
    ? `The character ${printCharacterName(character.name)} never appears in any scenes`
    : `The character ${printCharacterName(character.name)} appears in these scenes:

${scenes.map(([sceneId]) => `- ${printSceneId(sceneId)}`).join("\n")}`
}
`.trim();
  }

  /**
   * Print a Markdown-format report on a location.
   */
  printLocation(name: LocationName): string {
    const location: Location = this.getLocation(name);
    const scenes = Object.entries(this.gameDefinition.story.scenes).filter(
      ([_sceneId, entry]) =>
        entry.type === "impl" && entry.scene.location === location.name
    );

    return `
## Location ${printLocationName(location.name)}

${location.vignette}

### Backstory of ${printLocationName(location.name)}

${location.backstoryDescription}

### Scenes with ${printLocationName(location.name)}

${
  scenes.length === 0
    ? `The location ${printLocationName(location.name)} never visited`
    : `The location ${printLocationName(location.name)} is visited in these scenes:

${scenes.map(([sceneId]) => `- ${printSceneId(sceneId)}`).join("\n")}`
}
`.trim();
  }

  /**
   * Print a Markdown-format report on a scene entry, which could be either
   * either a scene stub of a scene implementation. The report include:
   *
   * - basic scene details
   * - incoming choices: the choices (and each choice's source scene) that target this scene
   * - outgoing choices: the choices (and each choice's target scene) that are available at this scene
   */
  printSceneEntry(id: SceneId): string {
    const sceneEntry = this.getSceneEntry(id);

    return switchDiscriminatedUnion("type", sceneEntry, {
      stub: (entry) => {
        const incoming = this.getIncomingChoices(id);
        const incomingStr =
          incoming.length > 0
            ? incoming
                .map(
                  (c) =>
                    `- From **${printSceneId(c.sceneId)}**: ${printChoiceLabel(c.label)}`
                )
                .join("\n")
            : "None";

        const isLocked = this.isTargetOfFrontierCheckpoint(id);
        const lockStr = isLocked
          ? " (Locked - targeted by frontier checkpoint)"
          : "";

        const distFromStart = this.getShortestDistanceFromStart(id);
        const distFromStartStr =
          distFromStart === Infinity ? "Infinity" : distFromStart.toString();

        const nearestCheckpoint = this.getNearestCheckpoint(id);
        const checkpointStr = nearestCheckpoint.id
          ? `${nearestCheckpoint.distance} (from checkpoint ${printSceneId(nearestCheckpoint.id)})`
          : "None";

        return `
## Scene ${printSceneId(id)} (Stub)${lockStr}

**Distance from Start**: ${distFromStartStr}
**Distance from Nearest Checkpoint**: ${checkpointStr}

${entry.scene.description}

### Incoming Choices

${incomingStr}
`.trim();
      },
      impl: (entry) => {
        const scene = entry.scene;
        const incoming = this.getIncomingChoices(id);
        const incomingStr =
          incoming.length > 0
            ? incoming
                .map(
                  (c) =>
                    `- From **${printSceneId(c.sceneId)}**: ${printChoiceLabel(c.label)}`
                )
                .join("\n")
            : "None";

        const outgoing = this.getOutgoingChoices(id);
        const outgoingStr =
          outgoing.length > 0
            ? outgoing
                .map(
                  (c) =>
                    `- To **${printSceneId(c.sceneId)}**: ${printChoiceLabel(c.label)}`
                )
                .join("\n")
            : "None";

        const passiveLoc =
          scene.passiveLocationEffects.length > 0
            ? scene.passiveLocationEffects.join(", ")
            : "None";

        const passiveChar =
          scene.passiveCharacterEffects.length > 0
            ? scene.passiveCharacterEffects
                .map(
                  ({ character: char, effect }) =>
                    `${printCharacterName(char)} (${effect})`
                )
                .join(", ")
            : "None";

        const checkpointStatusStr =
          scene.checkpoint !== undefined
            ? `\n**Checkpoint Status**: ${scene.checkpoint}`
            : "";

        const distFromStart = this.getShortestDistanceFromStart(id);
        const distFromStartStr =
          distFromStart === Infinity ? "Infinity" : distFromStart.toString();

        const nearestCheckpoint = this.getNearestCheckpoint(id);
        const checkpointStr = nearestCheckpoint.id
          ? `${nearestCheckpoint.distance} (from checkpoint ${printSceneId(nearestCheckpoint.id)})`
          : "None";

        return `
## Scene ${printSceneId(id)}${checkpointStatusStr}

**Distance from Start**: ${distFromStartStr}
**Distance from Nearest Checkpoint**: ${checkpointStr}
**Location**: ${printLocationName(scene.location)}
**Passive Location Effects**: ${passiveLoc}
**Passive Character Effects**: ${passiveChar}

### Script

${this.printScript(scene.script)}

### Incoming Choices

${incomingStr}

### Outgoing Choices

${outgoingStr}
`.trim();
      },
    });
  }

  /**
   * Print the story, starting from the start scene up to the scene with the
   * given ID, in Markdown format, with the scene content interleaved with the
   * choices.
   */
  printStoryUpToScene(id: SceneId): string {
    const start = this.gameDefinition.story.start;

    const queue: {
      current: SceneId;
      path: { sceneId: SceneId; choiceLabel?: ChoiceLabel }[];
    }[] = [];
    const visited = new Set<SceneId>([start]);

    queue.push({ current: start, path: [{ sceneId: start }] });

    let foundPath: { sceneId: SceneId; choiceLabel?: ChoiceLabel }[] | null =
      null;

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node.current === id) {
        foundPath = node.path;
        break;
      }

      const outgoing = this.getOutgoingChoices(node.current);
      for (const choice of outgoing) {
        if (!visited.has(choice.sceneId)) {
          visited.add(choice.sceneId);
          queue.push({
            current: choice.sceneId,
            path: [
              ...node.path,
              { sceneId: choice.sceneId, choiceLabel: choice.label },
            ],
          });
        }
      }
    }

    if (foundPath === null) {
      throw new OntologyError(
        `No path found from start scene ${printSceneId(start)} to scene ${printSceneId(id)}.`
      );
    }

    const parts: string[] = [];
    for (let i = 0; i < foundPath.length; i++) {
      const step = foundPath[i]!;
      const entry = this.getSceneEntry(step.sceneId);

      const distFromStart = this.getShortestDistanceFromStart(step.sceneId);
      const distFromStartStr =
        distFromStart === Infinity ? "Infinity" : distFromStart.toString();

      const nearestCheckpoint = this.getNearestCheckpoint(step.sceneId);
      const checkpointStr = nearestCheckpoint.id
        ? `${nearestCheckpoint.distance} (from checkpoint ${printSceneId(nearestCheckpoint.id)})`
        : "None";

      parts.push(`### Scene: ${printSceneId(step.sceneId)}`);
      parts.push(`**Distance from Start**: ${distFromStartStr}`);
      parts.push(`**Distance from Nearest Checkpoint**: ${checkpointStr}`);
      if (entry.type === "impl" && entry.scene.checkpoint === "frontier") {
        parts.push("*(Frontier Checkpoint)*");
      } else if (
        entry.type === "stub" &&
        this.isTargetOfFrontierCheckpoint(step.sceneId)
      ) {
        parts.push("*(Locked - targeted by frontier checkpoint)*");
      }
      parts.push("");

      if (entry.type === "stub") {
        parts.push(`*[Stub: ${entry.scene.description}]*`);
      } else {
        parts.push(this.printScript(entry.scene.script));
      }

      parts.push("");

      if (i < foundPath.length - 1) {
        const nextStep = foundPath[i + 1]!;
        parts.push(
          `**Choice Chosen**: ${printChoiceLabel(nextStep.choiceLabel!)}`
        );
        parts.push("");
        parts.push("---");
        parts.push("");
      }
    }

    return parts.join("\n").trim();
  }

  /**
   * Print a script part in Markdown format.
   */
  printScriptPart(part: ScriptPart): string {
    let contentStr = "";
    switchDiscriminatedUnion("type", part, {
      narration: (part) => {
        contentStr = part.content;
      },
      dialogue: (part) => {
        contentStr = `**${printCharacterName(part.character)}**: ${part.content}`;
      },
      internal_dialogue: (part) => {
        contentStr = `*${printCharacterName(part.character)} (thinking)*: ${part.content}`;
      },
    });

    let effectsStr = "";
    const effectLines: string[] = [];
    if (part.instantLocationEffects.length > 0) {
      effectLines.push(
        `Location effects: ${part.instantLocationEffects.join(", ")}`
      );
    }
    for (const {
      character: charName,
      effect,
    } of part.instantCharacterEffects) {
      effectLines.push(`${printCharacterName(charName)} effect: ${effect}`);
    }
    if (effectLines.length > 0) {
      effectsStr = `\n\n*(${effectLines.join("; ")})*`;
    }

    return contentStr + effectsStr;
  }

  /**
   * Print a script in Markdown format.
   */
  printScript(script: Script): string {
    return script.map((part) => this.printScriptPart(part)).join("\n\n");
  }

  /**
   * Print a choice in Markdown format.
   */
  printChoice(choice: Choice): string {
    return `
**Choice: ${printChoiceLabel(choice.label)}**

${choice.description}

*(Targets: ${printSceneId(choice.targetScene)})*
`.trim();
  }
}

/**
 * Ontology given a class so that they can be handled specially by some
 * ontological operations.
 */
export class OntologyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// --------------------------------
// GameStateManager
// --------------------------------

export class GameStateManager {
  gameDefinitionManager: GameDefinitionManager;
  gameState: GameState;

  constructor(gameDefinition: GameDefinition, gameState: GameState) {
    this.gameDefinitionManager = new GameDefinitionManager(gameDefinition);
    this.gameState = gameState;
  }

  /**
   * Update the game by making a choice at the current scene.
   */
  choose(label: ChoiceLabel) {
    const sceneEntry = this.gameDefinitionManager.getSceneEntry(
      this.gameState.currentScene
    );
    const choice = switchDiscriminatedUnion("type", sceneEntry, {
      stub: (sceneEntry) => {
        throw new OntologyError(
          `Invalid choice ${printChoiceLabel(label)} at scene stub ${sceneEntry.scene.id}`
        );
      },
      impl: (sceneEntry) => {
        const choice = sceneEntry.scene.choices.find((c) => c.label === label);
        if (choice === undefined) {
          throw new OntologyError(
            `Invalid choice ${printChoiceLabel(label)} at scene ${sceneEntry.scene.id}`
          );
        }
        return choice;
      },
    });
    this.gameDefinitionManager.getSceneEntry(choice.targetScene);

    this.gameState.history.push({
      scene: this.gameState.currentScene,
      choice: label,
    });
    this.gameState.currentScene = choice.targetScene;
  }
}

// --------------------------------
// GameBundle
// --------------------------------

export type ImageAssetRef = Type.Static<typeof ImageAssetRef>;
export const ImageAssetRef = Type.String({
  description:
    "Reference to an image asset from the uploaded game bundle zip file.",
});

export type AudioAssetRef = Type.Static<typeof AudioAssetRef>;
export const AudioAssetRef = Type.String({
  description:
    "Reference to an audio asset from the uploaded game bundle zip file.",
});

/**
 * A GameBundle is loaded from a zip file with this internal structure:
 * ```
 * ./gameDefinition.json
 * ./gameAssets/characters/<CharacterName-slug>/image.*
 * ./gameAssets/characters/<CharacterName-slug>/passiveEffects/<PassiveCharacterEffect-slug>/image.*
 * ./gameAssets/characters/<CharacterName-slug>/passiveEffects/<PassiveCharacterEffect-slug>/audio.*
 * ./gameAssets/characters/<CharacterName-slug>/instanceEffects/<InstantCharacterEffect-slug>/image.*
 * ./gameAssets/characters/<CharacterName-slug>/instanceEffects/<InstantCharacterEffect-slug>/audio.*
 * ./gameAssets/locations/<LocationName-slug>/passiveEffects/<PassiveLocationEffect-slug>/image.*
 * ./gameAssets/locations/<LocationName-slug>/passiveEffects/<PassiveLocationEffect-slug>/audio.*
 * ./gameAssets/locations/<LocationName-slug>/instanceEffects/<InstantLocationEffect-slug>/image.*
 * ./gameAssets/locations/<LocationName-slug>/instanceEffects/<InstantLocationEffect-slug>/audio.*
 * ```
 */
export type GameBundle = Type.Static<typeof GameBundle>;
export const GameBundle = Type.Object({
  gameDefinition: GameDefinition,
  gameAssets: Type.Object({
    characters: Type.Record(
      CharacterName,
      Type.Object({
        image: Type.Optional(ImageAssetRef),
        passiveEffects: Type.Record(
          PassiveCharacterEffect,
          Type.Object({
            image: Type.Optional(ImageAssetRef),
            sound: Type.Optional(AudioAssetRef),
          })
        ),
        instantEffects: Type.Record(
          InstantCharacterEffect,
          Type.Object({
            image: Type.Optional(ImageAssetRef),
            sound: Type.Optional(AudioAssetRef),
          })
        ),
      })
    ),
    locations: Type.Record(
      LocationName,
      Type.Object({
        image: Type.Optional(ImageAssetRef),
        passiveEffects: Type.Record(
          PassiveLocationEffect,
          Type.Object({
            image: Type.Optional(ImageAssetRef),
            sound: Type.Optional(AudioAssetRef),
          })
        ),
        instantEffects: Type.Record(
          InstantLocationEffect,
          Type.Object({
            image: Type.Optional(ImageAssetRef),
            sound: Type.Optional(AudioAssetRef),
          })
        ),
      })
    ),
  }),
});

interface ZipEntryWithData {
  filename: string;
  directory: boolean;
  getData: <T>(writer: unknown) => Promise<T>;
}

interface CharacterAssets {
  image?: string;
  passiveEffects: Record<string, { image?: string; sound?: string }>;
  instantEffects: Record<string, { image?: string; sound?: string }>;
}

interface LocationAssets {
  image?: string;
  passiveEffects: Record<string, { image?: string; sound?: string }>;
  instantEffects: Record<string, { image?: string; sound?: string }>;
}

function getMimeType(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "m4a":
      return "audio/mp4";
    default:
      return undefined;
  }
}

export async function loadGameBundle(
  reader: ReadableReader
): Promise<GameBundle> {
  const zipReader = new ZipReader(reader);
  const entries = await zipReader.getEntries();

  // Find gameDefinition.json
  const gameDefEntry = entries.find(
    (e) =>
      e.filename.replace(/^\.\//, "").replace(/^\//, "") ===
      "gameDefinition.json"
  );
  if (!gameDefEntry) {
    throw new Error("Missing gameDefinition.json in the zip bundle");
  }

  const gameDefEntryWithData = gameDefEntry as unknown as ZipEntryWithData;
  if (!gameDefEntryWithData.getData) {
    throw new Error("Invalid zip reader: getData is missing on entry");
  }

  const gameDefText = await gameDefEntryWithData.getData<string>(
    new TextWriter()
  );
  const rawGameDef = JSON.parse(gameDefText) as unknown;
  // Parse and validate GameDefinition using Schema.Compile
  const gameDefinition = Schema.Compile(GameDefinition).Parse(rawGameDef);

  // Initialize gameAssets
  const gameAssets: {
    characters: Record<string, CharacterAssets>;
    locations: Record<string, LocationAssets>;
  } = {
    characters: {},
    locations: {},
  };

  function getOrInitCharacter(charName: string): CharacterAssets {
    if (!gameAssets.characters[charName]) {
      gameAssets.characters[charName] = {
        passiveEffects: {
          float: {},
          spin: {},
          shake: {},
        },
        instantEffects: {
          shake: {},
          spin: {},
          float: {},
          jump: {},
          fall: {},
          run: {},
          walk: {},
          happy: {},
          sad: {},
          angry: {},
          shy: {},
        },
      };
    }
    return gameAssets.characters[charName];
  }

  function getOrInitLocation(locName: string): LocationAssets {
    if (!gameAssets.locations[locName]) {
      gameAssets.locations[locName] = {
        passiveEffects: {
          dark: {},
          sunny: {},
          snow: {},
          rain: {},
          wind: {},
          shake: {},
        },
        instantEffects: {
          shake: {},
        },
      };
    }
    return gameAssets.locations[locName];
  }

  // Pre-initialize characters and locations from gameDefinition
  if (gameDefinition.story?.characters) {
    for (const charName of Object.keys(gameDefinition.story.characters)) {
      getOrInitCharacter(charName);
    }
  }

  if (gameDefinition.story?.locations) {
    for (const locName of Object.keys(gameDefinition.story.locations)) {
      getOrInitLocation(locName);
    }
  }

  // Process files in the zip
  for (const entry of entries) {
    const filename = entry.filename.replace(/^\.\//, "").replace(/^\//, "");
    if (filename === "gameDefinition.json" || entry.directory) {
      continue;
    }

    const parts = filename.split("/");
    if (parts[0] !== "gameAssets" || parts.length < 4) {
      continue;
    }

    if (!entry.getData) {
      continue;
    }

    const category = parts[1]!; // "characters" or "locations"
    const name = parts[2]!; // CharacterName or LocationName

    let originalName = name;
    if (category === "characters" && gameDefinition.story?.characters) {
      const match = Object.keys(gameDefinition.story.characters).find(
        (key) => slugify(key) === slugify(name)
      );
      if (match) {
        originalName = match;
      }
    } else if (category === "locations" && gameDefinition.story?.locations) {
      const match = Object.keys(gameDefinition.story.locations).find(
        (key) => slugify(key) === slugify(name)
      );
      if (match) {
        originalName = match;
      }
    }

    if (category === "characters") {
      const charObj = getOrInitCharacter(originalName);
      const subType = parts[3]!; // "image.*" or "passiveEffects" or "instanceEffects"/"instantEffects"

      if (subType.includes(".")) {
        const [baseName] = subType.split(".");
        if (baseName === "image") {
          const mimeType = getMimeType(filename);
          charObj.image = await (
            entry as unknown as ZipEntryWithData
          ).getData<string>(new Data64URIWriter(mimeType));
        }
      } else if (subType === "passiveEffects" && parts.length >= 6) {
        const rawEffectName = parts[4]!; // e.g. "float", "spin", "shake"
        const fileType = parts[5]!; // "image.*" or "audio.*"

        const effectName = ["float", "spin", "shake"].find(
          (e) => slugify(e) === slugify(rawEffectName)
        );

        if (effectName) {
          const effectObj = charObj.passiveEffects[effectName] || {};
          charObj.passiveEffects[effectName] = effectObj;

          const [baseName] = fileType.split(".");
          if (baseName === "image") {
            const mimeType = getMimeType(filename);
            effectObj.image = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          } else if (baseName === "audio") {
            const mimeType = getMimeType(filename);
            effectObj.sound = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          }
        }
      } else if (
        (subType === "instanceEffects" || subType === "instantEffects") &&
        parts.length >= 6
      ) {
        const rawEffectName = parts[4]!;
        const fileType = parts[5]!;

        const validEffects = [
          "shake",
          "spin",
          "float",
          "jump",
          "fall",
          "run",
          "walk",
          "happy",
          "sad",
          "angry",
          "shy",
        ];
        const effectName = validEffects.find(
          (e) => slugify(e) === slugify(rawEffectName)
        );
        if (effectName) {
          const effectObj = charObj.instantEffects[effectName] || {};
          charObj.instantEffects[effectName] = effectObj;

          const [baseName] = fileType.split(".");
          if (baseName === "image") {
            const mimeType = getMimeType(filename);
            effectObj.image = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          } else if (baseName === "audio") {
            const mimeType = getMimeType(filename);
            effectObj.sound = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          }
        }
      }
    } else if (category === "locations") {
      const locObj = getOrInitLocation(originalName);
      const subType = parts[3]!;

      if (subType.includes(".")) {
        const [baseName] = subType.split(".");
        if (baseName === "image") {
          const mimeType = getMimeType(filename);
          locObj.image = await (
            entry as unknown as ZipEntryWithData
          ).getData<string>(new Data64URIWriter(mimeType));
        }
      } else if (subType === "passiveEffects" && parts.length >= 6) {
        const rawEffectName = parts[4]!;
        const fileType = parts[5]!;

        const validEffects = ["dark", "sunny", "snow", "rain", "wind", "shake"];
        const effectName = validEffects.find(
          (e) => slugify(e) === slugify(rawEffectName)
        );
        if (effectName) {
          const effectObj = locObj.passiveEffects[effectName] || {};
          locObj.passiveEffects[effectName] = effectObj;

          const [baseName] = fileType.split(".");
          if (baseName === "image") {
            const mimeType = getMimeType(filename);
            effectObj.image = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          } else if (baseName === "audio") {
            const mimeType = getMimeType(filename);
            effectObj.sound = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          }
        }
      } else if (
        (subType === "instanceEffects" || subType === "instantEffects") &&
        parts.length >= 6
      ) {
        const rawEffectName = parts[4]!;
        const fileType = parts[5]!;

        const effectName = ["shake"].find(
          (e) => slugify(e) === slugify(rawEffectName)
        );
        if (effectName === "shake") {
          const effectObj = locObj.instantEffects[effectName] || {};
          locObj.instantEffects[effectName] = effectObj;

          const [baseName] = fileType.split(".");
          if (baseName === "image") {
            const mimeType = getMimeType(filename);
            effectObj.image = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          } else if (baseName === "audio") {
            const mimeType = getMimeType(filename);
            effectObj.sound = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          }
        }
      }
    }
  }

  await zipReader.close();

  const finalBundle = {
    gameDefinition,
    gameAssets,
  };

  // Compile and Parse/Validate the final GameBundle
  return Schema.Compile(GameBundle).Parse(finalBundle);
}
