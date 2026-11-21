const fs = require("fs");
const path = require("path");
const { TEMPLATES, workDir, run } = require("../util");

function writeProject(cfg, work) {
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(TEMPLATES, "electron"), work, { recursive: true });

  const appConfig = {
    name: cfg.name,
    domain: cfg.domain,
    entry: cfg.entry,
    blockOtherDomains: cfg.blockOtherDomains,
  };
  fs.writeFileSync(path.join(work, "app.config.json"), JSON.stringify(appConfig, null, 2));

  const pkg = {
    name: "appweb-" + cfg.slug,
    productName: cfg.safeName,
    version: "1.0.0",
    description: `${cfg.name} (made with AppWeb)`,
    main: "main.js",
    author: "AppWeb",
    devDependencies: { electron: "33.2.1", "electron-builder": "25.1.8" },
    build: {
      appId: cfg.appId,
      productName: cfg.safeName,
      artifactName: "${productName}.${ext}",
      directories: { output: "out" },
      files: ["main.js", "preload.js", "header.html", "app.config.json"],
      // skip rcedit/winCodeSign, it needs symlink perms on win10
      win: { target: [{ target: "portable", arch: ["x64"] }], signAndEditExecutable: false },
    },
  };
  fs.writeFileSync(path.join(work, "package.json"), JSON.stringify(pkg, null, 2));
}

async function buildWindows(cfg, { outDir, noBuild }) {
  const work = workDir(cfg, "windows");
  writeProject(cfg, work);
  if (noBuild) return { work };

  const env = { CSC_IDENTITY_AUTO_DISCOVERY: "false" };
  run("npm install --no-audit --no-fund", { cwd: work, env });

  fs.rmSync(path.join(work, "out"), { recursive: true, force: true });
  run("npx electron-builder --win --x64", { cwd: work, env });

  const exe = fs.readdirSync(path.join(work, "out")).find((f) => f.toLowerCase().endsWith(".exe"));
  if (!exe) throw new Error("Build finished but no .exe found");

  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, cfg.safeName + ".exe");
  fs.copyFileSync(path.join(work, "out", exe), dest);
  return { work, file: dest };
}

module.exports = { buildWindows };
