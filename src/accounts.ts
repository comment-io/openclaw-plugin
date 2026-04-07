import {
  createAccountListHelpers,
  normalizeAccountId,
  resolveMergedAccountConfig,
} from "openclaw/plugin-sdk/account-resolution";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { CommentDocsAccountConfig } from "./config-schema.js";

// DEFAULT_BASE_URL is also exported from channel-shared.ts but we define it here
// to avoid a circular import (channel-shared imports from accounts.ts).
const DEFAULT_BASE_URL = "https://comment.io";

export type ResolvedCommentDocsAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  config: CommentDocsAccountConfig;
  configured: boolean;
  hasAgentSecret: boolean;
  baseUrl: string;
};

const {
  listAccountIds: listCommentDocsAccountIds,
  resolveDefaultAccountId: resolveDefaultCommentDocsAccountId,
} = createAccountListHelpers("comment-io");

export { listCommentDocsAccountIds, resolveDefaultCommentDocsAccountId };

export function resolveCommentDocsAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedCommentDocsAccount {
  const accountId = normalizeAccountId(
    params.accountId ?? resolveDefaultCommentDocsAccountId(params.cfg),
  );
  const baseEnabled = params.cfg.channels?.["comment-io"]?.enabled;
  const merged = resolveMergedAccountConfig<CommentDocsAccountConfig>({
    channelConfig: params.cfg.channels?.["comment-io"] as CommentDocsAccountConfig | undefined,
    accounts: params.cfg.channels?.["comment-io"]?.accounts as
      | Record<string, Partial<CommentDocsAccountConfig>>
      | undefined,
    accountId,
    omitKeys: ["defaultAccount"],
  });
  const accountEnabled = merged.enabled !== false;
  const agentSecret = merged.agentSecret?.trim() ?? "";
  const baseUrl = (merged.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  return {
    accountId,
    enabled: baseEnabled !== false && accountEnabled,
    name: merged.name?.trim() || undefined,
    config: merged,
    configured: true, // always configured — plugin works anonymously
    hasAgentSecret: Boolean(agentSecret),
    baseUrl,
  };
}
