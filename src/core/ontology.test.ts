import { describe, expect, it } from "vitest";
import {
  GameDefinition,
  GameDefinitionManager,
  loadGameBundle,
} from "@/core/ontology";
import {
  BlobReader,
  BlobWriter,
  ZipWriter,
  TextReader,
  Uint8ArrayReader,
} from "@zip.js/zip.js";

describe("ontology test suite", () => {
  const getMockGameDef = (): GameDefinition => ({
    story: {
      start: "start",
      scenes: {
        start: {
          type: "impl",
          scene: {
            isCheckpoint: true,
            id: "start",
            location: "forest",
            passiveLocationEffects: ["sunny"],
            passiveCharacterEffects: [{ character: "Hero", effect: "float" }],
            script: [
              {
                type: "narration",
                content: "You are standing at the edge of a quiet forest.",
                instantLocationEffects: ["shake"],
                instantCharacterEffects: [
                  { character: "Hero", effect: "shake" },
                ],
              },
              {
                type: "dialogue",
                character: "Hero",
                content: "Hello world!",
                instantLocationEffects: [],
                instantCharacterEffects: [],
              },
            ],
            choices: [
              {
                description: "Go deeper into the dark forest.",
                label: "Enter the forest",
                targetScene: "deep_forest",
              },
            ],
          },
        },
        deep_forest: {
          type: "stub",
          scene: {
            id: "deep_forest",
            description: "The deepest and darkest part of the forest.",
          },
        },
      },
      locations: {
        forest: {
          name: "forest",
          vignette: "A serene woodland of ancient pines.",
          appearanceDescription: "Dense green foliage with sun shafts.",
          backstoryDescription: "Legends say a guardian spirit resides here.",
        },
      },
      characters: {
        Hero: {
          name: "Hero",
          vignette: "A brave wanderer searching for lost relics.",
          appearanceDescription: "Wears a faded blue cloak.",
          backstoryDescription: "Raised in a small mountain village.",
        },
      },
    },
    minimumCheckpointsSpacing: 4,
    thresholdFrontierCheckpointsCount: 4,
    maximumDistanceFromCheckpoint: 6,
    minimumDistanceToFinalEnding: 2,
  });

  it("gets incoming choices correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const incoming = manager.getIncomingChoices("deep_forest");
    expect(incoming).toEqual([{ sceneId: "start", label: "Enter the forest" }]);
  });

  it("gets outgoing choices correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const outgoing = manager.getOutgoingChoices("start");
    expect(outgoing).toEqual([
      { sceneId: "deep_forest", label: "Enter the forest" },
    ]);
  });

  it("gets characters in scene correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const chars = manager.getCharactersInScene("start");
    expect(chars).toEqual(new Set(["Hero"]));
  });

  it("validates valid scene id", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    expect(() => manager.validateSceneId("start")).not.toThrow();
    expect(() => manager.validateSceneId("invalid")).toThrow();
  });

  it("validates valid character name", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    expect(() => manager.validateCharacterName("Hero")).not.toThrow();
    expect(() => manager.validateCharacterName("invalid")).toThrow();
  });

  it("validates valid location name", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    expect(() => manager.validateLocationName("forest")).not.toThrow();
    expect(() => manager.validateLocationName("invalid")).toThrow();
  });

  it("validates adding a new scene stub", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    expect(() =>
      manager.addSceneStub({ id: "new_stub", description: "A new location" })
    ).not.toThrow();
    expect(() =>
      manager.addSceneStub({ id: "start", description: "A duplicate location" })
    ).toThrow();
  });

  it("validates adding a new character", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    expect(() =>
      manager.addNewCharacter({
        name: "Villain",
        vignette: "A mysterious figure in dark armor.",
        appearanceDescription: "Red glowing eyes.",
        backstoryDescription: "Exiled from his kingdom long ago.",
      })
    ).not.toThrow();
    expect(() =>
      manager.addNewCharacter({
        name: "Hero",
        vignette: "A duplicate hero.",
        appearanceDescription: "",
        backstoryDescription: "",
      })
    ).toThrow();
  });

  it("validates adding a new location", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    expect(() =>
      manager.addNewLocation({
        name: "castle",
        vignette: "A majestic fortress atop a rocky hill.",
        appearanceDescription: "Stone walls and soaring towers.",
        backstoryDescription: "Built by the ancient kings.",
      })
    ).not.toThrow();
    expect(() =>
      manager.addNewLocation({
        name: "forest",
        vignette: "A duplicate forest.",
        appearanceDescription: "",
        backstoryDescription: "",
      })
    ).toThrow();
  });

  it("prints script parts correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const firstScene = getMockGameDef().story.scenes["start"];
    if (firstScene && firstScene.type === "impl") {
      const narrationPart = firstScene.scene.script[0]!;
      const printed = manager.printScriptPart(narrationPart);
      expect(printed).toContain(
        "You are standing at the edge of a quiet forest."
      );
      expect(printed).toContain(
        '*(Location effects: shake; "Hero" effect: shake)*'
      );
    } else {
      expect.fail("Scene start was not an impl");
    }
  });

  it("prints a full scene report correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const printedScene = manager.printSceneEntry("start");
    expect(printedScene).toContain('## Scene "start"');
    expect(printedScene).toContain("**Distance from Start**: 0");
    expect(printedScene).toContain(
      "**Distance from Nearest Checkpoint**: None"
    );
    expect(printedScene).toContain('**Location**: "forest"');
    expect(printedScene).toContain("**Passive Location Effects**: sunny");
    expect(printedScene).toContain(
      '**Passive Character Effects**: "Hero" (float)'
    );
    expect(printedScene).toContain("### Script");
    expect(printedScene).toContain(
      '- To **"deep_forest"**: "Enter the forest"'
    );
  });

  it("prints a stub scene report correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const printedScene = manager.printSceneEntry("deep_forest");
    expect(printedScene).toContain('## Scene "deep_forest" (Stub)');
    expect(printedScene).toContain("**Distance from Start**: 1");
    expect(printedScene).toContain(
      '**Distance from Nearest Checkpoint**: 1 (from checkpoint "start")'
    );
  });

  it("prints the story path up to a scene correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const printedStory = manager.printStoryUpToScene("deep_forest");
    expect(printedStory).toContain('### Scene: "start"');
    expect(printedStory).toContain("**Distance from Start**: 0");
    expect(printedStory).toContain(
      "**Distance from Nearest Checkpoint**: None"
    );
    expect(printedStory).toContain(
      "You are standing at the edge of a quiet forest."
    );
    expect(printedStory).toContain('**Choice Chosen**: "Enter the forest"');
    expect(printedStory).toContain('### Scene: "deep_forest"');
    expect(printedStory).toContain("**Distance from Start**: 1");
    expect(printedStory).toContain(
      '**Distance from Nearest Checkpoint**: 1 (from checkpoint "start")'
    );
    expect(printedStory).toContain(
      "*[Stub: The deepest and darkest part of the forest.]*"
    );
  });

  it("prints a choice correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const choice = {
      description: "Go deeper into the dark forest.",
      label: "Enter the forest",
      targetScene: "deep_forest",
    };
    const printed = manager.printChoice(choice);
    expect(printed).toBe(
      `**Choice: "Enter the forest"**\n\nGo deeper into the dark forest.\n\n*(Targets: "deep_forest")*`
    );
  });

  it("gets scene stubs correctly", () => {
    const manager = new GameDefinitionManager(getMockGameDef());
    const stubs = manager.getSceneStubs();
    expect(stubs).toEqual(new Set(["deep_forest"]));
  });

  it("gets multiple orphan scenes and stubs correctly", () => {
    const gameDefinition = getMockGameDef();
    // Add another orphan scene (impl)
    gameDefinition.story.scenes["another_orphan"] = {
      type: "impl",
      scene: {
        isCheckpoint: false,
        id: "another_orphan",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [],
      },
    };
    // Add another stub
    gameDefinition.story.scenes["another_stub"] = {
      type: "stub",
      scene: {
        id: "another_stub",
        description: "A secondary stub.",
      },
    };

    const manager = new GameDefinitionManager(gameDefinition);
    expect(manager.getOrphanScenes()).toEqual(
      new Set(["start", "another_orphan", "another_stub"])
    );
    expect(manager.getSceneStubs()).toEqual(
      new Set(["deep_forest", "another_stub"])
    );
  });

  describe("checkpoint logic details", () => {
    it("validates game definition", () => {
      const validDef = getMockGameDef();
      // start has isCheckpoint: true now
      expect(() =>
        GameDefinitionManager.validateGameDefinition(validDef)
      ).not.toThrow();

      // Test invalid start scene checkpoint
      const invalidDef1 = getMockGameDef();
      if (invalidDef1.story.scenes["start"]!.type === "impl") {
        invalidDef1.story.scenes["start"]!.scene.isCheckpoint = false;
        invalidDef1.story.scenes["start"]!.scene.checkpoint = undefined;
      }
      expect(() =>
        GameDefinitionManager.validateGameDefinition(invalidDef1)
      ).toThrow(/must be flagged as a checkpoint/);

      // Test spacing > max distance
      const invalidDef2 = getMockGameDef();
      invalidDef2.minimumCheckpointsSpacing = 10;
      invalidDef2.maximumDistanceFromCheckpoint = 5;
      expect(() =>
        GameDefinitionManager.validateGameDefinition(invalidDef2)
      ).toThrow(/cannot be greater than/);
    });

    it("verifies distance checks and spacing rules", () => {
      const gameDefinition = getMockGameDef();
      if (gameDefinition.story.scenes["start"]!.type === "impl") {
        gameDefinition.story.scenes["start"]!.scene.isCheckpoint = true;
        gameDefinition.story.scenes["start"]!.scene.checkpoint = "interior";
      }
      gameDefinition.minimumCheckpointsSpacing = 3;
      gameDefinition.maximumDistanceFromCheckpoint = 4;
      gameDefinition.thresholdFrontierCheckpointsCount = 1;
      gameDefinition.story.scenes["extra_stub"] = {
        type: "stub",
        scene: {
          id: "extra_stub",
          description: "An extra stub to satisfy the threshold check.",
        },
      };

      const manager = new GameDefinitionManager(gameDefinition);

      // start (C) -> deep_forest (stub) [distance 1]
      // Let's implement deep_forest as a checkpoint (not spaced out enough)
      const badNewScene = {
        id: "deep_forest",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go to cave.",
            label: "Enter cave",
            targetSceneMode: "create-new-scene-stub" as const,
            targetScene: "cave",
            targetSceneDescription: "Dark cave.",
          },
        ],
        isCheckpoint: true,
      };

      expect(() => manager.validateNewScene(badNewScene)).toThrow(
        /too few steps/
      );
      expect(() => manager.addNewScene(badNewScene)).toThrow(/too few steps/);

      // Implement deep_forest without isCheckpoint: true (valid, distance 1 <= 4)
      const okNewScene = { ...badNewScene, isCheckpoint: false };
      expect(manager.validateNewScene(okNewScene)).toBeUndefined();
      manager.addNewScene(okNewScene);

      // Graph is now: start (C, interior) -> deep_forest (impl, distance 1) -> cave (stub, distance 2)
      // Let's validate cave as a checkpoint. Distance is 2, minimumSpacing is 3. Still too close!
      const badCave = {
        id: "cave",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go to deep cave.",
            label: "Enter deep cave",
            targetSceneMode: "create-new-scene-stub" as const,
            targetScene: "deep_cave",
            targetSceneDescription: "Very dark cave.",
          },
        ],
        isCheckpoint: true,
      };
      expect(() => manager.validateNewScene(badCave)).toThrow(
        /must be at least 3 steps away/
      );
      expect(() => manager.addNewScene(badCave)).toThrow(
        /must be at least 3 steps away/
      );

      // Implement cave as a normal scene (distance 2 <= 4, valid)
      manager.addNewScene({ ...badCave, isCheckpoint: false });

      // Graph: start -> deep_forest -> cave -> deep_cave (stub, distance 3)
      // Validate deep_cave as a checkpoint. Distance is 3 >= 3, valid!
      const okDeepCave = {
        id: "deep_cave",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go to underground lake.",
            label: "Go to lake",
            targetSceneMode: "create-new-scene-stub" as const,
            targetScene: "lake",
            targetSceneDescription: "An underground lake.",
          },
        ],
        isCheckpoint: true,
      };
      expect(manager.validateNewScene(okDeepCave)).toBeUndefined();

      // Let's check distance restriction: if we have another choice at distance 5, it should be blocked.
      // Graph: start -> deep_forest -> cave -> deep_cave -> lake (stub, distance 4) -> abyss (stub, distance 5)
      manager.gameDefinition.story.scenes["loose_end"] = {
        type: "stub",
        scene: { id: "loose_end", description: "A loose end stub." },
      };
      manager.addNewScene(okDeepCave); // deep_cave is now frontier checkpoint!

      // Since deep_cave is a frontier checkpoint, the stub immediately targeted by its choice is "lake".
      // Therefore, "lake" cannot be implemented yet!
      const lakeScene = {
        id: "lake",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go to abyss.",
            label: "Enter abyss",
            targetSceneMode: "create-new-scene-stub" as const,
            targetScene: "abyss",
            targetSceneDescription: "The deep abyss.",
          },
        ],
        isCheckpoint: false,
      };

      expect(() => manager.validateNewScene(lakeScene)).toThrow(
        /immediately targeted by a choice of a frontier checkpoint scene/
      );
    });

    it("handles checkpoint refresh logic", () => {
      const gameDefinition = getMockGameDef();
      if (gameDefinition.story.scenes["start"]!.type === "impl") {
        gameDefinition.story.scenes["start"]!.scene.isCheckpoint = true;
        gameDefinition.story.scenes["start"]!.scene.checkpoint = "interior";
      }
      gameDefinition.minimumCheckpointsSpacing = 2;
      gameDefinition.maximumDistanceFromCheckpoint = 4;
      gameDefinition.thresholdFrontierCheckpointsCount = 1;

      const manager = new GameDefinitionManager(gameDefinition);

      // start (C) -> deep_forest (stub) [distance 1]
      // start also has another path: let's add a choice to start targeting "another_stub"
      if (gameDefinition.story.scenes["start"]!.type === "impl") {
        gameDefinition.story.scenes["start"]!.scene.choices.push({
          description: "Go elsewhere.",
          label: "Go elsewhere",
          targetScene: "another_stub",
        });
      }
      gameDefinition.story.scenes["another_stub"] = {
        type: "stub",
        scene: { id: "another_stub", description: "Another location" },
      };

      // Implement deep_forest as a frontier checkpoint.
      // Since distance is 1 and minimumspacing is 2, wait, let's make spacing 1 to allow it!
      gameDefinition.minimumCheckpointsSpacing = 1;

      const res1 = manager.addNewScene({
        id: "deep_forest",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go to cave.",
            label: "Enter cave",
            targetSceneMode: "create-new-scene-stub" as const,
            targetScene: "cave",
            targetSceneDescription: "Dark cave.",
          },
        ],
        isCheckpoint: true,
      });

      // Since "another_stub" is still a stub in the story and is NOT targeted by deep_forest (frontier),
      // refreshedCheckpoints should be false.
      expect(res1.refreshedCheckpoints).toBe(false);
      const entry1 = manager.getSceneEntry("deep_forest");
      expect(entry1.type).toBe("impl");
      if (entry1.type === "impl") {
        expect(entry1.scene.checkpoint).toBe("frontier");
      }

      // Try to implement cave: it's immediately targeted by "deep_forest" (frontier), so it should fail.
      expect(() =>
        manager.validateNewScene({
          id: "cave",
          location: "forest",
          passiveLocationEffects: [],
          passiveCharacterEffects: [],
          script: [],
          choices: [],
          isCheckpoint: false,
        })
      ).toThrow();

      // Now implement the other stub "another_stub" (not targeted by any frontier checkpoints).
      const res2 = manager.addNewScene({
        id: "another_stub",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go back to start.",
            label: "Go back",
            targetSceneMode: "reference-existing-scene" as const,
            targetScene: "start",
          },
        ],
        isCheckpoint: false,
      });

      // Now that all stubs not targeted by frontier checkpoints are implemented,
      // the checkpoint "deep_forest" should be refreshed to "interior".
      expect(res2.refreshedCheckpoints).toBe(true);
      const entry2 = manager.getSceneEntry("deep_forest");
      expect(entry2.type).toBe("impl");
      if (entry2.type === "impl") {
        expect(entry2.scene.checkpoint).toBe("interior");
      }

      // Now we should be allowed to implement "cave"!
      expect(
        manager.validateNewScene({
          id: "cave",
          location: "forest",
          passiveLocationEffects: [],
          passiveCharacterEffects: [],
          script: [],
          choices: [
            {
              description: "Go back to start.",
              label: "Go back",
              targetSceneMode: "reference-existing-scene" as const,
              targetScene: "start",
            },
          ],
          isCheckpoint: false,
        })
      ).toBeUndefined();
    });

    it("enforces maximum frontier checkpoints count", () => {
      const gameDefinition = getMockGameDef();
      if (gameDefinition.story.scenes["start"]!.type === "impl") {
        gameDefinition.story.scenes["start"]!.scene.isCheckpoint = true;
        gameDefinition.story.scenes["start"]!.scene.checkpoint = "interior";
        gameDefinition.story.scenes["start"]!.scene.choices.push({
          description: "Go elsewhere.",
          label: "Go elsewhere",
          targetScene: "another_stub",
        });
      }
      gameDefinition.story.scenes["another_stub"] = {
        type: "stub",
        scene: { id: "another_stub", description: "Another location" },
      };

      gameDefinition.minimumCheckpointsSpacing = 1;
      gameDefinition.maximumDistanceFromCheckpoint = 10;
      gameDefinition.thresholdFrontierCheckpointsCount = 1;

      const manager = new GameDefinitionManager(gameDefinition);

      // Create one frontier checkpoint ("deep_forest").
      // Since "another_stub" is not targeted by "deep_forest" and is still a stub,
      // the checkpoint does NOT refresh and remains a frontier checkpoint.
      manager.addNewScene({
        id: "deep_forest",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go to cave.",
            label: "Enter cave",
            targetSceneMode: "create-new-scene-stub" as const,
            targetScene: "cave",
            targetSceneDescription: "Dark cave.",
          },
        ],
        isCheckpoint: true,
      });

      // Now we have 1 frontier checkpoint ("deep_forest"), which is the maximum.
      // If we try to implement "another_stub" as a checkpoint, it should fail with a maximum count error!
      const badAnother = {
        id: "another_stub",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go to deep cave.",
            label: "Enter deep cave",
            targetSceneMode: "create-new-scene-stub" as const,
            targetScene: "deep_cave",
            targetSceneDescription: "Deep dark cave.",
          },
        ],
        isCheckpoint: true,
      };

      expect(() => manager.validateNewScene(badAnother)).toThrow(
        /maximum allowed is 1/
      );
    });

    it("enforces that ending scenes can only be created with enough frontier checkpoints", () => {
      const gameDefinition = getMockGameDef();
      gameDefinition.thresholdFrontierCheckpointsCount = 3;
      const manager = new GameDefinitionManager(gameDefinition);

      // The current count of frontier checkpoints is 0.
      // So creating an ending scene at "deep_forest" (which is a stub) should fail.
      const endingScene = {
        id: "deep_forest",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [], // 0 choices -> ending scene
        isCheckpoint: false,
      };

      expect(() => manager.validateNewScene(endingScene)).toThrow(
        /A new ending scene can only be created if there are already 3 frontier checkpoints/
      );
    });

    it("allows implementing a final ending even when it would otherwise reduce open stubs below the required threshold", () => {
      const gameDefinition = getMockGameDef();
      gameDefinition.thresholdFrontierCheckpointsCount = 2;
      gameDefinition.minimumDistanceToFinalEnding = 1;
      gameDefinition.minimumCheckpointsSpacing = 1;

      // Add a frontier checkpoint "frontier_cp" targeting "deep_forest" (which is a stub)
      gameDefinition.story.scenes["frontier_cp"] = {
        type: "impl",
        scene: {
          id: "frontier_cp",
          location: "forest",
          passiveLocationEffects: [],
          passiveCharacterEffects: [],
          script: [],
          choices: [
            {
              description: "Go to deep forest.",
              label: "Enter deep forest",
              targetScene: "deep_forest",
            },
          ],
          isCheckpoint: true,
          checkpoint: "frontier",
        },
      };

      // Add an independent stub "independent_stub" that we want to implement
      gameDefinition.story.scenes["independent_stub"] = {
        type: "stub",
        scene: {
          id: "independent_stub",
          description: "An independent stub scene.",
        },
      };

      const manager = new GameDefinitionManager(gameDefinition);

      // We implement "independent_stub" as a final ending (isCheckpoint: true, 0 choices)
      const finalEndingScene = {
        id: "independent_stub",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [], // 0 choices -> ending
        isCheckpoint: true, // checkpoint -> final ending
      };

      // This should validate successfully!
      expect(() => manager.validateNewScene(finalEndingScene)).not.toThrow();
    });

    it("enforces that frontier checkpoints near start have at least one stub choice", () => {
      const gameDefinition = getMockGameDef();
      gameDefinition.minimumDistanceToFinalEnding = 3;
      gameDefinition.thresholdFrontierCheckpointsCount = 1;
      gameDefinition.story.scenes["extra_stub"] = {
        type: "stub",
        scene: {
          id: "extra_stub",
          description: "An extra stub to satisfy the threshold check.",
        },
      };
      const manager = new GameDefinitionManager(gameDefinition);

      // "deep_forest" is at distance 1 from "start" (start -> deep_forest is 1 step).
      // Since 1 < 3 (minimumDistanceToFinalEnding), if we try to make "deep_forest" a checkpoint,
      // it must have at least one choice with "create-new-scene-stub".
      // Let's try to make it a checkpoint with only "reference-existing-scene" (or no choices).
      const badCheckpoint = {
        id: "deep_forest",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go back to start.",
            label: "Go back",
            targetSceneMode: "reference-existing-scene" as const,
            targetScene: "start",
          },
        ],
        isCheckpoint: true,
      };

      expect(() => manager.validateNewScene(badCheckpoint)).toThrow(
        /is a frontier checkpoint less than 3 steps from the start.*must have at least one choice with 'create-new-scene-stub'/
      );

      // With a "create-new-scene-stub" choice, it should pass this check.
      const okCheckpoint = {
        id: "deep_forest",
        location: "forest",
        passiveLocationEffects: [],
        passiveCharacterEffects: [],
        script: [],
        choices: [
          {
            description: "Go to cave.",
            label: "Enter cave",
            targetSceneMode: "create-new-scene-stub" as const,
            targetScene: "cave",
            targetSceneDescription: "Dark cave.",
          },
        ],
        isCheckpoint: true,
      };

      // Since we set spacing to 4, okCheckpoint would fail the spacing check instead if spacing is 4.
      // Let's set minimumCheckpointsSpacing to 1 to test only the stub choice rule.
      gameDefinition.minimumCheckpointsSpacing = 1;
      expect(manager.validateNewScene(okCheckpoint)).toBeUndefined();
    });
  });

  describe("loadGameBundle", () => {
    it("successfully loads a game bundle from a zip", async () => {
      const mockGameDef = getMockGameDef();

      const blobWriter = new BlobWriter("application/zip");
      const zipWriter = new ZipWriter(blobWriter);

      // 1. Add gameDefinition.json
      await zipWriter.add(
        "gameDefinition.json",
        new TextReader(JSON.stringify(mockGameDef))
      );

      // 2. Add Hero image
      await zipWriter.add(
        "gameAssets/characters/Hero/image.png",
        new Uint8ArrayReader(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))
      );

      // 3. Add Hero passive float effect image and audio
      await zipWriter.add(
        "gameAssets/characters/Hero/passiveEffects/float/image.png",
        new Uint8ArrayReader(new Uint8Array([1, 2, 3]))
      );
      await zipWriter.add(
        "gameAssets/characters/Hero/passiveEffects/float/audio.mp3",
        new Uint8ArrayReader(new Uint8Array([4, 5, 6]))
      );

      // 4. Add Hero instance jump effect image
      await zipWriter.add(
        "gameAssets/characters/Hero/instanceEffects/jump/image.png",
        new Uint8ArrayReader(new Uint8Array([7, 8, 9]))
      );

      // 5. Add Forest location image
      await zipWriter.add(
        "gameAssets/locations/forest/image.jpg",
        new Uint8ArrayReader(new Uint8Array([255, 216, 255]))
      );

      // 6. Add Forest passive rain effect audio
      await zipWriter.add(
        "gameAssets/locations/forest/passiveEffects/rain/audio.mp3",
        new Uint8ArrayReader(new Uint8Array([10, 11, 12]))
      );

      // Close the zip
      await zipWriter.close();

      const zipBlob = await blobWriter.getData();
      const reader = new BlobReader(zipBlob);

      // Load bundle!
      const bundle = await loadGameBundle(reader);

      // Validate the returned object structure
      expect(bundle).toBeDefined();
      expect(bundle.gameDefinition).toEqual(mockGameDef);

      // Hero character assets should be populated
      const heroAssets = bundle.gameAssets.characters["Hero"]!;
      expect(heroAssets).toBeDefined();
      expect(heroAssets.image).toContain("data:image/png;base64,");

      // Hero passive float effect should be populated
      expect(heroAssets.passiveEffects.float.image).toContain(
        "data:image/png;base64,"
      );
      expect(heroAssets.passiveEffects.float.sound).toContain(
        "data:audio/mpeg;base64,"
      );

      // Hero instant jump effect (mapped from instanceEffects) should be populated
      expect(heroAssets.instantEffects.jump.image).toContain(
        "data:image/png;base64,"
      );

      // Hero other effects should be empty objects to satisfy schema
      expect(heroAssets.passiveEffects.spin).toEqual({});
      expect(heroAssets.instantEffects.happy).toEqual({});

      // Forest location assets should be populated
      const forestAssets = bundle.gameAssets.locations["forest"]!;
      expect(forestAssets).toBeDefined();
      expect(forestAssets.image).toContain("data:image/jpeg;base64,");
      expect(forestAssets.passiveEffects.rain.sound).toContain(
        "data:audio/mpeg;base64,"
      );

      // Forest other effects should be empty objects to satisfy schema
      expect(forestAssets.passiveEffects.sunny).toEqual({});
    });

    it("throws an error if gameDefinition.json is missing", async () => {
      const blobWriter = new BlobWriter("application/zip");
      const zipWriter = new ZipWriter(blobWriter);
      await zipWriter.add("otherfile.txt", new TextReader("hello"));
      await zipWriter.close();

      const zipBlob = await blobWriter.getData();
      const reader = new BlobReader(zipBlob);

      await expect(loadGameBundle(reader)).rejects.toThrow(
        /Missing gameDefinition.json/
      );
    });
  });
});
