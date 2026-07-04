import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Title,
  Text,
  Tabs,
  Button,
  ActionIcon,
  TextInput,
  Select,
  Card,
  Badge,
  ScrollArea,
  Modal,
  Group,
  Stack,
  Tooltip,
  Divider,
  FileInput,
  Textarea,
  Alert,
  Autocomplete,
} from "@mantine/core";
import {
  MapPin,
  FilmSlate,
  User,
  Database,
  DownloadSimple,
  UploadSimple,
  Plus,
  Minus,
  ArrowsOut,
  Tree,
  Atom,
  Broom,
  Pause,
  Play,
  MagnifyingGlass,
  CloudRain,
  Sparkle,
  BookOpen,
  ChatTeardrop,
  Door,
  ArrowLeft,
  ArrowRight,
  Star,
  Dress,
  Scroll,
  Eye,
  Buildings,
  Flag,
  FlagCheckered,
  Lock,
} from "@phosphor-icons/react";
import classes from "@/pages/StateViewerV1.module.css";

import type { State } from "@/core/agents/DesignerAgentV1";
import type { Story } from "@/core/ontology";

// Local typed representations to comply with strict unused-import and explicit-any configurations
interface LocalScriptPart {
  type: "narration" | "dialogue" | "internal_dialogue";
  character?: string;
  content: string;
  instantLocationEffects?: string[];
  instantCharacterEffects?: { character: string; effect: string }[];
}

interface LocalChoice {
  description: string;
  label: string;
  targetScene: string;
}

interface LocalScene {
  location: string;
  passiveLocationEffects?: string[];
  passiveCharacterEffects?: { character: string; effect: string }[];
  script?: LocalScriptPart[];
  choices?: LocalChoice[];
  isCheckpoint?: boolean;
  checkpoint?: "frontier" | "interior";
}

// Graph Types
interface GraphNode {
  id: string; // SceneId
  type: "stub" | "impl";
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  choiceIndex: number;
}

interface ParsedJsonData {
  gameDefinition?: {
    story?: {
      scenes?: Record<string, unknown>;
    };
  };
  story?: {
    scenes?: Record<string, unknown>;
  };
  scenes?: Record<string, unknown>;
  start?: string;
}

// Helper to calculate BFS story depth from start
const calculateDepths = (story: Story): Record<string, number> => {
  const depths: Record<string, number> = {};
  const queue: string[] = [];

  const start = story.start;
  if (start && story.scenes[start]) {
    depths[start] = 0;
    queue.push(start);
  }

  // BFS Queue loop
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths[current] ?? 0;

    const entry = story.scenes[current];
    if (entry && entry.type === "impl") {
      const scene = entry.scene;
      if (scene.choices && Array.isArray(scene.choices)) {
        scene.choices.forEach((choice) => {
          if (
            choice &&
            choice.targetScene &&
            story.scenes[choice.targetScene]
          ) {
            if (depths[choice.targetScene] === undefined) {
              depths[choice.targetScene] = currentDepth + 1;
              queue.push(choice.targetScene);
            }
          }
        });
      }
    }
  }

  // Assign max depth + 1 to any orphan/unreachable scenes
  let maxDepth = 0;
  Object.values(depths).forEach((d) => {
    if (d > maxDepth) maxDepth = d;
  });

  Object.keys(story.scenes).forEach((id) => {
    if (depths[id] === undefined) {
      depths[id] = maxDepth + 1;
    }
  });

  return depths;
};

// --- Safe Helper for Extracting JSON Module Content ---
function getJsonContent(moduleValue: unknown): unknown {
  if (moduleValue && typeof moduleValue === "object") {
    const modRecord = moduleValue as Record<string, unknown>;
    if (modRecord["default"] !== undefined) {
      return modRecord["default"];
    }
  }
  return moduleValue;
}

