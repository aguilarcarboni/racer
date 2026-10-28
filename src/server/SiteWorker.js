import assets from "virtual:racer-assets";
import { ONLINE_SERVER_URL } from "../online/ServerConfig.js";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/online/")) {
      const target = new URL(url.pathname + url.search, ONLINE_SERVER_URL);
      const headers = new Headers(request.headers);
      headers.delete("host");
      return fetch(
        new Request(target, {
          method: request.method,
          headers,
          ...(request.method === "POST"
            ? { body: request.body, duplex: "half" }
            : {}),
        }),
      );
    }
    const asset = assets[url.pathname === "/" ? "/index.html" : url.pathname];
    if (!asset) return new Response("Not found", { status: 404 });
    const body = asset.binary
      ? Uint8Array.from(atob(asset.content), (c) => c.charCodeAt(0))
      : asset.content;
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": asset.type,
        "cache-control": url.pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  },
};
