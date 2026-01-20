/**
 * OpenCode Plugin API スタブ
 * 
 * @opencode-ai/plugin パッケージが npm に存在しないためのフォールバック。
 * OpenCode v1.1.25 の packages/plugin/src/index.ts と packages/plugin/src/tool.ts を参照。
 */
import { z } from 'zod';

export type ToolContext = {
  sessionID: string;
  messageID: string;
  agent: string;
  abort: AbortSignal;
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): void;
  ask(input: AskInput): Promise<void>;
};

type AskInput = {
  permission: string;
  patterns: string[];
  always: string[];
  metadata: { [key: string]: any };
};

interface ToolFactory {
  <Args extends z.ZodRawShape>(input: {
    description: string;
    args: Args;
    execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
  }): {
    description: string;
    args: Args;
    execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
    schema: z.ZodObject<Args>;
  };
  schema: typeof z;
}

export const tool: ToolFactory = Object.assign(
  <Args extends z.ZodRawShape>(input: {
    description: string;
    args: Args;
    execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
  }) => {
    return {
      ...input,
      schema: z.object(input.args),
    };
  },
  { schema: z }
);

export type ToolDefinition = ReturnType<typeof tool>;

export type PluginInput = {
  client: any;
  project: any;
  directory: string;
  worktree: string;
  serverUrl: URL;
  $: any;
};

export type Plugin = (input: PluginInput) => Promise<Hooks>;

export interface Hooks {
  event?: (input: { event: any }) => Promise<void>;
  config?: (input: any) => Promise<void>;
  tool?: {
    [key: string]: ToolDefinition;
  };
  'tool.execute.before'?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any },
  ) => Promise<void>;
  'tool.execute.after'?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: any },
  ) => Promise<void>;
}
