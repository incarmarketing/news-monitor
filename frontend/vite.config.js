import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoots = [
  path.resolve(__dirname, "../public/data"),
  path.resolve(__dirname, "../data"),
];

function serveProjectData() {
  return {
    name: "serve-project-data",
    configureServer(server) {
      server.middlewares.use("/data", async (req, res, next) => {
        try {
          const url = new URL(req.url || "/", "http://localhost");
          const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
          for (const root of dataRoots) {
            const filePath = path.resolve(root, `.${safePath}`);
            if (!filePath.startsWith(root)) continue;
            try {
              const content = await fs.readFile(filePath);
              res.setHeader("Content-Type", filePath.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
              res.end(content);
              return;
            } catch {}
          }
          next();
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  base: "./",
  build: {
    target: "es2018",
    cssTarget: "chrome61",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) return "vendor-charts";
          if (id.includes("lucide-react") || id.includes("lucide")) return "vendor-icons";
          return "vendor";
        },
      },
    },
  },
  plugins: [react(), serveProjectData()],
});
