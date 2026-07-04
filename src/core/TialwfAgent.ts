import {
  Agent,
  type AgentMessage,
  type AgentState,
  type AgentTool,
  type ToolExecutionMode,
} from "@earendil-works/pi-agent-core";
import type {
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCall,
  Type,
} from "@earendil-works/pi-ai";
import fs from "fs";
import path from "path";

export class TialwfAgentError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type TialwfFeedback =
  | {
      done: false;
      prompt: string;
    }
  | {
      done: true;
    };

export type TialwfAgentConfig = {
  tools: AgentState["tools"];
  thinkingLevel: AgentState["thinkingLevel"];
  systemPrompt: AgentState["systemPrompt"];
};

export abstract class TialwfAgentImpl<StateSchema extends Type.TSchema> {
  abstract name: string;

  abstract config(): Promise<TialwfAgentConfig>;
  abstract feedback(): Promise<TialwfFeedback>;

  abstract stateSchema: StateSchema;
  abstract initialState: Type.Static<StateSchema>;
  abstract state: Type.Static<StateSchema>;
  abstract stateFilepath: string;
}

export function makeAgentTool<
  ParamsSchema extends Type.TSchema = Type.TSchema,
  Details = unknown,
>(tool: {
  name: string;
  description: string;
  parameters: ParamsSchema;
  executionMode?: ToolExecutionMode;
  execute: (args: Type.Static<ParamsSchema>) => Promise<{
    text: string;
    details?: Details;
    terminate?: boolean;
  }>;
}): AgentTool<ParamsSchema, Details | undefined> {
  return {
    label: tool.name,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    executionMode: tool.executionMode,
    async execute(_toolCallId, args) {
      const result = await tool.execute(args);
      return {
        content: [
          {
            type: "text",
            text: result.text,
          },
        ],
        details: result.details,
        terminate: result.terminate,
      };
    },
  };
}

export class TialwfAgent<State extends Type.TSchema> {
  agent: Agent;
  impl: TialwfAgentImpl<State>;

  constructor(args: { agent: Agent; impl: TialwfAgentImpl<State> }) {
    this.agent = args.agent;
    this.impl = args.impl;
  }

  async run(prompt: string): Promise<void> {
    const traceDirpath = path.join("trace");
    fs.mkdirSync(traceDirpath, { recursive: true });

    const timestamp = Date.now();
    const logFilepath = path.join(
      traceDirpath,
      `${this.impl.name}-${timestamp}.log`
    );
    fs.writeFileSync(logFilepath, "", { encoding: "utf-8" });

    function printContent(
      content:
        | string
        | (string | TextContent | ThinkingContent | ToolCall | ImageContent)[]
    ) {
      if (typeof content === "string") {
        return content;
      } else {
        return content
          .map((x) => {
            if (typeof x === "string") {
              return x;
            } else {
              switch (x.type) {
                case "image": {
                  return "<image>";
                }
                case "text": {
                  return x.text;
                }
                case "thinking": {
                  return `> ${x.thinking}`;
                }
                case "toolCall": {
                  return `$ ${x.name}(${JSON.stringify(x.arguments)})`;
                }
              }
            }
          })
          .join("\n\n");
      }
    }

    function printMessage(message: AgentMessage): string {
      switch (message.role) {
        case "assistant": {
          return `${printContent(message.content)}`;
        }
        case "bashExecution": {
          return `[bashExecution]: ${JSON.stringify({
            command: message.command,
            cancelled: message.cancelled,
            exitCode: message.exitCode,
            output: message.output,
          })}`;
        }
        case "branchSummary": {
          return `[branchSummary]: ${message.summary}`;
        }
        case "compactionSummary": {
          return `[compactionSummary]: ${message.summary}`;
        }
        case "custom": {
          return `${printContent(message.content)}`;
        }
        case "toolResult": {
          return `${printContent(message.content)}`;
        }
        case "user": {
          return `${printContent(message.content)}`;
        }
      }
    }

    this.agent.subscribe((event) => {
      if (
        event.type === "agent_start" ||
        event.type === "agent_end" ||
        event.type === "turn_start" ||
        event.type === "turn_end" ||
        event.type === "message_end" ||
        event.type === "tool_execution_end"
      ) {
        fs.appendFileSync(logFilepath, `${JSON.stringify(event)}\n`, {
          encoding: "utf-8",
        });
      }

      if (event.type === "message_end") {
        console.log(
          `
[${event.type}] ${event.message.role}
${printMessage(event.message)}
`.trim()
        );
      }

      if (event.type === "tool_execution_end") {
        console.log(
          `
[${event.type}] ${JSON.stringify({
            type: event.type,
            toolName: event.toolName,
            isError: event.isError,
            result: event.result as unknown,
          })}
`.trim()
        );

        fs.writeFileSync(
          this.impl.stateFilepath,
          JSON.stringify(this.impl.state),
          { encoding: "utf-8" }
        );
      }
    });

    while (true) {
      const config = await this.impl.config();
      this.agent.state.systemPrompt = config.systemPrompt;
      this.agent.state.tools = config.tools;
      this.agent.state.thinkingLevel = config.thinkingLevel;

      await this.agent.prompt(prompt);

      const feedback = await this.impl.feedback();
      if (feedback.done) break;

      prompt = feedback.prompt;
    }
  }
}
