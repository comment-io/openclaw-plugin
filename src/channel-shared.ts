/**
 * Shared constants and adapters used by both the full channel plugin
 * and the setup-only plugin. Mirrors the BlueBubbles channel-shared.ts pattern.
 */
import { describeWebhookAccountSnapshot } from "openclaw/plugin-sdk/account-helpers";
import { formatNormalizedAllowFromEntries } from "openclaw/plugin-sdk/allow-from";
import {
  adaptScopedAccountAccessor,
  createScopedChannelConfigAdapter,
} from "openclaw/plugin-sdk/channel-config-helpers";
import {
  listCommentDocsAccountIds,
  resolveCommentDocsAccount,
  resolveDefaultCommentDocsAccountId,
  type ResolvedCommentDocsAccount,
} from "./accounts.js";
import { CommentDocsChannelConfigSchema } from "./config-schema.js";

export const DEFAULT_BASE_URL = "https://comment.io";

export const commentDocsMeta = {
  id: "comment-docs",
  label: "Comment Docs",
  selectionLabel: "Comment Docs (comment.io)",
  detailLabel: "comment.io",
  docsPath: "/channels/comment-docs",
  docsLabel: "comment-docs",
  blurb: "Collaborative markdown editor — @mention the agent in any doc.",
  aliases: ["cdocs", "commentdocs"],
  order: 80,
};

export const commentDocsCapabilities = {
  chatTypes: ["direct" as const],
  media: false,
  reactions: false,
  edit: false,
  unsend: false,
  reply: true,
  effects: false,
  groupManagement: false,
};

export const commentDocsReload = { configPrefixes: ["channels.comment-docs"] };
export const commentDocsConfigSchema = CommentDocsChannelConfigSchema;

export const commentDocsConfigAdapter =
  createScopedChannelConfigAdapter<ResolvedCommentDocsAccount>({
    sectionKey: "comment-docs",
    listAccountIds: listCommentDocsAccountIds,
    resolveAccount: adaptScopedAccountAccessor(resolveCommentDocsAccount),
    defaultAccountId: resolveDefaultCommentDocsAccountId,
    clearBaseFields: ["agentSecret", "name", "baseUrl"],
    resolveAllowFrom: (account) => account.config.allowFrom,
    formatAllowFrom: (allowFrom) =>
      formatNormalizedAllowFromEntries({
        allowFrom,
        normalizeEntry: (entry) => entry.replace(/^comment-docs:/i, "").trim(),
      }),
  });

export function describeCommentDocsAccount(account: ResolvedCommentDocsAccount) {
  return describeWebhookAccountSnapshot({
    account,
    configured: account.configured,
    extra: { baseUrl: account.baseUrl },
  });
}