export function StateViewerV1() {
  // 1. Load static state files in `examples/` via Vite Glob
  const staticStateModules = useMemo(() => {
    try {
      return import.meta.glob("../examples/*-state.json", {
        eager: true,
      });
    } catch (e) {
      console.warn(
        "Failed to eager-load static states. Empty directory or environment issue.",
        e
      );
      return {};
    }
  }, []);

  // 2. Compile all states
  const parsedStates = useMemo(() => {
    const statesMap: Record<string, { name: string; state: State }> = {};

    // Process static glob modules
    Object.entries(staticStateModules).forEach(([path, mod]) => {
      const stateObj = getJsonContent(mod) as State;
      const filename = path.split("/").pop() || path;
      const key = `static-${filename}`;

      // Format name nicely
      const cleanName = filename.replace(/\.json$/, "");
      const parts = cleanName.split("-state");
      // const name =
      //   parts.length === 2
      //     ? `${parts[0]!
      //         .split("-")
      //         .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      //         .join(" ")} (State ${parts[1]!.toUpperCase()})`
      //     : cleanName
      //         .split(/[-_]+/)
      //         .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      //         .join(" ");
      const name = parts[0]!;

      statesMap[key] = {
        name,
        state: stateObj,
      };
    });

    return statesMap;
  }, [staticStateModules]);

  const [selectedDatasetKey, setSelectedDatasetKey] = useState<string>("");
  const datasetKey =
    selectedDatasetKey ||
    (Object.keys(parsedStates).length > 0
      ? Object.keys(parsedStates)[0]!
      : "custom");

  const [customState, setCustomState] = useState<State | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  // Active State Resolver
  const activeState = useMemo((): State => {
    if (datasetKey === "custom" && customState) {
      return customState;
    }
    const found = parsedStates[datasetKey];
    if (found) {
      return found.state;
    }
    // Fallback if nothing matches
    return customState || (Object.values(parsedStates)[0]?.state as State);
  }, [datasetKey, customState, parsedStates]);

  const story = useMemo(() => activeState.gameDefinition.story, [activeState]);

  // Pre-calculate story BFS depths
  const sceneDepths = useMemo(() => {
    return calculateDepths(story);
  }, [story]);

  const [prevStory, setPrevStory] = useState<Story | null>(null);

  // --- UI Interactivity State ---
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedCharacterName, setSelectedCharacterName] = useState<
    string | null
  >(null);
  const [selectedLocationName, setSelectedLocationName] = useState<
    string | null
  >(null);

  const [activeTab, setActiveTab] = useState<string | null>("scenes");
  const [searchQuery, setSearchQuery] = useState("");
  const [sceneFilter, setSceneFilter] = useState<"all" | "impl" | "stub">(
    "all"
  );

  // Layout Style State: "tree" (layered tree layout) or "free" (classic force-directed radial layout)
  const [layoutStyle, setLayoutStyle] = useState<"tree" | "free">("tree");

  // --- Graph State ---
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [simulationActive, setSimulationActive] = useState(true);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);

  // Zoom / Pan State
  const [panX, setPanX] = useState(150);
  const [panY, setPanY] = useState(100);
  const [scale, setScale] = useState(0.8);

  const dragInfoRef = useRef<{
    isPanning: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    draggedNodeId: string | null;
  }>({
    isPanning: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    draggedNodeId: null,
  });

  // Rebuild Graph Nodes and Links when active story changes
  const rebuildGraph = useCallback(
    (activeStory: Story, currentNodes: GraphNode[]) => {
      const sceneIds = Object.keys(activeStory.scenes);
      const existingNodesMap = new Map(currentNodes.map((n) => [n.id, n]));

      const width = 800;
      const height = 600;
      const centerX = width / 2;
      const centerY = height / 2;

      const newNodes: GraphNode[] = sceneIds.map((id, index) => {
        const sceneEntry = activeStory.scenes[id];
        const existing = existingNodesMap.get(id);
        const depth = sceneDepths[id] ?? 0;

        if (existing) {
          return {
            ...existing,
            type: sceneEntry ? sceneEntry.type : "stub",
          };
        } else {
          if (layoutStyle === "tree") {
            // Tree arrangement: distribute horizontally within narrative depth levels
            const nodesAtDepth = sceneIds.filter(
              (nid) => sceneDepths[nid] === depth
            );
            const positionInDepth = nodesAtDepth.indexOf(id);
            const totalAtDepth = nodesAtDepth.length;

            const xOffset =
              totalAtDepth > 1
                ? (positionInDepth - (totalAtDepth - 1) / 2) * 160
                : 0;

            return {
              id,
              type: sceneEntry ? sceneEntry.type : "stub",
              x: centerX + xOffset + (Math.random() - 0.5) * 15,
              y: 80 + depth * 150 + (Math.random() - 0.5) * 10,
              vx: 0,
              vy: 0,
              fx: null,
              fy: null,
            };
          } else {
            // Standard circular force-directed distribution
            const angle = (index / sceneIds.length) * 2 * Math.PI;
            const radius = 100 + Math.sqrt(sceneIds.length) * 35;
            return {
              id,
              type: sceneEntry ? sceneEntry.type : "stub",
              x:
                centerX + radius * Math.cos(angle) + (Math.random() - 0.5) * 10,
              y:
                centerY + radius * Math.sin(angle) + (Math.random() - 0.5) * 10,
              vx: 0,
              vy: 0,
              fx: null,
              fy: null,
            };
          }
        }
      });

      const newLinks: GraphLink[] = [];
      sceneIds.forEach((id) => {
        const sceneEntry = activeStory.scenes[id];
        if (sceneEntry && sceneEntry.type === "impl") {
          const scene = sceneEntry.scene;
          if (scene.choices && Array.isArray(scene.choices)) {
            scene.choices.forEach((choice, choiceIdx) => {
              if (choice && choice.targetScene) {
                newLinks.push({
                  source: id,
                  target: choice.targetScene,
                  label:
                    choice.label ||
                    choice.description ||
                    `Choice ${choiceIdx + 1}`,
                  choiceIndex: choiceIdx,
                });
              }
            });
          }
        }
      });

      setNodes(newNodes);
      setLinks(newLinks);
    },
    [layoutStyle, sceneDepths]
  );

  // Synchronously update graph state when the story changes
  if (prevStory !== story) {
    setPrevStory(story);
    rebuildGraph(story, nodes);
    setSelectedSceneId(story.start);
    setSelectedCharacterName(null);
    setSelectedLocationName(null);
  }

  // Trigger full reset of layout positions
  const handleResetLayout = () => {
    rebuildGraph(story, []);
    setSimulationActive(true);
  };

  // Physics Simulation Loop with Layer/Sugiyama Force Alignments
  useEffect(() => {
    if (!simulationActive) return;

    let animFrameId: number;

    const step = () => {
      setNodes((currentNodes) => {
        if (currentNodes.length === 0) return currentNodes;

        const width = 800;
        const height = 600;
        const centerX = width / 2;
        const centerY = height / 2;

        const kRepel = 1600;
        const kAttract = 0.05;
        const kCenter = 0.015;
        const kLayer = 0.15; // Vertical layered suggestion alignment force
        const damping = 0.82;
        const restLength = 150;

        const nextNodes = currentNodes.map((n) => ({ ...n }));

        // 1. Repulsion force between all nodes
        for (let i = 0; i < nextNodes.length; i++) {
          const u = nextNodes[i];
          if (!u) continue;
          for (let j = i + 1; j < nextNodes.length; j++) {
            const v = nextNodes[j];
            if (!v) continue;
            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 1;

            const force = kRepel / (distSq + 100);
            const fx = force * (dx / dist);
            const fy = force * (dy / dist);

            if (u.fx === null) {
              u.vx -= fx;
              u.vy -= fy;
            }
            if (v.fx === null) {
              v.vx += fx;
              v.vy += fy;
            }
          }
        }

        // 2. Attraction force along links
        const nodeMap = new Map(nextNodes.map((n) => [n.id, n]));
        links.forEach((link) => {
          const u = nodeMap.get(link.source);
          const v = nodeMap.get(link.target);
          if (u && v) {
            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const force = kAttract * (dist - restLength);
            const fx = force * (dx / dist);
            const fy = force * (dy / dist);

            if (u.fx === null) {
              u.vx += fx;
              u.vy += fy;
            }
            if (v.fx === null) {
              v.vx -= fx;
              v.vy -= fy;
            }
          }
        });

        // 3. Center gravity / Layer alignment Sugiyama force
        nextNodes.forEach((u) => {
          if (u && u.fx === null) {
            if (layoutStyle === "tree") {
              // Pull horizontally to center
              u.vx += kCenter * (centerX - u.x);

              // Pull vertically to matching narrative layer depth
              const depth = sceneDepths[u.id] ?? 0;
              const targetY = 80 + depth * 150;
              u.vy += kLayer * (targetY - u.y);
            } else {
              // Standard circular force-directed alignments
              u.vx += kCenter * (centerX - u.x);
              u.vy += kCenter * (centerY - u.y);
            }
          }
        });

        // 4. Update positions & apply damping
        nextNodes.forEach((u) => {
          if (u) {
            if (u.fx !== null) {
              u.x = u.fx;
              u.y = u.fy!;
              u.vx = 0;
              u.vy = 0;
            } else {
              u.x += u.vx;
              u.y += u.vy;
              u.vx *= damping;
              u.vy *= damping;
            }
          }
        });

        return nextNodes;
      });

      animFrameId = requestAnimationFrame(step);
    };

    animFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameId);
  }, [simulationActive, links, layoutStyle, sceneDepths]);

  // Center view on a specific node
  const centerOnNode = useCallback(
    (nodeId: string, currentNodes: GraphNode[]) => {
      const node = currentNodes.find((n) => n.id === nodeId);
      if (node) {
        const svgElement = document.getElementById("main-graph-svg");
        const svgWidth = svgElement?.clientWidth || 800;
        const svgHeight = svgElement?.clientHeight || 600;

        const targetScale = 1.0;
        const newPanX = svgWidth / 2 - node.x * targetScale;
        const newPanY = svgHeight / 2 - node.y * targetScale;

        setScale(targetScale);
        setPanX(newPanX);
        setPanY(newPanY);
      }
    },
    []
  );

  // Fit whole graph into view
  const handleFitToView = useCallback(() => {
    if (nodes.length === 0) return;

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    nodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const graphWidth = maxX - minX || 1;
    const graphHeight = maxY - minY || 1;

    const svgElement = document.getElementById("main-graph-svg");
    const svgWidth = svgElement?.clientWidth || 800;
    const svgHeight = svgElement?.clientHeight || 600;

    const padding = 0.15;
    const scaleX = (svgWidth * (1 - padding * 2)) / graphWidth;
    const scaleY = (svgHeight * (1 - padding * 2)) / graphHeight;
    const newScale = Math.min(Math.min(scaleX, scaleY), 1.3);

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    const newPanX = svgWidth / 2 - graphCenterX * newScale;
    const newPanY = svgHeight / 2 - graphCenterY * newScale;

    setScale(newScale);
    setPanX(newPanX);
    setPanY(newPanY);
  }, [nodes]);

  // --- Zoom / Pan handlers ---
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    const nodeId = target.getAttribute("data-node-id");

    if (nodeId) {
      dragInfoRef.current = {
        isPanning: false,
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panX,
        startPanY: panY,
        draggedNodeId: nodeId,
      };

      setNodes((currentNodes) =>
        currentNodes.map((n) => {
          if (n.id === nodeId) {
            return { ...n, fx: n.x, fy: n.y };
          }
          return n;
        })
      );
      setSelectedSceneId(nodeId);
      setActiveTab("scenes");
    } else {
      dragInfoRef.current = {
        isPanning: true,
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panX,
        startPanY: panY,
        draggedNodeId: null,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const dragInfo = dragInfoRef.current;

    if (dragInfo.isPanning) {
      const dx = e.clientX - dragInfo.startX;
      const dy = e.clientY - dragInfo.startY;
      setPanX(dragInfo.startPanX + dx);
      setPanY(dragInfo.startPanY + dy);
    } else if (dragInfo.draggedNodeId) {
      const nodeId = dragInfo.draggedNodeId;
      const dx = (e.clientX - dragInfo.startX) / scale;
      const dy = (e.clientY - dragInfo.startY) / scale;

      setNodes((currentNodes) =>
        currentNodes.map((n) => {
          if (n.id === nodeId) {
            return { ...n, fx: (n.fx ?? n.x) + dx, fy: (n.fy ?? n.y) + dy };
          }
          return n;
        })
      );

      dragInfo.startX = e.clientX;
      dragInfo.startY = e.clientY;
    }
  };

  const handleMouseUpOrLeave = () => {
    const dragInfo = dragInfoRef.current;
    if (dragInfo.draggedNodeId) {
      const nodeId = dragInfo.draggedNodeId;
      setNodes((currentNodes) =>
        currentNodes.map((n) => {
          if (n.id === nodeId) {
            return { ...n, fx: null, fy: null };
          }
          return n;
        })
      );
    }
    dragInfoRef.current = {
      isPanning: false,
      startX: 0,
      startY: 0,
      startPanX: 0,
      startPanY: 0,
      draggedNodeId: null,
    };
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomIntensity = 0.05;
    const delta = -e.deltaY;
    const zoomFactor = delta > 0 ? 1 + zoomIntensity : 1 - zoomIntensity;

    const newScale = Math.min(Math.max(scale * zoomFactor, 0.15), 4);
    setScale(newScale);
  };

  // --- Deep linking navigators ---
  const navigateToScene = useCallback(
    (id: string) => {
      setSelectedSceneId(id);
      setActiveTab("scenes");
      setNodes((currentNodes) => {
        centerOnNode(id, currentNodes);
        return currentNodes;
      });
    },
    [centerOnNode]
  );

  const navigateToCharacter = (charName: string) => {
    setSelectedCharacterName(charName);
    setActiveTab("characters");
  };

  const navigateToLocation = (locName: string) => {
    setSelectedLocationName(locName);
    setActiveTab("locations");
  };

  // --- Helper calculations for lists ---
  const characterAppearances = useMemo(() => {
    const map: Record<string, string[]> = {};
    Object.keys(story.characters).forEach((charName) => {
      map[charName] = [];
    });

    Object.keys(story.scenes).forEach((sceneId) => {
      const sceneEntry = story.scenes[sceneId];
      if (sceneEntry && sceneEntry.type === "impl") {
        const s = sceneEntry.scene;
        const charsInScene = new Set<string>();

        // Check passive character effects
        s.passiveCharacterEffects?.forEach((p) => {
          if (p && p.character) charsInScene.add(p.character);
        });

        // Check script dialogues/effects
        s.script?.forEach((part) => {
          if (part.type === "dialogue" || part.type === "internal_dialogue") {
            if (part.character) charsInScene.add(part.character);
          }
          if (part.type === "narration" && part.instantCharacterEffects) {
            part.instantCharacterEffects.forEach((eff) => {
              if (eff && eff.character) charsInScene.add(eff.character);
            });
          }
        });

        charsInScene.forEach((char) => {
          if (map[char]) {
            map[char].push(sceneId);
          }
        });
      }
    });

    return map;
  }, [story]);

  const locationScenes = useMemo(() => {
    const map: Record<string, string[]> = {};
    Object.keys(story.locations).forEach((locName) => {
      map[locName] = [];
    });

    Object.keys(story.scenes).forEach((sceneId) => {
      const sceneEntry = story.scenes[sceneId];
      if (sceneEntry && sceneEntry.type === "impl") {
        const s = sceneEntry.scene;
        if (s.location && map[s.location]) {
          map[s.location]?.push(sceneId);
        }
      }
    });

    return map;
  }, [story]);

  // --- Search and filtering lists ---
  const filteredSceneIds = useMemo(() => {
    return Object.keys(story.scenes).filter((id) => {
      const sceneEntry = story.scenes[id];
      const matchesSearch = id
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesFilter =
        sceneFilter === "all" ||
        (sceneFilter === "impl" && sceneEntry && sceneEntry.type === "impl") ||
        (sceneFilter === "stub" && sceneEntry && sceneEntry.type === "stub");
      return matchesSearch && matchesFilter;
    });
  }, [story, searchQuery, sceneFilter]);

  const filteredCharacters = useMemo(() => {
    return Object.keys(story.characters).filter((name) =>
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [story, searchQuery]);

  const filteredLocations = useMemo(() => {
    return Object.keys(story.locations).filter((name) =>
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [story, searchQuery]);

  // Autocomplete search suggestions for fast centering
  const searchSuggestions = useMemo(() => {
    return Object.keys(story.scenes).map((id) => ({ value: id }));
  }, [story]);

  // Statistics calculation
  const stats = useMemo(() => {
    const scenes = Object.values(story.scenes);
    const total = scenes.length;
    const implCount = scenes.filter((s) => s && s.type === "impl").length;
    const stubCount = scenes.filter((s) => s && s.type === "stub").length;
    const charCount = Object.keys(story.characters).length;
    const locCount = Object.keys(story.locations).length;

    // Calculate endings
    let earlyEndingsCount = 0;
    let finalEndingsCount = 0;

    Object.entries(story.scenes).forEach(([id, s]) => {
      if (s && s.type === "impl") {
        const sceneObj = s.scene as LocalScene;
        const isEnding = !sceneObj.choices || sceneObj.choices.length === 0;
        if (isEnding) {
          const isCp =
            id === story.start ||
            sceneObj["isCheckpoint"] === true ||
            sceneObj["checkpoint"] === "frontier" ||
            sceneObj["checkpoint"] === "interior";
          if (isCp) {
            finalEndingsCount++;
          } else {
            earlyEndingsCount++;
          }
        }
      }
    });

    return {
      total,
      implCount,
      stubCount,
      charCount,
      locCount,
      earlyEndingsCount,
      finalEndingsCount,
    };
  }, [story]);

  // Check if a scene ID is a locked stub
  const isLockedStub = useCallback(
    (id: string) => {
      const sceneEntry = story.scenes[id];
      if (!sceneEntry || sceneEntry.type !== "stub") return false;

      // Check if any incoming connection is from a frontier checkpoint
      return Object.values(story.scenes).some((entry) => {
        if (entry && entry.type === "impl") {
          const s = entry.scene as LocalScene;
          if (s["checkpoint"] === "frontier" && s["choices"]) {
            const choicesList = s["choices"];
            if (Array.isArray(choicesList)) {
              return choicesList.some((c) => c && c["targetScene"] === id);
            }
          }
        }
        return false;
      });
    },
    [story]
  );

  // Helper to render checkpoint icon with tooltips in a fully typed manner
  const renderCheckpointIcon = useCallback(
    (sceneEntry: { type: string; scene: unknown }) => {
      if (sceneEntry.type !== "impl") return null;
      const sceneData = sceneEntry.scene as LocalScene;
      const isCp = sceneData["isCheckpoint"] || sceneData["checkpoint"];
      if (!isCp) return null;
      const cpType = sceneData["checkpoint"];
      const cpColor =
        cpType === "frontier"
          ? "var(--mantine-color-red-6)"
          : cpType === "interior"
            ? "var(--mantine-color-blue-6)"
            : "var(--mantine-color-violet-6)";
      return (
        <span title={`${cpType || "configured"} checkpoint`}>
          <Flag size={14} weight="fill" color={cpColor} />
        </span>
      );
    },
    []
  );

  // Helper to render ending icon with tooltips in a fully typed manner
  const renderEndingIcon = useCallback(
    (sceneEntry: { type: string; scene: unknown }) => {
      if (sceneEntry.type !== "impl") return null;
      const sceneData = sceneEntry.scene as LocalScene;
      const isEnding = !sceneData.choices || sceneData.choices.length === 0;
      if (!isEnding) return null;

      const isCp =
        sceneData["isCheckpoint"] === true ||
        sceneData["checkpoint"] === "frontier" ||
        sceneData["checkpoint"] === "interior";

      const titleText = isCp
        ? "Final Ending (Checkpoint)"
        : "Early Ending (Non-checkpoint)";

      const color = isCp
        ? "var(--mantine-color-violet-6)"
        : "var(--mantine-color-orange-6)";

      return (
        <span title={titleText}>
          <FlagCheckered size={14} weight="fill" color={color} />
        </span>
      );
    },
    []
  );

  // Derived list of all story checkpoints
  const checkpointsList = useMemo(() => {
    const list: {
      id: string;
      type: "initial" | "frontier" | "interior" | "configured";
      depth: number;
      location: string;
      isEnding: boolean;
    }[] = [];

    Object.entries(story.scenes).forEach(([id, sceneEntry]) => {
      const isStart = id === story.start;
      if (sceneEntry && sceneEntry.type === "impl") {
        const scene = sceneEntry.scene as LocalScene;
        const isCheckpoint =
          scene["isCheckpoint"] === true ||
          scene["checkpoint"] === "frontier" ||
          scene["checkpoint"] === "interior";

        const isEnding = !scene.choices || scene.choices.length === 0;

        if (isStart || isCheckpoint) {
          let type: "initial" | "frontier" | "interior" | "configured" =
            "configured";
          if (isStart) type = "initial";
          else if (scene["checkpoint"] === "frontier") type = "frontier";
          else if (scene["checkpoint"] === "interior") type = "interior";

          list.push({
            id,
            type,
            depth: sceneDepths[id] ?? 0,
            location: scene["location"] || "Unknown",
            isEnding,
          });
        }
      } else if (isStart) {
        list.push({
          id,
          type: "initial",
          depth: sceneDepths[id] ?? 0,
          location: "Unknown",
          isEnding: false,
        });
      }
    });

    return list.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  }, [story, sceneDepths]);

  // --- Derived Selection States for Safer Rendering ---
  const selectedSceneEntry = useMemo(() => {
    if (!selectedSceneId) return null;
    return story.scenes[selectedSceneId] || null;
  }, [story, selectedSceneId]);

  const selectedScene: LocalScene | null = useMemo(() => {
    if (selectedSceneEntry && selectedSceneEntry.type === "impl") {
      const s: LocalScene = selectedSceneEntry.scene;
      return s;
    }
    return null;
  }, [selectedSceneEntry]);

  const selectedSceneStub = useMemo(() => {
    if (selectedSceneEntry && selectedSceneEntry.type === "stub") {
      return selectedSceneEntry.scene;
    }
    return null;
  }, [selectedSceneEntry]);

  const passiveLocationEffects = useMemo(() => {
    return selectedScene?.passiveLocationEffects || [];
  }, [selectedScene]);

  const passiveCharacterEffects = useMemo(() => {
    return selectedScene?.passiveCharacterEffects || [];
  }, [selectedScene]);

  const scriptParts = useMemo(() => {
    return selectedScene?.script || [];
  }, [selectedScene]);

  const choices = useMemo(() => {
    return selectedScene?.choices || [];
  }, [selectedScene]);

  // --- JSON Importing / Exporting ---
  const handleExportState = () => {
    const dataStr = JSON.stringify(activeState, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agent-state-${datasetKey}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonSubmit = () => {
    try {
      const parsed = JSON.parse(importJsonText) as unknown as ParsedJsonData;
      // Loose validator to heal state object structure
      let validated: State | null = null;
      if (parsed && typeof parsed === "object") {
        if (parsed.gameDefinition?.story?.scenes) {
          validated = parsed as unknown as State;
        } else if (parsed.story?.scenes) {
          validated = { gameDefinition: parsed } as unknown as State;
        } else if (parsed.scenes && parsed.start) {
          validated = { gameDefinition: { story: parsed } } as unknown as State;
        }
      }

      if (validated) {
        setCustomState(validated);
        setSelectedDatasetKey("custom");
        setIsImportModalOpen(false);
        setImportError(null);
        setImportJsonText("");
      } else {
        setImportError(
          "Invalid State structure. The JSON must contain scenes, locations, and characters fields."
        );
      }
    } catch (e: unknown) {
      setImportError(
        `JSON Parse Error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  const handleFileUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportJsonText(content);
    };
    reader.readAsText(file);
  };

  // Pre-load and re-center completes whenever story layout updates
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitToView();
    }, 200);
    return () => clearTimeout(timer);
  }, [story, handleFitToView]);

  return (
    <div className={classes["container"]}>
      {/* HEADER SECTION */}
      <header className={classes["header"]}>
        <div className={classes["titleArea"]}>
          <h1
            className={classes["title"]}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <MapPin size={24} weight="fill" /> Story Designer State Viewer
          </h1>
          <div className={classes["statsRow"]}>
            <Badge
              size="sm"
              variant="filled"
              color="blue"
              leftSection={<FilmSlate size={12} weight="fill" />}
            >
              {stats.total} Scenes ({stats.implCount} Impl / {stats.stubCount}{" "}
              Stubs)
            </Badge>
            <Badge
              size="sm"
              variant="filled"
              color="teal"
              leftSection={<User size={12} weight="fill" />}
            >
              {stats.charCount} Characters
            </Badge>
            <Badge
              size="sm"
              variant="filled"
              color="orange"
              leftSection={<MapPin size={12} weight="fill" />}
            >
              {stats.locCount} Locations
            </Badge>
            <Badge
              size="sm"
              variant="filled"
              color="orange"
              leftSection={<FlagCheckered size={12} weight="fill" />}
            >
              {stats.earlyEndingsCount} Early Endings
            </Badge>
            <Badge
              size="sm"
              variant="filled"
              color="violet"
              leftSection={<FlagCheckered size={12} weight="fill" />}
            >
              {stats.finalEndingsCount} Final Endings
            </Badge>
          </div>
        </div>

        <div className={classes["controlsArea"]}>
          <Select
            size="sm"
            leftSection={<Database size={16} />}
            data={[
              ...Object.entries(parsedStates).map(([key, info]) => ({
                value: key,
                label: info.name,
              })),
              ...(customState
                ? [{ value: "custom", label: "Loaded Custom State" }]
                : []),
            ]}
            value={datasetKey}
            onChange={(val) => val && setSelectedDatasetKey(val)}
            style={{ width: 280 }}
          />

          <Button
            size="sm"
            variant="outline"
            color="blue"
            onClick={() => setIsImportModalOpen(true)}
            leftSection={<DownloadSimple size={16} />}
          >
            Import JSON
          </Button>

          <Button
            size="sm"
            variant="light"
            color="blue"
            onClick={handleExportState}
            leftSection={<UploadSimple size={16} />}
          >
            Export JSON
          </Button>
        </div>
      </header>

      {/* MAIN VIEWPORT LAYOUT */}
      <div className={classes["mainLayout"]}>
        {/* GRAPH PANEL */}
        <div className={classes["viewportPanel"]}>
          {/* Floating Tool Controls */}
          <div className={classes["floatingControls"]}>
            <Tooltip label="Zoom In">
              <ActionIcon
                variant="light"
                onClick={() => setScale((s) => Math.min(s + 0.1, 4))}
              >
                <Plus size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Zoom Out">
              <ActionIcon
                variant="light"
                onClick={() => setScale((s) => Math.max(s - 0.1, 0.15))}
              >
                <Minus size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Fit to Screen">
              <ActionIcon variant="light" onClick={handleFitToView}>
                <ArrowsOut size={16} />
              </ActionIcon>
            </Tooltip>
            <Divider my={4} />
            <Tooltip label="Sugiyama Tree Layout">
              <ActionIcon
                variant={layoutStyle === "tree" ? "filled" : "light"}
                color="blue"
                onClick={() => {
                  setLayoutStyle("tree");
                  setSimulationActive(true);
                }}
              >
                <Tree size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Free Force Layout">
              <ActionIcon
                variant={layoutStyle === "free" ? "filled" : "light"}
                color="blue"
                onClick={() => {
                  setLayoutStyle("free");
                  setSimulationActive(true);
                }}
              >
                <Atom size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Reset Layout Positions">
              <ActionIcon
                variant="light"
                color="blue"
                onClick={handleResetLayout}
              >
                <Broom size={16} />
              </ActionIcon>
            </Tooltip>
            <Divider my={4} />
            <Tooltip
              label={simulationActive ? "Pause Simulation" : "Play Simulation"}
            >
              <ActionIcon
                variant={simulationActive ? "filled" : "light"}
                color={simulationActive ? "blue" : "gray"}
                onClick={() => setSimulationActive(!simulationActive)}
              >
                {simulationActive ? <Pause size={16} /> : <Play size={16} />}
              </ActionIcon>
            </Tooltip>
          </div>

          {/* Quick Scene Search Floating Autocomplete */}
          <div
            style={{
              position: "absolute",
              top: "1rem",
              left: "4.5rem",
              zIndex: 5,
              width: 240,
            }}
          >
            <Autocomplete
              placeholder="Find scene node..."
              leftSection={<MagnifyingGlass size={16} />}
              size="sm"
              data={searchSuggestions}
              limit={8}
              onChange={(val) => {
                if (story.scenes[val]) {
                  navigateToScene(val);
                }
              }}
            />
          </div>

          {/* Graph Legend */}
          <div className={classes["legendArea"]}>
            <Text size="xs" fw="bold" ta="center" mb={2}>
              LEGEND
            </Text>
            <div className={classes["legendItem"]}>
              <div
                className={classes["legendColor"]}
                style={{ backgroundColor: "var(--mantine-color-teal-6)" }}
              />
              <Text size="xs">Implemented Scene</Text>
            </div>
            <div className={classes["legendItem"]}>
              <div
                className={classes["legendColor"]}
                style={{ backgroundColor: "var(--mantine-color-orange-6)" }}
              />
              <Text size="xs">Stub Scene (Open)</Text>
            </div>
            <div className={classes["legendItem"]}>
              <div
                className={classes["legendColor"]}
                style={{
                  backgroundColor: "var(--mantine-color-orange-8)",
                  border: "2px dashed var(--mantine-color-orange-7)",
                }}
              />
              <Text
                size="xs"
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <Lock size={10} color="var(--mantine-color-orange-7)" /> Locked
                Stub Scene
              </Text>
            </div>
            <div className={classes["legendItem"]}>
              <div
                className={classes["legendColor"]}
                style={{
                  backgroundColor: "var(--mantine-color-teal-6)",
                  border: "2px solid var(--mantine-color-yellow-4)",
                }}
              />
              <Text size="xs">Start Scene</Text>
            </div>
            <div className={classes["legendItem"]}>
              <div
                className={classes["legendColor"]}
                style={{
                  backgroundColor: "var(--mantine-color-teal-6)",
                  border: "2px solid var(--mantine-color-red-6)",
                }}
              />
              <Text
                size="xs"
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <Flag
                  size={10}
                  weight="fill"
                  color="var(--mantine-color-red-6)"
                />{" "}
                Frontier Checkpoint
              </Text>
            </div>
            <div className={classes["legendItem"]}>
              <div
                className={classes["legendColor"]}
                style={{
                  backgroundColor: "var(--mantine-color-teal-6)",
                  border: "2px solid var(--mantine-color-blue-6)",
                }}
              />
              <Text
                size="xs"
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <Flag
                  size={10}
                  weight="fill"
                  color="var(--mantine-color-blue-6)"
                />{" "}
                Interior Checkpoint
              </Text>
            </div>
            <div className={classes["legendItem"]}>
              <div
                className={classes["legendColor"]}
                style={{
                  backgroundColor: "var(--mantine-color-teal-6)",
                  border: "2px dashed var(--mantine-color-violet-6)",
                }}
              />
              <Text
                size="xs"
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <Flag
                  size={10}
                  weight="fill"
                  color="var(--mantine-color-violet-6)"
                />{" "}
                Configured Checkpoint
              </Text>
            </div>
            <div className={classes["legendItem"]}>
              <div style={{ position: "relative", width: 12, height: 12 }}>
                <div
                  className={classes["legendColor"]}
                  style={{
                    backgroundColor: "var(--mantine-color-teal-6)",
                    border: "1.5px solid var(--mantine-color-body)",
                    width: 8,
                    height: 8,
                    position: "absolute",
                    top: 2,
                    left: 2,
                  }}
                />
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    border: "1px solid var(--mantine-color-body)",
                    position: "absolute",
                    top: 0,
                    left: 0,
                  }}
                />
              </div>
              <Text
                size="xs"
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <FlagCheckered
                  size={10}
                  weight="fill"
                  color="var(--mantine-color-orange-6)"
                />{" "}
                Early Ending
              </Text>
            </div>
            <div className={classes["legendItem"]}>
              <div style={{ position: "relative", width: 12, height: 12 }}>
                <div
                  className={classes["legendColor"]}
                  style={{
                    backgroundColor: "var(--mantine-color-teal-6)",
                    border: "1.5px solid var(--mantine-color-violet-6)",
                    width: 8,
                    height: 8,
                    position: "absolute",
                    top: 2,
                    left: 2,
                  }}
                />
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    border: "1px solid var(--mantine-color-violet-6)",
                    position: "absolute",
                    top: 0,
                    left: 0,
                  }}
                />
              </div>
              <Text
                size="xs"
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <FlagCheckered
                  size={10}
                  weight="fill"
                  color="var(--mantine-color-violet-6)"
                />{" "}
                Final Ending
              </Text>
            </div>
          </div>

          {/* Active Choice Overlay Hover Box */}
          {hoveredLink && (
            <div
              className={classes["floatingStats"]}
              style={{
                maxWidth: 350,
                bottom: "1rem",
                left: "1rem",
                pointerEvents: "all",
              }}
            >
              <Group justify="space-between" align="center">
                <Text size="xs" fw="bold" color="blue">
                  CHOICE CONNECTOR
                </Text>
                {isLockedStub(hoveredLink.target) && (
                  <Badge size="xs" color="red" leftSection={<Lock size={10} />}>
                    LOCKED STUB
                  </Badge>
                )}
              </Group>
              <Text size="xs" fw="bold" mt={2}>
                {hoveredLink.source} ➔ {hoveredLink.target}
              </Text>
              <Text size="xs" style={{ fontStyle: "italic" }} mt={1}>
                "{hoveredLink.label}"
              </Text>
            </div>
          )}

          {/* SVG RENDERING SURFACE */}
          <svg
            id="main-graph-svg"
            className={classes["graphSvg"]}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onWheel={handleWheel}
          >
            {/* SVG Markers for Directional Arrows */}
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="23"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 1 L 10 5 L 0 9 z"
                  fill="var(--mantine-color-gray-4)"
                />
              </marker>
              <marker
                id="arrow-active"
                viewBox="0 0 10 10"
                refX="23"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 1 L 10 5 L 0 9 z"
                  fill="var(--mantine-color-blue-6)"
                />
              </marker>
            </defs>

            {/* Transform Group for Pan and Zoom */}
            <g transform={`translate(${panX}, ${panY}) scale(${scale})`}>
              {/* 1. DRAW LINKS */}
              {links.map((link) => {
                const sourceNode = nodes.find((n) => n.id === link.source);
                const targetNode = nodes.find((n) => n.id === link.target);

                if (!sourceNode || !targetNode) return null;

                const isSelected =
                  selectedSceneId === link.source ||
                  selectedSceneId === link.target;

                const isLinkLocked = isLockedStub(link.target);

                // Smooth cubic Bezier s-curve for Sugiyama tree layout flows, straight lines for free force
                const dPath = `M ${sourceNode.x} ${sourceNode.y} C ${sourceNode.x} ${(sourceNode.y + targetNode.y) / 2}, ${targetNode.x} ${(sourceNode.y + targetNode.y) / 2}, ${targetNode.x} ${targetNode.y}`;

                return (
                  <g
                    key={`link-${link.source}-${link.target}-${link.choiceIndex}`}
                  >
                    {layoutStyle === "tree" ? (
                      <path
                        d={dPath}
                        className={`${classes["linkLine"]} ${isSelected ? classes["linkLineActive"] : ""}`}
                        stroke={
                          isSelected
                            ? "var(--mantine-color-blue-5)"
                            : "var(--mantine-color-gray-4)"
                        }
                        strokeDasharray={isLinkLocked ? "3 3" : undefined}
                        fill="none"
                        markerEnd={
                          isSelected ? "url(#arrow-active)" : "url(#arrow)"
                        }
                        onMouseEnter={() => setHoveredLink(link)}
                        onMouseLeave={() => setHoveredLink(null)}
                        onClick={() => navigateToScene(link.target)}
                      />
                    ) : (
                      <line
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        className={`${classes["linkLine"]} ${isSelected ? classes["linkLineActive"] : ""}`}
                        stroke={
                          isSelected
                            ? "var(--mantine-color-blue-5)"
                            : "var(--mantine-color-gray-4)"
                        }
                        strokeDasharray={isLinkLocked ? "3 3" : undefined}
                        markerEnd={
                          isSelected ? "url(#arrow-active)" : "url(#arrow)"
                        }
                        onMouseEnter={() => setHoveredLink(link)}
                        onMouseLeave={() => setHoveredLink(null)}
                        onClick={() => navigateToScene(link.target)}
                      />
                    )}
                  </g>
                );
              })}

              {/* 2. DRAW NODES */}
              {nodes.map((node) => {
                const isSelected = selectedSceneId === node.id;
                const isStart = story.start === node.id;

                const sceneEntry = story.scenes[node.id];
                const isImpl = sceneEntry && sceneEntry.type === "impl";
                const sceneObj = isImpl
                  ? (sceneEntry.scene as LocalScene)
                  : null;
                const isCheckpoint =
                  isStart ||
                  (sceneObj
                    ? sceneObj["isCheckpoint"] === true ||
                      sceneObj["checkpoint"] === "frontier" ||
                      sceneObj["checkpoint"] === "interior"
                    : false);
                const checkpointType = sceneObj
                  ? sceneObj["checkpoint"]
                  : undefined;
                const isLocked = isLockedStub(node.id);
                const isEnding =
                  isImpl &&
                  (!sceneObj?.choices || sceneObj.choices.length === 0);

                let fillColor = "var(--mantine-color-teal-6)";
                if (node.type === "stub") {
                  fillColor = isLocked
                    ? "var(--mantine-color-orange-8)"
                    : "var(--mantine-color-orange-6)";
                }

                let strokeColor = "var(--mantine-color-body)";
                let strokeWidth = 2;
                let strokeDasharray = undefined;

                if (isStart) {
                  strokeColor = "var(--mantine-color-yellow-4)";
                  strokeWidth = 4;
                } else if (isCheckpoint) {
                  strokeWidth = 3;
                  if (checkpointType === "frontier") {
                    strokeColor = "var(--mantine-color-red-6)";
                  } else if (checkpointType === "interior") {
                    strokeColor = "var(--mantine-color-blue-6)";
                  } else {
                    strokeColor = "var(--mantine-color-violet-6)";
                    strokeDasharray = "3 2";
                  }
                } else if (isLocked) {
                  strokeColor = "var(--mantine-color-orange-7)";
                  strokeWidth = 2.5;
                  strokeDasharray = "2 2";
                }

                return (
                  <g key={`node-${node.id}`}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isStart ? 15 : 13}
                      data-node-id={node.id}
                      className={`${classes["nodeCircle"]} ${isSelected ? classes["nodeCircleActive"] : ""}`}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDasharray}
                    />
                    {isEnding && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={(isStart ? 15 : 13) + 4}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={1.5}
                        strokeDasharray={strokeDasharray}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    {/* Tiny Ending Badge */}
                    {isEnding && (
                      <g
                        transform={`translate(${node.x + 10}, ${node.y + 10})`}
                        style={{ pointerEvents: "none" }}
                      >
                        <circle
                          r={7}
                          fill={
                            isCheckpoint
                              ? "var(--mantine-color-violet-6)"
                              : "var(--mantine-color-orange-6)"
                          }
                          stroke="var(--mantine-color-body)"
                          strokeWidth={1.5}
                        />
                        <g transform="translate(0, 0)">
                          <rect
                            x={-3}
                            y={-3}
                            width={3}
                            height={3}
                            fill="white"
                          />
                          <rect x={0} y={-3} width={3} height={3} fill="#222" />
                          <rect x={-3} y={0} width={3} height={3} fill="#222" />
                          <rect x={0} y={0} width={3} height={3} fill="white" />
                        </g>
                      </g>
                    )}
                    {/* Tiny Checkpoint Badge */}
                    {isCheckpoint && (
                      <g
                        transform={`translate(${node.x + 10}, ${node.y - 10})`}
                        style={{ pointerEvents: "none" }}
                      >
                        <circle
                          r={7}
                          fill={
                            isStart
                              ? "var(--mantine-color-yellow-4)"
                              : checkpointType === "frontier"
                                ? "var(--mantine-color-red-6)"
                                : checkpointType === "interior"
                                  ? "var(--mantine-color-blue-6)"
                                  : "var(--mantine-color-violet-6)"
                          }
                          stroke="var(--mantine-color-body)"
                          strokeWidth={1.5}
                        />
                        <path
                          d="M -1.5 -3 L 2 -3 L 1 -1 L 2 1 L -1.5 1 Z M -1.5 -3 L -1.5 4"
                          stroke={
                            isStart ? "var(--mantine-color-blue-8)" : "white"
                          }
                          strokeWidth={1}
                          fill={
                            isStart ? "var(--mantine-color-blue-8)" : "white"
                          }
                        />
                      </g>
                    )}
                    {/* Tiny Lock Badge for Locked Stubs */}
                    {isLocked && (
                      <g
                        transform={`translate(${node.x - 10}, ${node.y - 10})`}
                        style={{ pointerEvents: "none" }}
                      >
                        <circle
                          r={7}
                          fill="var(--mantine-color-orange-7)"
                          stroke="var(--mantine-color-body)"
                          strokeWidth={1.5}
                        />
                        <path
                          d="M -2.5 -0.5 L 2.5 -0.5 L 2.5 3 L -2.5 3 Z M -1.5 -0.5 L -1.5 -2 C -1.5 -3 1.5 -3 1.5 -2 L 1.5 -0.5"
                          stroke="white"
                          strokeWidth={1}
                          fill="none"
                        />
                      </g>
                    )}
                    <text
                      x={node.x}
                      y={node.y + 26}
                      className={classes["nodeLabel"]}
                      fontWeight={isSelected ? "bold" : "normal"}
                    >
                      {node.id}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* SIDEBAR INSPECTOR */}
        <div className={classes["sidebarInspector"]}>
          {/* Tab Selection */}
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            className={classes["sidebarTabs"]}
          >
            <Tabs.List grow>
              <Tabs.Tab value="scenes" leftSection={<FilmSlate size={16} />}>
                Scenes
              </Tabs.Tab>
              <Tabs.Tab value="characters" leftSection={<User size={16} />}>
                Characters
              </Tabs.Tab>
              <Tabs.Tab value="locations" leftSection={<MapPin size={16} />}>
                Locations
              </Tabs.Tab>
              <Tabs.Tab value="checkpoints" leftSection={<Flag size={16} />}>
                Checkpoints
              </Tabs.Tab>
            </Tabs.List>

            {/* SCENES TAB */}
            <Tabs.Panel value="scenes" className={classes["tabContent"]}>
              {selectedSceneId && selectedSceneEntry ? (
                // SCENE DETAIL VIEW (INSPECTOR)
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  <Group justify="space-between" mb="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => setSelectedSceneId(null)}
                      leftSection={<ArrowLeft size={14} />}
                    >
                      Back to All Scenes
                    </Button>
                    <Badge
                      color={
                        selectedSceneEntry.type === "impl" ? "teal" : "orange"
                      }
                    >
                      {selectedSceneEntry.type === "impl"
                        ? "Implemented"
                        : "Stub / Draft"}
                    </Badge>
                  </Group>

                  <Title
                    order={3}
                    mb={4}
                    style={{
                      fontFamily: "Courier New",
                      wordBreak: "break-all",
                    }}
                  >
                    {selectedSceneId}
                  </Title>

                  {/* Scene content is scrollable */}
                  <ScrollArea
                    style={{ flex: 1 }}
                    scrollbarSize={6}
                    offsetScrollbars
                  >
                    <Stack gap="md" mt="xs" pb="xl">
                      {selectedSceneEntry.type === "stub" &&
                      selectedSceneStub ? (
                        // Stub Inspector
                        <Card withBorder radius="md">
                          {isLockedStub(selectedSceneId) && (
                            <Badge
                              color="red"
                              variant="filled"
                              mb="xs"
                              leftSection={<Lock size={12} />}
                            >
                              Locked Stub
                            </Badge>
                          )}
                          <Text fw="bold" size="sm" color="orange" mb={4}>
                            SCENE STUB DESCRIPTION
                          </Text>
                          <Text
                            size="sm"
                            style={{
                              fontStyle: "italic",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            "{selectedSceneStub.description}"
                          </Text>
                          {isLockedStub(selectedSceneId) && (
                            <Text size="xs" color="red" mt="xs">
                              This stub is locked and cannot be implemented
                              because it is immediately targeted by a choice of
                              a frontier checkpoint.
                            </Text>
                          )}
                          <Text size="xs" color="dimmed" mt="md">
                            This is a placeholder scene stub created by choices.
                            The agent has not yet generated its script or
                            location transitions.
                          </Text>
                        </Card>
                      ) : (
                        // Full Scene Inspector
                        selectedScene && (
                          <div className={classes["sceneDetailsArea"]}>
                            {/* Checkpoint Details Card */}
                            {(selectedScene.isCheckpoint ||
                              selectedScene.checkpoint ||
                              selectedSceneId === story.start) && (
                              <Card
                                withBorder
                                radius="md"
                                p="sm"
                                style={{
                                  backgroundColor:
                                    "light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-8))",
                                  borderLeft:
                                    "4px solid var(--mantine-color-blue-6)",
                                }}
                              >
                                <Group gap="xs" mb={4}>
                                  <Flag
                                    size={16}
                                    weight="fill"
                                    color="var(--mantine-color-blue-6)"
                                  />
                                  <Text fw="bold" size="sm" color="blue">
                                    Checkpoint Information
                                  </Text>
                                </Group>
                                <Stack gap={4}>
                                  {selectedSceneId === story.start && (
                                    <Text size="xs">
                                      • This is the <strong>Start Scene</strong>
                                      , which serves as the starting checkpoint.
                                    </Text>
                                  )}
                                  {selectedScene.isCheckpoint && (
                                    <Text size="xs">
                                      • Configured in definition:{" "}
                                      <strong>isCheckpoint: true</strong>
                                    </Text>
                                  )}
                                  {selectedScene.checkpoint && (
                                    <Text size="xs">
                                      • Status:{" "}
                                      <Badge
                                        size="xs"
                                        color={
                                          selectedScene.checkpoint ===
                                          "frontier"
                                            ? "red"
                                            : "blue"
                                        }
                                      >
                                        {selectedScene.checkpoint.toUpperCase()}
                                      </Badge>
                                    </Text>
                                  )}
                                  {selectedSceneId && (
                                    <Text size="xs" color="dimmed">
                                      • BFS depth level:{" "}
                                      {sceneDepths[selectedSceneId] ?? 0}
                                    </Text>
                                  )}
                                </Stack>
                              </Card>
                            )}

                            {/* Ending Details Card */}
                            {selectedScene &&
                              (!selectedScene.choices ||
                                selectedScene.choices.length === 0) && (
                                <Card
                                  withBorder
                                  radius="md"
                                  p="sm"
                                  style={{
                                    backgroundColor:
                                      selectedScene.isCheckpoint ||
                                      selectedScene.checkpoint ||
                                      selectedSceneId === story.start
                                        ? "light-dark(var(--mantine-color-violet-0), var(--mantine-color-dark-8))"
                                        : "light-dark(var(--mantine-color-orange-0), var(--mantine-color-dark-8))",
                                    borderLeft:
                                      selectedScene.isCheckpoint ||
                                      selectedScene.checkpoint ||
                                      selectedSceneId === story.start
                                        ? "4px solid var(--mantine-color-violet-6)"
                                        : "4px solid var(--mantine-color-orange-6)",
                                  }}
                                >
                                  <Group gap="xs" mb={4}>
                                    <FlagCheckered
                                      size={16}
                                      weight="fill"
                                      color={
                                        selectedScene.isCheckpoint ||
                                        selectedScene.checkpoint ||
                                        selectedSceneId === story.start
                                          ? "var(--mantine-color-violet-6)"
                                          : "var(--mantine-color-orange-6)"
                                      }
                                    />
                                    <Text
                                      fw="bold"
                                      size="sm"
                                      color={
                                        selectedScene.isCheckpoint ||
                                        selectedScene.checkpoint ||
                                        selectedSceneId === story.start
                                          ? "violet"
                                          : "orange"
                                      }
                                    >
                                      {selectedScene.isCheckpoint ||
                                      selectedScene.checkpoint ||
                                      selectedSceneId === story.start
                                        ? "Final Ending"
                                        : "Early Ending"}
                                    </Text>
                                  </Group>
                                  <Stack gap={4}>
                                    <Text size="xs">
                                      • This is an ending scene because it has{" "}
                                      <strong>no outgoing choices</strong>.
                                    </Text>
                                    {selectedScene.isCheckpoint ||
                                    selectedScene.checkpoint ||
                                    selectedSceneId === story.start ? (
                                      <Text size="xs">
                                        • It is a <strong>Final Ending</strong>{" "}
                                        because it is configured as a
                                        checkpoint.
                                      </Text>
                                    ) : (
                                      <Text size="xs">
                                        • It is an <strong>Early Ending</strong>{" "}
                                        because it is not configured as a
                                        checkpoint.
                                      </Text>
                                    )}
                                  </Stack>
                                </Card>
                              )}

                            {/* Location Card */}
                            <Card
                              withBorder
                              radius="md"
                              className={classes["itemRow"]}
                              onClick={() =>
                                navigateToLocation(selectedScene.location)
                              }
                            >
                              <Text size="xs" fw="bold" color="dimmed">
                                LOCATION
                              </Text>
                              <Text
                                fw="bold"
                                size="sm"
                                color="blue"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <MapPin size={16} /> {selectedScene.location}
                              </Text>
                            </Card>

                            {/* Passive Effects */}
                            {(passiveLocationEffects.length > 0 ||
                              passiveCharacterEffects.length > 0) && (
                              <Card withBorder radius="md" p="xs">
                                <Text size="xs" fw="bold" color="dimmed" mb={4}>
                                  ENVIRONMENT EFFECTS
                                </Text>
                                <Group gap="xs">
                                  {passiveLocationEffects.map((eff) => (
                                    <Badge
                                      key={`loc-eff-${eff}`}
                                      color="gray"
                                      size="xs"
                                      className={classes["effectBadge"]}
                                      leftSection={<CloudRain size={10} />}
                                    >
                                      loc: {eff}
                                    </Badge>
                                  ))}
                                  {passiveCharacterEffects.map((eff) => (
                                    <Badge
                                      key={`char-eff-${eff.character}-${eff.effect}`}
                                      color="violet"
                                      size="xs"
                                      className={classes["effectBadge"]}
                                      leftSection={<Sparkle size={10} />}
                                    >
                                      {eff.character}: {eff.effect}
                                    </Badge>
                                  ))}
                                </Group>
                              </Card>
                            )}

                            {/* Script Dialogues/Narrations */}
                            <div>
                              <div
                                className={classes["sectionHeader"]}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <BookOpen size={16} /> STORY SCRIPT & ACTION
                              </div>
                              <div className={classes["scriptBlock"]}>
                                {scriptParts.map((part) => {
                                  const textHash = part.content.slice(0, 15);
                                  if (part.type === "narration") {
                                    return (
                                      <div
                                        key={`script-part-narration-${textHash}`}
                                        className={classes["narrationBox"]}
                                      >
                                        {part.content}
                                        {part.instantLocationEffects?.map(
                                          (eff: string) => (
                                            <Badge
                                              key={`inst-loc-${eff}`}
                                              size="xs"
                                              color="gray"
                                              ml="xs"
                                            >
                                              Effect: {eff}
                                            </Badge>
                                          )
                                        )}
                                      </div>
                                    );
                                  } else if (part.type === "dialogue") {
                                    return (
                                      <div
                                        key={`script-part-dialogue-${part.character}-${textHash}`}
                                        className={classes["dialogueContainer"]}
                                      >
                                        <span
                                          className={classes["dialogueSpeaker"]}
                                          onClick={() =>
                                            navigateToCharacter(
                                              part.character || ""
                                            )
                                          }
                                          style={{
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                          }}
                                        >
                                          <User size={14} /> {part.character}
                                        </span>
                                        <div
                                          className={classes["dialogueBubble"]}
                                        >
                                          {part.content}
                                        </div>
                                      </div>
                                    );
                                  } else if (
                                    part.type === "internal_dialogue"
                                  ) {
                                    return (
                                      <div
                                        key={`script-part-internal-${part.character}-${textHash}`}
                                        className={classes["dialogueContainer"]}
                                        style={{
                                          alignSelf: "flex-end",
                                          maxWidth: "90%",
                                        }}
                                      >
                                        <span
                                          className={
                                            classes["internalDialogueSpeaker"]
                                          }
                                          onClick={() =>
                                            navigateToCharacter(
                                              part.character || ""
                                            )
                                          }
                                          style={{
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                          }}
                                        >
                                          <ChatTeardrop size={14} />{" "}
                                          {part.character} (Internal)
                                        </span>
                                        <div
                                          className={
                                            classes["internalDialogueBubble"]
                                          }
                                        >
                                          {part.content}
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            </div>

                            {/* Choices List */}
                            <div>
                              <div
                                className={classes["sectionHeader"]}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <Door size={16} /> CHOICES / PATHWAYS
                              </div>
                              <div className={classes["choicesList"]}>
                                {choices.map((choice, i) => (
                                  <div
                                    key={`choice-card-${choice.targetScene}`}
                                    className={classes["choiceCard"]}
                                    onClick={() =>
                                      navigateToScene(choice.targetScene)
                                    }
                                  >
                                    <Group justify="space-between" mb={4}>
                                      <Text fw="bold" size="xs" color="blue">
                                        Option {i + 1}: {choice.label}
                                      </Text>
                                      <Badge
                                        size="xs"
                                        color={
                                          story.scenes[choice.targetScene]
                                            ?.type === "stub"
                                            ? "orange"
                                            : "teal"
                                        }
                                        leftSection={<ArrowRight size={10} />}
                                      >
                                        {choice.targetScene}
                                      </Badge>
                                    </Group>
                                    <Text
                                      size="xs"
                                      color="dimmed"
                                      style={{ lineHeight: 1.3 }}
                                    >
                                      {choice.description}
                                    </Text>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </Stack>
                  </ScrollArea>
                </div>
              ) : (
                // SCENES LIST PANEL
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  <TextInput
                    placeholder="Filter scenes by ID..."
                    leftSection={<MagnifyingGlass size={16} />}
                    size="sm"
                    mb="xs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  />

                  <Select
                    size="xs"
                    mb="md"
                    data={[
                      { value: "all", label: "Show All Scenes" },
                      { value: "impl", label: "Show Implemented Only" },
                      { value: "stub", label: "Show Stubs/Drafts Only" },
                    ]}
                    value={sceneFilter}
                    onChange={(val) => val && setSceneFilter(val)}
                  />

                  <div className={classes["listScroll"]}>
                    {filteredSceneIds.length === 0 ? (
                      <Text size="sm" color="dimmed" ta="center" mt="xl">
                        No scenes found matching criteria.
                      </Text>
                    ) : (
                      filteredSceneIds.map((id) => {
                        const sceneEntry = story.scenes[id];
                        if (!sceneEntry) return null;
                        return (
                          <div
                            key={`scene-row-${id}`}
                            className={`${classes["itemRow"]} ${selectedSceneId === id ? classes["itemRowActive"] : ""}`}
                            onClick={() => {
                              setSelectedSceneId(id);
                              centerOnNode(id, nodes);
                            }}
                          >
                            <Group justify="space-between">
                              <Text
                                fw="bold"
                                size="sm"
                                style={{
                                  fontFamily: "Courier New",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                {id === story.start ? (
                                  <span title="Start Scene">
                                    <Star
                                      size={14}
                                      weight="fill"
                                      color="var(--mantine-color-yellow-filled)"
                                    />
                                  </span>
                                ) : (
                                  ""
                                )}
                                {renderCheckpointIcon(sceneEntry)}
                                {renderEndingIcon(sceneEntry)}
                                {isLockedStub(id) && (
                                  <span title="Locked Stub Scene">
                                    <Lock
                                      size={14}
                                      color="var(--mantine-color-orange-7)"
                                    />
                                  </span>
                                )}
                                {id}
                              </Text>
                              <Badge
                                color={
                                  sceneEntry.type === "impl" ? "teal" : "orange"
                                }
                                size="xs"
                              >
                                {sceneEntry.type}
                              </Badge>
                            </Group>
                            {sceneEntry.type === "impl" ? (
                              <Text
                                size="xs"
                                color="dimmed"
                                truncate
                                mt={4}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <MapPin size={12} /> {sceneEntry.scene.location}{" "}
                                • {sceneEntry.scene.choices?.length || 0}{" "}
                                Choice(s)
                              </Text>
                            ) : (
                              <Text
                                size="xs"
                                color="orange"
                                truncate
                                mt={4}
                                style={{ fontStyle: "italic" }}
                              >
                                "
                                {
                                  (sceneEntry.scene as { description: string })
                                    .description
                                }
                                "
                              </Text>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </Tabs.Panel>

            {/* CHARACTERS TAB */}
            <Tabs.Panel value="characters" className={classes["tabContent"]}>
              {selectedCharacterName &&
              story.characters[selectedCharacterName] ? (
                // CHARACTER DETAIL VIEW
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  <Group justify="space-between" mb="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => setSelectedCharacterName(null)}
                      leftSection={<ArrowLeft size={14} />}
                    >
                      Back to All Characters
                    </Button>
                    <Badge color="teal">NPC Profile</Badge>
                  </Group>

                  <Title
                    order={3}
                    mb="xs"
                    style={{
                      fontFamily: "Courier New",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <User size={18} /> {selectedCharacterName}
                  </Title>

                  <ScrollArea
                    style={{ flex: 1 }}
                    scrollbarSize={6}
                    offsetScrollbars
                  >
                    <Stack gap="md" pb="xl">
                      <Card withBorder radius="md">
                        <Text fw="bold" size="xs" color="dimmed" mb={2}>
                          VIGNETTE
                        </Text>
                        <Text size="sm" style={{ fontStyle: "italic" }}>
                          "{story.characters[selectedCharacterName]?.vignette}"
                        </Text>
                      </Card>

                      <div>
                        <div
                          className={classes["sectionHeader"]}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Dress size={16} /> APPEARANCE DESCRIPTION
                        </div>
                        <Text
                          size="sm"
                          style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}
                        >
                          {
                            story.characters[selectedCharacterName]
                              ?.appearanceDescription
                          }
                        </Text>
                      </div>

                      <div>
                        <div
                          className={classes["sectionHeader"]}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Scroll size={16} /> CHARACTER BACKSTORY
                        </div>
                        <Text
                          size="sm"
                          style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}
                        >
                          {
                            story.characters[selectedCharacterName]
                              ?.backstoryDescription
                          }
                        </Text>
                      </div>

                      {/* APPEARANCES IN SCENES */}
                      <div>
                        <div
                          className={classes["sectionHeader"]}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <FilmSlate size={16} /> APPEARS IN SCENES
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                          }}
                        >
                          {!characterAppearances[selectedCharacterName] ||
                          characterAppearances[selectedCharacterName]
                            ?.length === 0 ? (
                            <Text size="xs" color="dimmed">
                              No implemented scenes refer to this character yet.
                            </Text>
                          ) : (
                            characterAppearances[selectedCharacterName]?.map(
                              (sceneId) => (
                                <Badge
                                  key={`char-app-scene-${sceneId}`}
                                  color="blue"
                                  style={{ cursor: "pointer" }}
                                  onClick={() => navigateToScene(sceneId)}
                                >
                                  {sceneId}
                                </Badge>
                              )
                            )
                          )}
                        </div>
                      </div>
                    </Stack>
                  </ScrollArea>
                </div>
              ) : (
                // CHARACTERS LIST VIEW
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  <TextInput
                    placeholder="Filter characters by name..."
                    leftSection={<MagnifyingGlass size={16} />}
                    size="sm"
                    mb="md"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  />

                  <div className={classes["listScroll"]}>
                    {filteredCharacters.length === 0 ? (
                      <Text size="sm" color="dimmed" ta="center" mt="xl">
                        No characters found.
                      </Text>
                    ) : (
                      filteredCharacters.map((name) => {
                        const char = story.characters[name];
                        if (!char) return null;
                        return (
                          <div
                            key={`char-row-${name}`}
                            className={`${classes["itemRow"]} ${selectedCharacterName === name ? classes["itemRowActive"] : ""}`}
                            onClick={() => setSelectedCharacterName(name)}
                          >
                            <Text
                              fw="bold"
                              size="sm"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <User size={14} /> {name}
                            </Text>
                            <Text size="xs" color="dimmed" mt={4} truncate>
                              {char.vignette}
                            </Text>
                            <Text
                              size="xs"
                              color="blue"
                              mt={2}
                              fw="bold"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <FilmSlate size={12} /> Appears in{" "}
                              {characterAppearances[name]?.length || 0} Scene(s)
                            </Text>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </Tabs.Panel>

            {/* LOCATIONS TAB */}
            <Tabs.Panel value="locations" className={classes["tabContent"]}>
              {selectedLocationName && story.locations[selectedLocationName] ? (
                // LOCATION DETAIL VIEW
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  <Group justify="space-between" mb="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => setSelectedLocationName(null)}
                      leftSection={<ArrowLeft size={14} />}
                    >
                      Back to All Locations
                    </Button>
                    <Badge color="orange">Vignette Stage</Badge>
                  </Group>

                  <Title
                    order={3}
                    mb="xs"
                    style={{
                      fontFamily: "Courier New",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <MapPin size={18} /> {selectedLocationName}
                  </Title>

                  <ScrollArea
                    style={{ flex: 1 }}
                    scrollbarSize={6}
                    offsetScrollbars
                  >
                    <Stack gap="md" pb="xl">
                      <Card withBorder radius="md">
                        <Text fw="bold" size="xs" color="dimmed" mb={2}>
                          VIGNETTE
                        </Text>
                        <Text size="sm" style={{ fontStyle: "italic" }}>
                          "{story.locations[selectedLocationName]?.vignette}"
                        </Text>
                      </Card>

                      <div>
                        <div
                          className={classes["sectionHeader"]}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Eye size={16} /> APPEARANCE & ATMOSPHERE
                        </div>
                        <Text
                          size="sm"
                          style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}
                        >
                          {
                            story.locations[selectedLocationName]
                              ?.appearanceDescription
                          }
                        </Text>
                      </div>

                      <div>
                        <div
                          className={classes["sectionHeader"]}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Buildings size={16} /> LOCATION BACKSTORY & CONTEXT
                        </div>
                        <Text
                          size="sm"
                          style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}
                        >
                          {
                            story.locations[selectedLocationName]
                              ?.backstoryDescription
                          }
                        </Text>
                      </div>

                      {/* SCENES IN THIS LOCATION */}
                      <div>
                        <div
                          className={classes["sectionHeader"]}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <FilmSlate size={16} /> SCENES OCCURRING HERE
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                          }}
                        >
                          {!locationScenes[selectedLocationName] ||
                          locationScenes[selectedLocationName]?.length === 0 ? (
                            <Text size="xs" color="dimmed">
                              No implemented scenes take place in this location
                              yet.
                            </Text>
                          ) : (
                            locationScenes[selectedLocationName]?.map(
                              (sceneId) => (
                                <Badge
                                  key={`loc-app-scene-${sceneId}`}
                                  color="blue"
                                  style={{ cursor: "pointer" }}
                                  onClick={() => navigateToScene(sceneId)}
                                >
                                  {sceneId}
                                </Badge>
                              )
                            )
                          )}
                        </div>
                      </div>
                    </Stack>
                  </ScrollArea>
                </div>
              ) : (
                // LOCATIONS LIST VIEW
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  <TextInput
                    placeholder="Filter locations..."
                    leftSection={<MagnifyingGlass size={16} />}
                    size="sm"
                    mb="md"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  />

                  <div className={classes["listScroll"]}>
                    {filteredLocations.length === 0 ? (
                      <Text size="sm" color="dimmed" ta="center" mt="xl">
                        No locations found.
                      </Text>
                    ) : (
                      filteredLocations.map((name) => {
                        const loc = story.locations[name];
                        if (!loc) return null;
                        return (
                          <div
                            key={`loc-row-${name}`}
                            className={`${classes["itemRow"]} ${selectedLocationName === name ? classes["itemRowActive"] : ""}`}
                            onClick={() => setSelectedLocationName(name)}
                          >
                            <Text
                              fw="bold"
                              size="sm"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <MapPin size={14} /> {name}
                            </Text>
                            <Text size="xs" color="dimmed" mt={4} truncate>
                              {loc.vignette}
                            </Text>
                            <Text
                              size="xs"
                              color="orange"
                              mt={2}
                              fw="bold"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <FilmSlate size={12} /> Host to{" "}
                              {locationScenes[name]?.length || 0} Scene(s)
                            </Text>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </Tabs.Panel>

            {/* CHECKPOINTS TAB */}
            <Tabs.Panel value="checkpoints" className={classes["tabContent"]}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  overflow: "hidden",
                }}
              >
                <ScrollArea
                  style={{ flex: 1 }}
                  scrollbarSize={6}
                  offsetScrollbars
                >
                  <Stack gap="md" pb="xl" pt="xs">
                    {/* Game Rules Card */}
                    <Card withBorder radius="md">
                      <Group gap="xs" mb="xs">
                        <Flag
                          size={16}
                          weight="fill"
                          color="var(--mantine-color-blue-6)"
                        />
                        <Text fw="bold" size="sm" color="blue">
                          Game Definition Checkpoint Config
                        </Text>
                      </Group>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Minimum Spacing
                          </Text>
                          <Badge color="blue" size="sm">
                            {
                              activeState.gameDefinition
                                .minimumCheckpointsSpacing
                            }{" "}
                            steps
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Maximum Frontier Checkpoints
                          </Text>
                          <Badge color="red" size="sm">
                            {
                              activeState.gameDefinition
                                .thresholdFrontierCheckpointsCount
                            }
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Maximum Distance from Checkpoint
                          </Text>
                          <Badge color="orange" size="sm">
                            {
                              activeState.gameDefinition
                                .maximumDistanceFromCheckpoint
                            }{" "}
                            steps
                          </Badge>
                        </Group>
                      </Stack>
                    </Card>

                    {/* Stats Card */}
                    <Card withBorder radius="md" p="sm">
                      <Text fw="bold" size="sm" mb="xs">
                        Checkpoint & Ending Summary
                      </Text>
                      <Stack gap={6}>
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Total Checkpoints
                          </Text>
                          <Badge size="xs" color="indigo">
                            {checkpointsList.length}
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Frontier Checkpoints
                          </Text>
                          <Badge size="xs" color="red">
                            {
                              checkpointsList.filter(
                                (c) => c.type === "frontier"
                              ).length
                            }
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Interior Checkpoints
                          </Text>
                          <Badge size="xs" color="blue">
                            {
                              checkpointsList.filter(
                                (c) => c.type === "interior"
                              ).length
                            }
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Configured checkpoints
                          </Text>
                          <Badge size="xs" color="violet">
                            {
                              checkpointsList.filter(
                                (c) => c.type === "configured"
                              ).length
                            }
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Early Endings (Non-checkpoint)
                          </Text>
                          <Badge size="xs" color="orange">
                            {stats.earlyEndingsCount}
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="xs" color="dimmed">
                            Final Endings (Checkpoint)
                          </Text>
                          <Badge size="xs" color="violet">
                            {stats.finalEndingsCount}
                          </Badge>
                        </Group>
                      </Stack>
                    </Card>

                    {/* Checkpoints List */}
                    <div>
                      <div
                        className={classes["sectionHeader"]}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Flag size={14} /> STORY CHECKPOINTS (
                        {checkpointsList.length})
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        {checkpointsList.length === 0 ? (
                          <Text size="sm" color="dimmed" ta="center" mt="md">
                            No checkpoints defined in this story.
                          </Text>
                        ) : (
                          checkpointsList.map((cp) => {
                            return (
                              <div
                                key={`cp-row-${cp.id}`}
                                className={`${classes["itemRow"]} ${selectedSceneId === cp.id ? classes["itemRowActive"] : ""}`}
                                onClick={() => {
                                  setSelectedSceneId(cp.id);
                                  centerOnNode(cp.id, nodes);
                                }}
                              >
                                <Group justify="space-between">
                                  <Text
                                    fw="bold"
                                    size="sm"
                                    style={{
                                      fontFamily: "Courier New",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 4,
                                    }}
                                  >
                                    <Flag
                                      size={14}
                                      weight="fill"
                                      color={
                                        cp.type === "initial"
                                          ? "var(--mantine-color-yellow-filled)"
                                          : cp.type === "frontier"
                                            ? "var(--mantine-color-red-6)"
                                            : cp.type === "interior"
                                              ? "var(--mantine-color-blue-6)"
                                              : "var(--mantine-color-violet-6)"
                                      }
                                    />
                                    {cp.id}
                                  </Text>
                                  <Group gap="xs">
                                    <Badge
                                      size="xs"
                                      color={
                                        cp.type === "initial"
                                          ? "yellow"
                                          : cp.type === "frontier"
                                            ? "red"
                                            : cp.type === "interior"
                                              ? "blue"
                                              : "violet"
                                      }
                                    >
                                      {cp.type}
                                    </Badge>
                                    {cp.isEnding && (
                                      <Badge
                                        size="xs"
                                        color="violet"
                                        variant="outline"
                                      >
                                        Final Ending
                                      </Badge>
                                    )}
                                  </Group>
                                </Group>
                                <Text
                                  size="xs"
                                  color="dimmed"
                                  truncate
                                  mt={4}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <MapPin size={12} /> {cp.location} • BFS
                                  Depth: {cp.depth}
                                </Text>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Informational Help card */}
                    <Card
                      withBorder
                      radius="md"
                      p="sm"
                      bg="var(--mantine-color-gray-light)"
                    >
                      <Text fw="bold" size="xs" color="gray" mb={4}>
                        HOW THE CHECKPOINT SYSTEM WORKS
                      </Text>
                      <Text
                        size="xs"
                        color="dimmed"
                        style={{ lineHeight: 1.4 }}
                      >
                        Checkpoints are used by the AI Designer to develop the
                        story in safe batches:
                      </Text>
                      <Text
                        size="xs"
                        color="dimmed"
                        style={{ lineHeight: 1.4 }}
                        mt={4}
                      >
                        1. <strong>Frontier checkpoints</strong> mark the limits
                        of the current expansion. Stubs targeted by their
                        choices are locked.
                      </Text>
                      <Text
                        size="xs"
                        color="dimmed"
                        style={{ lineHeight: 1.4 }}
                        mt={4}
                      >
                        2. <strong>Interior checkpoints</strong> are former
                        frontier checkpoints whose open branches have all been
                        successfully implemented, unlocking their stub choices.
                      </Text>
                      <Text
                        size="xs"
                        color="dimmed"
                        style={{ lineHeight: 1.4 }}
                        mt={4}
                      >
                        3. Checkpoints must be spaced by at least{" "}
                        <strong>
                          {activeState.gameDefinition.minimumCheckpointsSpacing}{" "}
                          scenes
                        </strong>
                        , and no scene can be more than{" "}
                        <strong>
                          {
                            activeState.gameDefinition
                              .maximumDistanceFromCheckpoint
                          }{" "}
                          steps
                        </strong>{" "}
                        away from its nearest parent checkpoint.
                      </Text>
                    </Card>
                  </Stack>
                </ScrollArea>
              </div>
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>

      {/* IMPORT CUSTOM JSON STATE MODAL */}
      <Modal
        opened={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title={
          <Group gap="xs">
            <DownloadSimple size={18} />
            <Text fw="bold">Import Custom Agent State</Text>
          </Group>
        }
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm" color="dimmed">
            Upload or paste an agent state JSON file matching the{" "}
            <code>State</code> format (must contain scenes, characters, and
            locations). This allows you to inspect arbitrary stories developed
            by the Agent.
          </Text>

          <FileInput
            label="Upload .json File"
            placeholder="Select a JSON file"
            accept="application/json"
            onChange={handleFileUpload}
          />

          <Textarea
            label="Or Paste JSON Content Directly"
            placeholder='{ "gameDefinition": { "story": { "scenes": ... } } }'
            rows={8}
            style={{ fontFamily: "Courier New", fontSize: "0.8rem" }}
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.currentTarget.value)}
          />

          {importError && (
            <Alert color="red" title="Parsing Failed">
              {importError}
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              variant="outline"
              color="gray"
              onClick={() => setIsImportModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              color="blue"
              onClick={handleImportJsonSubmit}
              disabled={!importJsonText.trim()}
            >
              Parse & Load State
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
