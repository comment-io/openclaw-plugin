/**
 * Comment Docs gateway monitor — WebSocket notification stream.
 *
 * Connects to Comment Docs' agent WebSocket endpoint, receives @mention
 * notifications in real-time, and dispatches them to the agent session.
 */
import WebSocket from "ws";
import { dispatchInboundReplyWithBase } from "openclaw/plugin-sdk/inbound-reply-dispatch";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { OutboundReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import type { ResolvedCommentDocsAccount } from "./accounts.js";
import { fetchStandingOrders, sendCommentDocsMessage } from "./send.js";

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
  | { type: "notification_catchup"; notifications: CommentDocsNotification[]; unread_count: number }
  | { type: "notification_appended"; notification: CommentDocsNotification; unread_count: number }
  | { type: "notification_read"; id: string; unread_count: number }
  | { type: "notifications_all_read"; unread_count: number }
  | { type: "pong" };

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

  // Anonymous mode — no WebSocket, just hold open until abort
  if (!account.hasAgentSecret) {
    ctx.log?.info("[comment-io] Running in anonymous mode — skipping WebSocket notifications");
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
  async function processNotification(ntf: CommentDocsNotification): Promise<void> {
    if (seenIds.has(ntf.id)) return;
    seenIds.add(ntf.id);
    trimSeenIds();

    // Client-side allowlist check
    if (!allowAll && !allowSet.has(ntf.from_handle.toLowerCase())) {
      ctx.log?.info(`[comment-io] Dropped notification from unlisted sender: ${ntf.from_handle}`);
      return;
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
      ...(standingOrders ? { GroupSystemPrompt: standingOrders } : {}),
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
        if (!payload.text?.trim()) return;
        await sendCommentDocsMessage({
          baseUrl,
          agentSecret,
          docSlug: ntf.doc_slug,
          text: payload.text,
          quote: (ntf.context || "").slice(0, 2000) || undefined,
        });
      },
      onRecordError: (err) => {
        ctx.log?.warn(`[comment-io] Session record error: ${err}`);
      },
      onDispatchError: (err, info) => {
        ctx.log?.warn(`[comment-io] Dispatch error (${info.kind}): ${err}`);
      },
    });

    // Acknowledge the notification
    try {
      await fetch(`${baseUrl}/agents/me/notifications/${ntf.id}/read`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentSecret}`,
          "Content-Type": "application/json",
        },
      });
    } catch {
      // Non-fatal — will be marked read on next catchup
    }
  }

  // WebSocket connection with reconnect
  let attempt = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentWs: WebSocket | null = null;
  let currentPingInterval: ReturnType<typeof setInterval> | null = null;

  // Register abort handler ONCE outside connect() to avoid listener accumulation
  abortSignal.addEventListener(
    "abort",
    () => {
      if (currentPingInterval) clearInterval(currentPingInterval);
      currentPingInterval = null;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
      if (currentWs) currentWs.close();
      currentWs = null;
    },
    { once: true },
  );

  function connect(): void {
    if (abortSignal.aborted) return;

    const wsUrl = baseUrl.replace(/^http/, "ws") + `/agents/me/notifications/connect?token=${encodeURIComponent(agentSecret)}`;
    const ws = new WebSocket(wsUrl);
    currentWs = ws;

    ws.on("open", () => {
      attempt = 0;
      ctx.log?.info("[comment-io] WebSocket connected");

      // Keepalive ping every 30s — also triggers catch-up burst on first ping
      currentPingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30_000);

      // Send first ping immediately to trigger catch-up
      ws.send(JSON.stringify({ type: "ping" }));
    });

    ws.on("message", async (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsMessage;

        if (msg.type === "notification_catchup") {
          for (const ntf of msg.notifications) {
            await processNotification(ntf);
          }
        } else if (msg.type === "notification_appended") {
          await processNotification(msg.notification);
        }
        // notification_read, notifications_all_read, pong — ignore
      } catch (err) {
        ctx.log?.warn(`[comment-io] WS message error: ${err}`);
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      if (currentPingInterval) clearInterval(currentPingInterval);
      currentPingInterval = null;
      currentWs = null;

      const reasonStr = reason.toString();
      // Permanent errors — do not reconnect
      if (code === 4401 || code === 4403 || code === 4426 || code === 1008) {
        ctx.log?.warn(`[comment-io] Permanent WS close ${code}: ${reasonStr} — not reconnecting`);
        return;
      }

      ctx.log?.info(`[comment-io] WebSocket closed: ${code} ${reasonStr}`);
      scheduleReconnect();
    });

    ws.on("error", (err: Error) => {
      ctx.log?.warn(`[comment-io] WebSocket error: ${err.message}`);
      // on('close') fires after this, which handles cleanup + reconnect
    });
  }

  function scheduleReconnect(): void {
    if (abortSignal.aborted) return;
    const delay = Math.min(1000 * Math.pow(2, attempt), 60_000) + Math.random() * 1000;
    attempt++;
    ctx.log?.info(`[comment-io] Reconnecting in ${Math.round(delay)}ms (attempt ${attempt})`);
    reconnectTimeout = setTimeout(connect, delay);
  }

  // Start the connection
  connect();

  // Hold open until abort
  return new Promise<void>((resolve) => {
    if (abortSignal.aborted) {
      resolve();
      return;
    }
    abortSignal.addEventListener("abort", () => resolve(), { once: true });
  });
}
