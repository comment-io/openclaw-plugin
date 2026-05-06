import { createSetupInputPresenceValidator, normalizeAccountId, patchScopedAccountConfig, prepareScopedSetupConfig, } from "openclaw/plugin-sdk/setup";
const channel = "comment-io";
export function setCommentDocsDmPolicy(cfg, accountId, dmPolicy) {
    return patchScopedAccountConfig({
        cfg,
        channelKey: channel,
        accountId: normalizeAccountId(accountId),
        patch: { dmPolicy },
        ensureChannelEnabled: false,
        ensureAccountEnabled: false,
    });
}
export function setCommentDocsAllowFrom(cfg, accountId, allowFrom) {
    return patchScopedAccountConfig({
        cfg,
        channelKey: channel,
        accountId,
        patch: { allowFrom },
        ensureChannelEnabled: false,
        ensureAccountEnabled: false,
    });
}
export const commentDocsSetupAdapter = {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) => prepareScopedSetupConfig({ cfg, channelKey: channel, accountId, name }),
    validateInput: createSetupInputPresenceValidator({
        validate: () => {
            // Agent secret is optional — plugin works in anonymous mode without it
            return null;
        },
    }),
    applyAccountConfig: ({ cfg, accountId, input }) => {
        const next = prepareScopedSetupConfig({ cfg, channelKey: channel, accountId });
        return patchScopedAccountConfig({
            cfg: next,
            channelKey: channel,
            accountId,
            patch: {
                agentSecret: (input.token ?? input.password ?? "").trim(),
                ...(input.httpUrl ? { baseUrl: input.httpUrl.trim().replace(/\/$/, "") } : {}),
            },
            ensureChannelEnabled: true,
            ensureAccountEnabled: true,
        });
    },
};
