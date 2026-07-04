import { useState, useMemo, useRef, useCallback } from "react";
import {
  Title,
  Text,
  Tabs,
  Button,
  ActionIcon,
  Card,
  Badge,
  ScrollArea,
  Group,
  Stack,
  Divider,
  FileInput,
  Alert,
  Box,
  Grid,
  Center,
} from "@mantine/core";
import {
  MapPin,
  User,
  Plus,
  Minus,
  ArrowsOut,
  Warning,
  CheckCircle,
  XCircle,
  Info,
  UploadSimple,
  FilmSlate,
  Lightning,
  Play,
  CaretUp,
  CaretDown,
} from "@phosphor-icons/react";
import { BlobReader, BlobWriter, ZipWriter, TextReader } from "@zip.js/zip.js";
import {
  loadGameBundle,
  type GameBundle,
  type ScriptPart,
  type GameDefinition,
} from "@/core/ontology";
import classes from "@/pages/GameBundleViewerV1.module.css";

const exampleFiles = import.meta.glob<{ gameDefinition: GameDefinition }>(
  "../examples/*-state.json",
  { eager: true }
);
const demoGamePath =
  Object.keys(exampleFiles).find((path) => path.includes("zombies-v1-2")) ||
  Object.keys(exampleFiles)[0]!;
const demoGameDefinition = exampleFiles[demoGamePath]!.gameDefinition;

// ---------------------------------------------------------------------
// Types & Layout Constants
// ---------------------------------------------------------------------

interface NodePosition {
  id: string;
  x: number;
  y: number;
  col: number;
  row: number;
  type: "stub" | "impl";
}

interface EdgeLink {
  source: string;
  target: string;
  label: string;
}

interface DiagnosticMessage {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  description: string;
  target?: {
    kind: "scene" | "character" | "location";
    id: string;
  };
}

const colWidth = 220;
const colGap = 100;
const rowHeight = 80;
const rowGap = 30;

