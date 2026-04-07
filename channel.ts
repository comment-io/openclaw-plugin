import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import { createScopedDmSecurityResolver } from "openclaw/plugin-sdk/channel-config-helpers";
import { createChatChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { createAccountStatusSink } from "openclaw/plugin-sdk/channel-lifecycle";
import { createLazyRuntimeNamedExport } from "openclaw/plugin-sdk/lazy-runtime";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import {
  resolveCommentDocsAccount,
  type ResolvedCommentDocsAccount,
} from "./src/accounts.js";
import {
  commentDocsMeta,
  commentDocsCapabilities,
  commentDocsReload,
  commentDocsConfigSchema,
  commentDocsConfigAdapter,
  describeCommentDocsAccount,
} from "./src/channel-shared.js";
import { commentDocsSetupAdapter } from "./src/setup-core.js";
import { commentDocsSetupWizard } from "./src/setup-surface.js";

// Lazy-load the runtime module (monitor + send) so it stays out of the setup bundle
const loadCommentDocsChannelRuntime = createLazyRuntimeNamedExport(
  () => import("./channel.runtime.js"),
  "commentDocsChannelRuntime",
);

const resolveCommentDocsDmPolicy = createScopedDmSecurityResolver<ResolvedCommentDocsAccount>({
  channelKey: "comment-io",
  resolvePolicy: (account) => account.config.dmPolicy,
  resolveAllowFrom: (account) => account.config.allowFrom,
  policyPathSuffix: "dmPolicy",
  normalizeEntry: (raw) => raw.replace(/^comment-io:/i, "").trim(),
});

export const commentDocsPlugin = createChatChannelPlugin<ResolvedCommentDocsAccount>({
  base: {
    id: "comment-io",
    meta: commentDocsMeta,
    capabilities: commentDocsCapabilities,
    reload: commentDocsReload,
    configSchema: commentDocsConfigSchema,
    setupWizard: commentDocsSetupWizard,
    config: {
      ...commentDocsConfigAdapter,
      isConfigured: (account) => account.configured,
      describeAccount: (account) => describeCommentDocsAccount(account),
    },
    setup: commentDocsSetupAdapter,
    status: createComputedAccountStatusAdapter<ResolvedCommentDocsAccount>({
      defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
      collectStatusIssues: (accounts) => {
        const issues: Array<{ channel: string; accountId: string; kind: string; message: string; fix?: string }> = [];
        for (const acct of accounts) {
          if (!acct.enabled) continue;
          if (!acct.extra?.hasAgentSecret) {
            issues.push({
              channel: "comment-io",
              accountId: acct.accountId,
              kind: "config",
              message: `Account "${acct.accountId}" has no agent secret — running in anonymous mode. @mention notifications and WebSocket push are disabled.`,
              fix: `openclaw channels add --channel comment-io --account ${acct.accountId} --token 'as_ag_...'`,
            });
          }
        }
        return issues;
      },
      buildChannelSummary: ({ snapshot }) => ({
        configured: snapshot.configured ?? false,
        enabled: snapshot.enabled ?? false,
        baseUrl: snapshot.extra?.baseUrl ?? null,
      }),
      probeAccount: async ({ account }) => {
        // Anonymous accounts have no secret to verify — skip the probe
        if (!account.hasAgentSecret) return { ok: true, statusCode: 200 };
        const runtime = await loadCommentDocsChannelRuntime();
        const result = await runtime.verifyCommentDocsAgent(
          account.baseUrl,
          account.config.agentSecret!,
        );
        return { ok: result.ok, statusCode: result.ok ? 200 : 401 };
      },
      resolveAccountSnapshot: ({ account }) => ({
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        extra: { baseUrl: account.baseUrl, hasAgentSecret: account.hasAgentSecret },
      }),
    }),
    gateway: {
      startAccount: async (ctx) => {
        const runtime = await loadCommentDocsChannelRuntime();
        const statusSink = createAccountStatusSink({
          accountId: ctx.accountId,
          setStatus: ctx.setStatus,
        });
        statusSink({ baseUrl: ctx.account.baseUrl });
        ctx.log?.info(`[${ctx.account.accountId}] starting Comment Docs monitor`);
        return await runtime.monitorCommentDocsAccount({
          account: ctx.account,
          cfg: ctx.cfg,
          abortSignal: ctx.abortSignal,
          log: ctx.log,
          channelRuntime: ctx.channelRuntime,
        });
      },
    },
  },
  security: {
    resolveDmPolicy: resolveCommentDocsDmPolicy,
  },
  outbound: {
    base: {
      deliveryMode: "direct",
      textChunkLimit: 8000,
      resolveTarget: ({ to }) => {
        const slug = to?.replace(/^comment-io:/i, "").trim();
        if (!slug) {
          return { ok: false, error: new Error("Requires --to comment-io:{slug}") };
        }
        return { ok: true, to: slug };
      },
    },
    attachedResults: {
      channel: "comment-io",
      sendText: async ({ cfg, to, text, accountId }) => {
        const runtime = await loadCommentDocsChannelRuntime();
        const account = resolveCommentDocsAccount({ cfg, accountId });
        return await runtime.sendCommentDocsMessage({
          baseUrl: account.baseUrl,
          agentSecret: account.config.agentSecret ?? "",
          docSlug: to, // resolveTarget already strips the comment-io: prefix
          text,
        });
      },
    },
  },
});
