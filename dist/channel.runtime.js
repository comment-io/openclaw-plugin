import { monitorCommentDocsAccount as monitorCommentDocsAccountImpl } from "./src/monitor.js";
import { sendCommentDocsMessage as sendCommentDocsMessageImpl } from "./src/send.js";
import { verifyCommentDocsAgent as verifyCommentDocsAgentImpl } from "./src/send.js";
export const commentDocsChannelRuntime = {
    monitorCommentDocsAccount: monitorCommentDocsAccountImpl,
    sendCommentDocsMessage: sendCommentDocsMessageImpl,
    verifyCommentDocsAgent: verifyCommentDocsAgentImpl,
};
