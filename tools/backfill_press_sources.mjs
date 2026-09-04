// Compatibility entry point; the shared Python resolver owns all source repairs.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./backfill_publisher_identity.py", import.meta.url));
const result = spawnSync(process.env.PYTHON || "python", [script, ...process.argv.slice(2)], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
