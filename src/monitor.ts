/**
 * Comment Docs gateway monitor — daemon-backed notification stream.
 *
 * Consumes Comment.io daemon notification leases and dispatches them to the
 * agent session.
 */
import { spawn } from "node:child_process";
import { dispatchInboundReplyWithBase } from "openclaw/plugin-sdk/inbound-reply-dispatch";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { OutboundReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import type { ResolvedCommentDocsAccount } from "./accounts.js";
import { fetchStandingOrders } from "./send.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentDocsNotification {
  id: string;
  type: string;
  doc_slug: string;
  doc_title: string;
  comment_id?: string | null;
  suggestion_id?: string | null;
  from_handle: string;
  from_name: string;
  context: string;
  access_token?: string;
}

type WsMessage =
  | { timeout?: boolean; error?: string; claim_id?: string; notification?: CommentDocsNotification };

export type CommentDocsMonitorContext = {
  account: ResolvedCommentDocsAccount;
  cfg: OpenClawConfig;
  abortSignal: AbortSignal;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
  channelRuntime: {
    routing: {
      resolveAgentRoute: (params: {
        cfg: OpenClawConfig;
        channel: string;
        accountId: string;
        peer: { kind: string; id: string };
      }) => { agentId: string; sessionKey: string };
    };
    session: {
      resolveStorePath: (store: string | undefined, opts: { agentId: string }) => string;
      recordInboundSession: (...args: any[]) => any;
    };
    reply: {
      dispatchReplyWithBufferedBlockDispatcher: (...args: any[]) => any;
    };
  };
};

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

export async function monitorCommentDocsAccount(ctx: CommentDocsMonitorContext): Promise<void> {
  const { account, cfg, abortSignal, channelRuntime } = ctx;
  const { baseUrl, config } = account;
  const agentSecret = config.agentSecret?.trim() ?? "";
  const allowFrom = config.allowFrom ?? [];
  const allowSet = new Set(allowFrom.map((h: string) => h.toLowerCase()));
  const allowAll = allowSet.has("*") || allowSet.size === 0;

  // Anonymous mode — no daemon notifications, just hold open until abort
  if (!account.hasAgentSecret) {
    ctx.log?.info("[comment-io] Running in anonymous mode — skipping daemon notifications");
    return new Promise<void>((resolve) => {
      if (abortSignal.aborted) { resolve(); return; }
      abortSignal.addEventListener("abort", () => resolve(), { once: true });
    });
  }

  // Fetch standing orders from server — fail open
  ctx.log?.info("[comment-io] Fetching standing orders from /llms.txt");
  const standingOrders = await fetchStandingOrders(baseUrl);
  if (!standingOrders) {
    ctx.log?.warn("[comment-io] Could not fetch /llms.txt — proceeding without standing orders");
  }

  // Dedup set
  const seenIds = new Set<string>();
  function trimSeenIds() {
    if (seenIds.size > 1000) {
      const entries = [...seenIds];
      seenIds.clear();
      for (const id of entries.slice(-500)) seenIds.add(id);
    }
  }

  // Process a single notification
  async function processNotification(ntf: CommentDocsNotification): Promise<"dispatched" | "filtered" | "duplicate"> {
    if (seenIds.has(ntf.id)) return "duplicate";
    seenIds.add(ntf.id);
    trimSeenIds();

    // Client-side allowlist check
    if (!allowAll && !allowSet.has(ntf.from_handle.toLowerCase())) {
      ctx.log?.info(`[comment-io] Dropped notification from unlisted sender: ${ntf.from_handle}`);
      return "filtered";
    }

    // Resolve agent route for this document
    const route = channelRuntime.routing.resolveAgentRoute({
      cfg,
      channel: "comment-io",
      accountId: account.accountId,
      peer: { kind: "direct", id: ntf.doc_slug },
    });

    const storePath = channelRuntime.session.resolveStorePath(undefined, {
      agentId: route.agentId,
    });

    // Channel preamble: the agent must use the REST API for ALL actions
    // (comments, edits, suggestions). Channel replies are dropped.
    const channelPreamble = [
      "## How to respond",
      "",
      "Use the Comment.io REST API for ALL actions — reading, editing, commenting, suggesting, accepting, rejecting. Do NOT write a text reply in this channel. Channel replies are discarded. The REST API is the only way to interact with the document.",
      "",
    ].join("\n");

    const systemPrompt = channelPreamble + (standingOrders ?? "");

    // Build the inbound context
    const ctxPayload = {
      Body: `@${ntf.from_name} mentioned you in "${ntf.doc_title}": ${ntf.context}`,
      BodyForAgent: ntf.context,
      From: `comment-io:${ntf.from_handle}`,
      To: `comment-io:${ntf.doc_slug}`,
      SessionKey: route.sessionKey,
      AccountId: account.accountId,
      MessageSid: ntf.id,
      CommandAuthorized: true,
      GroupSystemPrompt: systemPrompt,
    };

    // Dispatch the reply
    await dispatchInboundReplyWithBase({
      cfg,
      channel: "comment-io",
      accountId: account.accountId,
      route,
      storePath,
      ctxPayload,
      core: {
        channel: {
          session: { recordInboundSession: channelRuntime.session.recordInboundSession },
          reply: {
            dispatchReplyWithBufferedBlockDispatcher:
              channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher,
          },
        },
      },
      deliver: async (payload: OutboundReplyPayload) => {
        // Channel replies are intentionally dropped — the agent should use the
        // REST API for all interactions. If we get here, the agent ignored the
        // preamble; log it but don't post to avoid duplicates.
        if (payload.text?.trim()) {
          ctx.log?.warn(`[comment-io] Dropped channel reply for ${ntf.doc_slug} — agent should use the REST API`);
        }
      },
      onRecordError: (err) => {
        ctx.log?.warn(`[comment-io] Session record error: ${err}`);
      },
      onDispatchError: (err, info) => {
        ctx.log?.warn(`[comment-io] Dispatch error (${info.kind}): ${err}`);
      },
    });

    return "dispatched";
  }

  const profile = account.accountId;
  ctx.log?.info(`[comment-io] Starting daemon notification watcher for profile ${profile}`);

  while (!abortSignal.aborted) {
    const envelope = await waitForNotification(profile, abortSignal, ctx.log);
    if (!envelope || abortSignal.aborted) continue;
    if (envelope.timeout) continue;
    if (!envelope.claim_id || !envelope.notification) {
      ctx.log?.warn("[comment-io] Daemon returned malformed notification payload");
      continue;
    }

    try {
      const result = await processNotification(envelope.notification);
      if (result === "duplicate") {
        await releaseClaim(envelope.claim_id, ctx.log);
      } else {
        await ackClaim(envelope.claim_id, ctx.log);
      }
    } catch (err) {
      ctx.log?.warn(`[comment-io] Dispatch failed, releasing claim ${envelope.claim_id}: ${err}`);
      await releaseClaim(envelope.claim_id, ctx.log);
    }
  }
}

