import type { Hooks, Plugin } from './lib/plugin-stub.js';
import gatekeeper from './plugins/sdd-gatekeeper.js';
import contextInjector from './plugins/sdd-context-injector.js';
import feedbackLoop from './plugins/sdd-feedback-loop.js';

type EventHook = NonNullable<Hooks['event']>;
type ConfigHook = NonNullable<Hooks['config']>;
type BeforeHook = NonNullable<Hooks['tool.execute.before']>;
type AfterHook = NonNullable<Hooks['tool.execute.after']>;
type TransformHook = NonNullable<Hooks['experimental.chat.system.transform']>;
type ChatParamsHook = NonNullable<Hooks['chat.params']>;

function mergeHooks(hooksList: { name: string; hooks: Hooks }[]): Hooks {
  const merged: Hooks = {};
  const eventHooks: EventHook[] = [];
  const configHooks: ConfigHook[] = [];
  const beforeHooks: BeforeHook[] = [];
  const afterHooks: AfterHook[] = [];
  const transformHooks: TransformHook[] = [];
  const chatParamsHooks: ChatParamsHook[] = [];

  for (const { name: pluginName, hooks } of hooksList) {
    if (hooks.tool) {
      if (!merged.tool) {
        merged.tool = {};
      }
      for (const [toolName, toolDef] of Object.entries(hooks.tool)) {
        if (Object.prototype.hasOwnProperty.call(merged.tool, toolName)) {
          console.warn(
            `[Opencode Plugin] Tool collision detected: '${toolName}' from plugin '${pluginName}' overwrites an existing tool.`
          );
        }
        merged.tool[toolName] = toolDef;
      }
    }
    if (hooks.event) eventHooks.push(hooks.event);
    if (hooks.config) configHooks.push(hooks.config);
    if (hooks['tool.execute.before']) beforeHooks.push(hooks['tool.execute.before']);
    if (hooks['tool.execute.after']) afterHooks.push(hooks['tool.execute.after']);
    if (hooks['experimental.chat.system.transform']) {
      transformHooks.push(hooks['experimental.chat.system.transform']);
    }
    if (hooks['chat.params']) chatParamsHooks.push(hooks['chat.params']);
  }

  if (eventHooks.length > 0) {
    merged.event = async (input) => {
      for (const hook of eventHooks) {
        await hook(input);
      }
    };
  }

  if (configHooks.length > 0) {
    merged.config = async (input) => {
      for (const hook of configHooks) {
        await hook(input);
      }
    };
  }

  if (beforeHooks.length > 0) {
    merged['tool.execute.before'] = async (input, output) => {
      for (const hook of beforeHooks) {
        await hook(input, output);
      }
    };
  }

  if (afterHooks.length > 0) {
    merged['tool.execute.after'] = async (input, output) => {
      for (const hook of afterHooks) {
        await hook(input, output);
      }
    };
  }

  if (transformHooks.length > 0) {
    merged['experimental.chat.system.transform'] = async (input, output) => {
      for (const hook of transformHooks) {
        await hook(input, output);
      }
    };
  }

  if (chatParamsHooks.length > 0) {
    merged['chat.params'] = async (input, output) => {
      for (const hook of chatParamsHooks) {
        await hook(input, output);
      }
    };
  }

  return merged;
}

const plugin: Plugin = async (options) => {
  const results = await Promise.all([
    gatekeeper(options),
    contextInjector(options),
    feedbackLoop(options),
  ]);

  const hooksList = [
    { name: 'sdd-gatekeeper', hooks: results[0] },
    { name: 'sdd-context-injector', hooks: results[1] },
    { name: 'sdd-feedback-loop', hooks: results[2] },
  ];

  return mergeHooks(hooksList);
};

export default plugin;
