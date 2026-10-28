import { defineConfig } from "vite";
import { onlineDevPlugin } from "./src/server/LocalRoomServer.js";
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: { usePolling: true, interval: 350 },
  },
  plugins: [
    onlineDevPlugin(),
    {
      name: "client-log-bridge",
      configureServer(server) {
        server.middlewares.use("/__client-log", (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405).end();
            return;
          }
          let raw = "",
            tooLarge = false;
          req.on("data", (chunk) => {
            if (raw.length + chunk.length > 32768) {
              tooLarge = true;
              return;
            }
            raw += chunk;
          });
          req.on("end", () => {
            if (tooLarge) {
              res.writeHead(413).end();
              return;
            }
            try {
              const data = JSON.parse(raw),
                level = ["warn", "error", "info", "debug"].includes(data.level)
                  ? data.level
                  : "log";
              console[level](
                `[browser:${level}]`,
                ...(Array.isArray(data.args) ? data.args : []),
              );
              res.writeHead(204).end();
            } catch {
              res.writeHead(400).end();
            }
          });
        });
      },
    },
  ],
});
