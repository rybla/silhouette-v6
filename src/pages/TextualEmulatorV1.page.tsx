import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Text,
  Title,
  Button,
  Card,
  Badge,
  ScrollArea,
  Group,
  Stack,
  Divider,
  Select,
  Tooltip,
  FileInput,
  Alert,
} from "@mantine/core";
import {
  MapPin,
  User,
  ArrowClockwise,
  BookOpen,
  ChatTeardrop,
  Sparkle,
  Hourglass,
  Clock,
  Warning,
  Play,
  UploadSimple,
} from "@phosphor-icons/react";
import classes from "@/pages/TextualEmulatorV1.module.css";
import Schema from "typebox/schema";

import {
  GameDefinition,
  GameState,
  GameStateManager,
  GameDefinitionManager,
  ScriptPart,
  Choice,
  SceneEntry,
  printCharacterName,
  printLocationName,
} from "@/core/ontology";

const exampleFiles = import.meta.glob<{ gameDefinition: GameDefinition }>(
  "../examples/*-state.json",
  { eager: true }
);

const defaultGames = Object.entries(exampleFiles)
  .map(([path, module]) => {
    const filename = path.split("/").pop() || "";
    const base = filename.replace("-state.json", "");
    const match = base.match(/^(.*)-v(\d+(?:-\d+)*)$/);
    const name = match
      ? (() => {
          const namePart = match[1]!;
          const versionPart = match[2]!;
          let displayName = namePart
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          if (displayName === "Zombies") {
            displayName = "Zombies Outbreak";
          }
          return `${displayName} (v${versionPart})`;
        })()
      : base
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

    return {
      name,
      gameDefinition: module.gameDefinition,
    };
  })
  .sort((a, b) => {
    const aIsZombie = a.name.startsWith("Zombies");
    const bIsZombie = b.name.startsWith("Zombies");
    if (aIsZombie && !bIsZombie) return -1;
    if (!aIsZombie && bIsZombie) return 1;
    return a.name.localeCompare(b.name);
  });

interface ShownScriptPart {
  type: "script";
  part: ScriptPart;
  sceneId: string;
  index: number;
}

interface ShownChoiceSelection {
  type: "choices";
  sceneId: string;
  choices: Choice[];
  selectedLabel?: string;
}

interface ShownEnding {
  type: "ending";
  sceneId: string;
}

type TranscriptItem = ShownScriptPart | ShownChoiceSelection | ShownEnding;

// Helper to get a consistent color theme for characters to make dialogue highly readable
const getCharacterColor = (name: string): string => {
  const colors = [
    "blue",
    "teal",
    "grape",
    "orange",
    "indigo",
    "violet",
    "pink",
    "cyan",
    "green",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index] || "gray";
};

