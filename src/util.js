const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const isWin = process.platform === "win32";
const TEMPLATES = path.join(__dirname, "..", "templates");

// persistent work dir, so node_modules and gradle cache survive rebuilds
function workDir(cfg, platform) {
  return path.join(os.homedir(), ".appweb", "work", `${cfg.slug}-${platform}`);
}

// run a shell command, stream output, throw if it flops
function run(cmd, { cwd, env } = {}) {
  console.log(`\n> ${cmd}`);
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${cmd}`);
}

// run quietly and grab the output
function capture(cmd, args = [], shell = false) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell });
  return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") };
}

module.exports = { isWin, TEMPLATES, workDir, run, capture };
