import { RoomError } from "./RoomService.js";
export async function handleRoomRequest(
  request,
  service,
  { allowedOrigins = [], transport = "http-snapshots", getStats } = {},
) {
  const url = new URL(request.url);
  if (url.pathname === "/api/online/health")
    return Response.json(
      { available: true, maxPlayers: 4, transport, ...getStats?.() },
      { headers: { "cache-control": "no-store" } },
    );
  try {
    if (request.method !== "POST")
      throw new RoomError("Use POST for lobby actions.", 405);
    if (
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== url.origin &&
      !allowedOrigins.includes(request.headers.get("Origin"))
    )
      throw new RoomError("Invalid request origin.", 403);
    const reader = request.body?.getReader();
    let size = 0,
      chunks = [];
    if (reader)
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 4096) {
          await reader.cancel();
          throw new RoomError("Lobby request is too large.", 413);
        }
        chunks.push(part.value);
      }
    const raw = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      raw.set(part, offset);
      offset += part.length;
    }
    let data;
    try {
      data = JSON.parse(new TextDecoder().decode(raw) || "{}");
    } catch {
      throw new RoomError("Invalid lobby request.");
    }
    if (!data || Array.isArray(data) || typeof data !== "object")
      throw new RoomError("Invalid lobby request.");
    const match = url.pathname.match(
      /^\/api\/online\/rooms\/([A-Z2-9]{6})\/(join|poll|ready|start|input|leave|close|rematch)$/,
    );
    const result =
      url.pathname === "/api/online/rooms"
        ? await service.create(data)
        : match
          ? await service.request(match[1], match[2], data)
          : null;
    if (!result) throw new RoomError("Lobby endpoint not found.", 404);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (!(error instanceof RoomError))
      console.error("[Online:server-error]", error);
    return Response.json(
      {
        error:
          error instanceof RoomError
            ? error.message
            : "The online server is unavailable. Try reconnecting.",
      },
      { status: error.status ?? 503, headers: { "cache-control": "no-store" } },
    );
  }
}
