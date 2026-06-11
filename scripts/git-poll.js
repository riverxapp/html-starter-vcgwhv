import { exec } from "child_process";
import { triggerReload } from "./static-server.js";

function run(cmd, cwd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd }, (err, stdout) => {
      if (err) return reject(err.message);
      resolve(stdout.trim());
    });
  });
}

export async function startGitPoll(options = {}) {
  const cwd = options.cwd || process.cwd();
  const branch = options.branch || process.env.PREVIEW_BRANCH || "main";
  const intervalMs = Number(options.intervalMs || process.env.GIT_POLL_INTERVAL || "2000");
  const onUpdate = options.onUpdate;
  let lastSha = null;

  if (!process.env.REPO_URL) {
    console.log("[git-poll] REPO_URL not set; polling disabled");
    return;
  }

  console.log(`[git-poll] started for ${branch} every ${intervalMs}ms`);

  async function poll() {
    try {
      await run(`git fetch --depth=1 origin ${branch}`, cwd);
      const sha = await run(`git rev-parse origin/${branch}`, cwd);

      if (sha !== lastSha) {
        if (lastSha) {
          console.log("[git-poll] update detected");
          await run(`git reset --hard origin/${branch}`, cwd);
          triggerReload();
          if (typeof onUpdate === "function") onUpdate(sha);
        }
        lastSha = sha;
      }
    } catch (e) {
      console.error("[git-poll]", e);
    }

    setTimeout(poll, intervalMs);
  }

  poll();
}
