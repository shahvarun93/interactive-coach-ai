export async function onRequest(context) {
  const { request, params } = context;

  // IMPORTANT: BACKEND_ORIGIN must be your *real* GKE Ingress origin.
  // If you accidentally point this at a Cloudflare proxy IP, you'll get Cloudflare Error 1003 (Direct IP access not allowed).
  // Recommended:
  //   - Use the GKE Ingress external IP directly (from `kubectl get ingress` / GCP console), OR
  //   - Use a real hostname (best), OR
  //   - Use a free nip.io hostname for an IP: http://<IP>.nip.io (no domain purchase)
  const BACKEND_ORIGIN = "https://interactive-coach-930312900804.us-central1.run.app";

  const incomingUrl = new URL(request.url);

  // Pages Functions catch-all params can be an array (multi-segment) or a string.
  const raw = params?.path;
  const path = Array.isArray(raw) ? raw.join("/") : (raw || "");

  // Forward: /api/<path> -> BACKEND_ORIGIN/api/<path>
  const targetUrl = new URL(`/api/${path}${incomingUrl.search}`, BACKEND_ORIGIN);

  // Clone request headers and normalize for upstream.
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("host");

  const backendHost = new URL(BACKEND_ORIGIN).host;

  // If backendHost is a hostname, forcing Host helps host-based ingress routing.
  // If it's a bare IP, forcing Host can cause Cloudflare 1003 if that IP belongs to Cloudflare.
  const looksLikeIp = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(backendHost);
  if (!looksLikeIp) headers.set("Host", backendHost);

  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
  headers.set(
    "X-Forwarded-For",
    request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || ""
  );
  headers.set("User-Agent", request.headers.get("User-Agent") || "cloudflare-pages-proxy");
  headers.set("X-Internal-Api-Key", context.env.INTERNAL_API_KEY);

  // Handle CORS preflight locally.
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": incomingUrl.origin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers":
          request.headers.get("Access-Control-Request-Headers") ||
          "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Cache-Control": "no-store",
      },
    });
  }

  let resp;
  try {
    resp = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      redirect: "manual",
    });
  } catch (e) {
    // Upstream connection error
    return new Response(
      JSON.stringify({
        error: "Upstream fetch failed",
        target: targetUrl.toString(),
        detail: String(e?.message || e),
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  // Pass upstream headers through, but add a couple of debug + cache-control headers.
  const outHeaders = new Headers(resp.headers);
  outHeaders.set("Access-Control-Allow-Origin", incomingUrl.origin);
  outHeaders.set("Access-Control-Allow-Credentials", "true");
  outHeaders.set("Cache-Control", "no-store");
  outHeaders.set("X-Proxy-Target", targetUrl.toString());
  outHeaders.set("X-Proxy-Upstream-Status", String(resp.status));
  outHeaders.set("X-Debug-Has-Internal-Key", context.env.INTERNAL_API_KEY ? "1" : "0");

  return new Response(resp.body, { status: resp.status, headers: outHeaders });
}