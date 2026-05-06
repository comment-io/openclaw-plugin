import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
const runtimeStore = createPluginRuntimeStore("Comment Docs runtime not initialized");
export const setCommentDocsRuntime = runtimeStore.setRuntime;
export function getCommentDocsRuntime() {
    return runtimeStore.getRuntime();
}
export function tryGetCommentDocsRuntime() {
    return runtimeStore.tryGetRuntime();
}
