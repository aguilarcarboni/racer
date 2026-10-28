import { createRealtimeServer } from "../src/server/RealtimeServer.js";
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "https://racer-valle-motor-park.aguilarcarboni173810.chatgpt.site"
)
  .split(",")
  .map((v) => v.trim());
const { server, hub } = createRealtimeServer({ allowedOrigins });
server.listen(Number(process.env.PORT) || 8080, "0.0.0.0", () =>
  console.info("[Online:listening]", {
    port: Number(process.env.PORT) || 8080,
    transport: "websocket",
    maxPlayers: 4,
  }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    hub.close();
    server.close(() => process.exit(0));
  });
