import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { commentDocsPlugin } from "./channel.js";
import { setCommentDocsRuntime } from "./src/runtime.js";

export { commentDocsPlugin } from "./channel.js";
export { setCommentDocsRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "comment-docs",
  name: "Comment Docs",
  description: "Comment Docs channel plugin (comment.io)",
  plugin: commentDocsPlugin,
  setRuntime: setCommentDocsRuntime,
});
