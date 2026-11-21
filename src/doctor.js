const fs = require("fs");
const path = require("path");
const { isWin, capture } = require("./util");

function javaMajor(bin) {
  const r = capture(bin, ["-version"]);
  const m = r.out.match(/version "(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return m[1] === "1" ? Number(m[2]) : Number(m[1]); // old "1.8" style
}

// JAVA_HOME first, then Android Studio's bundled jbr, then PATH
function findJava() {
  const homes = [process.env.JAVA_HOME, "C:\\Program Files\\Android\\Android Studio\\jbr"].filter(Boolean);
  for (const h of homes) {
    const bin = path.join(h, "bin", isWin ? "java.exe" : "java");
    if (fs.existsSync(bin)) {
      const major = javaMajor(bin);
      if (major) return { home: h, major };
    }
  }
  const major = javaMajor("java");
  return major ? { home: null, major } : null;
}

function findSdk() {
  const local = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk");
  const list = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, local].filter(Boolean);
  return list.find((p) => fs.existsSync(p)) || null;
}

function nodeCheck() {
  const major = Number(process.versions.node.split(".")[0]);
  return { label: `Node ${process.versions.node}`, ok: major >= 18, hint: "Install Node 18 or newer" };
}

function npmCheck() {
  const r = capture("npm --version", [], true);
  return { label: r.ok ? `npm ${r.out.trim()}` : "npm", ok: r.ok, hint: "npm not found, reinstall Node.js" };
}

function checkWindows() {
  return [nodeCheck(), npmCheck()];
}

function checkAndroid() {
  const checks = [nodeCheck()];
  const java = findJava();
  checks.push({
    label: java ? `Java ${java.major}` : "Java",
    ok: !!java && java.major >= 17,
    hint: "Need JDK 17+ (set JAVA_HOME, or install Android Studio)",
  });
  const sdk = findSdk();
  checks.push({
    label: sdk ? `Android SDK (${sdk})` : "Android SDK",
    ok: !!sdk,
    hint: "Install Android Studio or set ANDROID_HOME",
  });
  if (sdk) {
    checks.push({
      label: "SDK licenses accepted",
      ok: fs.existsSync(path.join(sdk, "licenses")),
      hint: "Run: sdkmanager --licenses",
    });
  }
  return checks;
}

// print results, return true if all green
function printChecks(checks) {
  for (const c of checks) {
    console.log(`  ${c.ok ? "[OK]  " : "[FAIL]"} ${c.label}${c.ok ? "" : "  -> " + c.hint}`);
  }
  return checks.every((c) => c.ok);
}

module.exports = { checkWindows, checkAndroid, findJava, findSdk, printChecks };
