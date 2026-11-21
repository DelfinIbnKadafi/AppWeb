const fs = require("fs");
const path = require("path");
const { TEMPLATES, workDir, run } = require("../util");
const { findJava, findSdk } = require("../doctor");
const { ensureGradle } = require("../gradle");

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

function writeProject(cfg, work, sdk) {
  fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(TEMPLATES, "android"), work, { recursive: true });

  // swap the app id in
  const gradleFile = path.join(work, "app", "build.gradle");
  fs.writeFileSync(gradleFile, fs.readFileSync(gradleFile, "utf8").replace("__APP_ID__", cfg.appId));

  // app label
  const resDir = path.join(work, "app", "src", "main", "res", "values");
  fs.mkdirSync(resDir, { recursive: true });
  fs.writeFileSync(
    path.join(resDir, "strings.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">${xmlStr(cfg.name)}</string>\n</resources>\n`
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

async function buildAndroid(cfg, { outDir, noBuild }) {
  const sdk = findSdk();
  const work = workDir(cfg, "android");
  writeProject(cfg, work, sdk);
  if (noBuild) return { work };

  const gradle = await ensureGradle();
  const java = findJava();
  const env = { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  if (java && java.home) env.JAVA_HOME = java.home;

  run(`"${gradle}" assembleDebug --console=plain`, { cwd: work, env });

  const apk = path.join(work, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!fs.existsSync(apk)) throw new Error("Build finished but no .apk found");

  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, cfg.safeName + ".apk");
  fs.copyFileSync(apk, dest);
  return { work, file: dest };
}

module.exports = { buildAndroid };
