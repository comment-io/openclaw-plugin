import { AllowFromListSchema, buildChannelConfigSchema, DmPolicySchema, } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";
const commentDocsAccountSchema = z.object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    agentSecret: z.string().optional().describe("Comment Docs agent secret (as_...). Optional — plugin works anonymously without it."),
    baseUrl: z.string().optional().describe("Comment Docs API base URL"),
    dmPolicy: DmPolicySchema.optional(),
    allowFrom: AllowFromListSchema,
});
export const CommentDocsChannelConfigSchema = buildChannelConfigSchema(commentDocsAccountSchema, { uiHints: {} });
