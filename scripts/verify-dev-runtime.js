import fs from "fs";
import path from "path";

const root = process.cwd();
const failures = [];

function ensure(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const pkg = readJson("package.json");
ensure(pkg.type === "module", "package.json: type must be module");
ensure(String(pkg.packageManager || "").startsWith("pnpm@"), "package.json: packageManager must be pnpm");
ensure(pkg.scripts && pkg.scripts["verify:dev-runtime"], "package.json: verify:dev-runtime script missing");

const docker = readText("Dockerfile");
[
  "FROM node:22-alpine",
  "WORKDIR /app",
  "apk add --no-cache git ca-certificates",
  "corepack enable && corepack prepare pnpm@10.26.2 --activate",
  "COPY package.json pnpm-lock.yaml* ./",
  "pnpm install --prefer-offline --no-frozen-lockfile",
  "ENV NODE_ENV=development",
  "ENV HOST=0.0.0.0",
  "ENV CHOKIDAR_USEPOLLING=true",
  "ENV CHOKIDAR_INTERVAL=100",
  "EXPOSE 5173",
  'CMD ["node", "scripts/dev-supervisor.js"]',
].forEach((line) => ensure(docker.includes(line), `Dockerfile missing: ${line}`));

const envExample = readText(".env.example");
[
  "VITE_APP_NAME=RiverX App",
  "VITE_API_BASE_URL=/api",
  "VITE_DEV=true",
  "NEXT_DEV=true",
  "PORT=5173",
  "HEALTHCHECK_PATH=/",
  "GIT_BOOTSTRAP=false",
  "GIT_POLL=true",
  "GIT_POLL_INTERVAL=2000",
  "PREVIEW_BRANCH=main",
  "REPO_URL=",
  "DATABASE_URL=",
  "DB_MIGRATE_RETRY_MS=3000",
  "DB_MIGRATE_CONNECT_TIMEOUT_SEC=10",
  "PGCONNECT_TIMEOUT=10",
  "DATABASE_SSL=false",
].forEach((line) => ensure(envExample.includes(line), `.env.example missing: ${line}`));

ensure(fs.existsSync(path.join(root, "scripts/dev-supervisor.js")), "scripts/dev-supervisor.js missing");

const supervisor = readText("scripts/dev-supervisor.js");
[
  "VITE_DEV",
  "NEXT_DEV",
  "PORT || \"5173\"",
  "--host",
  "0.0.0.0",
  "--strictPort",
  "HEALTHCHECK_PATH",
].forEach((line) => ensure(supervisor.includes(line), `scripts/dev-supervisor.js missing runtime invariant: ${line}`));

if (failures.length) {
  console.error("verify:dev-runtime failed");
  failures.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}

console.log("verify:dev-runtime passed");
