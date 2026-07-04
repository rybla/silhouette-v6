import { useState, useMemo, useRef, type ChangeEvent } from "react";
import { useMantineColorScheme } from "@mantine/core";
import classes from "@/pages/TraceViewerV1.module.css";

// --- Types for Trace Events (derived from TialwfAgent.ts traces) ---

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ImageContent {
  type: "image";
  image: string;
}

export type ContentItem =
  string | TextContent | ThinkingContent | ToolCall | ImageContent;

export interface AgentMessage {
  role: string;
  content: ContentItem | ContentItem[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  timestamp?: number;
  api?: string;
  provider?: string;
  model?: string;
  stopReason?: string;
  usage?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens: number;
    cost?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      total?: number;
    };
  };
  errorMessage?: string;
}

export interface AgentStartEvent {
  type: "agent_start";
}

export interface TurnStartEvent {
  type: "turn_start";
}

export interface MessageEndEvent {
  type: "message_end";
  message: AgentMessage;
}

export interface ToolExecutionEndEvent {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

export interface TurnEndEvent {
  type: "turn_end";
  message: AgentMessage;
  toolResults: unknown[];
}

export interface AgentEndEvent {
  type: "agent_end";
  messages: AgentMessage[];
}

export type TraceEvent =
  | AgentStartEvent
  | TurnStartEvent
  | MessageEndEvent
  | ToolExecutionEndEvent
  | TurnEndEvent
  | AgentEndEvent;

interface ParsedLogFile {
  key: string;
  filename: string;
  agentName: string;
  timestamp: number;
  date: Date;
  rawContent: string;
  events: TraceEvent[];
}

// --- Safe Helper for Extracting Raw File Content ---

function getRawContent(moduleValue: unknown): string {
  if (moduleValue && typeof moduleValue === "object") {
    const modRecord = moduleValue as Record<string, unknown>;
    if (typeof modRecord["default"] === "string") {
      return modRecord["default"];
    }
  }
  return "";
}

// --- Sub-components for Structured Rendering ---

/**
 * Renders a plain-text block, handling simple backticks for code and blockquotes
 */
function FormattedTextBlock({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  let itemPos = 0;

  return (
    <div className={classes["textBlock"]}>
      {lines.map((line) => {
        const isQuote = line.startsWith("> ");
        const displayLine = isQuote ? line.substring(2) : line;

        // Simple parse for backtick code blocks (e.g. `something`)
        const parts = displayLine.split(/(`[^`]+`)/g);
        let partPos = 0;
        const elements = parts.map((part) => {
          const currentPartPos = partPos++;
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={`inline-code-${currentPartPos}`}
                style={{
                  backgroundColor: "var(--bg-code)",
                  padding: "0.1rem 0.3rem",
                  border: "1px solid var(--border-color-light)",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  color: "var(--thinking-accent-text)",
                }}
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return part;
        });

        const currentItemPos = itemPos++;
        const lineKey = `line-render-${currentItemPos}-${line.substring(0, 8)}`;

        if (isQuote) {
          return (
            <blockquote
              key={lineKey}
              style={{
                borderLeft: "3px solid var(--border-color)",
                paddingLeft: "0.5rem",
                margin: "0.25rem 0",
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              {elements}
            </blockquote>
          );
        }

        return (
          <div key={lineKey} style={{ minHeight: "1.2rem" }}>
            {elements}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Formats tool results defensively and cleanly
 */
function formatToolResult(result: unknown): string {
  if (result === null || result === undefined) return "No result returned.";
  if (typeof result === "string") return result;

  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj["content"])) {
      const parts: string[] = [];
      for (const x of obj["content"]) {
        if (typeof x === "string") {
          parts.push(x);
        } else if (x && typeof x === "object") {
          const block = x as Record<string, unknown>;
          if (block["type"] === "text") {
            parts.push(String(block["text"]));
          } else if (block["type"] === "image") {
            parts.push("<image content>");
          } else {
            parts.push(JSON.stringify(x));
          }
        } else {
          parts.push(
            typeof x === "object"
              ? JSON.stringify(x)
              : `${x as string | number | boolean}`
          );
        }
      }
      return parts.join("\n\n");
    }
    return JSON.stringify(result, null, 2);
  }

  return typeof result === "object"
    ? JSON.stringify(result)
    : `${result as string | number | boolean}`;
}

/**
 * Card rendering component for an individual TraceEvent
 */
interface EventCardProps {
  event: TraceEvent;
  index: number;
  firstTimestamp: number | null;
  defaultCollapseThinking: boolean;
  defaultCollapseRawJson: boolean;
}

function EventCard({
  event,
  index,
  firstTimestamp,
  defaultCollapseThinking,
  defaultCollapseRawJson,
}: EventCardProps) {
  const [thinkingCollapsed, setThinkingCollapsed] = useState(
    defaultCollapseThinking
  );
  const [rawJsonCollapsed, setRawJsonCollapsed] = useState(
    defaultCollapseRawJson
  );

  // Format timestamps relative to first timestamp
  const getFormattedTime = (ts?: number) => {
    if (!ts) return null;
    const d = new Date(ts);
    const timeStr =
      d.toTimeString().split(" ")[0] +
      "." +
      String(d.getMilliseconds()).padStart(3, "0");

    if (firstTimestamp) {
      const elapsedMs = ts - firstTimestamp;
      const elapsedSec = (elapsedMs / 1000).toFixed(3);
      return `${timeStr} (+${elapsedSec}s)`;
    }
    return timeStr;
  };

  // Render badge/border styling according to event type
  const getEventStyle = () => {
    switch (event.type) {
      case "agent_start":
        return {
          badge: "AGENT START",
          badgeColor: "#9c27b0",
          borderColor: "var(--border-color)",
          borderLeft: "6px solid #9c27b0",
        };
      case "agent_end":
        return {
          badge: "AGENT END",
          badgeColor: "#e91e63",
          borderColor: "var(--border-color)",
          borderLeft: "6px solid #e91e63",
        };
      case "turn_start":
        return {
          badge: "TURN START",
          badgeColor: "#3f51b5",
          borderColor: "var(--border-color-light)",
          borderLeft: "4px solid #3f51b5",
        };
      case "turn_end":
        return {
          badge: "TURN END",
          badgeColor: "#00bcd4",
          borderColor: "var(--border-color-light)",
          borderLeft: "4px solid #00bcd4",
        };
      case "tool_execution_end":
        return {
          badge: `TOOL END: ${event.toolName}`,
          badgeColor: event.isError ? "#f44336" : "#ff9800",
          borderColor: event.isError ? "#f44336" : "var(--border-color)",
          borderLeft: `4px solid ${event.isError ? "#f44336" : "#ff9800"}`,
        };
      case "message_end": {
        const role = event.message.role;
        let color = "#607d8b";
        let label = `MESSAGE: ${role.toUpperCase()}`;

        if (role === "user") {
          color = "#4caf50";
          label = "USER MESSAGE";
        } else if (role === "assistant") {
          color = "#673ab7";
          label = "ASSISTANT MESSAGE";
        } else if (role === "toolResult") {
          color = "#009688";
          label = `TOOL RESULT: ${event.message.toolName || "Result"}`;
        }

        return {
          badge: label,
          badgeColor: color,
          borderColor: "var(--border-color)",
          borderLeft: `4px solid ${color}`,
        };
      }
      default:
        return {
          badge: "EVENT",
          badgeColor: "#666",
          borderColor: "var(--border-color-light)",
          borderLeft: "4px solid #666",
        };
    }
  };

  const styleMeta = getEventStyle();

  // Render individual content items (Text, Thinking, Tool Calls, Images)
  const renderContentItem = (item: ContentItem, pos: number) => {
    if (typeof item === "string") {
      const stringTrunc = item.substring(0, 16);
      return (
        <FormattedTextBlock key={`str-${pos}-${stringTrunc}`} text={item} />
      );
    }

    switch (item.type) {
      case "text": {
        const textTrunc = item.text.substring(0, 16);
        return (
          <FormattedTextBlock
            key={`txt-${pos}-${textTrunc}`}
            text={item.text}
          />
        );
      }
      case "thinking": {
        const hasText = item.thinking.trim().length > 0;
        return (
          <div key={`think-${pos}`} className={classes["thinkingBlock"]}>
            <div
              className={classes["thinkingHeader"]}
              onClick={() => setThinkingCollapsed(!thinkingCollapsed)}
            >
              <span>
                💭 Assistant Thought Process {thinkingCollapsed ? "[+]" : "[-]"}
              </span>
              {item.thinkingSignature && (
                <span style={{ fontSize: "0.6rem", opacity: 0.6 }}>
                  SIG: {item.thinkingSignature.substring(0, 12)}...
                </span>
              )}
            </div>
            {!thinkingCollapsed && (
              <div style={{ marginTop: "0.5rem" }}>
                {hasText ? (
                  <FormattedTextBlock text={item.thinking} />
                ) : (
                  <span style={{ fontStyle: "italic", opacity: 0.5 }}>
                    Empty thoughts.
                  </span>
                )}
              </div>
            )}
            {thinkingCollapsed && hasText && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  marginTop: "0.25rem",
                  cursor: "pointer",
                }}
                onClick={() => setThinkingCollapsed(false)}
              >
                {item.thinking.substring(0, 120)}...
              </div>
            )}
          </div>
        );
      }
      case "toolCall":
        return (
          <div
            key={`toolcall-${pos}-${item.name}`}
            className={classes["toolCallBlock"]}
          >
            <div className={classes["toolCallHeader"]}>
              ⚡ EXECUTE TOOL: {item.name}
            </div>
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                marginBottom: "0.25rem",
              }}
            >
              ID: {item.id}
            </div>
            <pre className={classes["toolCallArgs"]}>
              {JSON.stringify(item.arguments, null, 2)}
            </pre>
          </div>
        );
      case "image":
        return (
          <div
            key={`img-${pos}`}
            style={{
              border: "1px dashed var(--border-color)",
              padding: "1rem",
              textAlign: "center",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              margin: "0.5rem 0",
            }}
          >
            🖼️ IMAGE CONTENT BOUND
          </div>
        );
      default:
        return null;
    }
  };

  let contentPos = 0;

  return (
    <div
      className={classes["eventCard"]}
      style={{
        borderColor: styleMeta.borderColor,
        borderLeft: styleMeta.borderLeft,
      }}
    >
      {/* Event Header */}
      <div className={classes["eventHeader"]}>
        <div className={classes["eventTitleGroup"]}>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: "bold",
              fontSize: "0.8rem",
            }}
          >
            #{index}
          </span>
          <span
            className={classes["eventBadge"]}
            style={{
              borderColor: styleMeta.badgeColor,
              color: styleMeta.badgeColor,
            }}
          >
            {styleMeta.badge}
          </span>
          {event.type === "message_end" && event.message.errorMessage && (
            <span
              className={classes["eventBadge"]}
              style={{
                borderColor: "#f44336",
                color: "#f44336",
                backgroundColor: "rgba(244, 67, 54, 0.1)",
              }}
            >
              API ERROR
            </span>
          )}
        </div>
        <div className={classes["eventTimestamp"]}>
          {event.type === "message_end" &&
            getFormattedTime(event.message.timestamp)}
          {event.type === "turn_end" &&
            getFormattedTime(event.message.timestamp)}
        </div>
      </div>

      {/* Main Content Area */}
      <div className={classes["contentBlock"]}>
        {/* Render for message_end */}
        {event.type === "message_end" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {/* Display message metadata (models/tokens) if assistant */}
            {event.message.role === "assistant" &&
              (event.message.model || event.message.api) && (
                <div className={classes["metaInfo"]}>
                  {event.message.model && (
                    <span>MODEL: {event.message.model}</span>
                  )}
                  {event.message.api && <span>API: {event.message.api}</span>}
                  {event.message.stopReason && (
                    <span>STOP_REASON: {event.message.stopReason}</span>
                  )}
                </div>
              )}

            {/* Render actual content item(s) */}
            {Array.isArray(event.message.content)
              ? event.message.content.map((item) =>
                  renderContentItem(item, contentPos++)
                )
              : renderContentItem(event.message.content, 0)}

            {/* Error Message if present */}
            {event.message.errorMessage && (
              <div
                style={{
                  border: "1px solid #f44336",
                  backgroundColor: "rgba(244, 67, 54, 0.05)",
                  padding: "0.75rem",
                  color: "#f44336",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  whiteSpace: "pre-wrap",
                }}
              >
                ⚠️ ERROR MESSAGE: {event.message.errorMessage}
              </div>
            )}

            {/* Usage panel */}
            {event.message.usage && (
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.7rem",
                  fontFamily: "monospace",
                  border: "1px dashed var(--border-color-light)",
                  padding: "0.4rem 0.6rem",
                  color: "var(--text-muted)",
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  TOKENS: In={event.message.usage.input} | Out=
                  {event.message.usage.output} | Total=
                  {event.message.usage.totalTokens}
                </div>
                {event.message.usage.cost && (
                  <div>
                    COST: $
                    {event.message.usage.cost.total?.toFixed(6) ?? "0.00"}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Render for tool_execution_end */}
        {event.type === "tool_execution_end" && (
          <div className={classes["toolResultBlock"]}>
            <div className={classes["toolResultHeader"]}>
              <span
                style={{
                  color: event.isError ? "#f44336" : "var(--tool-accent)",
                }}
              >
                🔧 Tool Output ({event.isError ? "Error" : "Success"})
              </span>
              <span style={{ fontSize: "0.65rem", opacity: 0.6 }}>
                CALL ID: {event.toolCallId}
              </span>
            </div>
            <pre className={classes["toolResultContent"]}>
              {formatToolResult(event.result)}
            </pre>
          </div>
        )}

        {/* Render for turn_start */}
        {event.type === "turn_start" && (
          <div
            style={{
              fontFamily: "monospace",
              fontStyle: "italic",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
            }}
          >
            ▶️ Commencing fresh thinking turn cycle...
          </div>
        )}

        {/* Render for turn_end */}
        {event.type === "turn_end" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <div
              style={{
                fontFamily: "monospace",
                fontStyle: "italic",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
              }}
            >
              ⏹️ Completed turn cycle. Accumulated{" "}
              {event.toolResults?.length ?? 0} tool results.
            </div>
            {event.message && (
              <div
                style={{
                  borderLeft: "2px solid var(--border-color-light)",
                  paddingLeft: "0.5rem",
                  marginTop: "0.25rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: "bold",
                    fontFamily: "monospace",
                    color: "var(--text-muted)",
                  }}
                >
                  LAST ASSISTANT RESPONSE PREVIEW:
                </span>
                <div
                  style={{
                    fontSize: "0.8rem",
                    opacity: 0.85,
                    marginTop: "0.15rem",
                  }}
                >
                  {typeof event.message.content === "string"
                    ? event.message.content.substring(0, 160)
                    : "Structured content block array."}
                  ...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Render for agent_start */}
        {event.type === "agent_start" && (
          <div
            style={{
              fontFamily: "monospace",
              fontWeight: "bold",
              fontSize: "0.8rem",
            }}
          >
            🚀 Agent initialized. Ready to receive commands.
          </div>
        )}

        {/* Render for agent_end */}
        {event.type === "agent_end" && (
          <div
            style={{
              fontFamily: "monospace",
              fontWeight: "bold",
              fontSize: "0.8rem",
            }}
          >
            🏁 Agent sequence execution terminated. Total final messages logged:{" "}
            {event.messages?.length ?? 0}.
          </div>
        )}
      </div>

      {/* Raw Event JSON Details Toggle */}
      <div className={classes["rawJsonBlock"]}>
        <div
          className={classes["rawJsonHeader"]}
          onClick={() => setRawJsonCollapsed(!rawJsonCollapsed)}
        >
          {rawJsonCollapsed ? "▶ Show raw JSON event" : "▼ Hide raw JSON event"}
        </div>
        {!rawJsonCollapsed && (
          <pre className={classes["rawJsonContent"]}>
            {JSON.stringify(event, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// --- Main App Page ---

export function TraceViewerV1() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Load static log files in `trace/` via Vite Glob
  const staticLogModules = useMemo(() => {
    try {
      return import.meta.glob("../../trace/*.log", {
        query: "?raw",
        eager: true,
      });
    } catch (e) {
      console.warn(
        "Failed to eager-load static logs. Empty directory or environment issue.",
        e
      );
      return {};
    }
  }, []);

  // 2. State for uploaded/custom files
  const [uploadedFiles, setUploadedFiles] = useState<ParsedLogFile[]>([]);

  // 3. Compile all files
  const parsedFiles = useMemo(() => {
    const files: ParsedLogFile[] = [];

    // Process static glob modules
    Object.entries(staticLogModules).forEach(([path, mod]) => {
      const rawContent = getRawContent(mod);
      const filename = path.split("/").pop() || path;
      const match = filename.match(/^([a-zA-Z0-9_]+)-(\d+)\.log$/);
      const agentName = match ? match[1]! : filename.replace(/\.log$/, "");
      const timestampStr = match ? match[2] : null;
      // Use pure 0 as default to guarantee compiler/React purity metrics
      const timestamp = timestampStr ? parseInt(timestampStr, 10) : 0;

      // Read lines and parse
      const lines = rawContent.split("\n");
      const events: TraceEvent[] = [];
      lines.forEach((line) => {
        if (!line.trim()) return;
        try {
          events.push(JSON.parse(line) as TraceEvent);
        } catch {
          // Skip corrupted lines silently
        }
      });

      files.push({
        key: `static-${filename}`,
        filename,
        agentName,
        timestamp,
        date: new Date(timestamp),
        rawContent,
        events,
      });
    });

    // Merge in useruploaded files
    files.push(...uploadedFiles);

    // Sort files newest first
    return files.sort((a, b) => b.timestamp - a.timestamp);
  }, [staticLogModules, uploadedFiles]);

  // 4. Active Selected File with reactive fallback (no-useEffect state syncing)
  const [selectedFileKey, setSelectedFileKey] = useState<string>("");
  const activeFileKey =
    selectedFileKey || (parsedFiles.length > 0 ? parsedFiles[0]!.key : "");

  const activeFile = useMemo(() => {
    return parsedFiles.find((f) => f.key === activeFileKey) || null;
  }, [parsedFiles, activeFileKey]);

  // 5. Sidebar Search and Filters
  const [searchQuery, setSearchQuery] = useState("");

  // Event Type Toggles
  const [filterAgentStart, setFilterAgentStart] = useState(true);
  const [filterAgentEnd, setFilterAgentEnd] = useState(true);
  const [filterTurnStart, setFilterTurnStart] = useState(false); // Collapsed by default as they clog lists
  const [filterTurnEnd, setFilterTurnEnd] = useState(false); // Collapsed by default
  const [filterMessageEnd, setFilterMessageEnd] = useState(true);
  const [filterToolExecution, setFilterToolExecution] = useState(true);

  // Message Role Toggles
  const [filterUser, setFilterUser] = useState(true);
  const [filterAssistant, setFilterAssistant] = useState(true);
  const [filterToolResult, setFilterToolResult] = useState(true);

  // Behavior Toggles
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [collapseThinkingByDefault, setCollapseThinkingByDefault] =
    useState(true);
  const [collapseRawJsonByDefault, setCollapseRawJsonByDefault] =
    useState(true);

  // Reset filters helper
  const resetFilters = () => {
    setSearchQuery("");
    setFilterAgentStart(true);
    setFilterAgentEnd(true);
    setFilterTurnStart(false);
    setFilterTurnEnd(false);
    setFilterMessageEnd(true);
    setFilterToolExecution(true);
    setFilterUser(true);
    setFilterAssistant(true);
    setFilterToolResult(true);
    setShowErrorsOnly(false);
  };

  // 6. Stats compilation for the active file
  const activeFileStats = useMemo(() => {
    if (!activeFile) return null;

    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let toolCalls = 0;
    let errorCount = 0;
    let messageCount = 0;

    activeFile.events.forEach((ev) => {
      if (ev.type === "message_end") {
        messageCount++;
        const msg = ev.message;
        if (msg.errorMessage) errorCount++;

        // Add tokens
        if (msg.usage) {
          inputTokens += msg.usage.input || 0;
          outputTokens += msg.usage.output || 0;
          totalTokens += msg.usage.totalTokens || 0;
          if (msg.usage.cost?.total) {
            totalCost += msg.usage.cost.total;
          }
        }

        // Add tool calls
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          msg.content.forEach((block) => {
            if (typeof block === "object" && block.type === "toolCall") {
              toolCalls++;
            }
          });
        }
      } else if (ev.type === "tool_execution_end") {
        if (ev.isError) errorCount++;
      }
    });

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      totalCost,
      toolCalls,
      errorCount,
      messageCount,
      eventCount: activeFile.events.length,
    };
  }, [activeFile]);

  // 7. Filter and match search over events
  const filteredEvents = useMemo(() => {
    if (!activeFile) return [];

    return activeFile.events
      .map((ev, originalIndex) => ({ ev, originalIndex }))
      .filter(({ ev }) => {
        // Simple filter parameters passed to matches function
        const showType = (() => {
          if (ev.type === "agent_start") return filterAgentStart;
          if (ev.type === "agent_end") return filterAgentEnd;
          if (ev.type === "turn_start") return filterTurnStart;
          if (ev.type === "turn_end") return filterTurnEnd;
          if (ev.type === "message_end") return filterMessageEnd;
          if (ev.type === "tool_execution_end") return filterToolExecution;
          return true;
        })();

        if (!showType) return false;

        // Role filters
        if (ev.type === "message_end") {
          const role = ev.message.role;
          if (role === "user" && !filterUser) return false;
          if (role === "assistant" && !filterAssistant) return false;
          if (role === "toolResult" && !filterToolResult) return false;
        }

        // Error filter
        if (showErrorsOnly) {
          const isError =
            (ev.type === "message_end" && !!ev.message.errorMessage) ||
            (ev.type === "tool_execution_end" && ev.isError);
          if (!isError) return false;
        }

        // Fuzzy/substring search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const words = q.split(/\s+/).filter(Boolean);

          const searchFields: string[] = [ev.type];

          if (ev.type === "message_end") {
            const msg = ev.message;
            searchFields.push(msg.role);
            if (msg.model) searchFields.push(msg.model);
            if (msg.provider) searchFields.push(msg.provider);
            if (msg.api) searchFields.push(msg.api);
            if (msg.errorMessage) searchFields.push(msg.errorMessage);

            if (typeof msg.content === "string") {
              searchFields.push(msg.content);
            } else if (Array.isArray(msg.content)) {
              msg.content.forEach((block) => {
                if (typeof block === "string") {
                  searchFields.push(block);
                } else if (block.type === "text") {
                  searchFields.push(block.text);
                } else if (block.type === "thinking") {
                  searchFields.push(block.thinking);
                } else if (block.type === "toolCall") {
                  searchFields.push(block.name);
                  searchFields.push(JSON.stringify(block.arguments));
                }
              });
            }
          } else if (ev.type === "tool_execution_end") {
            searchFields.push(ev.toolName);
            searchFields.push(ev.toolCallId);
            searchFields.push(formatToolResult(ev.result));
          } else if (ev.type === "turn_end") {
            searchFields.push("completed turn");
            if (ev.message && typeof ev.message.content === "string") {
              searchFields.push(ev.message.content);
            }
          }

          const fullSearchText = searchFields.join(" ").toLowerCase();
          return words.every((word) => fullSearchText.includes(word));
        }

        return true;
      });
  }, [
    activeFile,
    searchQuery,
    filterAgentStart,
    filterAgentEnd,
    filterTurnStart,
    filterTurnEnd,
    filterMessageEnd,
    filterToolExecution,
    filterUser,
    filterAssistant,
    filterToolResult,
    showErrorsOnly,
  ]);

  // First timestamp of the active file (for relative elapsed times)
  const firstTimestamp = useMemo(() => {
    if (!activeFile) return null;
    for (const ev of activeFile.events) {
      if (ev.type === "message_end" && ev.message.timestamp) {
        return ev.message.timestamp;
      }
      if (ev.type === "turn_end" && ev.message?.timestamp) {
        return ev.message.timestamp;
      }
    }
    return null;
  }, [activeFile]);

  // 8. Handle file upload (local logs)
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;

        // Parse lines
        const lines = text.split("\n");
        const events: TraceEvent[] = [];
        lines.forEach((line) => {
          if (!line.trim()) return;
          try {
            events.push(JSON.parse(line) as TraceEvent);
          } catch {
            // Skip corrupted lines
          }
        });

        const newParsedFile: ParsedLogFile = {
          key: `uploaded-${Date.now()}-${file.name}`,
          filename: file.name,
          agentName: file.name.replace(/\.log$/, ""),
          timestamp: Date.now(),
          date: new Date(),
          rawContent: text,
          events,
        };

        setUploadedFiles((prev) => [newParsedFile, ...prev]);
        setSelectedFileKey(newParsedFile.key);
      };
      reader.readAsText(file);
    });
  };

  return (
    <div className={classes["container"]}>
      {/* Header Panel */}
      <header className={classes["header"]}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1 className={classes["title"]}>📍 TIALWF AGENT TRACE VIEWER</h1>
          <span
            style={{
              fontSize: "0.7rem",
              fontFamily: "monospace",
              border: "1px solid var(--border-color)",
              padding: "0.1rem 0.4rem",
              backgroundColor: "var(--accent-color)",
              color: "var(--accent-text-color)",
              fontWeight: "bold",
            }}
          >
            V1.0.0
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            className={classes["sharpButton"]}
            style={{
              backgroundColor: "var(--bg-card)",
              color: "var(--code-color)",
              padding: "0.4rem 0.8rem",
            }}
            onClick={() =>
              setColorScheme(colorScheme === "dark" ? "light" : "dark")
            }
          >
            MODE: {colorScheme.toUpperCase()}
          </button>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className={classes["mainLayout"]}>
        {/* Sidebar Panel */}
        <aside className={classes["sidebar"]}>
          {/* File Selector Section */}
          <div className={classes["sidebarSection"]}>
            <div className={classes["sidebarTitle"]}>
              <span>📁 Active Trace Files</span>
              <button
                className={classes["sharpButton"]}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.3rem" }}
                onClick={() => fileInputRef.current?.click()}
              >
                + UPLOAD
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".log,.txt,application/json"
                style={{ display: "none" }}
                onChange={handleFileUpload}
                multiple
              />
            </div>
            {parsedFiles.length === 0 ? (
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  padding: "1rem",
                  textAlign: "center",
                  border: "1px dashed var(--border-color)",
                }}
              >
                No trace files discovered. Click "+ UPLOAD" to select a log.
              </div>
            ) : (
              <div className={classes["fileList"]}>
                {parsedFiles.map((file) => (
                  <div
                    key={file.key}
                    className={`${classes["fileItem"]} ${
                      file.key === activeFileKey
                        ? classes["fileItemActive"]
                        : ""
                    }`}
                    onClick={() => setSelectedFileKey(file.key)}
                  >
                    <span
                      style={{
                        fontWeight: "bold",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {file.agentName}
                    </span>
                    <span style={{ fontSize: "0.65rem", opacity: 0.8 }}>
                      {file.date.toLocaleDateString()}{" "}
                      {file.date.toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span style={{ fontSize: "0.6rem", opacity: 0.7 }}>
                      {file.events.length} events logged
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-time statistics section */}
          {activeFileStats && (
            <div
              className={classes["sidebarSection"]}
              style={{ borderBottom: "2px solid var(--border-color)" }}
            >
              <div className={classes["sidebarTitle"]}>
                <span>📊 Session Metrics</span>
              </div>
              <div className={classes["statGrid"]}>
                <div className={classes["statBox"]}>
                  <span className={classes["statLabel"]}>Total Cost</span>
                  <span
                    className={classes["statValue"]}
                    style={{ color: "var(--thinking-accent-text)" }}
                  >
                    {"$"}
                    {activeFileStats.totalCost.toFixed(5)}
                  </span>
                </div>
                <div className={classes["statBox"]}>
                  <span className={classes["statLabel"]}>Total Tokens</span>
                  <span className={classes["statValue"]}>
                    {activeFileStats.totalTokens}
                  </span>
                </div>
                <div className={classes["statBox"]}>
                  <span className={classes["statLabel"]}>Tool Runs</span>
                  <span
                    className={classes["statValue"]}
                    style={{ color: "var(--tool-accent)" }}
                  >
                    {activeFileStats.toolCalls}
                  </span>
                </div>
                <div className={classes["statBox"]}>
                  <span className={classes["statLabel"]}>Errors</span>
                  <span
                    className={classes["statValue"]}
                    style={{
                      color:
                        activeFileStats.errorCount > 0 ? "#f44336" : "inherit",
                    }}
                  >
                    {activeFileStats.errorCount}
                  </span>
                </div>
              </div>
              <div
                style={{
                  marginTop: "0.4rem",
                  fontFamily: "monospace",
                  fontSize: "0.65rem",
                  color: "var(--text-muted)",
                }}
              >
                INPUT TOKENS: {activeFileStats.inputTokens} | OUTPUT TOKENS:{" "}
                {activeFileStats.outputTokens}
              </div>
            </div>
          )}

          {/* Filter Toggles and Fuzzy Search Section */}
          <div className={classes["sidebarSection"]}>
            <div className={classes["sidebarTitle"]}>
              <span>🔍 Filters & Search</span>
              <span
                style={{
                  fontSize: "0.65rem",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
                onClick={resetFilters}
              >
                Reset
              </span>
            </div>

            {/* Fuzzy Search Widget */}
            <div style={{ marginBottom: "1rem" }}>
              <input
                type="text"
                className={classes["sharpInput"]}
                placeholder="Fuzzy search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: "100%", padding: "0.4rem" }}
              />
              {searchQuery && (
                <div
                  style={{
                    fontSize: "0.65rem",
                    fontFamily: "monospace",
                    marginTop: "0.2rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Searching for: "{searchQuery}"</span>
                  <span
                    style={{ textDecoration: "underline", cursor: "pointer" }}
                    onClick={() => setSearchQuery("")}
                  >
                    clear
                  </span>
                </div>
              )}
            </div>

            {/* Checkbox Event Filters */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  color: "var(--text-muted)",
                }}
              >
                EVENT TYPE INCLUSION
              </span>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterMessageEnd}
                  onChange={(e) => setFilterMessageEnd(e.target.checked)}
                />
                Messages (message_end)
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterToolExecution}
                  onChange={(e) => setFilterToolExecution(e.target.checked)}
                />
                Tool Runs (tool_execution_end)
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterAgentStart}
                  onChange={(e) => setFilterAgentStart(e.target.checked)}
                />
                Agent Start
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterAgentEnd}
                  onChange={(e) => setFilterAgentEnd(e.target.checked)}
                />
                Agent End
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterTurnStart}
                  onChange={(e) => setFilterTurnStart(e.target.checked)}
                />
                Turn Start (diagnostic)
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterTurnEnd}
                  onChange={(e) => setFilterTurnEnd(e.target.checked)}
                />
                Turn End (diagnostic)
              </label>

              <hr
                style={{
                  border: "none",
                  borderTop: "1px dashed var(--border-color-light)",
                  margin: "0.25rem 0",
                }}
              />

              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  color: "var(--text-muted)",
                }}
              >
                MESSAGE ROLE FILTER
              </span>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterUser}
                  onChange={(e) => setFilterUser(e.target.checked)}
                />
                User Prompts
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterAssistant}
                  onChange={(e) => setFilterAssistant(e.target.checked)}
                />
                Assistant Output
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={filterToolResult}
                  onChange={(e) => setFilterToolResult(e.target.checked)}
                />
                Tool Results
              </label>

              <hr
                style={{
                  border: "none",
                  borderTop: "1px dashed var(--border-color-light)",
                  margin: "0.25rem 0",
                }}
              />

              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  color: "var(--text-muted)",
                }}
              >
                GLOBAL EXPANSION BEHAVIOR
              </span>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={showErrorsOnly}
                  onChange={(e) => setShowErrorsOnly(e.target.checked)}
                />
                🚨 Errors Only
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={collapseThinkingByDefault}
                  onChange={(e) =>
                    setCollapseThinkingByDefault(e.target.checked)
                  }
                />
                Collapse thoughts by default
              </label>
              <label
                className={classes["sharpCheckbox"]}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <input
                  type="checkbox"
                  checked={collapseRawJsonByDefault}
                  onChange={(e) =>
                    setCollapseRawJsonByDefault(e.target.checked)
                  }
                />
                Collapse raw JSON by default
              </label>
            </div>
          </div>
        </aside>

        {/* List View / Events Rendering Area */}
        <main className={classes["contentArea"]}>
          {!activeFile ? (
            <div className={classes["emptyState"]}>
              <span>
                📁 SELECT A TRACE FILE TO INITIATE STRUCTURED RENDERING
              </span>
              <button
                className={classes["sharpButton"]}
                style={{ padding: "0.5rem 1rem" }}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload custom log file
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className={classes["emptyState"]}>
              <span>🔎 NO EVENTS MATCH THE CRITERIA SPECS</span>
              <button
                className={classes["sharpButton"]}
                style={{ padding: "0.4rem 0.8rem" }}
                onClick={resetFilters}
              >
                RESET FILTERS
              </button>
            </div>
          ) : (
            <>
              {/* Event Counter Header */}
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  padding: "0.5rem",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-header)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  RENDERING: {filteredEvents.length} of{" "}
                  {activeFile.events.length} events
                </span>
                <span>SOURCE: {activeFile.filename}</span>
              </div>

              {/* Event Cards Scroll-List */}
              {filteredEvents.map(({ ev, originalIndex }) => (
                <EventCard
                  key={`${activeFile.key}-ev-${originalIndex}-${collapseThinkingByDefault}-${collapseRawJsonByDefault}`}
                  event={ev}
                  index={originalIndex + 1}
                  firstTimestamp={firstTimestamp}
                  defaultCollapseThinking={collapseThinkingByDefault}
                  defaultCollapseRawJson={collapseRawJsonByDefault}
                />
              ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
