export async function onRequest(context) {
    const { request, params } = context;
  
    // TEMP DEBUG: confirm this Pages Function is being invoked.
    // Visit https://<your-pages-domain>/api/onRequest to see this JSON.
    if (new URL(request.url).pathname === "/api/onRequest") {
      return new Response(
        JSON.stringify({ ok: true, via: "pages-function", note: "This file only matches /api/onRequest. Use functions/api/[...path].js to match /api/*" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  
    const BACKEND_ORIGIN = "http://34.149.127.45";
  
    const incomingUrl = new URL(request.url);
    const path = (params.path || []).join("/");
  
    // Forward /api/<path> -> <BACKEND_ORIGIN>/api/<path>
    const targetUrl = new URL(`/api/${path}${incomingUrl.search}`, BACKEND_ORIGIN);
  
    // Clone headers and remove ones that break upstream
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("content-length");
  
    // Handle preflight locally (optional but helps)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": incomingUrl.origin,
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
        },
      });
    }
  
    const resp = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: "manual",
    });
  
    // Return upstream response; add same-origin CORS headers (safe)
    const outHeaders = new Headers(resp.headers);
    outHeaders.set("Access-Control-Allow-Origin", incomingUrl.origin);
    outHeaders.set("Access-Control-Allow-Credentials", "true");
  
    return new Response(resp.body, { status: resp.status, headers: outHeaders });
  }