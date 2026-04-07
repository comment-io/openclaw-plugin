import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";

const runtimeStore = createPluginRuntimeStore<PluginRuntime>(
  "Comment Docs runtime not initialized",
);

export const setCommentDocsRuntime = runtimeStore.setRuntime;

export function getCommentDocsRuntime(): PluginRuntime {
  return runtimeStore.getRuntime();
}

export function tryGetCommentDocsRuntime(): PluginRuntime | null {
  return runtimeStore.tryGetRuntime();
}
