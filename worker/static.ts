import manifest from "./static-manifest.generated.js";

/**
 * Serves the embedded Vite build. Hashed files under /assets/ are immutable;
 * index.html is revalidated so new deploys show up immediately.
 */

const decoded = new Map<string, { type: string; body: Uint8Array }>();

function decode(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function lookup(path: string) {
  let file = decoded.get(path);
  if (!file) {
    const entry = manifest[path];
    if (!entry) return undefined;
    file = { type: entry.type, body: decode(entry.body) };
    decoded.set(path, file);
  }
  return file;
}

export function serveStatic(request: Request): Response {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const { pathname } = new URL(request.url);
  let path = pathname === "/" ? "/index.html" : pathname;
  let file = lookup(path);

  // SPA fallback: extensionless paths get the app shell.
  if (!file && !/\.[a-z0-9]+$/i.test(path)) {
    path = "/index.html";
    file = lookup(path);
  }

  if (!file) {
    return new Response("Not Found", { status: 404 });
  }

  const immutable = path.startsWith("/assets/");
  return new Response(request.method === "HEAD" ? null : file.body, {
    headers: {
      "Content-Type": file.type,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    },
  });
}
