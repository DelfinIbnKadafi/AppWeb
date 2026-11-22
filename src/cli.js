const path = require("path");
const { makeConfig, parsePlatforms } = require("./config");
const { askConfig } = require("./prompts");
const { checkWindows, checkAndroid, printChecks } = require("./doctor");
const { prepareIcon } = require("./icon");
const { Progress } = require("./ui");
const { buildWindows } = require("./builders/windows");
const { buildAndroid } = require("./builders/android");
const pkg = require("../package.json");

const BOOLS = new Set(["help", "version", "yes", "no-build", "block", "no-block", "verbose"]);

const HELP = `
AppWeb ${pkg.version} - turn a website into a single-site .exe / .apk

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
  --icon <file>          app icon, square .png/.jpg (512x512 is ideal)
  --out <dir>            output folder (default: ./dist)
  --verbose              show the full build log
  --no-build             only generate the project, skip the build
  --yes                  no prompts, use defaults for what's missing
  --version              print version
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

// stage weights ~ how long each step usually takes
function stagesFor(p, noBuild) {
  if (noBuild) return [{ id: `gen:${p}`, weight: 1 }];
  if (p === "windows") {
    return [
      { id: "gen:windows", weight: 3 },
      { id: "install:windows", weight: 30 },
      { id: "build:windows", weight: 62 },
      { id: "copy:windows", weight: 2 },
    ];
  }
  return [
    { id: "gen:android", weight: 3 },
    { id: "gradle:android", weight: 15 },
    { id: "build:android", weight: 78 },
    { id: "copy:android", weight: 2 },
  ];
}

function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
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
  const icon = args.icon ? await prepareIcon(args.icon) : null;

  console.log(`\nBuilding "${cfg.name}" -> ${cfg.entry}`);
  console.log(`Block other domains: ${cfg.blockOtherDomains ? "yes" : "no"}`);
  if (icon) console.log(`Icon: ${icon}`);

  // toolchain check first, skip platforms that can't build
  const fails = [];
  let runnable = platforms;
  if (!noBuild) {
    runnable = [];
    for (const p of platforms) {
      console.log(`\nChecking ${p} toolchain:`);
      const ok = printChecks(p === "windows" ? checkWindows() : checkAndroid());
      if (ok) runnable.push(p);
      else fails.push(`${p}: toolchain check failed, fix the FAIL lines above`);
    }
  }

  const results = [];
  const started = Date.now();

  if (runnable.length) {
    console.log("");
    const stages = runnable.flatMap((p) => stagesFor(p, noBuild));
    const progress = new Progress(stages, { verbose: !!args.verbose });
    const ctx = { progress, outDir, noBuild, icon };

    for (const p of runnable) {
      try {
        const fn = p === "windows" ? buildWindows : buildAndroid;
        results.push(await fn(cfg, ctx));
      } catch (e) {
        progress.stop();
        fails.push(`${p}: ${e.message}`);
      }
    }
    progress.stop();
  }

  console.log("\n--- Result ---");
  for (const r of results) console.log(r.file ? `Built:     ${r.file}` : `Generated: ${r.work}`);
  for (const f of fails) console.log(`Failed:    ${f}`);
  if (results.length) console.log(`Time:      ${fmtTime(Date.now() - started)}`);
  if (fails.length) process.exitCode = 1;
}

async function run(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0] || "build";

  if (args.version) return console.log(pkg.version);
  if (args.help || cmd === "help") return console.log(HELP);
  if (cmd === "doctor") return doctor();
  if (cmd === "build") return build(args);
  throw new Error(`Unknown command: ${cmd}`);
}

module.exports = { run, parseArgs };
