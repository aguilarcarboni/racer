import { existsSync, readFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
const manifest = existsSync(".openai/hosting.json")
  ? JSON.parse(readFileSync(".openai/hosting.json", "utf8"))
  : null;
function run(args) {
  const r = spawnSync(
    process.execPath,
    ["node_modules/vite/bin/vite.js", ...args],
    { stdio: "inherit" },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (!manifest?.d1) {
  run(["build"]);
} else {
  rmSync("dist", { recursive: true, force: true });
  run(["build", "--outDir", ".sites-build/client"]);
  run(["build", "--config", "vite.worker.config.js"]);
  mkdirSync("dist/.openai", { recursive: true });
  cpSync(".openai/hosting.json", "dist/.openai/hosting.json");
  cpSync("drizzle", "dist/.openai/drizzle", { recursive: true });
}
