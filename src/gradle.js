const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { isWin } = require("./util");

const VERSION = "8.7"; // matches AGP 8.5.x

// grab our own gradle once, no PATH gradle drama
async function ensureGradle({ progress, exec }) {
  const root = path.join(os.homedir(), ".appweb", "tools");
  const bin = path.join(root, `gradle-${VERSION}`, "bin", isWin ? "gradle.bat" : "gradle");

  if (fs.existsSync(bin)) {
    progress.skip("gradle:android");
    return bin;
  }

  progress.begin("gradle:android", `Downloading Gradle ${VERSION}`);
  fs.mkdirSync(root, { recursive: true });
  const zip = path.join(root, `gradle-${VERSION}-bin.zip`);
  const url = `https://services.gradle.org/distributions/gradle-${VERSION}-bin.zip`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gradle download failed: HTTP ${res.status}`);

  const total = Number(res.headers.get("content-length")) || 0;
  const totalMb = Math.round(total / 1048576);
  let got = 0;
  let lastPct = -1;

  // count bytes as they fly by
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      got += chunk.length;
      const mb = Math.round(got / 1048576);
      if (total) {
        const pct = Math.floor((got / total) * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          progress.set(0.95 * (got / total), `Downloading Gradle ${VERSION}: ${mb}/${totalMb} MB`);
        }
      } else {
        progress.set(0, `Downloading Gradle ${VERSION}: ${mb} MB`);
      }
      cb(null, chunk);
    },
  });

  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(zip));

  progress.set(0.96, "Unpacking Gradle");
  await exec(`tar -xf "${zip}" -C "${root}"`); // win10 ships bsdtar, handles zip
  fs.rmSync(zip, { force: true });

  if (!fs.existsSync(bin)) throw new Error("Gradle unpack failed");
  progress.end();
  return bin;
}

module.exports = { ensureGradle };
