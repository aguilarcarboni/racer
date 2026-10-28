import { createServer } from "node:http";
import { RoomService } from "./RoomService.js";
import { MemoryRoomStore } from "./RoomStore.js";
import { DeferredRaceSimulation } from "./RaceSimulation.js";
import { handleRoomRequest } from "./RoomApi.js";
import { RealtimeHub } from "./RealtimeHub.js";
export function createRealtimeServer({ allowedOrigins = [] } = {}) {
  const store = new MemoryRoomStore(),
    service = new RoomService(store, new DeferredRaceSimulation()),
    hub = new RealtimeHub(service, store, { allowedOrigins });
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin,
      own = `http://${req.headers.host}`;
    const cors =
      origin && (allowedOrigins.includes(origin) || origin === own)
        ? { "access-control-allow-origin": origin, vary: "Origin" }
        : {};
    if (req.method === "OPTIONS") {
      res
        .writeHead(Object.keys(cors).length ? 204 : 403, {
          ...cors,
          "access-control-allow-methods": "POST, GET, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "600",
        })
        .end();
      return;
    }
    try {
      const parts = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 4096) {
          res
            .writeHead(413, { ...cors, "content-type": "application/json" })
            .end(JSON.stringify({ error: "Lobby request too large." }));
          return;
        }
        parts.push(part);
      }
      const response = await handleRoomRequest(
        new Request(own + req.url, {
          method: req.method,
          headers: req.headers,
          ...(req.method === "POST" ? { body: Buffer.concat(parts) } : {}),
        }),
        service,
        {
          allowedOrigins,
          transport: "websocket",
          getStats: () => hub.getStats(),
        },
      );
      res.writeHead(response.status, {
        ...Object.fromEntries(response.headers),
        ...cors,
      });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error("[Online:http-error]", error.message);
      res
        .writeHead(503, { ...cors, "content-type": "application/json" })
        .end(JSON.stringify({ error: "Online server unavailable." }));
    }
  });
  hub.attach(server);
  server.on("close", () => hub.close());
  return { server, service, store, hub };
}
