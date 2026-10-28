CREATE TABLE online_rooms (code TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, payload TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX online_rooms_expiry ON online_rooms (expires_at);
