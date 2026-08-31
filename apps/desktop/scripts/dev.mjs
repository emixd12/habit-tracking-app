import net from "node:net";
import { spawn } from "node:child_process";
import { createServer } from "vite";

async function available(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => error.code === "EADDRINUSE" ? resolve(false) : reject(error));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

let port = 4321;
while (port <= 4330 && !(await available(port))) port++;
if (port > 4330) throw new Error("All Codex development ports (4321–4330) are occupied.");
const server = await createServer({ server: {
  host: "127.0.0.1", port, strictPort: true,
  watch: { ignored: ["**/src-tauri/**"] },
} });
await server.listen();
server.printUrls();

if (!process.argv.includes("--web")) {
  const child = spawn("npm", ["exec", "--", "tauri", "dev", "--config", JSON.stringify({
    build: { devUrl: `http://127.0.0.1:${port}`, beforeDevCommand: "" },
  })], { stdio: "inherit", env: process.env });
  child.on("exit", async (code) => { await server.close(); process.exit(code ?? 1); });
  child.on("error", async (error) => { console.error(error.message); await server.close(); process.exitCode = 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
} else {
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await server.close(); process.exit(0); });
}
