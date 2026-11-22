const fs = require("fs");
const path = require("path");
const { TEMPLATES, workDir, logPath } = require("../util");
const { makeExec } = require("../ui");
const { makeIco } = require("../icon");

async function writeProject(cfg, work, icon) {
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(TEMPLATES, "electron"), work, { recursive: true });

  const appConfig = {
    name: cfg.name,
    domain: cfg.domain,
    entry: cfg.entry,
    blockOtherDomains: cfg.blockOtherDomains,
  };
  fs.writeFileSync(path.join(work, "app.config.json"), JSON.stringify(appConfig, null, 2));

  const files = ["main.js", "preload.js", "header.html", "app.config.json"];
  const win = { target: [{ target: "portable", arch: ["x64"] }], signAndEditExecutable: false };

  const icoFile = path.join(work, "icon.ico");
  if (icon) {
    fs.writeFileSync(icoFile, await makeIco(icon));
    files.push("icon.ico");
    win.icon = "icon.ico";
  } else {
    fs.rmSync(icoFile, { force: true }); // no stale icon from old builds
  }

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
      files,
      // skip rcedit/winCodeSign, it needs symlink perms on win10
      win,
    },
  };
  fs.writeFileSync(path.join(work, "package.json"), JSON.stringify(pkg, null, 2));
}

// log markers from electron-builder -> rough progress
const BUILD_MARKS = [
  [/loaded configuration/i, 0.1, "Loading config"],
  [/packaging\s+platform/i, 0.3, "Packaging app"],
  [/downloading/i, 0.45, "Downloading build tools"],
  [/building\s+target/i, 0.8, "Building portable exe"],
  [/building block map/i, 0.95, "Finalizing"],
];

async function buildWindows(cfg, { progress, outDir, noBuild, icon }) {
  const work = workDir(cfg, "windows");
  const exec = makeExec(progress, logPath(cfg, "windows"));

  progress.begin("gen:windows", "Generating Windows project");
  await writeProject(cfg, work, icon);
  progress.end();
  if (noBuild) return { work };

  const env = { CSC_IDENTITY_AUTO_DISCOVERY: "false" };

  // npm gives no percent, so count fetched tarballs and guess
  progress.begin("install:windows", "Installing packages (npm)", 60);
  let fetched = 0;
  await exec("npm install --no-audit --no-fund --loglevel=http", {
    cwd: work,
    env,
    onLine: (l) => {
      if (!/http fetch/i.test(l)) return;
      fetched++;
      progress.set(fetched / (fetched + 120), `Installing packages (${fetched} fetched)`);
    },
  });
  progress.end();

  fs.rmSync(path.join(work, "out"), { recursive: true, force: true });

  progress.begin("build:windows", "Packaging with electron-builder", 90);
  await exec("npx electron-builder --win --x64", {
    cwd: work,
    env,
    onLine: (l) => {
      for (const [re, frac, text] of BUILD_MARKS) {
        if (re.test(l)) progress.set(frac, text);
      }
    },
  });
  progress.end();

  progress.begin("copy:windows", "Copying .exe to output");
  const exe = fs.readdirSync(path.join(work, "out")).find((f) => f.toLowerCase().endsWith(".exe"));
  if (!exe) throw new Error("Build finished but no .exe found");

  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, cfg.safeName + ".exe");
  fs.copyFileSync(path.join(work, "out", exe), dest);
  progress.end();

  return { work, file: dest };
}

module.exports = { buildWindows };
