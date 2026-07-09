import { switchDiscriminatedUnion } from "@/utilities";
import Type from "typebox";

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
  }),
  Type.Object({
    type: Type.Literal("dialogue"),
    character: CharacterName,
    content: MarkdownText({
      description:
        "A passage of dialogue written in the first person point of view from the perspective of the speaking character.",
    }),
  }),
  Type.Object({
    type: Type.Literal("internal_dialogue"),
    character: CharacterName,
    content: MarkdownText({
      description:
        "A passage of inner thoughts written in the first person point of view from the perspective of the character thinking it.",
    }),
  }),
  Type.Object({
    type: Type.Literal("character_effect"),
    character: CharacterName,
    effect: InstantCharacterEffect,
  }),
  Type.Object({
    type: Type.Literal("location_effect"),
    effect: InstantLocationEffect,
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
  description: Type.String(),
  checkpoint: Type.Optional(CheckpointStatus),
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
      character_effect: () => {},
      location_effect: () => {},
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
  // getting objects
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
  // adding objects
  // --------------------------------

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

  // --------------------------------
  // printing objects
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

  printSceneEntry(_sceneId: SceneId): string {
    throw new Error("Unimplemented");
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
