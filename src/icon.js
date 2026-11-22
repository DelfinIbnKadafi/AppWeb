const fs = require("fs");
const path = require("path");

const MIN_SIZE = 192;
const ANDROID_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// heavy deps load only when --icon is used
function need(name) {
  try {
    return require(name);
  } catch {
    throw new Error(`Missing "${name}" (needed for --icon). Run "npm install" inside the AppWeb folder.`);
  }
}

// validate the file, return its absolute path
async function prepareIcon(input) {
  const file = path.resolve(input);
  if (!fs.existsSync(file)) throw new Error(`Icon not found: ${file}`);
  if (!/\.(png|jpe?g)$/i.test(file)) throw new Error("Icon must be a .png or .jpg file");

  const Jimp = need("jimp");
  const { width, height } = (await Jimp.read(file)).bitmap;
  if (Math.min(width, height) < MIN_SIZE) {
    throw new Error(`Icon too small (${width}x${height}). Use ${MIN_SIZE}x${MIN_SIZE} at least, 512x512 is ideal.`);
  }
  return file;
}

// square pngs at every size we need, keeps ratio and pads transparent
async function renderSizes(file, sizes) {
  const Jimp = need("jimp");
  const base = await Jimp.read(file);
  const out = {};
  for (const s of sizes) out[s] = await base.clone().contain(s, s).getBufferAsync(Jimp.MIME_PNG);
  return out;
}

async function makeIco(file) {
  const mod = need("png-to-ico");
  const pngToIco = mod.default || mod;
  const bufs = await renderSizes(file, ICO_SIZES);
  return pngToIco(ICO_SIZES.map((s) => bufs[s]));
}

// wipe old mipmaps first so a stale icon can't sneak in
async function writeAndroidIcons(file, resDir) {
  for (const d of fs.readdirSync(resDir)) {
    if (d.startsWith("mipmap-")) fs.rmSync(path.join(resDir, d), { recursive: true, force: true });
  }
  if (!file) return false;

  const bufs = await renderSizes(file, Object.values(ANDROID_SIZES));
  for (const [dens, size] of Object.entries(ANDROID_SIZES)) {
    const dir = path.join(resDir, `mipmap-${dens}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ic_launcher.png"), bufs[size]);
  }
  return true;
}

module.exports = { prepareIcon, makeIco, writeAndroidIcons };
