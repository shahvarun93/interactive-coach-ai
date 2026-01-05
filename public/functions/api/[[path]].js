export async function onRequest(context) {
  const { request, params } = context;

  // IMPORTANT: Prefer a real hostname with TLS (e.g. https://api.yourdomain.com).
  // Using a raw IP is OK for server-to-server proxying, but some GKE Ingress setups enforce host-based routing.
  const BACKEND_ORIGIN = "http://34.149.127.45";

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

  // Some backends/ingress controllers validate Host and/or forwarded headers.
  // Setting these explicitly often resolves unexpected 403s.
  const backendHost = new URL(BACKEND_ORIGIN).host;
  headers.set("Host", backendHost);
  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
  headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "");
  headers.set("User-Agent", request.headers.get("User-Agent") || "cloudflare-pages-proxy");

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

  return new Response(resp.body, { status: resp.status, headers: outHeaders });
}