const path = require("path");
const { makeConfig, parsePlatforms } = require("./config");
const { askConfig } = require("./prompts");
const { checkWindows, checkAndroid, printChecks } = require("./doctor");
const { buildWindows } = require("./builders/windows");
const { buildAndroid } = require("./builders/android");

const BOOLS = new Set(["help", "yes", "no-build", "block", "no-block"]);

const HELP = `
AppWeb - turn a website into a single-site .exe / .apk

Usage:
  appweb                 interactive build
  appweb build [flags]   build with flags (missing ones get prompted)
  appweb doctor          check your toolchain

Flags:
  --name <text>          app name
  --domain <host>        allowed domain, e.g. google.com
  --entry <url>          start URL (default: https://<domain>)
  --block / --no-block   force block other domains
  --platform <p>         android | windows | both
  --out <dir>            output folder (default: ./dist)
  --no-build             only generate the project, skip the build
  --yes                  no prompts, use defaults for what's missing
  --help                 show this
`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    if (BOOLS.has(key)) out[key] = true;
    else if (eq !== -1) out[key] = a.slice(eq + 1);
    else out[key] = argv[++i];
  }
  return out;
}

function doctor() {
  console.log("\nWindows build:");
  const w = printChecks(checkWindows());
  console.log("\nAndroid build:");
  const a = printChecks(checkAndroid());
  console.log("");
  if (!w || !a) process.exitCode = 1;
}

async function build(args) {
  const preset = {
    name: args.name,
    domain: args.domain,
    entry: args.entry,
    block: args.block ? true : args["no-block"] ? false : undefined,
    platform: args.platform,
  };

  let answers;
  if (args.yes) {
    if (!preset.name || !preset.domain) throw new Error("--yes needs --name and --domain");
    answers = { ...preset, block: preset.block ?? false, platform: preset.platform ?? "windows" };
  } else {
    answers = await askConfig(preset);
  }

  const cfg = makeConfig(answers);
  const platforms = parsePlatforms(answers.platform);
  const outDir = path.resolve(args.out || "dist");
  const noBuild = !!args["no-build"];

  console.log(`\nBuilding "${cfg.name}" -> ${cfg.entry}`);
  console.log(`Block other domains: ${cfg.blockOtherDomains ? "yes" : "no"}`);

  const results = [];
  const fails = [];

  for (const p of platforms) {
    console.log(`\n=== ${p.toUpperCase()} ===`);
    try {
      if (!noBuild) {
        const ok = printChecks(p === "windows" ? checkWindows() : checkAndroid());
        if (!ok) throw new Error("Toolchain check failed, fix the FAIL lines above");
      }
      const fn = p === "windows" ? buildWindows : buildAndroid;
      results.push(await fn(cfg, { outDir, noBuild }));
    } catch (e) {
      fails.push(`${p}: ${e.message}`);
    }
  }

  console.log("\n--- Result ---");
  for (const r of results) console.log(r.file ? `Built:     ${r.file}` : `Generated: ${r.work}`);
  for (const f of fails) console.log(`Failed:    ${f}`);
  if (fails.length) process.exitCode = 1;
}

async function run(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0] || "build";

  if (args.help || cmd === "help") return console.log(HELP);
  if (cmd === "doctor") return doctor();
  if (cmd === "build") return build(args);
  throw new Error(`Unknown command: ${cmd}`);
}

module.exports = { run, parseArgs };
