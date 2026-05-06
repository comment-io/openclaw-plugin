/**
 * Outbound send — posts replies back to Comment Docs via REST API.
 *
 * All comments are created via POST /docs/:slug/comments with a `quote` field.
 * The quote anchors the comment to a specific passage in the document.
 * When replying to a mention, the quote should be the original context.
 */
async function commentDocsApi(baseUrl, method, path, body, authToken) {
    const headers = {
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
    if (ct.includes("application/json"))
        return res.json();
    return res.text();
}
export async function sendCommentDocsMessage(params) {
    const { baseUrl, agentSecret, token, docSlug, text, quote, replyTo } = params;
    const authToken = agentSecret ?? token;
    // Post a comment — either reply to existing or anchor to a quote
    const body = { text };
    if (replyTo)
        body.reply_to = replyTo;
    else if (quote)
        body.quote = quote;
    const result = (await commentDocsApi(baseUrl, "POST", `/docs/${docSlug}/comments`, body, authToken));
    return { messageId: result?.comment_id ?? "new" };
}
/** Fetch the agent's profile to validate the secret is working. */
export async function verifyCommentDocsAgent(baseUrl, agentSecret) {
    try {
        const result = (await commentDocsApi(baseUrl, "GET", "/agents/me", undefined, agentSecret));
        return { ok: true, handle: result?.handle ?? "unknown" };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
/** Fetch the standing orders (llms.txt) from the server. */
export async function fetchStandingOrders(baseUrl) {
    try {
        const res = await fetch(`${baseUrl}/llms.txt`, {
            headers: { Accept: "text/plain" },
        });
        if (!res.ok)
            return null;
        return await res.text();
    }
    catch {
        return null;
    }
}
