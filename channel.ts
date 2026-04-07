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
  channelKey: "comment-docs",
  resolvePolicy: (account) => account.config.dmPolicy,
  resolveAllowFrom: (account) => account.config.allowFrom,
  policyPathSuffix: "dmPolicy",
  normalizeEntry: (raw) => raw.replace(/^comment-docs:/i, "").trim(),
});

export const commentDocsPlugin = createChatChannelPlugin<ResolvedCommentDocsAccount>({
  base: {
    id: "comment-docs",
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
      collectStatusIssues: () => [],
      buildChannelSummary: ({ snapshot }) => ({
        configured: snapshot.configured ?? false,
        enabled: snapshot.enabled ?? false,
        baseUrl: snapshot.extra?.baseUrl ?? null,
      }),
      probeAccount: async ({ account }) => {
        const runtime = await loadCommentDocsChannelRuntime();
        const result = await runtime.verifyCommentDocsAgent(
          account.baseUrl,
          account.config.agentSecret,
        );
        return { ok: result.ok, statusCode: result.ok ? 200 : 401 };
      },
      resolveAccountSnapshot: ({ account }) => ({
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        extra: { baseUrl: account.baseUrl },
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
        const slug = to?.replace(/^comment-docs:/i, "").trim();
        if (!slug) {
          return { ok: false, error: new Error("Requires --to comment-docs:{slug}") };
        }
        return { ok: true, to: slug };
      },
    },
    attachedResults: {
      channel: "comment-docs",
      sendText: async ({ cfg, to, text, accountId }) => {
        const runtime = await loadCommentDocsChannelRuntime();
        const account = resolveCommentDocsAccount({ cfg, accountId });
        return await runtime.sendCommentDocsMessage({
          baseUrl: account.baseUrl,
          agentSecret: account.config.agentSecret,
          docSlug: to, // resolveTarget already strips the comment-docs: prefix
          text,
        });
      },
    },
  },
});
