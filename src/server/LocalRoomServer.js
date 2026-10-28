import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { DeferredRaceSimulation } from "./RaceSimulation.js";
import { MemoryRoomStore } from "./RoomStore.js";
import { RealtimeHub } from "./RealtimeHub.js";
import { RoomService } from "./RoomService.js";
import { handleRoomRequest } from "./RoomApi.js";
export function localD1(database = new DatabaseSync(":memory:")) {
  database.exec(
    readFileSync(
      new URL("../../drizzle/0000_online_rooms.sql", import.meta.url),
      "utf8",
    ),
  );
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              return { results: database.prepare(sql).all(...args) };
            },
            async first() {
              return database.prepare(sql).get(...args) ?? null;
            },
            async run() {
              const r = database.prepare(sql).run(...args);
              return { meta: { changes: Number(r.changes) } };
            },
          };
        },
      };
    },
  };
}
export function onlineDevPlugin() {
  let service;
  return {
    name: "racer-online-dev",
    configureServer(server) {
      const store = new MemoryRoomStore();
      service = new RoomService(store, new DeferredRaceSimulation());
      const hub = new RealtimeHub(service, store);
      if (server.httpServer) {
        hub.attach(server.httpServer);
        server.httpServer.once("close", () => hub.close());
      }
      server.middlewares.use("/api/online", async (req, res) => {
        try {
          const chunks = [];
          let size = 0;
          for await (const part of req) {
            size += part.length;
            if (size > 4096) {
              res
                .writeHead(413, { "content-type": "application/json" })
                .end(JSON.stringify({ error: "Lobby request is too large." }));
              return;
            }
            chunks.push(part);
          }
          const request = new Request(
            `http://${req.headers.host}/api/online${req.url}`,
            {
              method: req.method,
              headers: req.headers,
              ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
            },
          );
          const response = await handleRoomRequest(request, service, {
            transport: "websocket",
            getStats: () => hub.getStats(),
          });
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          console.error("[Online:dev-error]", error);
          res.writeHead(503, { "content-type": "application/json" }).end(
            JSON.stringify({
              error: "Online development server unavailable.",
            }),
          );
        }
      });
    },
  };
}
