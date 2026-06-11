import { spawn } from "child_process";
import { execSync } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { startGitPoll } from "./git-poll.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
process.chdir(rootDir);

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

const PORT = String(getCliFlag("--port") || getCliEnvLike("PORT") || process.env.PORT || "5173");
const HOST = getCliFlag("--host") || getCliEnvLike("HOST") || process.env.HOST || "0.0.0.0";
const HEALTHCHECK_PATH = process.env.HEALTHCHECK_PATH || "/";
const VITE_DEV = String(process.env.VITE_DEV || "true").toLowerCase() === "true";
const NEXT_DEV = String(process.env.NEXT_DEV || "true").toLowerCase() === "true";

const GIT_BOOTSTRAP = String(process.env.GIT_BOOTSTRAP || "false").toLowerCase() === "true";
const GIT_POLL = String(process.env.GIT_POLL || "true").toLowerCase() === "true";
const REPO_URL = process.env.REPO_URL || "";
const BRANCH = process.env.PREVIEW_BRANCH || "main";

function hasVite() {
  if (fs.existsSync(path.join(rootDir, "vite.config.js")) || fs.existsSync(path.join(rootDir, "vite.config.mjs")) || fs.existsSync(path.join(rootDir, "vite.config.ts"))) {
    return true;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    return Boolean(deps.vite);
  } catch {
    return false;
  }
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: rootDir });
}

function maybeBootstrapGit() {
  if (!GIT_BOOTSTRAP || !REPO_URL) return;

  console.log("[dev-supervisor] bootstrapping git repo");
  if (!fs.existsSync(path.join(rootDir, ".git"))) {
    run("git init");
    run(`git remote add origin ${REPO_URL}`);
  } else {
    run(`git remote set-url origin ${REPO_URL}`);
  }

  run(`git fetch --depth=1 origin ${BRANCH}`);
  run(`git reset --hard origin/${BRANCH}`);
  run("git clean -fd");
}

function waitForWarmup() {
  const deadline = Date.now() + 60_000;
  const healthPath = HEALTHCHECK_PATH.startsWith("/") ? HEALTHCHECK_PATH : `/${HEALTHCHECK_PATH}`;

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get({ host: "127.0.0.1", port: Number(PORT), path: healthPath, timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          console.log(`[dev-supervisor] warmup ready at ${healthPath}`);
          resolve();
          return;
        }

        if (Date.now() > deadline) {
          reject(new Error(`warmup timeout for ${healthPath}`));
          return;
        }
        setTimeout(check, 500);
      });

      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`warmup timeout for ${healthPath}`));
          return;
        }
        setTimeout(check, 500);
      });

      req.on("timeout", () => {
        req.destroy();
      });
    };

    check();
  });
}

function spawnAndTrack(command, args) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, HOST, PORT },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.on(sig, () => {
      if (!child.killed) child.kill(sig);
    });
  });

  return child;
}

async function main() {
  maybeBootstrapGit();

  const useVite = hasVite();
  let child;

  if (useVite) {
    const shouldRunDev = VITE_DEV || NEXT_DEV;
    const mode = shouldRunDev ? "dev" : "preview";
    const args = [
      "vite",
      mode,
      "--host",
      "0.0.0.0",
      "--strictPort",
      "--port",
      PORT,
    ];

    console.log(`[dev-supervisor] starting vite ${mode} on ${HOST}:${PORT}`);
    child = spawnAndTrack("pnpm", args);
  } else {
    console.log(`[dev-supervisor] starting static server on ${HOST}:${PORT}`);
    child = spawnAndTrack("node", ["scripts/static-server.js"]);
  }

  await waitForWarmup();

  if (GIT_POLL) {
    startGitPoll({
      cwd: rootDir,
      branch: BRANCH,
      intervalMs: Number(process.env.GIT_POLL_INTERVAL || "2000"),
      onUpdate: () => {
        console.log("[dev-supervisor] repository update detected");
      },
    });
  }

  return child;
}

main().catch((error) => {
  console.error("[dev-supervisor]", error.message);
  process.exit(1);
});
