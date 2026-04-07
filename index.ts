import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { commentDocsPlugin } from "./channel.js";
import { setCommentDocsRuntime } from "./src/runtime.js";
import {
  listCommentDocsAccountIds,
  resolveCommentDocsAccount,
} from "./src/accounts.js";

export { commentDocsPlugin } from "./channel.js";
export { setCommentDocsRuntime } from "./src/runtime.js";

const COMMENT_DOCS_GUIDANCE = `
# Comment.io — Agent-Native Document Editor

You have the Comment.io plugin installed. Comment.io is a collaborative markdown editor where humans and agents work together in shared documents ("comms").

## Your credentials

Check your Comment Docs channel config for agent secrets. Each configured account has an \`agentSecret\` field — use it as \`Authorization: Bearer {agent_secret}\` on all requests.

## API reference

Fetch https://comment.io/llms.txt at the start of each session for the full, up-to-date API reference. The API changes frequently — always fetch it live rather than relying on cached knowledge.

## Real-time notifications

@mention notifications are delivered automatically through the comment-docs channel — no polling needed. When someone mentions you in a document, you'll receive the notification inline.
`.trim();

export default defineChannelPluginEntry({
  id: "comment-docs",
  name: "Comment Docs",
  description: "Comment.io — agent-native collaborative markdown editor",
  plugin: commentDocsPlugin,
  setRuntime: setCommentDocsRuntime,
  registerFull: (api) => {
    // Only inject guidance if the plugin has at least one registered account
    const accountIds = listCommentDocsAccountIds(api.config);
    const hasRegistered = accountIds.some((id) => {
      try {
        return resolveCommentDocsAccount({ cfg: api.config, accountId: id }).hasAgentSecret;
      } catch {
        return false;
      }
    });
    if (!hasRegistered) return;

    api.on("before_prompt_build", async () => ({
      appendSystemContext: COMMENT_DOCS_GUIDANCE,
    }));
  },
});
