const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const TICK_MS = 400;

// one bar for the whole run, stages have weights
class Progress {
  constructor(stages, { verbose = false } = {}) {
    this.stages = new Map(stages.map((s) => [s.id, { ...s, frac: 0 }]));
    this.verbose = verbose;
    this.tty = !!process.stdout.isTTY;
    this.cur = null;
    this.text = "";
    this.timer = null;
    this.drawn = false;
    this.lastPct = -1;
  }

  percent() {
    let total = 0;
    let sum = 0;
    for (const s of this.stages.values()) {
      total += s.weight;
      sum += s.weight * s.frac;
    }
    return Math.min(100, Math.floor((sum / (total || 1)) * 100));
  }

  // creepSec > 0 = slowly crawl the stage so silent downloads don't look frozen
  begin(id, text, creepSec = 0) {
    this._stopCreep();
    this.cur = this.stages.get(id);
    this.text = text;
    if (creepSec > 0) {
      this.timer = setInterval(() => {
        if (this.cur.frac < 0.95) this.cur.frac += (0.95 - this.cur.frac) * (TICK_MS / 1000 / creepSec);
        this.render();
      }, TICK_MS);
      this.timer.unref();
    }
    this.render(true);
  }

  // never goes backwards
  set(frac, text) {
    if (!this.cur) return;
    this.cur.frac = Math.max(this.cur.frac, Math.min(1, frac));
    if (text) this.text = text;
    this.render();
  }

  end() {
    this._stopCreep();
    if (this.cur) this.cur.frac = 1;
    this.render();
  }

  // stage not needed, drop its weight
  skip(id) {
    const s = this.stages.get(id);
    if (s) {
      s.weight = 0;
      s.frac = 1;
    }
  }

  // log line without wrecking the bar
  line(text) {
    this._clear();
    console.log(text);
    if (this.tty) this.render();
  }

  stop() {
    this._stopCreep();
    if (this.tty && this.drawn) process.stdout.write("\n");
    this.drawn = false;
  }

  _stopCreep() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _clear() {
    if (this.tty && this.drawn) {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
    }
  }

  render(force = false) {
    const pct = this.percent();

    if (!this.tty) {
      // piped output: only print on stage change or every 10%
      if (force || pct - this.lastPct >= 10 || pct === 100) {
        console.log(`[${String(pct).padStart(3)}%] ${this.text}`);
        this.lastPct = pct;
      }
      return;
    }

    const w = 24;
    const fill = Math.round((w * pct) / 100);
    let line = `[${"#".repeat(fill)}${"-".repeat(w - fill)}] ${String(pct).padStart(3)}%  ${this.text}`;
    const cols = process.stdout.columns || 80;
    if (line.length > cols - 1) line = line.slice(0, cols - 1);

    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(line);
    this.drawn = true;
  }
}

// async command runner, output goes to log file + line callback
function runAsync(cmd, { cwd, env, onLine, logFile } = {}) {
  return new Promise((resolve, reject) => {
    let log = null;
    if (logFile) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      log = fs.createWriteStream(logFile, { flags: "a" });
      log.write(`> ${cmd}\n`);
    }

    const tail = [];
    const bufs = { out: "", err: "" };
    const child = spawn(cmd, { cwd, shell: true, windowsHide: true, env: { ...process.env, ...env } });

    const feed = (key) => (chunk) => {
      bufs[key] += chunk.toString("utf8");
      const parts = bufs[key].split(/\r\n|\n|\r/);
      bufs[key] = parts.pop(); // keep the unfinished bit
      for (const raw of parts) {
        const line = raw.replace(ANSI, "").trimEnd();
        if (!line) continue;
        if (log) log.write(line + "\n");
        tail.push(line);
        if (tail.length > 15) tail.shift();
        if (onLine) onLine(line);
      }
    };

    child.stdout.on("data", feed("out"));
    child.stderr.on("data", feed("err"));

    child.on("error", (e) => {
      if (log) log.end();
      reject(e);
    });

    child.on("close", (code) => {
      if (log) log.end();
      if (code === 0) return resolve();
      const more = logFile ? `\nFull log: ${logFile}` : "";
      reject(new Error(`Command failed (exit ${code}): ${cmd}\n${tail.join("\n")}${more}`));
    });
  });
}

// runner bound to a progress bar + log file
function makeExec(progress, logFile) {
  return (cmd, opts = {}) =>
    runAsync(cmd, {
      ...opts,
      logFile,
      onLine: (l) => {
        if (progress.verbose) progress.line(l);
        if (opts.onLine) opts.onLine(l);
      },
    });
}

module.exports = { Progress, runAsync, makeExec };
