const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { isWin, run } = require("./util");

const VERSION = "8.7"; // matches AGP 8.5.x

// grab our own gradle once, no PATH gradle drama
async function ensureGradle() {
  const root = path.join(os.homedir(), ".appweb", "tools");
  const bin = path.join(root, `gradle-${VERSION}`, "bin", isWin ? "gradle.bat" : "gradle");
  if (fs.existsSync(bin)) return bin;

  fs.mkdirSync(root, { recursive: true });
  const zip = path.join(root, `gradle-${VERSION}-bin.zip`);
  const url = `https://services.gradle.org/distributions/gradle-${VERSION}-bin.zip`;

  console.log(`Downloading Gradle ${VERSION} (one time only)...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gradle download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));

  run(`tar -xf "${zip}" -C "${root}"`); // win10 ships bsdtar, handles zip
  fs.rmSync(zip, { force: true });

  if (!fs.existsSync(bin)) throw new Error("Gradle unpack failed");
  return bin;
}

module.exports = { ensureGradle };
