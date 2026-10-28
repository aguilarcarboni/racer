// Public game server endpoint. Development uses Vite's local server.
export const ONLINE_SERVER_URL =
  "https://racer-online-764894480181.us-east1.run.app";
export const onlineServerUrl = () =>
  import.meta.env?.DEV ? "" : ONLINE_SERVER_URL;
