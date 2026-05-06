/**
 * Setup wizard for the Comment Docs channel — handles credential input,
 * optional base URL, DM policy, and allowlist configuration.
 */
import { DEFAULT_ACCOUNT_ID, } from "openclaw/plugin-sdk/setup";
import { resolveCommentDocsAccount, } from "./accounts.js";
import { DEFAULT_BASE_URL } from "./channel-shared.js";
import { setCommentDocsDmPolicy } from "./setup-core.js";
const channel = "comment-io";
export const commentDocsSetupWizard = {
    channel,
    status: {
        configuredLabel: "Connected (registered)",
        unconfiguredLabel: "Running (anonymous)",
        resolveConfigured: ({ cfg, accountId }) => {
            const account = resolveCommentDocsAccount({ cfg, accountId });
            return account.hasAgentSecret;
        },
    },
    credentials: [
        {
            inputKey: "token",
            providerHint: "comment-io",
            credentialLabel: "agent secret",
            preferredEnvVar: "COMMENT_IO_AGENT_SECRET",
            envPrompt: "Use COMMENT_IO_AGENT_SECRET from environment?",
            keepPrompt: "Agent secret already configured. Keep it?",
            inputPrompt: "Agent secret (starts with as_)",
            helpLines: [
                `Get your agent secret at ${DEFAULT_BASE_URL} → Settings → Agent API.`,
                "It starts with as_ and is shown only once at creation time.",
            ],
            inspect: ({ cfg, accountId }) => {
                const account = resolveCommentDocsAccount({ cfg, accountId });
                const resolvedValue = account.config.agentSecret?.trim() || undefined;
                return {
                    accountConfigured: account.configured,
                    hasConfiguredValue: Boolean(resolvedValue),
                    resolvedValue,
                };
            },
        },
    ],
    textInputs: [
        {
            inputKey: "httpUrl",
            message: "API base URL",
            placeholder: DEFAULT_BASE_URL,
            helpLines: [`Leave blank for the default (${DEFAULT_BASE_URL}). Only change for development.`],
            required: false,
            initialValue: () => DEFAULT_BASE_URL,
            currentValue: ({ cfg, accountId }) => {
                const account = resolveCommentDocsAccount({ cfg, accountId });
                return account.config.baseUrl?.trim() || undefined;
            },
            shouldPrompt: () => false, // hidden by default — only shown when user explicitly runs configure
            validate: ({ value }) => {
                const trimmed = value.trim();
                if (!trimmed)
                    return undefined; // optional
                try {
                    new URL(trimmed);
                    return undefined;
                }
                catch {
                    return "Invalid URL format";
                }
            },
        },
    ],
    dmPolicy: {
        label: "Comment Docs",
        channel: "comment-io",
        policyKey: "channels.comment-io.dmPolicy",
        allowFromKey: "channels.comment-io.allowFrom",
        getCurrent: (cfg, accountId) => resolveCommentDocsAccount({ cfg, accountId }).config.dmPolicy ?? "open",
        setPolicy: (cfg, policy, accountId) => setCommentDocsDmPolicy(cfg, accountId ?? DEFAULT_ACCOUNT_ID, policy),
    },
    completionNote: {
        title: "Comment Docs configured",
        lines: [
            "Your agent can now create, read, edit, comment on, and suggest changes to Comment Docs.",
            "",
            "Without an agent secret, the plugin runs in anonymous mode — tools work with per-doc tokens.",
            `To unlock @mention notifications and persistent identity, register at ${DEFAULT_BASE_URL}/setup.`,
            "",
            `Full API reference: ${DEFAULT_BASE_URL}/llms.txt`,
        ],
    },
    disable: (cfg) => ({
        ...cfg,
        channels: {
            ...cfg.channels,
            "comment-io": {
                ...cfg.channels?.["comment-io"],
                enabled: false,
            },
        },
    }),
};
