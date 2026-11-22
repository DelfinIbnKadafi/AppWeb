const fs = require("fs");
const path = require("path");
const { TEMPLATES, workDir, logPath } = require("../util");
const { makeExec } = require("../ui");
const { findJava, findSdk } = require("../doctor");
const { ensureGradle } = require("../gradle");
const { writeAndroidIcons } = require("../icon");

// android string res: wrap in quotes, escape the nasty stuff
function xmlStr(s) {
  const e = s
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ");
  return `"${e}"`;
}

async function writeProject(cfg, work, sdk, icon) {
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(TEMPLATES, "android"), work, { recursive: true });

  // swap the app id in
  const gradleFile = path.join(work, "app", "build.gradle");
  fs.writeFileSync(gradleFile, fs.readFileSync(gradleFile, "utf8").replace("__APP_ID__", cfg.appId));

  // app label
  const resDir = path.join(work, "app", "src", "main", "res");
  fs.mkdirSync(path.join(resDir, "values"), { recursive: true });
  fs.writeFileSync(
    path.join(resDir, "values", "strings.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">${xmlStr(cfg.name)}</string>\n</resources>\n`
  );

  // icon (or lack of it) -> manifest attr
  const hasIcon = await writeAndroidIcons(icon, resDir);
  const manifest = path.join(work, "app", "src", "main", "AndroidManifest.xml");
  fs.writeFileSync(
    manifest,
    fs.readFileSync(manifest, "utf8").replace("__ICON_ATTR__", hasIcon ? 'android:icon="@mipmap/ic_launcher"' : "")
  );

  // config consts, JSON strings are valid java literals
  const javaDir = path.join(work, "app", "src", "main", "java", "com", "appweb", "app");
  const j = JSON.stringify;
  fs.writeFileSync(
    path.join(javaDir, "AppConfig.java"),
    [
      "package com.appweb.app;",
      "",
      "final class AppConfig {",
      `  static final String NAME = ${j(cfg.name)};`,
      `  static final String DOMAIN = ${j(cfg.domain)};`,
      `  static final String ENTRY = ${j(cfg.entry)};`,
      `  static final boolean BLOCK_OTHERS = ${cfg.blockOtherDomains};`,
      "  private AppConfig() {}",
      "}",
      "",
    ].join("\n")
  );

  if (sdk) {
    fs.writeFileSync(path.join(work, "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "/")}\n`);
  }
}

async function buildAndroid(cfg, { progress, outDir, noBuild, icon }) {
  const sdk = findSdk();
  const work = workDir(cfg, "android");
  const exec = makeExec(progress, logPath(cfg, "android"));

  progress.begin("gen:android", "Generating Android project");
  await writeProject(cfg, work, sdk, icon);
  progress.end();
  if (noBuild) return { work };

  const gradle = await ensureGradle({ progress, exec });

  const java = findJava();
  const env = { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  if (java && java.home) env.JAVA_HOME = java.home;

  // a clean assembleDebug runs ~40 tasks, count them for a rough percent
  progress.begin("build:android", "Building APK (Gradle)", 150);
  let tasks = 0;
  await exec(`"${gradle}" assembleDebug --console=plain`, {
    cwd: work,
    env,
    onLine: (l) => {
      if (l.startsWith("> Task ")) {
        tasks++;
        progress.set(tasks / 40, `Gradle: ${l.slice(7, 60)}`);
      } else if (/^Download(ing)?\s/i.test(l)) {
        progress.set(0, "Downloading Android dependencies");
      } else if (/BUILD SUCCESSFUL/.test(l)) {
        progress.set(1, "Build done");
      }
    },
  });
  progress.end();

  progress.begin("copy:android", "Copying .apk to output");
  const apk = path.join(work, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!fs.existsSync(apk)) throw new Error("Build finished but no .apk found");

  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, cfg.safeName + ".apk");
  fs.copyFileSync(apk, dest);
  progress.end();

  return { work, file: dest };
}

module.exports = { buildAndroid };
