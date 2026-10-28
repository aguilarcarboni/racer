import { defineConfig } from "vite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
export default defineConfig({
  plugins: [
    {
      name: "racer-assets",
      resolveId(id) {
        if (id === "virtual:racer-assets") return "\0racer-assets";
      },
      load(id) {
        if (id !== "\0racer-assets") return;
        const root = path.resolve(".sites-build/client"),
          assets = {};
        function walk(dir) {
          for (const item of readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, item.name);
            if (item.isDirectory()) walk(file);
            else {
              const ext = path.extname(file),
                binary = ![
                  ".html",
                  ".js",
                  ".css",
                  ".json",
                  ".svg",
                  ".txt",
                ].includes(ext);
              assets[
                "/" + path.relative(root, file).split(path.sep).join("/")
              ] = {
                binary,
                type:
                  {
                    ".html": "text/html; charset=utf-8",
                    ".js": "text/javascript; charset=utf-8",
                    ".css": "text/css; charset=utf-8",
                    ".glb": "model/gltf-binary",
                    ".svg": "image/svg+xml",
                  }[ext] ?? "application/octet-stream",
                content: readFileSync(file, binary ? "base64" : "utf8"),
              };
            }
          }
        }
        walk(root);
        return `export default ${JSON.stringify(assets)}`;
      },
    },
  ],
  build: {
    outDir: "dist/server",
    emptyOutDir: false,
    target: "es2022",
    lib: {
      entry: "src/server/SiteWorker.js",
      formats: ["es"],
      fileName: () => "index.js",
    },
    minify: true,
  },
});
