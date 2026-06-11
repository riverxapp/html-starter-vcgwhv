import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function getCliFlag(name) {
  const args = process.argv.slice(2);
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

function getCliEnvLike(name) {
  const arg = process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`));
  if (!arg) return undefined;
  return arg.slice(name.length + 1);
}

const PORT = Number(getCliFlag("--port") || getCliEnvLike("PORT") || process.env.PORT || "5173");
const HOST = getCliFlag("--host") || getCliEnvLike("HOST") || process.env.HOST || "0.0.0.0";
const ROOT = process.cwd();
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

const clients = new Set();

const server = http.createServer((req, res) => {
  if (req.url === "/__hmr") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("\n");

    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const reqPath = (req.url || "/").split("?")[0];
  const filePath = path.join(ROOT, reqPath === "/" ? "index.html" : reqPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200);
    res.end(content);
  });
});

export function triggerReload() {
  for (const res of clients) {
    res.write("data: reload\n\n");
  }
}

function startStaticServer() {
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[static] port ${PORT} is already in use`);
    } else {
      console.error("[static] server error", error);
    }
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(`[static] serving ${ROOT} on ${HOST}:${PORT}`);
  });
}

if (isDirectRun) {
  startStaticServer();
}
