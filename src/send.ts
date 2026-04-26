/**
 * Outbound send — posts replies back to Comment Docs via REST API.
 *
 * All comments are created via POST /docs/:slug/comments with a `quote` field.
 * The quote anchors the comment to a specific passage in the document.
 * When replying to a mention, the quote should be the original context.
 */

export type SendCommentDocsParams = {
  baseUrl: string;
  agentSecret?: string;
  token?: string;
  docSlug: string;
  text: string;
  quote?: string;
  replyTo?: string;
};

async function commentDocsApi(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
  authToken?: string,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Comment Docs ${method} ${path} → ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export async function sendCommentDocsMessage(
  params: SendCommentDocsParams,
): Promise<{ messageId: string }> {
  const { baseUrl, agentSecret, token, docSlug, text, quote, replyTo } = params;
  const authToken = agentSecret ?? token;

  // Post a comment — either reply to existing or anchor to a quote
  const body: Record<string, string> = { text };
  if (replyTo) body.reply_to = replyTo;
  else if (quote) body.quote = quote;

  const result = (await commentDocsApi(
    baseUrl,
    "POST",
    `/docs/${docSlug}/comments`,
    body,
    authToken,
  )) as { comment_id?: string };
  return { messageId: result?.comment_id ?? "new" };
}

/** Fetch the agent's profile to validate the secret is working. */
export async function verifyCommentDocsAgent(
  baseUrl: string,
  agentSecret: string,
): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  try {
    const result = (await commentDocsApi(baseUrl, "GET", "/agents/me", undefined, agentSecret)) as {
      handle?: string;
    };
    return { ok: true, handle: result?.handle ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fetch the standing orders (llms.txt) from the server. */
export async function fetchStandingOrders(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/llms.txt`, {
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