export function TextualEmulatorV1() {
  const [customGames, setCustomGames] = useState<
    { name: string; gameDefinition: GameDefinition }[]
  >([]);
  const [selectedGameIndex, setSelectedGameIndex] = useState<string>("0");

  const allGames = useMemo(
    () => [...defaultGames, ...customGames],
    [customGames]
  );

  const activeGame = useMemo(() => {
    const idx = parseInt(selectedGameIndex, 10);
    return allGames[idx] || defaultGames[0];
  }, [allGames, selectedGameIndex]);

  const gameDefinition: GameDefinition = activeGame
    ? activeGame.gameDefinition
    : defaultGames[0]!.gameDefinition;

  // Managers and active state
  const gameDefinitionManager = useMemo(
    () => new GameDefinitionManager(gameDefinition),
    [gameDefinition]
  );

  const [gameState, setGameState] = useState<GameState>(() => {
    const initialGame = defaultGames[0]!.gameDefinition;
    return {
      currentScene: initialGame.story.start,
      history: [],
    };
  });

  const [currentScene, setCurrentScene] = useState<SceneEntry>(() => {
    const initialGame = defaultGames[0]!.gameDefinition;
    return initialGame.story.scenes[initialGame.story.start]!;
  });

  const [transcript, setTranscript] = useState<TranscriptItem[]>(() => {
    const initialGame = defaultGames[0]!.gameDefinition;
    const startId = initialGame.story.start;
    const startEntry = initialGame.story.scenes[startId]!;
    if (startEntry.type === "impl") {
      const script = startEntry.scene.script || [];
      const list: TranscriptItem[] = [];
      if (script.length > 0) {
        list.push({
          type: "script",
          part: script[0]!,
          sceneId: startId,
          index: 0,
        });

        if (script.length === 1) {
          const choices = startEntry.scene.choices || [];
          if (choices.length > 0) {
            list.push({
              type: "choices",
              sceneId: startId,
              choices,
            });
          } else {
            list.push({
              type: "ending",
              sceneId: startId,
            });
          }
        }
      } else {
        const choices = startEntry.scene.choices || [];
        if (choices.length > 0) {
          list.push({
            type: "choices",
            sceneId: startId,
            choices,
          });
        } else {
          list.push({
            type: "ending",
            sceneId: startId,
          });
        }
      }
      return list;
    }
    return [];
  });

  const [scriptIndex, setScriptIndex] = useState<number>(() => {
    const initialGame = defaultGames[0]!.gameDefinition;
    const startId = initialGame.story.start;
    const startEntry = initialGame.story.scenes[startId]!;
    if (startEntry.type === "impl") {
      const script = startEntry.scene.script || [];
      if (script.length > 0) {
        return 1;
      }
    }
    return 0;
  });

  const [isWaitingForChoice, setIsWaitingForChoice] = useState<boolean>(() => {
    const initialGame = defaultGames[0]!.gameDefinition;
    const startId = initialGame.story.start;
    const startEntry = initialGame.story.scenes[startId]!;
    if (startEntry.type === "impl") {
      const script = startEntry.scene.script || [];
      const choices = startEntry.scene.choices || [];
      return script.length <= 1 && choices.length > 0;
    }
    return false;
  });

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Setup / reset story
  const loadGame = useCallback((targetDef: GameDefinition) => {
    const initSceneId = targetDef.story.start;
    const startEntry = targetDef.story.scenes[initSceneId]!;

    setGameState({
      currentScene: initSceneId,
      history: [],
    });
    setCurrentScene(startEntry);
    setIsWaitingForChoice(false);

    if (startEntry.type === "impl") {
      const script = startEntry.scene.script || [];
      if (script.length > 0) {
        setTranscript([
          {
            type: "script",
            part: script[0]!,
            sceneId: initSceneId,
            index: 0,
          },
        ]);
        setScriptIndex(1);

        if (script.length === 1) {
          const choices = startEntry.scene.choices || [];
          if (choices.length > 0) {
            setIsWaitingForChoice(true);
            setTranscript((prev) => [
              ...prev,
              {
                type: "choices",
                sceneId: initSceneId,
                choices,
              },
            ]);
          } else {
            setTranscript((prev) => [
              ...prev,
              {
                type: "ending",
                sceneId: initSceneId,
              },
            ]);
          }
        }
      } else {
        setTranscript([]);
        setScriptIndex(0);
        const choices = startEntry.scene.choices || [];
        if (choices.length > 0) {
          setIsWaitingForChoice(true);
          setTranscript([
            {
              type: "choices",
              sceneId: initSceneId,
              choices,
            },
          ]);
        } else {
          setTranscript([
            {
              type: "ending",
              sceneId: initSceneId,
            },
          ]);
        }
      }
    } else {
      // Stub scene
      setTranscript([]);
      setScriptIndex(0);
    }
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript.length]);

  // Reveal next script part
  const revealNextPart = useCallback(() => {
    if (!currentScene || currentScene.type !== "impl") return;

    const script = currentScene.scene.script || [];
    if (isWaitingForChoice) return;

    if (scriptIndex < script.length) {
      const part = script[scriptIndex]!;
      setTranscript((prev) => [
        ...prev,
        {
          type: "script",
          part,
          sceneId: currentScene.scene.id,
          index: scriptIndex,
        },
      ]);
      const nextIndex = scriptIndex + 1;
      setScriptIndex(nextIndex);

      if (nextIndex === script.length) {
        const choices = currentScene.scene.choices || [];
        if (choices.length > 0) {
          setIsWaitingForChoice(true);
          setTranscript((prev) => [
            ...prev,
            {
              type: "choices",
              sceneId: currentScene.scene.id,
              choices,
            },
          ]);
        } else {
          setTranscript((prev) => [
            ...prev,
            {
              type: "ending",
              sceneId: currentScene.scene.id,
            },
          ]);
        }
      }
    }
  }, [currentScene, scriptIndex, isWaitingForChoice]);

  // Make a choice
  const selectChoice = useCallback(
    (choice: Choice) => {
      if (!currentScene || currentScene.type !== "impl") return;

      // Lock the choices block in transcript
      setTranscript((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          const item = copy[i];
          if (item && item.type === "choices") {
            copy[i] = {
              ...item,
              selectedLabel: choice.label,
            };
            break;
          }
        }
        return copy;
      });

      try {
        const manager = new GameStateManager(gameDefinition, gameState);
        manager.choose(choice.label);

        setGameState({ ...manager.gameState });
        setIsWaitingForChoice(false);

        const nextSceneEntry =
          gameDefinition.story.scenes[manager.gameState.currentScene]!;
        setCurrentScene(nextSceneEntry);
        setScriptIndex(0);

        if (nextSceneEntry.type === "impl") {
          const nextScript = nextSceneEntry.scene.script || [];
          if (nextScript.length > 0) {
            setTranscript((prev) => [
              ...prev,
              {
                type: "script",
                part: nextScript[0]!,
                sceneId: nextSceneEntry.scene.id,
                index: 0,
              },
            ]);
            setScriptIndex(1);

            if (nextScript.length === 1) {
              const nextChoices = nextSceneEntry.scene.choices || [];
              if (nextChoices.length > 0) {
                setIsWaitingForChoice(true);
                setTranscript((prev) => [
                  ...prev,
                  {
                    type: "choices",
                    sceneId: nextSceneEntry.scene.id,
                    choices: nextChoices,
                  },
                ]);
              } else {
                setTranscript((prev) => [
                  ...prev,
                  {
                    type: "ending",
                    sceneId: nextSceneEntry.scene.id,
                  },
                ]);
              }
            }
          } else {
            const nextChoices = nextSceneEntry.scene.choices || [];
            if (nextChoices.length > 0) {
              setIsWaitingForChoice(true);
              setTranscript((prev) => [
                ...prev,
                {
                  type: "choices",
                  sceneId: nextSceneEntry.scene.id,
                  choices: nextChoices,
                },
              ]);
            } else {
              setTranscript((prev) => [
                ...prev,
                {
                  type: "ending",
                  sceneId: nextSceneEntry.scene.id,
                },
              ]);
            }
          }
        }
      } catch (err) {
        console.error("Error making choice:", err);
      }
    },
    [gameDefinition, gameState, currentScene]
  );

  // Bind Keyboard controls (Space for next part, 1-9 for choices, R for restart)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (
          currentScene &&
          currentScene.type === "impl" &&
          !isWaitingForChoice
        ) {
          const script = currentScene.scene.script || [];
          if (scriptIndex < script.length) {
            revealNextPart();
          }
        }
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        loadGame(gameDefinition);
      } else {
        const num = parseInt(event.key, 10);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          if (
            isWaitingForChoice &&
            currentScene &&
            currentScene.type === "impl"
          ) {
            const choices = currentScene.scene.choices || [];
            const index = num - 1;
            if (index >= 0 && index < choices.length) {
              event.preventDefault();
              selectChoice(choices[index]!);
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    currentScene,
    isWaitingForChoice,
    scriptIndex,
    revealNextPart,
    selectChoice,
    gameDefinition,
    loadGame,
  ]);

  // File Upload handler
  const handleCustomFileUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(
          e.target?.result as string
        ) as unknown as Record<string, unknown>;
        let rawDef: unknown = null;
        if (json && typeof json === "object") {
          if ("gameDefinition" in json) {
            rawDef = json["gameDefinition"];
          } else if ("story" in json) {
            rawDef = json;
          }
        }

        if (rawDef) {
          const loadedDef = Schema.Compile(GameDefinition).Parse(rawDef);
          const newName = `Uploaded: ${file.name.replace(/\.[^/.]+$/, "")}`;
          const newGameObj = { name: newName, gameDefinition: loadedDef };
          setCustomGames((prev) => [...prev, newGameObj]);
          // Auto select the new game which will be at index `allGames.length`
          const nextIndexStr = (
            defaultGames.length + customGames.length
          ).toString();
          setSelectedGameIndex(nextIndexStr);
          loadGame(loadedDef);
        } else {
          alert(
            "Invalid game definition file structure. Must contain 'gameDefinition' or 'story' with start and scenes."
          );
        }
      } catch (err) {
        alert(`Failed to load file: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  // Render left sidebar history log
  const renderHistorySidebar = () => {
    if (gameState.history.length === 0) {
      return (
        <Text className={classes["emptyHistoryText"]} size="sm">
          Your path is empty. Press Space to reveal the scene and make your
          first choice.
        </Text>
      );
    }

    return (
      <Stack gap="sm">
        {gameState.history.map((h) => {
          const sourceSceneEntry = gameDefinition.story.scenes[h.scene];
          const sourceLocation =
            sourceSceneEntry && sourceSceneEntry.type === "impl"
              ? sourceSceneEntry.scene.location
              : "Unknown Location";

          // Find choice target scene
          const targetSceneId =
            sourceSceneEntry && sourceSceneEntry.type === "impl"
              ? sourceSceneEntry.scene.choices.find((c) => c.label === h.choice)
                  ?.targetScene
              : undefined;

          const targetSceneEntry = targetSceneId
            ? gameDefinition.story.scenes[targetSceneId]
            : undefined;
          const targetLocation =
            targetSceneEntry && targetSceneEntry.type === "impl"
              ? targetSceneEntry.scene.location
              : undefined;

          const stepNum = gameState.history.indexOf(h) + 1;

          return (
            <Card
              key={`step-${h.scene}-${h.choice}`}
              shadow="xs"
              padding="sm"
              radius="md"
              withBorder
              className={classes["historyStepCard"]}
            >
              <Group justify="space-between" align="center" mb="xs">
                <Badge color="blue" variant="light" size="xs">
                  Step {stepNum}
                </Badge>
                <Text
                  size="xs"
                  c="dimmed"
                  style={{ display: "flex", alignItems: "center", gap: "2px" }}
                >
                  <Clock size={12} /> {h.scene}
                </Text>
              </Group>

              <Stack gap="xs">
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    style={{ letterSpacing: "0.2px" }}
                  >
                    LOCATION
                  </Text>
                  <Text size="sm" fw={600}>
                    📍 {printLocationName(sourceLocation)}
                  </Text>
                </div>

                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    style={{ letterSpacing: "0.2px" }}
                  >
                    CHOICE MADE
                  </Text>
                  <Text
                    size="xs"
                    fs="italic"
                    c="blue.7"
                    style={{ wordBreak: "break-word", fontWeight: 600 }}
                  >
                    "{h.choice}"
                  </Text>
                </div>

                {targetLocation && (
                  <div>
                    <Text
                      size="xs"
                      fw={700}
                      c="dimmed"
                      style={{ letterSpacing: "0.2px" }}
                    >
                      MOVED TO
                    </Text>
                    <Text size="sm" fw={600} c="green.7">
                      📍 {printLocationName(targetLocation)}
                    </Text>
                  </div>
                )}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    );
  };

  // Render right sidebar Location details
  const renderLocationDetails = () => {
    if (!currentScene || currentScene.type !== "impl") {
      return (
        <Text size="sm" c="dimmed" fs="italic">
          Location details unavailable.
        </Text>
      );
    }

    const locationName = currentScene.scene.location;
    let locInfo = null;
    try {
      locInfo = gameDefinitionManager.getLocation(locationName);
    } catch {
      // Not defined
    }

    return (
      <Stack gap="md">
        <Card padding="md" radius="md" withBorder shadow="xs">
          <Text
            size="xs"
            fw={700}
            c="dimmed"
            style={{ letterSpacing: "0.5px" }}
            mb={4}
          >
            LOCATION NAME
          </Text>
          <Text size="md" fw={800} c="blue.7" mb="xs">
            📍 {printLocationName(locationName)}
          </Text>

          {locInfo ? (
            <Stack gap="xs">
              {locInfo.vignette && (
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    style={{ letterSpacing: "0.5px" }}
                  >
                    VIGNETTE
                  </Text>
                  <Text size="sm" style={{ lineHeight: 1.5 }}>
                    {locInfo.vignette}
                  </Text>
                </div>
              )}

              <Divider my="xs" />

              {locInfo.appearanceDescription && (
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    style={{ letterSpacing: "0.5px" }}
                  >
                    APPEARANCE
                  </Text>
                  <Text size="sm" style={{ lineHeight: 1.5 }}>
                    {locInfo.appearanceDescription}
                  </Text>
                </div>
              )}

              {locInfo.backstoryDescription && (
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    style={{ letterSpacing: "0.5px" }}
                  >
                    BACKSTORY
                  </Text>
                  <Text size="sm" style={{ lineHeight: 1.5 }} c="dimmed">
                    {locInfo.backstoryDescription}
                  </Text>
                </div>
              )}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed" fs="italic">
              No additional ontological details found for this location.
            </Text>
          )}
        </Card>

        {/* Scene Passive Effects */}
        <Card padding="md" radius="md" withBorder shadow="xs">
          <Text
            size="xs"
            fw={700}
            c="dimmed"
            style={{ letterSpacing: "0.5px" }}
            mb="xs"
          >
            PASSIVE ENVIRONMENT EFFECTS
          </Text>
          {currentScene.scene.passiveLocationEffects &&
          currentScene.scene.passiveLocationEffects.length > 0 ? (
            <Group gap="xs">
              {currentScene.scene.passiveLocationEffects.map((eff) => (
                <Badge
                  key={`passive-loc-${eff}`}
                  color="orange"
                  variant="light"
                  size="sm"
                  leftSection={<Sparkle size={10} />}
                >
                  {eff}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed" fs="italic">
              No passive environmental effects.
            </Text>
          )}
        </Card>
      </Stack>
    );
  };

  // Render right sidebar Characters details
  const renderCharacterDetails = () => {
    if (!currentScene || currentScene.type !== "impl") {
      return (
        <Text size="sm" c="dimmed" fs="italic">
          Character details unavailable.
        </Text>
      );
    }

    const charNames = Array.from(
      gameDefinitionManager.getCharactersInScene(currentScene.scene.id)
    );

    if (charNames.length === 0) {
      return (
        <Card padding="md" radius="md" withBorder shadow="xs">
          <Text size="sm" c="dimmed" fs="italic" ta="center">
            No characters are currently present in this scene.
          </Text>
        </Card>
      );
    }

    return (
      <Stack gap="md">
        {charNames.map((name) => {
          let charInfo = null;
          try {
            charInfo = gameDefinitionManager.getCharacter(name);
          } catch {
            // Not defined
          }

          const charEffects =
            currentScene.scene.passiveCharacterEffects
              ?.filter((e) => e.character === name)
              .map((e) => e.effect) || [];

          const charThemeColor = getCharacterColor(name);

          return (
            <Card
              key={name}
              padding="md"
              radius="md"
              withBorder
              shadow="xs"
              style={{
                borderTop: `4px solid var(--mantine-color-${charThemeColor}-filled)`,
              }}
            >
              <Group justify="space-between" align="center" mb="xs">
                <Text
                  size="sm"
                  fw={800}
                  c={`${charThemeColor}.7`}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <User size={14} /> {printCharacterName(name)}
                </Text>
                {charEffects.length > 0 && (
                  <Group gap="xs">
                    {charEffects.map((eff) => (
                      <Badge
                        key={`char-passive-${eff}`}
                        color="teal"
                        size="xs"
                        variant="light"
                      >
                        {eff}
                      </Badge>
                    ))}
                  </Group>
                )}
              </Group>

              {charInfo ? (
                <Stack gap="xs">
                  {charInfo.vignette && (
                    <div>
                      <Text
                        size="xs"
                        fw={700}
                        c="dimmed"
                        style={{ letterSpacing: "0.2px" }}
                      >
                        SUMMARY
                      </Text>
                      <Text size="xs" style={{ lineHeight: 1.4 }}>
                        {charInfo.vignette}
                      </Text>
                    </div>
                  )}

                  {charInfo.appearanceDescription && (
                    <div>
                      <Text
                        size="xs"
                        fw={700}
                        c="dimmed"
                        style={{ letterSpacing: "0.2px" }}
                      >
                        APPEARANCE
                      </Text>
                      <Text size="xs" style={{ lineHeight: 1.4 }}>
                        {charInfo.appearanceDescription}
                      </Text>
                    </div>
                  )}

                  {charInfo.backstoryDescription && (
                    <div>
                      <Text
                        size="xs"
                        fw={700}
                        c="dimmed"
                        style={{ letterSpacing: "0.2px" }}
                      >
                        BACKSTORY
                      </Text>
                      <Text size="xs" style={{ lineHeight: 1.4 }} c="dimmed">
                        {charInfo.backstoryDescription}
                      </Text>
                    </div>
                  )}
                </Stack>
              ) : (
                <Text size="xs" c="dimmed" fs="italic">
                  No biography found in story characters database.
                </Text>
              )}
            </Card>
          );
        })}
      </Stack>
    );
  };

  // Render transcript items
  const renderTranscriptItem = (item: TranscriptItem, elementKey: string) => {
    if (item.type === "script") {
      const part = item.part;
      const isLastOfCurrentScene =
        currentScene &&
        currentScene.type === "impl" &&
        item.sceneId === currentScene.scene.id &&
        item.index === currentScene.scene.script.length - 1;

      // Filter and render effects for the script part
      const locationEffects = part.instantLocationEffects || [];
      const characterEffects = part.instantCharacterEffects || [];

      const hasEffects =
        locationEffects.length > 0 || characterEffects.length > 0;

      switch (part.type) {
        case "narration":
          return (
            <div key={elementKey} className={classes["scriptPart"]}>
              <div className={classes["narrationCard"]}>
                <Text size="md">{part.content}</Text>
                {hasEffects && (
                  <div className={classes["effectsContainer"]}>
                    {locationEffects.map((eff) => (
                      <Badge
                        key={`loc-eff-${eff}`}
                        color="orange"
                        variant="light"
                        size="xs"
                      >
                        📍 {eff}
                      </Badge>
                    ))}
                    {characterEffects.map((eff) => (
                      <Badge
                        key={`char-eff-${eff.character}-${eff.effect}`}
                        color="blue"
                        variant="light"
                        size="xs"
                      >
                        👤 {printCharacterName(eff.character)}: {eff.effect}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );

        case "dialogue": {
          const charThemeColor = getCharacterColor(part.character);
          return (
            <div key={elementKey} className={classes["scriptPart"]}>
              <div
                className={classes["dialogueCard"]}
                style={{
                  borderLeftColor: `var(--mantine-color-${charThemeColor}-filled)`,
                }}
              >
                <div className={classes["characterHeader"]}>
                  <Text
                    className={classes["characterName"]}
                    c={`${charThemeColor}.7`}
                  >
                    <User size={12} /> {printCharacterName(part.character)}
                  </Text>
                  {isLastOfCurrentScene && isWaitingForChoice && (
                    <Badge color="blue" size="xs" variant="outline">
                      Current Dialogue
                    </Badge>
                  )}
                </div>
                <Text size="md" fw={500} style={{ lineHeight: 1.5 }}>
                  "{part.content}"
                </Text>

                {hasEffects && (
                  <div className={classes["effectsContainer"]}>
                    {locationEffects.map((eff) => (
                      <Badge
                        key={`loc-eff-${eff}`}
                        color="orange"
                        variant="light"
                        size="xs"
                      >
                        📍 {eff}
                      </Badge>
                    ))}
                    {characterEffects.map((eff) => (
                      <Badge
                        key={`char-eff-${eff.character}-${eff.effect}`}
                        color="blue"
                        variant="light"
                        size="xs"
                      >
                        👤 {printCharacterName(eff.character)}: {eff.effect}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        }

        case "internal_dialogue": {
          const charThemeColor = getCharacterColor(part.character);
          return (
            <div key={elementKey} className={classes["scriptPart"]}>
              <div className={classes["internalDialogueCard"]}>
                <div className={classes["characterHeader"]}>
                  <Text
                    className={classes["characterName"]}
                    c={`${charThemeColor}.5`}
                  >
                    <ChatTeardrop size={12} />{" "}
                    {printCharacterName(part.character)}{" "}
                    <Text
                      span
                      size="xs"
                      c="dimmed"
                      style={{
                        textTransform: "lowercase",
                        fontWeight: "normal",
                      }}
                    >
                      (thinking)
                    </Text>
                  </Text>
                </div>
                <Text size="md" style={{ lineHeight: 1.5 }}>
                  {part.content}
                </Text>

                {hasEffects && (
                  <div className={classes["effectsContainer"]}>
                    {locationEffects.map((eff) => (
                      <Badge
                        key={`loc-eff-${eff}`}
                        color="orange"
                        variant="light"
                        size="xs"
                      >
                        📍 {eff}
                      </Badge>
                    ))}
                    {characterEffects.map((eff) => (
                      <Badge
                        key={`char-eff-${eff.character}-${eff.effect}`}
                        color="blue"
                        variant="light"
                        size="xs"
                      >
                        👤 {printCharacterName(eff.character)}: {eff.effect}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        }
      }
    }

    if (item.type === "choices") {
      const isCurrent =
        currentScene &&
        currentScene.type === "impl" &&
        item.sceneId === currentScene.scene.id &&
        item.selectedLabel === undefined;

      if (isCurrent) {
        return (
          <div key={elementKey} className={classes["choicesContainer"]}>
            <Text className={classes["choicesTitle"]}>
              <Hourglass size={16} /> What is your choice?
            </Text>
            <Stack gap="sm">
              {item.choices.map((choice) => (
                <div
                  key={choice.label}
                  className={classes["choiceCard"]}
                  onClick={() => selectChoice(choice)}
                >
                  <div className={classes["choiceNumber"]}>
                    {item.choices.indexOf(choice) + 1}
                  </div>
                  <div>
                    <Text className={classes["choiceLabel"]}>
                      {choice.label}
                    </Text>
                    {choice.description && (
                      <Text className={classes["choiceDescription"]}>
                        {choice.description}
                      </Text>
                    )}
                  </div>
                </div>
              ))}
            </Stack>
          </div>
        );
      } else {
        // Inactive historical choices
        return (
          <div key={elementKey} className={classes["inactiveChoicesContainer"]}>
            <Text
              size="xs"
              fw={700}
              c="dimmed"
              style={{ letterSpacing: "0.5px" }}
            >
              CHOICE ENCOUNTERED AT {item.sceneId.toUpperCase()}
            </Text>
            <Stack gap="xs">
              {item.choices.map((choice) => {
                const isSelected = choice.label === item.selectedLabel;
                const choiceIdx = item.choices.indexOf(choice);
                return (
                  <div
                    key={choice.label}
                    className={`${classes["inactiveChoiceCard"]} ${isSelected ? classes["selectedChoiceCard"] : ""}`}
                    style={{ opacity: isSelected ? 1 : 0.4 }}
                  >
                    {isSelected ? (
                      <Badge color="green" size="xs" variant="filled">
                        ✓ Chosen
                      </Badge>
                    ) : (
                      <Badge color="gray" size="xs" variant="outline">
                        {choiceIdx + 1}
                      </Badge>
                    )}
                    <div>
                      <Text
                        size="xs"
                        fw={700}
                        c={isSelected ? "green.9" : undefined}
                      >
                        {choice.label}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </Stack>
          </div>
        );
      }
    }

    if (item.type === "ending") {
      return (
        <div key={elementKey} className={classes["endingContainer"]}>
          <Title
            order={3}
            style={{
              fontFamily: "monospace",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            c="red.6"
          >
            ☠ END OF ADVENTURE
          </Title>
          <Text size="sm">
            You have reached the end of this story branch. There are no more
            available outgoing choices.
          </Text>
          <Button
            leftSection={<ArrowClockwise size={16} />}
            color="red"
            variant="filled"
            onClick={() => loadGame(gameDefinition)}
          >
            Restart Adventure
          </Button>
        </div>
      );
    }

    return null;
  };

  const isScriptRemaining = useMemo(() => {
    if (!currentScene || currentScene.type !== "impl") return false;
    return scriptIndex < currentScene.scene.script.length;
  }, [currentScene, scriptIndex]);

  return (
    <div className={classes["container"]}>
      {/* Emulator Header */}
      <header className={classes["header"]}>
        <Group>
          <Title className={classes["title"]}>🕹️ ADVENTURE EMULATOR</Title>
          <Select
            placeholder="Select a game story"
            data={allGames.map((g, i) => ({
              value: i.toString(),
              label: g.name,
            }))}
            value={selectedGameIndex}
            onChange={(val) => {
              if (val !== null) {
                setSelectedGameIndex(val);
                const idx = parseInt(val, 10);
                const targetGame = allGames[idx] || defaultGames[0]!;
                loadGame(targetGame.gameDefinition);
              }
            }}
            size="xs"
            allowDeselect={false}
            style={{ width: 280 }}
          />
        </Group>

        <Group>
          {/* Custom File uploader */}
          <FileInput
            placeholder="Upload Custom Adventure..."
            accept=".json"
            onChange={handleCustomFileUpload}
            size="xs"
            leftSection={<UploadSimple size={14} />}
            style={{ width: 220 }}
          />

          <Button
            size="xs"
            color="blue"
            variant="light"
            leftSection={<ArrowClockwise size={14} />}
            onClick={() => loadGame(gameDefinition)}
          >
            Restart Game
          </Button>
        </Group>
      </header>

      {/* Main Layout Area */}
      <div className={classes["mainLayout"]}>
        {/* Left Sidebar - Play History */}
        <aside className={`${classes["sidebar"]} ${classes["leftSidebar"]}`}>
          <div className={classes["sidebarHeader"]}>
            <Clock size={16} /> Run History ({gameState.history.length} choices)
          </div>
          <ScrollArea className={classes["sidebarContent"]} scrollbarSize={6}>
            {renderHistorySidebar()}
          </ScrollArea>
        </aside>

        {/* Central Area - Scrolling Transcript */}
        <main className={classes["transcriptContainer"]}>
          <ScrollArea
            className={classes["transcriptViewport"]}
            scrollbarSize={8}
          >
            <div className={classes["transcriptContent"]}>
              {/* Optional Alert for Stub Scene */}
              {currentScene && currentScene.type === "stub" && (
                <Alert
                  color="yellow"
                  title="Unimplemented Scene Stub"
                  icon={<Warning size={16} />}
                  variant="filled"
                >
                  <Text size="sm">
                    This scene (<strong>{currentScene.scene.id}</strong>) is a
                    placeholder stub and is not fully written:
                  </Text>
                  <Text
                    size="xs"
                    fs="italic"
                    mt="xs"
                    bg="rgba(0,0,0,0.15)"
                    p="xs"
                    style={{ borderRadius: "4px" }}
                  >
                    "{currentScene.scene.description}"
                  </Text>
                  <Button
                    size="xs"
                    color="dark"
                    mt="md"
                    leftSection={<ArrowClockwise size={14} />}
                    onClick={() => loadGame(gameDefinition)}
                  >
                    Restart Adventure
                  </Button>
                </Alert>
              )}

              {/* Rendered scrolling list of script parts & choice presentation */}
              {transcript.map((item) => {
                const itemKey =
                  item.type === "script"
                    ? `tr-part-${item.sceneId}-${item.index}`
                    : `tr-${item.type}-${item.sceneId}`;
                return renderTranscriptItem(item, itemKey);
              })}

              <div ref={transcriptEndRef} />
            </div>
          </ScrollArea>

          {/* Prompt action guide */}
          <div className={classes["statusBar"]}>
            <div className={classes["statusIndicator"]}>
              {isWaitingForChoice ? (
                <Group gap="xs">
                  <Badge color="red" variant="filled" size="xs">
                    CHOICE
                  </Badge>
                  <Text size="xs" className={classes["statusPrompt"]}>
                    Press key <kbd className={classes["keyboardBadge"]}>1</kbd>-
                    <kbd className={classes["keyboardBadge"]}>
                      {currentScene && currentScene.type === "impl"
                        ? currentScene.scene.choices.length
                        : "9"}
                    </kbd>{" "}
                    or click to make a choice
                  </Text>
                </Group>
              ) : isScriptRemaining ? (
                <Group gap="xs">
                  <Badge color="blue" variant="filled" size="xs">
                    STORY
                  </Badge>
                  <Text
                    size="xs"
                    className={classes["statusPrompt"]}
                    onClick={revealNextPart}
                    style={{ cursor: "pointer" }}
                  >
                    Press <kbd className={classes["keyboardBadge"]}>Space</kbd>{" "}
                    or click here to continue...
                  </Text>
                </Group>
              ) : currentScene &&
                currentScene.type === "impl" &&
                currentScene.scene.choices.length === 0 ? (
                <Group gap="xs">
                  <Badge color="red" variant="filled" size="xs">
                    ENDING
                  </Badge>
                  <Text size="xs" className={classes["statusPrompt"]}>
                    Press <kbd className={classes["keyboardBadge"]}>R</kbd> to
                    restart adventure
                  </Text>
                </Group>
              ) : (
                <Text size="xs" c="dimmed">
                  System waiting...
                </Text>
              )}
            </div>

            <Group gap="xs" style={{ display: "flex", alignItems: "center" }}>
              <Tooltip label="Keyboard Shortcuts Info" position="top">
                <Text
                  size="xs"
                  c="dimmed"
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Play size={12} />{" "}
                  <span style={{ fontWeight: 600 }}>Space</span>: Next |{" "}
                  <span style={{ fontWeight: 600 }}>1-9</span>: Select Choice |{" "}
                  <span style={{ fontWeight: 600 }}>R</span>: Restart
                </Text>
              </Tooltip>
            </Group>
          </div>
        </main>

        {/* Right Sidebar - Current Scene Inspector */}
        <aside className={`${classes["sidebar"]} ${classes["rightSidebar"]}`}>
          <div className={classes["sidebarHeader"]}>
            <BookOpen size={16} /> Scene Inspector ({gameState.currentScene})
          </div>

          <div
            className={classes["sidebarContent"]}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {/* Split inspector into Location details and Characters details */}
            <Title
              order={5}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
              size="xs"
              c="dimmed"
            >
              <MapPin size={14} /> LOCATION INSPECTOR
            </Title>
            <ScrollArea scrollbarSize={4} style={{ maxHeight: "40vh" }}>
              {renderLocationDetails()}
            </ScrollArea>

            <Divider my="xs" />

            <Title
              order={5}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
              size="xs"
              c="dimmed"
            >
              <User size={14} /> CHARACTERS PRESENT
            </Title>
            <ScrollArea scrollbarSize={4} style={{ flex: 1 }}>
              {renderCharacterDetails()}
            </ScrollArea>
          </div>
        </aside>
      </div>
    </div>
  );
}