function waitForNotification(
  profile: string,
  abortSignal: AbortSignal,
  log?: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<WsMessage | null> {
  return new Promise((resolve) => {
    const child = spawn("comment", ["notifications", "wait", "--profile", profile, "--timeout", "30m"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    const abort = () => {
      child.kill("SIGTERM");
      resolve(null);
    };
    abortSignal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      log?.warn(`[comment-io] notification wait stderr: ${chunk.toString("utf-8").trim()}`);
    });
    child.on("error", (err) => {
      abortSignal.removeEventListener("abort", abort);
      log?.warn(`[comment-io] notification wait failed: ${err.message}`);
      setTimeout(() => resolve({ timeout: true, error: err.message }), 5000);
    });
    child.on("exit", () => {
      abortSignal.removeEventListener("abort", abort);
      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve({ timeout: true });
        return;
      }
      try {
        resolve(JSON.parse(trimmed) as WsMessage);
      } catch (err) {
        log?.warn(`[comment-io] invalid notification wait JSON: ${err}`);
        resolve({ timeout: true });
      }
    });
  });
}

async function ackClaim(claimId: string, log?: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  await runClaimCommand("ack", claimId, log);
}

async function releaseClaim(claimId: string, log?: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  await runClaimCommand("release", claimId, log);
}

function runClaimCommand(
  op: "ack" | "release",
  claimId: string,
  log?: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("comment", ["notifications", op, claimId], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("exit", (code) => {
      if (code === 0) {
        log?.info(`[comment-io] ${op}ed notification claim ${claimId}`);
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${op} failed with exit ${code}`));
      }
    });
    child.on("error", reject);
  });
}