export function GameBundleViewerV1() {
  // ---------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------
  const [gameBundle, setGameBundle] = useState<GameBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Nav / Selection
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedCharacterName, setSelectedCharacterName] = useState<
    string | null
  >(null);
  const [selectedLocationName, setSelectedLocationName] = useState<
    string | null
  >(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>("scenes");

  // Interactive Graph Workspace
  const [zoom, setZoom] = useState<number>(0.85);
  const [panX, setPanX] = useState<number>(50);
  const [panY, setPanY] = useState<number>(50);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // UI state
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(true);

  // ---------------------------------------------------------------------
  // Graph Calculations (Deterministic Grid Layout)
  // ---------------------------------------------------------------------
  const graphData = useMemo(() => {
    if (!gameBundle) {
      return { nodes: [], links: [], canvasWidth: 800, canvasHeight: 600 };
    }

    const scenes = gameBundle.gameDefinition.story.scenes;
    const start = gameBundle.gameDefinition.story.start;

    const visited = new Set<string>();
    const layers: string[][] = [];

    // Breadth-First-Search (BFS) starting from the start scene
    if (start && scenes[start]) {
      const queue: { id: string; depth: number }[] = [{ id: start, depth: 0 }];
      visited.add(start);

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (!layers[depth]) {
          layers[depth] = [];
        }
        layers[depth].push(id);

        const entry = scenes[id];
        if (entry && entry.type === "impl") {
          const choices = entry.scene.choices || [];
          for (const choice of choices) {
            const target = choice.targetScene;
            if (target && scenes[target]) {
              if (!visited.has(target)) {
                visited.add(target);
                queue.push({ id: target, depth: depth + 1 });
              }
            }
          }
        }
      }
    }

    // Capture unreachable/stub scenes and add them as an "Unreachable" layer
    const unreachable: string[] = [];
    for (const sceneId of Object.keys(scenes)) {
      if (!visited.has(sceneId)) {
        unreachable.push(sceneId);
      }
    }

    if (unreachable.length > 0) {
      const unreachableColIndex = layers.length;
      layers[unreachableColIndex] = unreachable;
    }

    // Determine coordinate heights
    const maxNodesInCol = Math.max(...layers.map((l) => l.length), 1);
    const totalHeight = maxNodesInCol * (rowHeight + rowGap) + 120;

    const nodePositions: NodePosition[] = [];
    layers.forEach((colScenes, colIndex) => {
      const colCount = colScenes.length;
      // Center the columns vertically so it looks like a branching tree
      const colTotalHeight = colCount * (rowHeight + rowGap);
      const startY = (totalHeight - colTotalHeight) / 2;

      colScenes.forEach((sceneId, rowIndex) => {
        const x = colIndex * (colWidth + colGap) + 60;
        const y = startY + rowIndex * (rowHeight + rowGap) + 40;

        const entry = scenes[sceneId];
        const type = entry ? entry.type : "stub";

        nodePositions.push({
          id: sceneId,
          x,
          y,
          col: colIndex,
          row: rowIndex,
          type,
        });
      });
    });

    // Build the collection of choice edge paths
    const edgeLinks: EdgeLink[] = [];
    for (const [sceneId, entry] of Object.entries(scenes)) {
      if (entry && entry.type === "impl") {
        const choices = entry.scene.choices || [];
        for (const choice of choices) {
          const target = choice.targetScene;
          if (target) {
            edgeLinks.push({
              source: sceneId,
              target,
              label: choice.label,
            });
          }
        }
      }
    }

    const canvasWidth = layers.length * (colWidth + colGap) + 150;
    const canvasHeight = totalHeight;

    return {
      nodes: nodePositions,
      links: edgeLinks,
      canvasWidth,
      canvasHeight,
    };
  }, [gameBundle]);

  // ---------------------------------------------------------------------
  // Dynamic Diagnostic Suite
  // ---------------------------------------------------------------------
  const diagnostics = useMemo<DiagnosticMessage[]>(() => {
    if (!gameBundle) return [];

    const msgs: DiagnosticMessage[] = [];
    const scenes = gameBundle.gameDefinition.story.scenes;
    const start = gameBundle.gameDefinition.story.start;
    const locations = gameBundle.gameDefinition.story.locations;
    const characters = gameBundle.gameDefinition.story.characters;
    const assets = gameBundle.gameAssets;

    let diagId = 1;
    const nextId = () => `diag-${diagId++}`;

    // 1. Start Scene Validation
    if (!start) {
      msgs.push({
        id: nextId(),
        type: "error",
        title: "Missing Start Scene",
        description: "The story does not define an start scene.",
      });
    } else if (!scenes[start]) {
      msgs.push({
        id: nextId(),
        type: "error",
        title: "Invalid Start Scene",
        description: `The start scene "${start}" does not exist in the scenes dictionary.`,
        target: { kind: "scene", id: start },
      });
    }

    // 2. Scene-Specific Validation
    for (const [sceneId, entry] of Object.entries(scenes)) {
      if (entry.type === "stub") {
        msgs.push({
          id: nextId(),
          type: "info",
          title: "Stub Scene",
          description: `Scene "${sceneId}" is a stub and has no implementation yet. Stub details: "${entry.scene.description}"`,
          target: { kind: "scene", id: sceneId },
        });
        continue;
      }

      const scene = entry.scene;

      // Check Location reference
      if (!scene.location) {
        msgs.push({
          id: nextId(),
          type: "error",
          title: "Missing Location",
          description: `Scene "${sceneId}" does not specify a location.`,
          target: { kind: "scene", id: sceneId },
        });
      } else if (!locations[scene.location]) {
        msgs.push({
          id: nextId(),
          type: "error",
          title: "Invalid Location Reference",
          description: `Scene "${sceneId}" references location "${scene.location}", which is not defined in the story locations list.`,
          target: { kind: "scene", id: sceneId },
        });
      }

      // Check Passive Character Effects
      const charPassiveEffects = scene.passiveCharacterEffects || [];
      charPassiveEffects.forEach((eff) => {
        if (!characters[eff.character]) {
          msgs.push({
            id: nextId(),
            type: "warning",
            title: "Unknown Character in Passive Effects",
            description: `Scene "${sceneId}" references character "${eff.character}" in passive effects, but this character is not defined.`,
            target: { kind: "scene", id: sceneId },
          });
        } else {
          const charAsset = assets.characters[eff.character];
          if (!charAsset || !charAsset.passiveEffects[eff.effect]?.image) {
            msgs.push({
              id: nextId(),
              type: "info",
              title: "Missing Passive Effect Asset",
              description: `Character "${eff.character}" is missing an image asset for passive effect "${eff.effect}" used in scene "${sceneId}".`,
              target: { kind: "character", id: eff.character },
            });
          }
        }
      });

      // Check Script Parts
      const script = scene.script || [];
      script.forEach((part, partIdx) => {
        if (part.type === "dialogue" || part.type === "internal_dialogue") {
          if (!characters[part.character]) {
            msgs.push({
              id: nextId(),
              type: "warning",
              title: "Unknown Character in Script",
              description: `Scene "${sceneId}" script (part ${partIdx + 1}) references character "${part.character}", but this character is not defined.`,
              target: { kind: "scene", id: sceneId },
            });
          }
        }

        const instCharEffects = part.instantCharacterEffects || [];
        instCharEffects.forEach((eff) => {
          if (!characters[eff.character]) {
            msgs.push({
              id: nextId(),
              type: "warning",
              title: "Unknown Character in Script Effect",
              description: `Scene "${sceneId}" script references character "${eff.character}" for instant effect "${eff.effect}", but this character is not defined.`,
              target: { kind: "scene", id: sceneId },
            });
          } else {
            const charAsset = assets.characters[eff.character];
            if (!charAsset || !charAsset.instantEffects[eff.effect]?.image) {
              msgs.push({
                id: nextId(),
                type: "info",
                title: "Missing Instant Effect Asset",
                description: `Character "${eff.character}" is missing an image asset for instant effect "${eff.effect}" referenced in scene "${sceneId}".`,
                target: { kind: "character", id: eff.character },
              });
            }
          }
        });
      });

      // Check Choices & Dead ends
      const choices = scene.choices || [];
      if (choices.length === 0) {
        msgs.push({
          id: nextId(),
          type: "info",
          title: "Ending Scene (No Choices)",
          description: `Scene "${sceneId}" has no choices. It acts as a story ending.`,
          target: { kind: "scene", id: sceneId },
        });
      } else {
        choices.forEach((choice, choiceIdx) => {
          const target = choice.targetScene;
          if (!target) {
            msgs.push({
              id: nextId(),
              type: "error",
              title: "Empty Target Scene in Choice",
              description: `Scene "${sceneId}" choice ${choiceIdx + 1} ("${choice.label}") has an empty target scene.`,
              target: { kind: "scene", id: sceneId },
            });
          } else if (!scenes[target]) {
            msgs.push({
              id: nextId(),
              type: "error",
              title: "Broken Scene Link",
              description: `Scene "${sceneId}" choice ${choiceIdx + 1} ("${choice.label}") targets scene "${target}", which does not exist in the story.`,
              target: { kind: "scene", id: sceneId },
            });
          }
        });
      }
    }

    // 3. Characters Verification
    for (const [charName, char] of Object.entries(characters)) {
      const charAsset = assets.characters[charName];
      if (!charAsset || !charAsset.image) {
        msgs.push({
          id: nextId(),
          type: "warning",
          title: "Missing Character Image",
          description: `Character "${charName}" is defined in the story but lacks an image asset in the bundle.`,
          target: { kind: "character", id: charName },
        });
      }

      if (!char.vignette) {
        msgs.push({
          id: nextId(),
          type: "info",
          title: "Missing Character Vignette",
          description: `Character "${charName}" lacks a vignette description.`,
          target: { kind: "character", id: charName },
        });
      }
    }

    // 4. Locations Verification
    for (const [locName, loc] of Object.entries(locations)) {
      const locAsset = assets.locations[locName];
      if (!locAsset || !locAsset.image) {
        msgs.push({
          id: nextId(),
          type: "warning",
          title: "Missing Location Image",
          description: `Location "${locName}" is defined in the story but lacks an image asset in the bundle.`,
          target: { kind: "location", id: locName },
        });
      }

      if (!loc.vignette) {
        msgs.push({
          id: nextId(),
          type: "info",
          title: "Missing Location Vignette",
          description: `Location "${locName}" lacks a vignette description.`,
          target: { kind: "location", id: locName },
        });
      }
    }

    // 5. Unreachable Scenes
    const visited = new Set<string>();
    if (start && scenes[start]) {
      const queue: string[] = [start];
      visited.add(start);
      while (queue.length > 0) {
        const current = queue.shift()!;
        const entry = scenes[current];
        if (entry && entry.type === "impl") {
          const choices = entry.scene.choices || [];
          for (const choice of choices) {
            const target = choice.targetScene;
            if (target && scenes[target] && !visited.has(target)) {
              visited.add(target);
              queue.push(target);
            }
          }
        }
      }
    }

    for (const sceneId of Object.keys(scenes)) {
      if (!visited.has(sceneId)) {
        msgs.push({
          id: nextId(),
          type: "warning",
          title: "Unreachable Scene",
          description: `Scene "${sceneId}" is defined but cannot be reached starting from the start scene "${start}".`,
          target: { kind: "scene", id: sceneId },
        });
      }
    }

    // 6. Checkpoint Spacing Rules
    const minSpacing = gameBundle.gameDefinition.minimumCheckpointsSpacing;
    const maxDistance = gameBundle.gameDefinition.maximumDistanceFromCheckpoint;

    if (minSpacing !== undefined || maxDistance !== undefined) {
      for (const [sceneId, entry] of Object.entries(scenes)) {
        if (entry.type !== "impl") continue;
        const isC1 = entry.scene.isCheckpoint;
        const isStart = sceneId === start;

        if (isC1 || isStart) {
          const q: { id: string; dist: number }[] = [{ id: sceneId, dist: 0 }];
          const vis = new Set<string>([sceneId]);

          while (q.length > 0) {
            const { id: currId, dist: currDist } = q.shift()!;
            const currEntry = scenes[currId];

            if (currEntry && currEntry.type === "impl") {
              if (currDist > 0 && currEntry.scene.isCheckpoint) {
                if (minSpacing !== undefined && currDist < minSpacing) {
                  msgs.push({
                    id: nextId(),
                    type: "warning",
                    title: "Checkpoint Spacing Violation",
                    description: `Checkpoint "${currId}" is reachable from checkpoint "${sceneId}" in ${currDist} steps, which is less than the minimum required spacing of ${minSpacing} steps.`,
                    target: { kind: "scene", id: currId },
                  });
                }
                continue;
              }

              if (maxDistance !== undefined && currDist > maxDistance) {
                msgs.push({
                  id: nextId(),
                  type: "warning",
                  title: "Maximum Distance Exceeded",
                  description: `Scene "${currId}" is ${currDist} steps away from checkpoint "${sceneId}", exceeding the maximum allowed distance of ${maxDistance} steps.`,
                  target: { kind: "scene", id: currId },
                });
              }

              const choices = currEntry.scene.choices || [];
              for (const choice of choices) {
                const target = choice.targetScene;
                if (target && scenes[target] && !vis.has(target)) {
                  vis.add(target);
                  q.push({ id: target, dist: currDist + 1 });
                }
              }
            }
          }
        }
      }
    }

    return msgs.sort((a, b) => {
      const priority = { error: 0, warning: 1, info: 2 };
      return priority[a.type] - priority[b.type];
    });
  }, [gameBundle]);

  // ---------------------------------------------------------------------
  // Dynamic Navigation & Focus Helpers
  // ---------------------------------------------------------------------
  const focusOnSceneNode = useCallback(
    (sceneId: string) => {
      setSelectedSceneId(sceneId);

      // Find coordinates to center the graph on the node
      const matchedNode = graphData.nodes.find((n) => n.id === sceneId);
      if (matchedNode) {
        // Assuming a middle scale zoom, map coordinates to viewport center (approx 400x300)
        setPanX(400 - matchedNode.x * 0.95);
        setPanY(250 - matchedNode.y * 0.95);
        setZoom(0.95);
      }
    },
    [graphData.nodes]
  );

  const handleDiagnosticClick = useCallback(
    (diag: DiagnosticMessage) => {
      if (!diag.target) return;

      if (diag.target.kind === "scene") {
        focusOnSceneNode(diag.target.id);
        setActiveSidebarTab("scenes");
      } else if (diag.target.kind === "character") {
        setSelectedCharacterName(diag.target.id);
        setActiveSidebarTab("characters");
      } else if (diag.target.kind === "location") {
        setSelectedLocationName(diag.target.id);
        setActiveSidebarTab("locations");
      }
    },
    [focusOnSceneNode]
  );

  // Clean event handlers for initializing selection states on load
  const initializeSelections = useCallback(
    (bundle: GameBundle) => {
      const start = bundle.gameDefinition.story.start;
      if (start) {
        setSelectedSceneId(start);
        // Map coordinates to viewport center
        const matchedNode = graphData.nodes.find((n) => n.id === start);
        if (matchedNode) {
          setPanX(400 - matchedNode.x * 0.95);
          setPanY(250 - matchedNode.y * 0.95);
          setZoom(0.95);
        } else {
          setPanX(50);
          setPanY(50);
          setZoom(0.85);
        }
      }

      const chars = Object.keys(bundle.gameDefinition.story.characters);
      if (chars.length > 0) {
        setSelectedCharacterName(chars[0]!);
      }

      const locs = Object.keys(bundle.gameDefinition.story.locations);
      if (locs.length > 0) {
        setSelectedLocationName(locs[0]!);
      }
    },
    [graphData.nodes]
  );

  // ---------------------------------------------------------------------
  // Panning & Zooming Event Handlers
  // ---------------------------------------------------------------------
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Only pan if we click directly on the canvas background/SVG surface
    if (
      e.target instanceof SVGElement &&
      (e.target.id === "main-graph-svg" ||
        e.target.tagName === "svg" ||
        e.target.tagName === "g")
    ) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - panX, y: e.clientY - panY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging) {
      setPanX(e.clientX - dragStartRef.current.x);
      setPanY(e.clientY - dragStartRef.current.y);
    }
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomIntensity = 0.05;
    const factor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    setZoom((z) => Math.max(0.3, Math.min(3.0, z * factor)));
  };

  // ---------------------------------------------------------------------
  // File Upload & Demo Zip Generator
  // ---------------------------------------------------------------------
  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    setIsLoading(true);
    setUploadError(null);

    try {
      const reader = new BlobReader(file);
      const bundle = await loadGameBundle(reader);
      setGameBundle(bundle);
      initializeSelections(bundle);
    } catch (err) {
      console.error(err);
      setUploadError(
        err instanceof Error ? err.message : "Failed to load the zip bundle."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadDemoBundle = async () => {
    setIsLoading(true);
    setUploadError(null);

    try {
      const blobWriter = new BlobWriter("application/zip");
      const zipWriter = new ZipWriter(blobWriter);

      // 1. Add gameDefinition.json
      const gameDefStr = JSON.stringify(demoGameDefinition);
      await zipWriter.add("gameDefinition.json", new TextReader(gameDefStr));

      // 2. Add SVG images for all characters dynamically
      const characters = Object.keys(demoGameDefinition.story.characters);
      const charColors = [
        "#4dabf7",
        "#ff8787",
        "#343a40",
        "#ffc078",
        "#82c91e",
        "#da77f2",
      ];
      for (let i = 0; i < characters.length; i++) {
        const charName = characters[i]!;
        const color = charColors[i % charColors.length];
        const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
          <rect width="300" height="300" fill="${color}" stroke="#000" stroke-width="6"/>
          <circle cx="150" cy="115" r="55" fill="#fff" stroke="#000" stroke-width="5"/>
          <path d="M 80 230 Q 150 160 220 230" fill="none" stroke="#000" stroke-width="5"/>
          <rect x="25" y="235" width="250" height="45" fill="#121212" stroke="#fff" stroke-width="2" />
          <text x="50%" y="263" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="20" fill="#fff">${charName}</text>
        </svg>`;
        await zipWriter.add(
          `gameAssets/characters/${charName}/image.svg`,
          new TextReader(svgText)
        );

        // Mock passive & instant effects
        const effectSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
          <rect width="100" height="100" fill="#fab005" stroke="#121212" stroke-width="3"/>
          <circle cx="50" cy="50" r="25" fill="#121212" stroke="#121212" stroke-width="2"/>
        </svg>`;
        await zipWriter.add(
          `gameAssets/characters/${charName}/passiveEffects/spin/image.svg`,
          new TextReader(effectSvg)
        );
        await zipWriter.add(
          `gameAssets/characters/${charName}/instantEffects/shake/image.svg`,
          new TextReader(effectSvg)
        );
      }

      // 3. Add SVG images for all locations dynamically
      const locations = Object.keys(demoGameDefinition.story.locations);
      const locColors = ["#e9ecef", "#ced4da", "#adb5bd", "#dee2e6"];
      for (let i = 0; i < locations.length; i++) {
        const locName = locations[i]!;
        const color = locColors[i % locColors.length];
        const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">
          <rect width="400" height="250" fill="${color}" stroke="#121212" stroke-width="6"/>
          <rect x="30" y="80" width="340" height="140" fill="#fff" stroke="#121212" stroke-width="5"/>
          <line x1="30" y1="150" x2="370" y2="150" stroke="#121212" stroke-width="3"/>
          <text x="50%" y="45" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-weight="900" font-size="20" fill="#121212">${locName}</text>
          <text x="50%" y="120" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="14" fill="#3b5bdb">ASSET PREVIEW</text>
        </svg>`;
        await zipWriter.add(
          `gameAssets/locations/${locName}/image.svg`,
          new TextReader(svgText)
        );
      }

      await zipWriter.close();
      const zipBlob = await blobWriter.getData();

      const reader = new BlobReader(zipBlob);
      const bundle = await loadGameBundle(reader);
      setGameBundle(bundle);
      initializeSelections(bundle);
    } catch (err) {
      console.error(err);
      setUploadError("Failed to build the mock demo game bundle.");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------
  // Nested Rendering Helpers
  // ---------------------------------------------------------------------
  const activeSceneInfo = useMemo(() => {
    if (!gameBundle || !selectedSceneId) return null;
    return gameBundle.gameDefinition.story.scenes[selectedSceneId] || null;
  }, [gameBundle, selectedSceneId]);

  const activeCharacterInfo = useMemo(() => {
    if (!gameBundle || !selectedCharacterName) return null;
    const charMeta =
      gameBundle.gameDefinition.story.characters[selectedCharacterName];
    const charAssets = gameBundle.gameAssets.characters[selectedCharacterName];
    return { meta: charMeta, assets: charAssets };
  }, [gameBundle, selectedCharacterName]);

  const activeLocationInfo = useMemo(() => {
    if (!gameBundle || !selectedLocationName) return null;
    const locMeta =
      gameBundle.gameDefinition.story.locations[selectedLocationName];
    const locAssets = gameBundle.gameAssets.locations[selectedLocationName];
    return { meta: locMeta, assets: locAssets };
  }, [gameBundle, selectedLocationName]);

  // ---------------------------------------------------------------------
  // Render Sub-Views
  // ---------------------------------------------------------------------
  const renderDialoguePart = (part: ScriptPart) => {
    const isNarration = part.type === "narration";
    const isInternal = part.type === "internal_dialogue";
    const character = part.type !== "narration" ? part.character : undefined;
    const charColor = isNarration ? "transparent" : "#fab005";

    return (
      <Box
        key={`dialogue-${part.type}-${part.content.slice(0, 20)}`}
        className={classes["dialogueBubble"]}
        style={{
          borderLeft: isNarration
            ? "6px solid #868e96"
            : isInternal
              ? "6px dashed #1c7ed6"
              : `6px solid ${charColor}`,
        }}
      >
        {!isNarration && (
          <Text
            className={classes["dialogueCharName"]}
            c={isInternal ? "blue" : "orange"}
          >
            {character} {isInternal ? "(Internal)" : ""}
          </Text>
        )}
        <Text
          size="sm"
          style={{ fontStyle: isNarration || isInternal ? "italic" : "normal" }}
        >
          {part.content}
        </Text>

        {/* Instant Location effects badge */}
        {part.instantLocationEffects &&
          part.instantLocationEffects.length > 0 && (
            <Group gap={4} mt={6}>
              {part.instantLocationEffects.map((eff: string) => (
                <Badge
                  key={`eff-loc-${eff}`}
                  className={classes["badgeSquare"]}
                  color="red"
                  size="xs"
                  variant="outline"
                >
                  Loc effect: {eff}
                </Badge>
              ))}
            </Group>
          )}

        {/* Instant Character effects badge */}
        {part.instantCharacterEffects &&
          part.instantCharacterEffects.length > 0 && (
            <Group gap={4} mt={4}>
              {part.instantCharacterEffects.map(
                (eff: { character: string; effect: string }) => (
                  <Badge
                    key={`eff-char-${eff.character}-${eff.effect}`}
                    className={classes["badgeSquare"]}
                    color="yellow"
                    size="xs"
                    variant="outline"
                  >
                    {eff.character} ➔ {eff.effect}
                  </Badge>
                )
              )}
            </Group>
          )}
      </Box>
    );
  };

  return (
    <Box className={classes["container"]} p="md">
      {/* --------------------------------------------------------------------- */}
      {/* 1. Dashboard Header Area */}
      {/* --------------------------------------------------------------------- */}
      <Card
        className={`${classes["brutalistBorder"]}`}
        mb="md"
        p="md"
        bg="var(--mantine-color-body)"
      >
        <Grid align="center">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Title className={classes["title"]} order={1}>
              GameBundleViewer
            </Title>
            <Text className={classes["subtitle"]}>
              Ontology Validation & Interactive Tree Canvas Dashboard
            </Text>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 7 }}>
            <Group justify="flex-end" align="center" gap="md">
              <FileInput
                className={`${classes["brutalistBorder"]}`}
                style={{ width: "240px", cursor: "pointer" }}
                placeholder="Upload gamebundle.zip"
                leftSection={<UploadSimple size={18} />}
                onChange={(file) => {
                  handleFileUpload(file).catch(console.error);
                }}
                accept=".zip"
                disabled={isLoading}
              />

              <Button
                className={classes["neoButton"]}
                onClick={() => {
                  handleLoadDemoBundle().catch(console.error);
                }}
                leftSection={<Lightning size={18} />}
                color="yellow"
                loading={isLoading}
              >
                Load Demo Bundle
              </Button>

              {gameBundle && (
                <Group gap="xs">
                  <Badge
                    color="green"
                    size="lg"
                    className={classes["badgeSquare"]}
                  >
                    Scenes:{" "}
                    {Object.keys(gameBundle.gameDefinition.story.scenes).length}
                  </Badge>
                  <Badge
                    color="blue"
                    size="lg"
                    className={classes["badgeSquare"]}
                  >
                    Characters:{" "}
                    {
                      Object.keys(gameBundle.gameDefinition.story.characters)
                        .length
                    }
                  </Badge>
                  <Badge
                    color="grape"
                    size="lg"
                    className={classes["badgeSquare"]}
                  >
                    Locations:{" "}
                    {
                      Object.keys(gameBundle.gameDefinition.story.locations)
                        .length
                    }
                  </Badge>
                  <Badge
                    color={
                      diagnostics.filter((d) => d.type === "error").length > 0
                        ? "red"
                        : "yellow"
                    }
                    size="lg"
                    className={classes["badgeSquare"]}
                  >
                    Diags: {diagnostics.length}
                  </Badge>
                </Group>
              )}
            </Group>
          </Grid.Col>
        </Grid>

        {uploadError && (
          <Alert
            className={`${classes["brutalistBorder"]}`}
            color="red"
            title="Extraction Error"
            icon={<Warning size={16} />}
            mt="md"
          >
            {uploadError}
          </Alert>
        )}
      </Card>

      {!gameBundle ? (
        <Card className={`${classes["neoCard"]}`} style={{ flex: 1 }} p="xl">
          <Stack
            align="center"
            justify="center"
            style={{ height: "100%", minHeight: "300px" }}
          >
            <FilmSlate
              size={64}
              style={{ color: "var(--mantine-color-dimmed)" }}
            />
            <Text
              fw={900}
              size="xl"
              ta="center"
              style={{ textTransform: "uppercase" }}
            >
              No Game Bundle Loaded
            </Text>
            <Text
              size="sm"
              c="dimmed"
              ta="center"
              style={{ maxWidth: "450px" }}
            >
              Please upload a valid Game Bundle ZIP containing a{" "}
              <code>gameDefinition.json</code> file or load our high-fidelity
              Zombie Outbreak demonstration.
            </Text>
            <Button
              className={classes["neoButton"]}
              onClick={() => {
                handleLoadDemoBundle().catch(console.error);
              }}
              size="md"
              color="yellow"
              leftSection={<Play size={18} />}
            >
              Generate & Load Demo
            </Button>
          </Stack>
        </Card>
      ) : (
        <Grid style={{ flex: 1, minHeight: 0 }} gap="md">
          {/* --------------------------------------------------------------------- */}
          {/* 2. Left Column: Interactive Tree-Based Graph Renderer */}
          {/* --------------------------------------------------------------------- */}
          <Grid.Col
            span={{ base: 12, md: 8 }}
            style={{ display: "flex", flexDirection: "column" }}
          >
            <Box style={{ flex: 1, position: "relative", minHeight: "400px" }}>
              <Box className={classes["graphContainer"]}>
                {/* SVG Connecting Paths */}
                <svg
                  id="main-graph-svg"
                  className={classes["graphSvg"]}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUpOrLeave}
                  onMouseLeave={handleMouseUpOrLeave}
                  onWheel={handleWheel}
                >
                  <defs>
                    <marker
                      id="brutalist-arrow"
                      viewBox="0 0 10 10"
                      refX="21"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="currentColor" />
                    </marker>
                  </defs>

                  <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
                    {graphData.links.map((link) => {
                      const fromNode = graphData.nodes.find(
                        (n) => n.id === link.source
                      );
                      const toNode = graphData.nodes.find(
                        (n) => n.id === link.target
                      );

                      if (!fromNode || !toNode) return null;

                      // Source exit port (right face center)
                      const x1 = fromNode.x + colWidth;
                      const y1 = fromNode.y + rowHeight / 2;

                      // Target entry port (left face center)
                      const x2 = toNode.x;
                      const y2 = toNode.y + rowHeight / 2;

                      // Calculate bezier control offsets
                      const dx = Math.abs(x2 - x1);
                      const controlOffset = Math.min(colGap, dx * 0.4);
                      const cx1 = x1 + controlOffset;
                      const cy1 = y1;
                      const cx2 = x2 - controlOffset;
                      const cy2 = y2;

                      const isSelected =
                        selectedSceneId === link.source ||
                        selectedSceneId === link.target;

                      return (
                        <path
                          key={`link-${link.source}-${link.target}`}
                          d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                          className={`${classes["linkLine"]} ${isSelected ? classes["linkLineActive"] : ""}`}
                          markerEnd="url(#brutalist-arrow)"
                          onClick={() => focusOnSceneNode(link.target)}
                        />
                      );
                    })}
                  </g>
                </svg>

                {/* HTML Node Layer Overlay */}
                <Box
                  style={{
                    transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                    transformOrigin: "0 0",
                    width: graphData.canvasWidth,
                    height: graphData.canvasHeight,
                    position: "absolute",
                    left: 0,
                    top: 0,
                    pointerEvents: "none",
                  }}
                >
                  {graphData.nodes.map((node) => {
                    const sceneEntry =
                      gameBundle.gameDefinition.story.scenes[node.id];
                    const isStart =
                      node.id === gameBundle.gameDefinition.story.start;
                    const isCheckpoint =
                      sceneEntry?.type === "impl" &&
                      sceneEntry.scene.isCheckpoint;
                    const isStub = sceneEntry?.type === "stub";

                    // Style Class
                    let nodeClass = classes["nodeCard"];
                    if (isStart) nodeClass += ` ${classes["nodeStart"]}`;
                    else if (isCheckpoint)
                      nodeClass += ` ${classes["nodeCheckpoint"]}`;
                    else if (isStub) nodeClass += ` ${classes["nodeStub"]}`;
                    else if (
                      node.col ===
                        graphData.nodes.reduce(
                          (max, n) => (n.col > max ? n.col : max),
                          0
                        ) &&
                      !isStart &&
                      graphData.links.every((l) => l.target !== node.id)
                    ) {
                      nodeClass += ` ${classes["nodeUnreachable"]}`;
                    }

                    if (selectedSceneId === node.id) {
                      nodeClass += ` ${classes["nodeSelected"]}`;
                    }

                    return (
                      <Box
                        key={`node-${node.id}`}
                        className={nodeClass}
                        style={{
                          left: `${node.x}px`,
                          top: `${node.y}px`,
                          pointerEvents: "auto",
                        }}
                        onClick={() => {
                          setSelectedSceneId(node.id);
                          setActiveSidebarTab("scenes");
                        }}
                      >
                        <Group justify="space-between" align="center" gap={4}>
                          <Text
                            fw={900}
                            size="sm"
                            truncate
                            style={{
                              maxWidth: "140px",
                              fontFamily: "monospace",
                            }}
                          >
                            {node.id}
                          </Text>
                          {isStart && (
                            <Badge
                              color="green"
                              size="xs"
                              className={classes["badgeSquare"]}
                            >
                              START
                            </Badge>
                          )}
                          {isCheckpoint && (
                            <Badge
                              color="grape"
                              size="xs"
                              className={classes["badgeSquare"]}
                            >
                              CHECK
                            </Badge>
                          )}
                          {isStub && (
                            <Badge
                              color="orange"
                              size="xs"
                              className={classes["badgeSquare"]}
                            >
                              STUB
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed" truncate>
                          {sceneEntry?.type === "impl"
                            ? `📍 ${sceneEntry.scene.location}`
                            : "📝 Unimplemented"}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>

                {/* Overlaid Floating Zoom Controls */}
                <Group
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    zIndex: 5,
                  }}
                  gap="xs"
                >
                  <ActionIcon
                    className={`${classes["brutalistBorder"]} ${classes["neoButton"]}`}
                    color="gray"
                    onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
                    size="lg"
                  >
                    <Plus size={18} />
                  </ActionIcon>
                  <ActionIcon
                    className={`${classes["brutalistBorder"]} ${classes["neoButton"]}`}
                    color="gray"
                    onClick={() => setZoom((z) => Math.max(0.3, z / 1.15))}
                    size="lg"
                  >
                    <Minus size={18} />
                  </ActionIcon>
                  <ActionIcon
                    className={`${classes["brutalistBorder"]} ${classes["neoButton"]}`}
                    color="gray"
                    onClick={() => {
                      setZoom(0.85);
                      setPanX(50);
                      setPanY(50);
                    }}
                    size="lg"
                    title="Fit Canvas"
                  >
                    <ArrowsOut size={18} />
                  </ActionIcon>
                </Group>

                {/* Overlaid Floating Legend */}
                <Card
                  className={`${classes["brutalistBorder"]}`}
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    padding: "8px 12px",
                    zIndex: 5,
                    backgroundColor:
                      "light-dark(rgba(255,255,255,0.9), rgba(26,27,30,0.9))",
                  }}
                >
                  <Stack gap={4}>
                    <Text size="xs" fw={900}>
                      LEGEND
                    </Text>
                    <Group gap="xs">
                      <Box
                        style={{
                          width: 10,
                          height: 10,
                          backgroundColor: "#0ca678",
                          border: "1px solid #000",
                        }}
                      />
                      <Text size="xs">Start Scene</Text>
                    </Group>
                    <Group gap="xs">
                      <Box
                        style={{
                          width: 10,
                          height: 10,
                          backgroundColor: "#be4bdb",
                          border: "1px solid #000",
                        }}
                      />
                      <Text size="xs">Checkpoint Scene</Text>
                    </Group>
                    <Group gap="xs">
                      <Box
                        style={{
                          width: 10,
                          height: 10,
                          border: "1px dashed #fd7e14",
                        }}
                      />
                      <Text size="xs">Stub Scene</Text>
                    </Group>
                  </Stack>
                </Card>
              </Box>
            </Box>
          </Grid.Col>

          {/* --------------------------------------------------------------------- */}
          {/* 3. Right Column: Details Sidebar with Tabs */}
          {/* --------------------------------------------------------------------- */}
          <Grid.Col
            span={{ base: 12, md: 4 }}
            style={{ display: "flex", flexDirection: "column" }}
          >
            <Card
              className={`${classes["neoCard"]}`}
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
              p={0}
            >
              <Tabs
                value={activeSidebarTab}
                onChange={(val) => val && setActiveSidebarTab(val)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  width: "100%",
                }}
              >
                <Tabs.List className={classes["neoTabsList"]}>
                  <Tabs.Tab value="scenes" className={classes["neoTab"]}>
                    Scenes
                  </Tabs.Tab>
                  <Tabs.Tab value="characters" className={classes["neoTab"]}>
                    Characters
                  </Tabs.Tab>
                  <Tabs.Tab value="locations" className={classes["neoTab"]}>
                    Locations
                  </Tabs.Tab>
                </Tabs.List>

                {/* --- Scenes Tab --- */}
                <Tabs.Panel
                  value="scenes"
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  p="md"
                >
                  <Grid style={{ flex: 1, minHeight: 0 }} gap="md">
                    <Grid.Col
                      span={5}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        borderRight: "1px solid var(--mantine-color-border)",
                      }}
                    >
                      <Text
                        fw={900}
                        size="sm"
                        mb="xs"
                        style={{ textTransform: "uppercase" }}
                      >
                        Directory
                      </Text>
                      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
                        <div className={classes["listContainer"]}>
                          {Object.keys(
                            gameBundle.gameDefinition.story.scenes
                          ).map((sceneId) => {
                            const isSelected = selectedSceneId === sceneId;
                            const isStub =
                              gameBundle.gameDefinition.story.scenes[sceneId]
                                ?.type === "stub";
                            return (
                              <div
                                key={sceneId}
                                className={`${classes["listItem"]} ${isSelected ? classes["listItemSelected"] : ""}`}
                                onClick={() => setSelectedSceneId(sceneId)}
                                style={{
                                  borderStyle: isStub ? "dashed" : "solid",
                                }}
                              >
                                <Text fw={900} size="xs" truncate>
                                  {sceneId}
                                </Text>
                                <Text size="10px" truncate>
                                  {isStub ? "STUB" : "IMPLEMENTED"}
                                </Text>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </Grid.Col>

                    <Grid.Col
                      span={7}
                      style={{ display: "flex", flexDirection: "column" }}
                    >
                      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
                        {activeSceneInfo ? (
                          <Stack gap="sm">
                            <Group justify="space-between" align="center">
                              <Text
                                fw={900}
                                size="lg"
                                style={{ wordBreak: "break-all" }}
                              >
                                {selectedSceneId}
                              </Text>
                              <Button
                                size="xs"
                                variant="outline"
                                className={`${classes["neoButton"]}`}
                                color="yellow"
                                onClick={() =>
                                  selectedSceneId &&
                                  focusOnSceneNode(selectedSceneId)
                                }
                              >
                                Center
                              </Button>
                            </Group>

                            {activeSceneInfo.type === "stub" ? (
                              <Alert
                                color="orange"
                                icon={<Warning size={16} />}
                                className={classes["brutalistBorder"]}
                              >
                                <Text fw={900} size="xs" mb={4}>
                                  SCENE STUB
                                </Text>
                                <Text size="xs">
                                  {activeSceneInfo.scene.description}
                                </Text>
                              </Alert>
                            ) : (
                              <Stack gap="xs">
                                <Group gap="xs">
                                  <Badge
                                    color="blue"
                                    className={classes["badgeSquare"]}
                                  >
                                    Checkpoint:{" "}
                                    {activeSceneInfo.scene.isCheckpoint
                                      ? "Yes"
                                      : "No"}
                                  </Badge>
                                  {activeSceneInfo.scene.checkpoint && (
                                    <Badge
                                      color="grape"
                                      className={classes["badgeSquare"]}
                                    >
                                      {activeSceneInfo.scene.checkpoint}
                                    </Badge>
                                  )}
                                </Group>

                                <Box>
                                  <Text size="xs" fw={900} c="dimmed">
                                    📍 LOCATION
                                  </Text>
                                  <Text
                                    size="sm"
                                    fw={700}
                                    style={{
                                      cursor: "pointer",
                                      textDecoration: "underline",
                                    }}
                                    onClick={() => {
                                      setSelectedLocationName(
                                        activeSceneInfo.scene.location
                                      );
                                      setActiveSidebarTab("locations");
                                    }}
                                  >
                                    {activeSceneInfo.scene.location}
                                  </Text>
                                </Box>

                                {activeSceneInfo.scene.passiveLocationEffects &&
                                  activeSceneInfo.scene.passiveLocationEffects
                                    .length > 0 && (
                                    <Box>
                                      <Text size="xs" fw={900} c="dimmed">
                                        🌌 PASSIVE LOCATION EFFECTS
                                      </Text>
                                      <Group gap={4} mt={2}>
                                        {activeSceneInfo.scene.passiveLocationEffects.map(
                                          (eff) => (
                                            <Badge
                                              key={eff}
                                              color="teal"
                                              size="xs"
                                              className={classes["badgeSquare"]}
                                            >
                                              {eff}
                                            </Badge>
                                          )
                                        )}
                                      </Group>
                                    </Box>
                                  )}

                                {activeSceneInfo.scene
                                  .passiveCharacterEffects &&
                                  activeSceneInfo.scene.passiveCharacterEffects
                                    .length > 0 && (
                                    <Box>
                                      <Text size="xs" fw={900} c="dimmed">
                                        🎭 PASSIVE CHARACTER EFFECTS
                                      </Text>
                                      <Group gap={4} mt={2}>
                                        {activeSceneInfo.scene.passiveCharacterEffects.map(
                                          (eff) => (
                                            <Badge
                                              key={`passive-char-${eff.character}-${eff.effect}`}
                                              color="pink"
                                              size="xs"
                                              className={classes["badgeSquare"]}
                                            >
                                              {eff.character}: {eff.effect}
                                            </Badge>
                                          )
                                        )}
                                      </Group>
                                    </Box>
                                  )}

                                <Divider my="xs" />

                                <Box>
                                  <Text size="xs" fw={900} c="dimmed" mb="xs">
                                    📜 SCRIPT DIALOGUE
                                  </Text>
                                  {activeSceneInfo.scene.script?.map((part) =>
                                    renderDialoguePart(part)
                                  )}
                                </Box>

                                <Divider my="xs" />

                                <Box>
                                  <Text size="xs" fw={900} c="dimmed" mb="xs">
                                    🧭 DECISIONS / CHOICES
                                  </Text>
                                  {activeSceneInfo.scene.choices?.length ===
                                  0 ? (
                                    <Text
                                      size="xs"
                                      style={{ fontStyle: "italic" }}
                                      c="dimmed"
                                    >
                                      This scene represents a storyline
                                      conclusion.
                                    </Text>
                                  ) : (
                                    <Stack gap="xs">
                                      {activeSceneInfo.scene.choices?.map(
                                        (choice) => (
                                          <Card
                                            key={`choice-${choice.targetScene}-${choice.label}`}
                                            className={`${classes["brutalistBorder"]}`}
                                            p="xs"
                                            bg="var(--mantine-color-body)"
                                          >
                                            <Text
                                              size="xs"
                                              fw={900}
                                              color="orange"
                                            >
                                              {choice.label}
                                            </Text>
                                            <Text size="11px" c="dimmed" mb={6}>
                                              {choice.description}
                                            </Text>
                                            <Button
                                              size="xs"
                                              color="yellow"
                                              className={`${classes["neoButton"]}`}
                                              onClick={() =>
                                                focusOnSceneNode(
                                                  choice.targetScene
                                                )
                                              }
                                              style={{
                                                alignSelf: "flex-start",
                                              }}
                                            >
                                              Jump to "{choice.targetScene}"
                                            </Button>
                                          </Card>
                                        )
                                      )}
                                    </Stack>
                                  )}
                                </Box>
                              </Stack>
                            )}
                          </Stack>
                        ) : (
                          <Center style={{ height: "100%" }}>
                            <Text size="xs" c="dimmed">
                              No scene selected.
                            </Text>
                          </Center>
                        )}
                      </ScrollArea>
                    </Grid.Col>
                  </Grid>
                </Tabs.Panel>

                {/* --- Characters Tab --- */}
                <Tabs.Panel
                  value="characters"
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  p="md"
                >
                  <Grid style={{ flex: 1, minHeight: 0 }} gap="md">
                    <Grid.Col
                      span={5}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        borderRight: "1px solid var(--mantine-color-border)",
                      }}
                    >
                      <Text
                        fw={900}
                        size="sm"
                        mb="xs"
                        style={{ textTransform: "uppercase" }}
                      >
                        Directory
                      </Text>
                      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
                        <div className={classes["listContainer"]}>
                          {Object.keys(
                            gameBundle.gameDefinition.story.characters
                          ).map((charName) => {
                            const isSelected =
                              selectedCharacterName === charName;
                            return (
                              <div
                                key={charName}
                                className={`${classes["listItem"]} ${isSelected ? classes["listItemSelected"] : ""}`}
                                onClick={() =>
                                  setSelectedCharacterName(charName)
                                }
                              >
                                <Text fw={900} size="xs">
                                  {charName}
                                </Text>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </Grid.Col>

                    <Grid.Col
                      span={7}
                      style={{ display: "flex", flexDirection: "column" }}
                    >
                      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
                        {activeCharacterInfo && activeCharacterInfo.meta ? (
                          <Stack gap="sm">
                            <Text fw={900} size="lg">
                              {selectedCharacterName}
                            </Text>

                            {/* Render Image asset if available */}
                            {activeCharacterInfo.assets?.image ? (
                              <img
                                src={activeCharacterInfo.assets.image}
                                alt={selectedCharacterName || ""}
                                style={{
                                  width: "100%",
                                  maxHeight: "180px",
                                  objectFit: "contain",
                                  border: "2px solid #121212",
                                }}
                              />
                            ) : (
                              <Box
                                className={classes["assetThumbnail"]}
                                style={{ width: "100%", height: "140px" }}
                              >
                                <User size={48} style={{ opacity: 0.3 }} />
                                <Text size="xs" c="dimmed">
                                  No Image Asset
                                </Text>
                              </Box>
                            )}

                            <div>
                              <Text size="xs" fw={900} c="dimmed">
                                📖 VIGNETTE
                              </Text>
                              <Text size="sm">
                                {activeCharacterInfo.meta.vignette}
                              </Text>
                            </div>

                            <div>
                              <Text size="xs" fw={900} c="dimmed">
                                🕶️ APPEARANCE
                              </Text>
                              <Text size="sm">
                                {activeCharacterInfo.meta.appearanceDescription}
                              </Text>
                            </div>

                            <div>
                              <Text size="xs" fw={900} c="dimmed">
                                🕯️ BACKSTORY
                              </Text>
                              <Text size="sm" c="dimmed">
                                {activeCharacterInfo.meta.backstoryDescription}
                              </Text>
                            </div>

                            {/* Active Effects in assets */}
                            {activeCharacterInfo.assets && (
                              <div>
                                <Text size="xs" fw={900} c="dimmed" mb={4}>
                                  🎒 COMPILED EFFECT ASSETS
                                </Text>
                                <Stack gap={4}>
                                  {Object.entries(
                                    activeCharacterInfo.assets.passiveEffects ||
                                      {}
                                  ).map(([eff, data]) => {
                                    const typedData = data;
                                    return (
                                      <Group
                                        justify="space-between"
                                        key={`passive-${eff}`}
                                      >
                                        <Text size="xs" fw={900}>
                                          Passive: {eff}
                                        </Text>
                                        <Badge
                                          color={
                                            typedData.image ? "green" : "gray"
                                          }
                                          size="xs"
                                          className={classes["badgeSquare"]}
                                        >
                                          {typedData.image
                                            ? "HAS ASSET"
                                            : "NO ASSET"}
                                        </Badge>
                                      </Group>
                                    );
                                  })}
                                  {Object.entries(
                                    activeCharacterInfo.assets.instantEffects ||
                                      {}
                                  ).map(([eff, data]) => {
                                    const typedData = data;
                                    return (
                                      <Group
                                        justify="space-between"
                                        key={`instant-${eff}`}
                                      >
                                        <Text size="xs" fw={900}>
                                          Instant: {eff}
                                        </Text>
                                        <Badge
                                          color={
                                            typedData.image ? "green" : "gray"
                                          }
                                          size="xs"
                                          className={classes["badgeSquare"]}
                                        >
                                          {typedData.image
                                            ? "HAS ASSET"
                                            : "NO ASSET"}
                                        </Badge>
                                      </Group>
                                    );
                                  })}
                                </Stack>
                              </div>
                            )}
                          </Stack>
                        ) : (
                          <Center style={{ height: "100%" }}>
                            <Text size="xs" c="dimmed">
                              No character selected.
                            </Text>
                          </Center>
                        )}
                      </ScrollArea>
                    </Grid.Col>
                  </Grid>
                </Tabs.Panel>

                {/* --- Locations Tab --- */}
                <Tabs.Panel
                  value="locations"
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  p="md"
                >
                  <Grid style={{ flex: 1, minHeight: 0 }} gap="md">
                    <Grid.Col
                      span={5}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        borderRight: "1px solid var(--mantine-color-border)",
                      }}
                    >
                      <Text
                        fw={900}
                        size="sm"
                        mb="xs"
                        style={{ textTransform: "uppercase" }}
                      >
                        Directory
                      </Text>
                      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
                        <div className={classes["listContainer"]}>
                          {Object.keys(
                            gameBundle.gameDefinition.story.locations
                          ).map((locName) => {
                            const isSelected = selectedLocationName === locName;
                            return (
                              <div
                                key={locName}
                                className={`${classes["listItem"]} ${isSelected ? classes["listItemSelected"] : ""}`}
                                onClick={() => setSelectedLocationName(locName)}
                              >
                                <Text fw={900} size="xs">
                                  {locName}
                                </Text>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </Grid.Col>

                    <Grid.Col
                      span={7}
                      style={{ display: "flex", flexDirection: "column" }}
                    >
                      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
                        {activeLocationInfo && activeLocationInfo.meta ? (
                          <Stack gap="sm">
                            <Text fw={900} size="lg">
                              {selectedLocationName}
                            </Text>

                            {/* Render Image asset if available */}
                            {activeLocationInfo.assets?.image ? (
                              <img
                                src={activeLocationInfo.assets.image}
                                alt={selectedLocationName || ""}
                                style={{
                                  width: "100%",
                                  maxHeight: "180px",
                                  objectFit: "contain",
                                  border: "2px solid #121212",
                                }}
                              />
                            ) : (
                              <Box
                                className={classes["assetThumbnail"]}
                                style={{ width: "100%", height: "140px" }}
                              >
                                <MapPin size={48} style={{ opacity: 0.3 }} />
                                <Text size="xs" c="dimmed">
                                  No Image Asset
                                </Text>
                              </Box>
                            )}

                            <div>
                              <Text size="xs" fw={900} c="dimmed">
                                📖 VIGNETTE
                              </Text>
                              <Text size="sm">
                                {activeLocationInfo.meta.vignette}
                              </Text>
                            </div>

                            <div>
                              <Text size="xs" fw={900} c="dimmed">
                                🏠 APPEARANCE
                              </Text>
                              <Text size="sm">
                                {activeLocationInfo.meta.appearanceDescription}
                              </Text>
                            </div>

                            <div>
                              <Text size="xs" fw={900} c="dimmed">
                                🕯️ BACKSTORY
                              </Text>
                              <Text size="sm" c="dimmed">
                                {activeLocationInfo.meta.backstoryDescription}
                              </Text>
                            </div>
                          </Stack>
                        ) : (
                          <Center style={{ height: "100%" }}>
                            <Text size="xs" c="dimmed">
                              No location selected.
                            </Text>
                          </Center>
                        )}
                      </ScrollArea>
                    </Grid.Col>
                  </Grid>
                </Tabs.Panel>
              </Tabs>
            </Card>
          </Grid.Col>
        </Grid>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 4. Collapsible Drawer Panel: Global Diagnostics Suite */}
      {/* --------------------------------------------------------------------- */}
      {gameBundle && (
        <Card
          className={`${classes["brutalistBorder"]}`}
          mt="md"
          p={0}
          bg="var(--mantine-color-body)"
        >
          <Group
            justify="space-between"
            p="xs"
            onClick={() => setIsDiagnosticsOpen((open) => !open)}
            style={{
              cursor: "pointer",
              borderBottom: isDiagnosticsOpen ? "2px solid #121212" : "none",
            }}
          >
            <Group gap="xs">
              <Warning size={18} color="#fab005" />
              <Text fw={900} size="sm">
                GLOBAL DIAGNOSTICS & STORY ONTOLOGY ANALYSIS
              </Text>
              <Badge
                color="yellow"
                variant="filled"
                className={classes["badgeSquare"]}
              >
                {diagnostics.length} Issues Found
              </Badge>
            </Group>
            {isDiagnosticsOpen ? (
              <CaretDown size={18} />
            ) : (
              <CaretUp size={18} />
            )}
          </Group>

          {isDiagnosticsOpen && (
            <ScrollArea style={{ height: "200px" }} p="md" scrollbarSize={8}>
              {diagnostics.length === 0 ? (
                <Group
                  justify="center"
                  align="center"
                  style={{ height: "100%" }}
                >
                  <CheckCircle size={32} color="#0ca678" />
                  <Text fw={900} size="sm">
                    No compilation or ontology issues detected! The Game Bundle
                    is perfectly valid.
                  </Text>
                </Group>
              ) : (
                <Grid gap="xs">
                  {diagnostics.map((diag) => {
                    let diagClass = classes["diagnosticCard"];
                    let icon = <Info size={18} />;

                    if (diag.type === "error") {
                      diagClass += ` ${classes["diagError"]}`;
                      icon = <XCircle size={18} color="#f03e3e" />;
                    } else if (diag.type === "warning") {
                      diagClass += ` ${classes["diagWarning"]}`;
                      icon = <Warning size={18} color="#f59f00" />;
                    } else if (diag.type === "info") {
                      diagClass += ` ${classes["diagInfo"]}`;
                      icon = <Info size={18} color="#1c7ed6" />;
                    }

                    return (
                      <Grid.Col span={{ base: 12, md: 6 }} key={diag.id}>
                        <div
                          className={diagClass}
                          onClick={() => handleDiagnosticClick(diag)}
                        >
                          <Group align="flex-start" gap="xs">
                            {icon}
                            <div style={{ flex: 1 }}>
                              <Group justify="space-between" align="center">
                                <Text
                                  fw={900}
                                  size="xs"
                                  style={{ textTransform: "uppercase" }}
                                >
                                  {diag.title}
                                </Text>
                                <Badge
                                  color="dark"
                                  size="xs"
                                  className={classes["badgeSquare"]}
                                >
                                  {diag.target
                                    ? `${diag.target.kind}: ${diag.target.id}`
                                    : "global"}
                                </Badge>
                              </Group>
                              <Text size="xs" mt={4}>
                                {diag.description}
                              </Text>
                              {diag.target && (
                                <Text
                                  size="10px"
                                  c="dimmed"
                                  mt={4}
                                  style={{ textDecoration: "underline" }}
                                >
                                  Click to jump to and focus target item
                                </Text>
                              )}
                            </div>
                          </Group>
                        </div>
                      </Grid.Col>
                    );
                  })}
                </Grid>
              )}
            </ScrollArea>
          )}
        </Card>
      )}
    </Box>
  );
}
