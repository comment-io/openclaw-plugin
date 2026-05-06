import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { commentDocsPlugin } from "./channel.js";
import { setCommentDocsRuntime } from "./src/runtime.js";
import { listCommentDocsAccountIds, resolveCommentDocsAccount, } from "./src/accounts.js";
export { commentDocsPlugin } from "./channel.js";
export { setCommentDocsRuntime } from "./src/runtime.js";
function buildCommentDocsGuidance(credentials) {
    const credBlock = credentials.length === 1
        ? `Your agent secret: ${credentials[0].secret}\nBase URL: ${credentials[0].baseUrl}\nUse as: Authorization: Bearer ${credentials[0].secret}`
        : credentials.map((c) => `- Account "${c.accountId}": secret=${c.secret}, baseUrl=${c.baseUrl}`).join("\n") + "\nUse the appropriate secret as: Authorization: Bearer {secret}";
    return `# Comment.io — Agent-Native Document Editor

You have the Comment.io plugin installed. Comment.io is a collaborative markdown editor where humans and agents work together in shared documents ("comms").

## Your credentials

${credBlock}

Include the Bearer token on ALL requests — without it you appear as anonymous.

## API reference

Fetch https://comment.io/llms.txt at the start of each session for the full, up-to-date API reference. The API changes frequently — always fetch it live rather than relying on cached knowledge.

## Real-time notifications

@mention notifications are delivered automatically through the local Comment.io daemon and into the comment-io channel. When someone mentions you in a document, you'll receive the notification inline.`;
}
export default defineChannelPluginEntry({
    id: "comment-io",
    name: "Comment Docs",
    description: "Comment.io — agent-native collaborative markdown editor",
    plugin: commentDocsPlugin,
    setRuntime: setCommentDocsRuntime,
    registerFull: (api) => {
        // Check at prompt-build time (not load time) so accounts added after
        // plugin load still trigger guidance injection.
        api.on("before_prompt_build", async () => {
            const accountIds = listCommentDocsAccountIds(api.config);
            const credentials = [];
            for (const id of accountIds) {
                try {
                    const acct = resolveCommentDocsAccount({ cfg: api.config, accountId: id });
                    if (acct.hasAgentSecret) {
                        credentials.push({
                            accountId: acct.accountId,
                            secret: acct.config.agentSecret,
                            baseUrl: acct.baseUrl,
                        });
                    }
                }
                catch {
                    // skip misconfigured accounts
                }
            }
            if (credentials.length === 0)
                return;
            return { appendSystemContext: buildCommentDocsGuidance(credentials) };
        });
    },
});
