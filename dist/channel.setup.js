/**
 * Setup-only plugin — loaded when the channel is unconfigured.
 * Shares meta, capabilities, and config adapter with the full plugin,
 * but has no gateway or outbound adapters.
 */
import { createChatChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { commentDocsMeta, commentDocsCapabilities, commentDocsReload, commentDocsConfigSchema, commentDocsConfigAdapter, describeCommentDocsAccount, } from "./src/channel-shared.js";
import { commentDocsSetupAdapter } from "./src/setup-core.js";
import { commentDocsSetupWizard } from "./src/setup-surface.js";
export const commentDocsSetupPlugin = createChatChannelPlugin({
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
    },
});
