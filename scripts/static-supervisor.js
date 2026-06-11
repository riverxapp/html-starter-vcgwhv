import { execSync } from "child_process";
import fs from "fs";
import "./static-server.js";
import { startGitPoll } from "./git-poll.js";

const BRANCH = process.env.PREVIEW_BRANCH || "main";
const REPO_URL = process.env.REPO_URL;

process.chdir("/app"); // 🔑 FORCE cwd

if (!REPO_URL) {
  console.error("[supervisor] REPO_URL is required");
  process.exit(1);
}

function syncRepo() {
  console.log("[supervisor] syncing git repo");

  if (!fs.existsSync(".git")) {
    execSync("git init", { stdio: "inherit", cwd: "/app" });
    execSync(`git remote add origin ${REPO_URL}`.trim(), {
      stdio: "inherit",
      cwd: "/app",
    });
  } else {
    execSync(`git remote set-url origin ${REPO_URL}`.trim(), {
      stdio: "inherit",
      cwd: "/app",
    });
  }

  execSync(`git fetch --depth=1 origin ${BRANCH}`, {
    stdio: "inherit",
    cwd: "/app",
  });
  execSync(`git reset --hard origin/${BRANCH}`, {
    stdio: "inherit",
    cwd: "/app",
  });
  execSync("git clean -fd", { stdio: "inherit", cwd: "/app" });
}

syncRepo();

console.log("[supervisor] static preview running");

// 🔑 start polling ONLY after git is ready
startGitPoll();
