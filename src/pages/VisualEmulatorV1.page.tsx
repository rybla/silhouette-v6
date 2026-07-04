import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Text,
  Title,
  Button,
  Badge,
  ScrollArea,
  Group,
  Stack,
  FileInput,
  Select,
  Tooltip,
  Alert,
} from "@mantine/core";
import {
  User,
  ArrowClockwise,
  ChatTeardrop,
  Hourglass,
  Warning,
  Play,
  UploadSimple,
  ArrowUUpLeft,
} from "@phosphor-icons/react";
import { BlobReader } from "@zip.js/zip.js";
import classes from "@/pages/VisualEmulatorV1.module.css";

import {
  GameDefinition,
  GameState,
  GameStateManager,
  GameDefinitionManager,
  ScriptPart,
  Choice,
  SceneEntry,
  printCharacterName,
  loadGameBundle,
  type GameBundle,
  CharacterName,
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

// Consistent color theme for characters in transcripts
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

// Generate a beautiful, high-quality, 16:9 SVG background location placeholder
const generateLocationPlaceholder = (name: string, effectName?: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const bg = `hsl(${hue}, 35%, 20%)`;
  const bgLight = `hsl(${hue}, 40%, 32%)`;

  const effectStr = effectName ? ` [${effectName.toUpperCase()}]` : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="locGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${bg};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${bgLight};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(%23locGrad)" />
    <!-- Landscape Grid Lines -->
    <path d="M 0 350 Q 200 250 400 350 T 800 350 L 800 450 L 0 450 Z" fill="rgba(255,255,255,0.04)" />
    <path d="M 0 400 Q 300 320 600 400 T 800 420 L 800 450 L 0 450 Z" fill="rgba(255,255,255,0.03)" />
    <rect x="30" y="30" width="740" height="390" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2" rx="4" />

    <!-- Location Title -->
    <text x="50%" y="200" dominant-baseline="middle" text-anchor="middle" font-family="'Courier New', Courier, monospace" font-weight="900" font-size="32" fill="%23ffffff" letter-spacing="3">📍 ${name.toUpperCase()}${effectStr}</text>
    <text x="50%" y="245" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="13" fill="rgba(255,255,255,0.55)" letter-spacing="1.5">LOCATION SCENE</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Generate a beautiful, high-quality, 3:4 SVG character portrait placeholder
const generateCharacterPlaceholder = (name: string, effectName?: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const primaryColor = `hsl(${hue}, 65%, 50%)`;
  const secondaryColor = `hsl(${(hue + 45) % 360}, 60%, 42%)`;

  const effectStr = effectName ? ` (${effectName.toUpperCase()})` : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
    <defs>
      <linearGradient id="charGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${secondaryColor};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="%2317181c" rx="10" />
    <rect width="90%" height="92.5%" x="5%" y="3.75%" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="2.5" rx="6" />

    <!-- Avatar circle -->
    <circle cx="150" cy="145" r="65" fill="url(%23charGrad)" stroke="rgba(255,255,255,0.15)" stroke-width="3.5" />
    <!-- Profile silhouette -->
    <path d="M 112 205 Q 150 155 188 205 Z" fill="%2317181c" />
    <circle cx="150" cy="130" r="26" fill="%2317181c" />

    <!-- Character Name -->
    <text x="50%" y="275" dominant-baseline="middle" text-anchor="middle" font-family="'Courier New', Courier, monospace" font-weight="900" font-size="22" fill="%23ffffff" letter-spacing="1">${name.toUpperCase()}</text>
    <text x="50%" y="310" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="11" fill="${primaryColor}" letter-spacing="2">CHARACTER${effectStr}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export function VisualEmulatorV1() {
  // Game Bundle state
  const [gameBundle, setGameBundle] = useState<GameBundle | null>(null);

  const [selectedGameIndex, setSelectedGameIndex] = useState<string>("0");

  // Dynamic game definition depending on custom uploaded bundle or default dropdown selection
  const gameDefinition = useMemo(() => {
    if (gameBundle) {
      return gameBundle.gameDefinition;
    }
    const idx = parseInt(selectedGameIndex, 10);
    return defaultGames[idx]?.gameDefinition || defaultGames[0]!.gameDefinition;
  }, [gameBundle, selectedGameIndex]);

  // Game definition manager
  const gameDefinitionManager = useMemo(
    () => new GameDefinitionManager(gameDefinition),
    [gameDefinition]
  );

  // Active game logic states
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

  // Auto-scroll transcript when elements get appended
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript.length]);

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

  // Choose an adventure path
  const selectChoice = useCallback(
    (choice: Choice) => {
      if (!currentScene || currentScene.type !== "impl") return;

      // Lock current choice block in transcript
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
        console.error("Error choosing path:", err);
      }
    },
    [gameDefinition, gameState, currentScene]
  );

  // Re-simulate history from scratch, stripping the last step
  const stepBack = useCallback(() => {
    if (gameState.history.length === 0) return;

    const newHistory = [...gameState.history];
    newHistory.pop(); // Pop the last step

    const initSceneId = gameDefinition.story.start;
    let currentSceneId = initSceneId;
    let currentSceneEntry = gameDefinition.story.scenes[currentSceneId]!;
    const transcriptList: TranscriptItem[] = [];

    // Play through the remaining history steps to reconstruct perfectly
    for (const h of newHistory) {
      if (currentSceneEntry.type === "impl") {
        const script = currentSceneEntry.scene.script || [];
        for (let idx = 0; idx < script.length; idx++) {
          transcriptList.push({
            type: "script",
            part: script[idx]!,
            sceneId: currentSceneId,
            index: idx,
          });
        }

        const choice = currentSceneEntry.scene.choices.find(
          (c) => c.label === h.choice
        );

        transcriptList.push({
          type: "choices",
          sceneId: currentSceneId,
          choices: currentSceneEntry.scene.choices,
          selectedLabel: h.choice,
        });

        if (choice) {
          currentSceneId = choice.targetScene;
          currentSceneEntry = gameDefinition.story.scenes[currentSceneId]!;
        }
      }
    }

    // Initialize the current scene state at the target scene of back-stepping
    setIsWaitingForChoice(false);

    if (currentSceneEntry.type === "impl") {
      const script = currentSceneEntry.scene.script || [];
      if (script.length > 0) {
        transcriptList.push({
          type: "script",
          part: script[0]!,
          sceneId: currentSceneId,
          index: 0,
        });
        setScriptIndex(1);

        if (script.length === 1) {
          const choices = currentSceneEntry.scene.choices || [];
          if (choices.length > 0) {
            setIsWaitingForChoice(true);
            transcriptList.push({
              type: "choices",
              sceneId: currentSceneId,
              choices,
            });
          } else {
            transcriptList.push({
              type: "ending",
              sceneId: currentSceneId,
            });
          }
        }
      } else {
        setScriptIndex(0);
        const choices = currentSceneEntry.scene.choices || [];
        if (choices.length > 0) {
          setIsWaitingForChoice(true);
          transcriptList.push({
            type: "choices",
            sceneId: currentSceneId,
            choices,
          });
        } else {
          transcriptList.push({
            type: "ending",
            sceneId: currentSceneId,
          });
        }
      }
    } else {
      setScriptIndex(0);
    }

    setTranscript(transcriptList);
    setGameState({
      currentScene: currentSceneId,
      history: newHistory,
    });
    setCurrentScene(currentSceneEntry);
  }, [gameDefinition, gameState.history]);

  // Zip upload parser
  const handleZipUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const reader = new BlobReader(file);
      const bundle = await loadGameBundle(reader);
      setGameBundle(bundle);
      loadGame(bundle.gameDefinition);
    } catch (err) {
      alert(`Failed to load game bundle zip: ${(err as Error).message}`);
    }
  };

  // Bind Keyboard shortcuts
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
      } else if (event.key === "z" || event.key === "Z") {
        event.preventDefault();
        stepBack();
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
    stepBack,
  ]);

  // Determine active script part currently revealed at the end
  const activeScriptPart = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const item = transcript[i];
      if (item && item.type === "script") {
        return item;
      }
    }
    return null;
  }, [transcript]);

  // Deterministic "beginning of scene" logic
  const isBeginningOfScene = useMemo(() => {
    if (!currentScene || currentScene.type !== "impl") return false;
    if (!activeScriptPart) return true;
    return (
      activeScriptPart.sceneId === currentScene.scene.id &&
      activeScriptPart.index === 0
    );
  }, [currentScene, activeScriptPart]);

  // RESOLVING DYNAMIC EFFECTS AND IMAGES (TIE-BREAKERS AND PRIORITIES CODES)

  // 1. Resolve Location Active Effect
  const activeLocationEffect = (() => {
    if (!currentScene || currentScene.type !== "impl") return null;
    const locationName = currentScene.scene.location;

    // A. Prioritize instant effects at the beginning of the scene (index 0)
    if (
      isBeginningOfScene &&
      activeScriptPart &&
      activeScriptPart.index === 0
    ) {
      const instantLocEffects =
        activeScriptPart.part.instantLocationEffects || [];
      for (const effect of instantLocEffects) {
        if (
          gameBundle?.gameAssets?.locations?.[locationName]?.instantEffects?.[
            effect
          ]
        ) {
          return { type: "instant" as const, effect };
        }
      }
      // Trigger animations even without asset bindings
      if (instantLocEffects.length > 0) {
        return { type: "instant" as const, effect: instantLocEffects[0]! };
      }
    }

    // B. Revert to passive effects
    const passiveLocEffects = currentScene.scene.passiveLocationEffects || [];
    for (const effect of passiveLocEffects) {
      if (
        gameBundle?.gameAssets?.locations?.[locationName]?.passiveEffects?.[
          effect
        ]
      ) {
        return { type: "passive" as const, effect };
      }
    }
    if (passiveLocEffects.length > 0) {
      return { type: "passive" as const, effect: passiveLocEffects[0]! };
    }

    return null;
  })();

  // Resolve Location Background Image
  const locationImage = (() => {
    if (!currentScene || currentScene.type !== "impl") return "";
    const locationName = currentScene.scene.location;

    if (gameBundle) {
      const locAsset = gameBundle.gameAssets?.locations?.[locationName];
      if (locAsset) {
        if (activeLocationEffect?.type === "instant") {
          const img =
            locAsset.instantEffects?.[activeLocationEffect.effect]?.image;
          if (img) return img;
        }
        if (activeLocationEffect?.type === "passive") {
          const img =
            locAsset.passiveEffects?.[activeLocationEffect.effect]?.image;
          if (img) return img;
        }
        if (locAsset.image) {
          return locAsset.image;
        }
      }
    }

    return generateLocationPlaceholder(
      locationName,
      activeLocationEffect?.effect
    );
  })();

  // Resolve Location Audio
  const locationAudio = (() => {
    if (!currentScene || currentScene.type !== "impl") return null;
    const locationName = currentScene.scene.location;

    if (gameBundle) {
      const locAsset = gameBundle.gameAssets?.locations?.[locationName];
      if (locAsset) {
        if (
          isBeginningOfScene &&
          activeScriptPart &&
          activeScriptPart.index === 0
        ) {
          const instantLocEffects =
            activeScriptPart.part.instantLocationEffects || [];
          for (const effect of instantLocEffects) {
            const sound = locAsset.instantEffects?.[effect]?.sound;
            if (sound)
              return { src: sound, loop: false, key: `inst-${effect}` };
          }
        }
        const passiveLocEffects =
          currentScene.scene.passiveLocationEffects || [];
        for (const effect of passiveLocEffects) {
          const sound = locAsset.passiveEffects?.[effect]?.sound;
          if (sound) return { src: sound, loop: true, key: `pass-${effect}` };
        }
      }
    }
    return null;
  })();

  // Resolve Characters in active Scene
  const sceneCharacters =
    currentScene && currentScene.type === "impl"
      ? Array.from(
          gameDefinitionManager.getCharactersInScene(currentScene.scene.id)
        )
      : [];

  // State to track rendered characters, their positions and transition status
  const [renderedChars, setRenderedChars] = useState<
    Array<{
      name: CharacterName;
      status: "entering" | "active" | "exiting";
      currentLeft: number;
      targetLeft: number;
      opacity: number;
    }>
  >([]);

  // Keep track of the last processed scene characters key to detect changes during render
  const [prevSceneCharsKey, setPrevSceneCharsKey] = useState("");

  // Keep a serialized key of scene characters to trigger layout recalculation
  const sceneCharsKey = sceneCharacters.join(",");

  if (sceneCharsKey !== prevSceneCharsKey) {
    setPrevSceneCharsKey(sceneCharsKey);

    if (sceneCharacters.length === 0) {
      setRenderedChars((prev) => {
        return prev.map((char) => {
          const lastPos =
            char.status === "entering" ? char.currentLeft : char.targetLeft;
          const exitPos = lastPos < 50 ? -30 : 130;
          return {
            ...char,
            status: "exiting" as const,
            targetLeft: exitPos,
            opacity: 0,
          };
        });
      });
    } else {
      const nextN = sceneCharacters.length;

      setRenderedChars((prev) => {
        // Build a map of the previous positions of currently rendered characters
        const prevPosMap = new Map<CharacterName, number>();
        prev.forEach((char) => {
          if (char.status !== "exiting") {
            prevPosMap.set(
              char.name,
              char.status === "entering" ? char.currentLeft : char.targetLeft
            );
          }
        });

        const nextList: Array<{
          name: CharacterName;
          status: "entering" | "active" | "exiting";
          currentLeft: number;
          targetLeft: number;
          opacity: number;
        }> = [];

        // A. Handle persisting and entering characters
        sceneCharacters.forEach((charName, index) => {
          const targetPercent = ((2 * index + 1) / (2 * nextN)) * 100;

          if (prevPosMap.has(charName)) {
            // Persisting character: smooth transition to new placement
            nextList.push({
              name: charName,
              status: "active" as const,
              currentLeft: prevPosMap.get(charName)!,
              targetLeft: targetPercent,
              opacity: 1,
            });
          } else {
            // Entering character: transition on-screen
            const startPercent = targetPercent < 50 ? -30 : 130;
            nextList.push({
              name: charName,
              status: "entering" as const,
              currentLeft: startPercent,
              targetLeft: targetPercent,
              opacity: 0,
            });
          }
        });

        // B. Handle exiting characters: transition off-screen
        prev.forEach((char) => {
          if (
            char.status !== "exiting" &&
            !sceneCharacters.includes(char.name)
          ) {
            const lastPos =
              char.status === "entering" ? char.currentLeft : char.targetLeft;
            const exitPercent = lastPos < 50 ? -30 : 130;
            nextList.push({
              ...char,
              status: "exiting" as const,
              targetLeft: exitPercent,
              opacity: 0,
            });
          }
        });

        return nextList;
      });
    }
  }

  useEffect(() => {
    // 1. Trigger transition for entering characters
    const triggerTimeoutId = setTimeout(() => {
      setRenderedChars((current) =>
        current.map((char) => {
          if (char.status === "entering") {
            return {
              ...char,
              status: "active" as const,
              currentLeft: char.targetLeft,
              opacity: 1,
            };
          }
          return char;
        })
      );
    }, 50);

    // 2. Clean up exiting characters after transition completes
    const cleanupTimeoutId = setTimeout(() => {
      setRenderedChars((current) =>
        current.filter((char) => char.status !== "exiting")
      );
    }, 650);

    return () => {
      clearTimeout(triggerTimeoutId);
      clearTimeout(cleanupTimeoutId);
    };
  }, [sceneCharsKey]);

  // Resolve Character properties (effects, images, sound assets)
  const getCharacterState = useCallback(
    (characterName: CharacterName) => {
      if (!currentScene || currentScene.type !== "impl") return null;

      let activeEffect = null;

      // A. Prioritize instant effects at the beginning of the scene
      if (
        isBeginningOfScene &&
        activeScriptPart &&
        activeScriptPart.index === 0
      ) {
        const instantCharEffects =
          activeScriptPart.part.instantCharacterEffects || [];
        const myInstantEffects = instantCharEffects
          .filter((e) => e.character === characterName)
          .map((e) => e.effect);

        for (const effect of myInstantEffects) {
          if (
            gameBundle?.gameAssets?.characters?.[characterName]
              ?.instantEffects?.[effect]
          ) {
            activeEffect = { type: "instant" as const, effect };
            break;
          }
        }
        if (!activeEffect && myInstantEffects.length > 0) {
          activeEffect = {
            type: "instant" as const,
            effect: myInstantEffects[0]!,
          };
        }
      }

      // B. Fallback to passive effects
      if (!activeEffect) {
        const passiveCharEffects =
          currentScene.scene.passiveCharacterEffects || [];
        const myPassiveEffects = passiveCharEffects
          .filter((e) => e.character === characterName)
          .map((e) => e.effect);

        for (const effect of myPassiveEffects) {
          if (
            gameBundle?.gameAssets?.characters?.[characterName]
              ?.passiveEffects?.[effect]
          ) {
            activeEffect = { type: "passive" as const, effect };
            break;
          }
        }
        if (!activeEffect && myPassiveEffects.length > 0) {
          activeEffect = {
            type: "passive" as const,
            effect: myPassiveEffects[0]!,
          };
        }
      }

      // C. Resolve Portrait Image
      let image = "";
      if (gameBundle) {
        const charAsset = gameBundle.gameAssets?.characters?.[characterName];
        if (charAsset) {
          if (activeEffect?.type === "instant") {
            const img = charAsset.instantEffects?.[activeEffect.effect]?.image;
            if (img) image = img;
          } else if (activeEffect?.type === "passive") {
            const img = charAsset.passiveEffects?.[activeEffect.effect]?.image;
            if (img) image = img;
          }
          if (!image && charAsset.image) {
            image = charAsset.image;
          }
        }
      }
      if (!image) {
        image = generateCharacterPlaceholder(
          characterName,
          activeEffect?.effect
        );
      }

      // D. Resolve Sound asset
      let sound = null;
      if (gameBundle) {
        const charAsset = gameBundle.gameAssets?.characters?.[characterName];
        if (charAsset) {
          if (
            isBeginningOfScene &&
            activeScriptPart &&
            activeScriptPart.index === 0
          ) {
            const instantCharEffects =
              activeScriptPart.part.instantCharacterEffects || [];
            const myInstantEffects = instantCharEffects
              .filter((e) => e.character === characterName)
              .map((e) => e.effect);
            for (const effect of myInstantEffects) {
              const s = charAsset.instantEffects?.[effect]?.sound;
              if (s) {
                sound = {
                  src: s,
                  loop: false,
                  key: `inst-${characterName}-${effect}`,
                };
                break;
              }
            }
          }
          if (!sound) {
            const passiveCharEffects =
              currentScene.scene.passiveCharacterEffects || [];
            const myPassiveEffects = passiveCharEffects
              .filter((e) => e.character === characterName)
              .map((e) => e.effect);
            for (const effect of myPassiveEffects) {
              const s = charAsset.passiveEffects?.[effect]?.sound;
              if (s) {
                sound = {
                  src: s,
                  loop: true,
                  key: `pass-${characterName}-${effect}`,
                };
                break;
              }
            }
          }
        }
      }

      return {
        activeEffect,
        image,
        sound,
      };
    },
    [currentScene, isBeginningOfScene, activeScriptPart, gameBundle]
  );

  // Transcript items renderer
  const renderTranscriptItem = (item: TranscriptItem, elementKey: string) => {
    if (item.type === "script") {
      const part = item.part;
      const isLastOfCurrentScene =
        currentScene &&
        currentScene.type === "impl" &&
        item.sceneId === currentScene.scene.id &&
        item.index === currentScene.scene.script.length - 1;

      const locationEffects = part.instantLocationEffects || [];
      const characterEffects = part.instantCharacterEffects || [];
      const hasEffects =
        locationEffects.length > 0 || characterEffects.length > 0;

      switch (part.type) {
        case "narration":
          return (
            <div key={elementKey} className={classes["scriptPart"]}>
              <div className={classes["narrationCard"]}>
                <Text size="sm" style={{ wordBreak: "break-word" }}>
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
                    c={`${charThemeColor}.5`}
                  >
                    <User size={12} /> {printCharacterName(part.character)}
                  </Text>
                  {isLastOfCurrentScene && isWaitingForChoice && (
                    <Badge color="blue" size="xs" variant="outline">
                      Active Speak
                    </Badge>
                  )}
                </div>
                <Text
                  size="sm"
                  fw={500}
                  style={{ lineHeight: 1.4, wordBreak: "break-word" }}
                >
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
                    c={`${charThemeColor}.4`}
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
                <Text
                  size="sm"
                  style={{ lineHeight: 1.4, wordBreak: "break-word" }}
                >
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
              <Hourglass size={14} /> Make your move
            </Text>
            <Stack gap="xs">
              {item.choices.map((choice, i) => (
                <div
                  key={choice.label}
                  className={classes["choiceCard"]}
                  onClick={() => selectChoice(choice)}
                >
                  <div className={classes["choiceNumber"]}>{i + 1}</div>
                  <div>
                    <Text className={classes["choiceLabel"]}>
                      {choice.label}
                    </Text>
                  </div>
                </div>
              ))}
            </Stack>
          </div>
        );
      } else {
        return (
          <div key={elementKey} className={classes["inactiveChoicesContainer"]}>
            <Text
              size="xs"
              fw={700}
              c="dimmed"
              style={{ letterSpacing: "0.5px" }}
            >
              SCENE {item.sceneId.toUpperCase()} DECISION
            </Text>
            <Stack gap="xs">
              {item.choices.map((choice, i) => {
                const isSelected = choice.label === item.selectedLabel;
                return (
                  <div
                    key={choice.label}
                    className={`${classes["inactiveChoiceCard"]} ${
                      isSelected ? classes["selectedChoiceCard"] : ""
                    }`}
                    style={{ opacity: isSelected ? 1 : 0.4 }}
                  >
                    {isSelected ? (
                      <Badge color="green" size="xs" variant="filled">
                        ✓ Selected
                      </Badge>
                    ) : (
                      <Badge color="gray" size="xs" variant="outline">
                        {i + 1}
                      </Badge>
                    )}
                    <div>
                      <Text size="xs" fw={700}>
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
            order={4}
            style={{
              fontFamily: "monospace",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            c="red.5"
          >
            ADVENTURE ENDS
          </Title>
          <Text size="xs">
            There are no more outgoing choices along this pathway. Re-trace your
            steps or restart.
          </Text>
          <Button
            leftSection={<ArrowClockwise size={14} />}
            color="red"
            variant="filled"
            size="xs"
            onClick={() => loadGame(gameDefinition)}
          >
            Restart Journey
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={classes["container"]}>
      {/* LEFT SIDEBAR CONTROLS AND TRANSCRIPT */}
      <aside className={classes["sidebar"]}>
        {/* Controls Section at top */}
        <div className={classes["controlsSection"]}>
          <div className={classes["controlsHeader"]}>
            <Play size={14} /> Emulator Control Panel
          </div>

          {/* Select dropdown for standard default games or custom uploaded bundle */}
          <Select
            placeholder="Select Game Template"
            data={[
              ...defaultGames.map((g, i) => ({
                value: i.toString(),
                label: g.name,
              })),
              ...(gameBundle
                ? [
                    {
                      value: "bundle",
                      label: `Custom Zip: ${gameBundle.gameDefinition.story.start}`,
                    },
                  ]
                : []),
            ]}
            value={gameBundle ? "bundle" : selectedGameIndex}
            onChange={(val) => {
              if (val !== null) {
                if (val === "bundle") return;
                setGameBundle(null);
                setSelectedGameIndex(val);
                const idx = parseInt(val, 10);
                const targetGame = defaultGames[idx] || defaultGames[0]!;
                loadGame(targetGame.gameDefinition);
              }
            }}
            size="xs"
            allowDeselect={false}
          />

          {/* Upload zip bundle */}
          <FileInput
            placeholder={
              gameBundle
                ? `Custom: ${gameBundle.gameDefinition.story.start}`
                : "Upload game bundle (.zip)"
            }
            accept=".zip"
            onChange={(file) => {
              handleZipUpload(file).catch(console.error);
            }}
            size="xs"
            leftSection={<UploadSimple size={14} />}
          />

          {/* Restart and Step Back button pair */}
          <div className={classes["btnGroup"]}>
            <Tooltip label="Restart game definition (shortcut: R)">
              <Button
                size="xs"
                color="blue"
                variant="light"
                leftSection={<ArrowClockwise size={14} />}
                onClick={() => loadGame(gameDefinition)}
              >
                Restart
              </Button>
            </Tooltip>

            <Tooltip label="Step back to previous choice (shortcut: Z)">
              <Button
                size="xs"
                color="gray"
                variant="light"
                leftSection={<ArrowUUpLeft size={14} />}
                onClick={stepBack}
                disabled={gameState.history.length === 0}
              >
                Step Back
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Scrolling Transcript of Script Parts & Choice selectors */}
        <div className={classes["transcriptContainer"]}>
          <ScrollArea
            className={classes["transcriptScrollArea"]}
            scrollbarSize={6}
          >
            <div className={classes["transcriptContent"]}>
              {transcript.map((item, idx) =>
                renderTranscriptItem(item, `item-${idx}-${item.type}`)
              )}
              {/* Optional warning alert for stub scenes */}
              {currentScene && currentScene.type === "stub" && (
                <Alert
                  color="yellow"
                  title="STUB SCENE"
                  icon={<Warning size={16} />}
                >
                  <Text size="xs">
                    This scene ({currentScene.scene.id}) is defined as a stub.
                    It contains no script dialogue or choices.
                  </Text>
                </Alert>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Little help footnote */}
        <div className={classes["sidebarFooter"]}>
          <Group justify="space-between">
            <Text size="10px" c="dimmed">
              ⌨ Space: Progress script
            </Text>
            <Text size="10px" c="dimmed">
              ⌨ 1-9: Select Choice
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="10px" c="dimmed">
              ⌨ R: Restart game
            </Text>
            <Text size="10px" c="dimmed">
              ⌨ Z: Step back
            </Text>
          </Group>
        </div>
      </aside>

      {/* PURE VISUAL PRESENTATION CANVAS (NO OTHER UI ELEMENTS) */}
      <main className={classes["scenePane"]}>
        <div className={classes["sceneContainer"]}>
          {/* Location background image */}
          {locationImage && (
            <img
              src={locationImage}
              alt="Location Scene Background"
              className={`${classes["bgImage"]} ${
                activeLocationEffect?.effect === "shake"
                  ? classes["loc-shake"]
                  : ""
              }`}
            />
          )}

          {/* Active weather overlays (rain, snow, wind) */}
          {activeLocationEffect?.effect === "rain" && (
            <div className={classes["loc-rain"]} />
          )}
          {activeLocationEffect?.effect === "snow" && (
            <div className={classes["loc-snow"]} />
          )}
          {activeLocationEffect?.effect === "wind" && (
            <div className={classes["loc-wind"]} />
          )}

          {/* Active location lighting/tint overlays */}
          {activeLocationEffect?.effect === "dark" && (
            <div
              className={classes["effectsOverlay"]}
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.55)",
                mixBlendMode: "multiply",
              }}
            />
          )}
          {activeLocationEffect?.effect === "sunny" && (
            <div
              className={classes["effectsOverlay"]}
              style={{
                backgroundColor: "rgba(255, 200, 100, 0.15)",
                mixBlendMode: "color-burn",
              }}
            />
          )}

          {/* Auto-playing location audio sound */}
          {locationAudio && (
            <audio
              key={locationAudio.key}
              src={locationAudio.src}
              autoPlay
              loop={locationAudio.loop}
            />
          )}

          {/* Render scene characters */}
          {currentScene && currentScene.type === "impl" && (
            <div className={classes["charactersContainer"]}>
              {renderedChars.map((char) => {
                const charName = char.name;
                const charState = getCharacterState(charName);
                const isTalking =
                  activeScriptPart?.part.type === "dialogue" &&
                  activeScriptPart.part.character === charName;
                const isThinking =
                  activeScriptPart?.part.type === "internal_dialogue" &&
                  activeScriptPart.part.character === charName;

                // Build character composite animation class list
                const animationClasses = [classes["characterWrapper"]];
                if (charState?.activeEffect?.effect) {
                  const effClass = `char-${charState.activeEffect.effect}`;
                  if (classes[effClass]) {
                    animationClasses.push(classes[effClass]);
                  }
                }
                if (isTalking) {
                  animationClasses.push(classes["char-talking"]);
                }
                if (isThinking) {
                  animationClasses.push(classes["char-thinking"]);
                }

                // Render specific character portrait wrapper
                return (
                  <div
                    key={charName}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${char.status === "entering" ? char.currentLeft : char.targetLeft}%`,
                      opacity: char.opacity,
                      transition:
                        "left 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div className={animationClasses.join(" ")}>
                      {charState?.image && (
                        <img
                          src={charState.image}
                          alt={`Character ${charName}`}
                          className={`${classes["characterImage"]} ${
                            charState.activeEffect?.effect === "angry"
                              ? classes["angryFilter"]
                              : ""
                          }`}
                        />
                      )}

                      {/* Auto-playing character-associated audio sound */}
                      {charState?.sound && (
                        <audio
                          key={charState.sound.key}
                          src={charState.sound.src}
                          autoPlay
                          loop={charState.sound.loop}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
