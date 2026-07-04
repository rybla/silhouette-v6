import { describe, expect, it, afterEach } from "vitest";
import { BasicDesignerAgentImpl } from "@/core/agents/DesignerAgentV1";
import fs from "fs";
import path from "path";

describe("BasicDesignerAgent", () => {
  const tempStateFile = path.join(process.cwd(), "temp-state-test.json");

  afterEach(() => {
    if (fs.existsSync(tempStateFile)) {
      fs.unlinkSync(tempStateFile);
    }
  });

  it("can be instantiated and returns config", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    expect(config.systemPrompt).toContain("game designer");
    expect(config.tools.length).toBeGreaterThan(0);
  });

  it("list_scene_stubs tool works correctly", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const getStubsTool = config.tools.find(
      (t) => t.name === "list_scene_stubs"
    );
    expect(getStubsTool).toBeDefined();

    const result = await getStubsTool!.execute("toolCallId", {});
    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain("Open Scene Stubs");
      expect(firstContent.text).toContain("Locked Scene Stubs");
      expect(firstContent.text).toContain('"start"');
    } else {
      expect.fail("Expected a text content element");
    }
  });

  it("inspect_scene_context tool works correctly", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const contextTool = config.tools.find(
      (t) => t.name === "inspect_scene_context"
    );
    expect(contextTool).toBeDefined();

    const result = await contextTool!.execute("toolCallId", { id: "start" });
    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain('### Scene: "start"');
      expect(firstContent.text).toContain("An ancient stone gate.");
    } else {
      expect.fail("Expected a text content element");
    }
  });

  it("list_characters tool works correctly", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const getCharactersTool = config.tools.find(
      (t) => t.name === "list_characters"
    );
    expect(getCharactersTool).toBeDefined();

    const result = await getCharactersTool!.execute("toolCallId", {});
    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain(
        "There are no characters in the story."
      );
    } else {
      expect.fail("Expected a text content element");
    }
  });

  it("list_locations tool works correctly", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const getLocationsTool = config.tools.find(
      (t) => t.name === "list_locations"
    );
    expect(getLocationsTool).toBeDefined();

    const result = await getLocationsTool!.execute("toolCallId", {});
    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain(
        "There are no locations in the story."
      );
    } else {
      expect.fail("Expected a text content element");
    }
  });

  it("list_scenes tool works correctly", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const getScenesTool = config.tools.find((t) => t.name === "list_scenes");
    expect(getScenesTool).toBeDefined();

    const result = await getScenesTool!.execute("toolCallId", {});
    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain("Scenes");
      expect(firstContent.text).toContain('"start"');
    } else {
      expect.fail("Expected a text content element");
    }
  });

  it("create_character tool works correctly", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const createCharacterTool = config.tools.find(
      (t) => t.name === "create_character"
    );
    expect(createCharacterTool).toBeDefined();

    const result = await createCharacterTool!.execute("toolCallId", {
      name: "Villain",
      vignette: "A mysterious figure in dark armor.",
      appearanceDescription: "Red glowing eyes.",
      backstoryDescription: "Exiled from his kingdom long ago.",
    });

    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain("Successfully created new character");
      expect(firstContent.text).toContain('"Villain"');
    } else {
      expect.fail("Expected a text content element");
    }

    // Verify it is saved in state and can be listed
    const getCharactersTool = config.tools.find(
      (t) => t.name === "list_characters"
    );
    expect(getCharactersTool).toBeDefined();

    const listResult = await getCharactersTool!.execute("toolCallId", {});
    const listContent = listResult.content[0];
    if (listContent && listContent.type === "text") {
      expect(listContent.text).toContain('"Villain"');
    } else {
      expect.fail("Expected a text content element");
    }
  });

  it("create_location tool works correctly", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const createLocationTool = config.tools.find(
      (t) => t.name === "create_location"
    );
    expect(createLocationTool).toBeDefined();

    const result = await createLocationTool!.execute("toolCallId", {
      name: "castle",
      vignette: "A majestic fortress atop a rocky hill.",
      appearanceDescription: "Stone walls and soaring towers.",
      backstoryDescription: "Built by the ancient kings.",
    });

    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain("Successfully created new location");
      expect(firstContent.text).toContain('"castle"');
    } else {
      expect.fail("Expected a text content element");
    }

    // Verify it is saved in state and can be listed
    const getLocationsTool = config.tools.find(
      (t) => t.name === "list_locations"
    );
    expect(getLocationsTool).toBeDefined();

    const listResult = await getLocationsTool!.execute("toolCallId", {});
    const listContent = listResult.content[0];
    if (listContent && listContent.type === "text") {
      expect(listContent.text).toContain('"castle"');
    } else {
      expect.fail("Expected a text content element");
    }
  });

  it("implement_scene_stub warning for max distance", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const implementTool = config.tools.find(
      (t) => t.name === "implement_scene_stub"
    );
    expect(implementTool).toBeDefined();

    // Create the location first
    const createLocationTool = config.tools.find(
      (t) => t.name === "create_location"
    );
    await createLocationTool!.execute("toolCallId", {
      name: "gate",
      vignette: "gate vignette",
      appearanceDescription: "gate appearance",
      backstoryDescription: "gate backstory",
    });

    // Set maximumDistanceFromCheckpoint to 1
    agent.gameDefinitionManager.gameDefinition.maximumDistanceFromCheckpoint = 1;
    agent.gameDefinitionManager.gameDefinition.thresholdFrontierCheckpointsCount = 1;

    // Implement start
    const result = await implementTool!.execute("toolCallId", {
      id: "start",
      location: "gate",
      passiveLocationEffects: [],
      passiveCharacterEffects: [],
      script: [
        {
          type: "narration",
          content: "You are at the gate.",
          instantLocationEffects: [],
          instantCharacterEffects: [],
        },
      ],
      choices: [
        {
          description: "Go left.",
          label: "Left",
          targetSceneMode: "create-new-scene-stub",
          targetScene: "left-stub",
          targetSceneDescription: "Left stub",
        },
      ],
      isCheckpoint: true,
    });

    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain(
        "Warning: Each of those new scene stubs must either (1) be checkpoints, (2) be endings, or (3) target only existing scenes."
      );
    } else {
      expect.fail("Expected a text content element");
    }
  });

  it("implement_scene_stub warning for frontier checkpoint locking", async () => {
    const agent = new BasicDesignerAgentImpl({
      init: { startDescription: "An ancient stone gate." },
      stateFilepath: tempStateFile,
    });

    const config = await agent.config();
    const implementTool = config.tools.find(
      (t) => t.name === "implement_scene_stub"
    );
    expect(implementTool).toBeDefined();

    // Create the location first
    const createLocationTool = config.tools.find(
      (t) => t.name === "create_location"
    );
    await createLocationTool!.execute("toolCallId", {
      name: "gate",
      vignette: "gate vignette",
      appearanceDescription: "gate appearance",
      backstoryDescription: "gate backstory",
    });

    // Add another stub so checkpoints don't refresh immediately
    agent.gameDefinitionManager.gameDefinition.thresholdFrontierCheckpointsCount = 1;
    agent.gameDefinitionManager.addSceneStub({
      id: "other-stub",
      description: "Another loose end.",
    });

    // Implement start as a checkpoint with a new stub choice
    const result = await implementTool!.execute("toolCallId", {
      id: "start",
      location: "gate",
      passiveLocationEffects: [],
      passiveCharacterEffects: [],
      script: [
        {
          type: "narration",
          content: "You are at the gate.",
          instantLocationEffects: [],
          instantCharacterEffects: [],
        },
      ],
      choices: [
        {
          description: "Go left.",
          label: "Left",
          targetSceneMode: "create-new-scene-stub",
          targetScene: "left-stub",
          targetSceneDescription: "Left stub",
        },
      ],
      isCheckpoint: true,
    });

    const firstContent = result.content[0];
    if (firstContent && firstContent.type === "text") {
      expect(firstContent.text).toContain(
        "Warning: Any new scene stubs just created are locked until all other non-locked scene stubs are implemented."
      );
    } else {
      expect.fail("Expected a text content element");
    }
  });
});
