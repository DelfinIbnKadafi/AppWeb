// input cleanup + validation, keep it strict

function hostMatches(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

function normalizeDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) throw new Error("Domain can't be empty");
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = "https://" + s;

  let host;
  try {
    host = new URL(s).hostname;
  } catch {
    throw new Error(`Bad domain: ${input}`);
  }

  host = host.replace(/^www\./, ""); // www is just a subdomain, drop it
  const ok = host === "localhost" || /^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(host);
  if (!ok) throw new Error(`Bad domain: ${input}`);
  return host;
}

function normalizeEntry(input, domain) {
  let s = String(input || "").trim();
  if (!s) s = "https://" + domain; // default entry
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;

  let url;
  try {
    url = new URL(s);
  } catch {
    throw new Error(`Bad entry point: ${input}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Entry point must be http or https");
  }
  if (!hostMatches(url.hostname.toLowerCase(), domain)) {
    throw new Error(`Entry host (${url.hostname}) isn't part of domain (${domain})`);
  }
  return url.href;
}

function slugify(name) {
  const s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "app";
}

// strip chars windows hates in file names
function safeName(name) {
  const s = String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  return s || "App";
}

function makeAppId(slug) {
  let part = slug.replace(/-/g, "");
  if (!part || /^\d/.test(part)) part = "app" + part;
  return "com.appweb." + part;
}

function parsePlatforms(input) {
  const p = String(input || "").trim().toLowerCase();
  if (p === "windows") return ["windows"];
  if (p === "android") return ["android"];
  if (p === "both" || p === "all") return ["windows", "android"];
  throw new Error(`Unknown platform: ${input} (use android, windows, or both)`);
}

function makeConfig({ name, domain, entry, block }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("App name can't be empty");

  const dom = normalizeDomain(domain);
  const slug = slugify(cleanName);
  return {
    name: cleanName,
    safeName: safeName(cleanName),
    slug,
    appId: makeAppId(slug),
    domain: dom,
    entry: normalizeEntry(entry, dom),
    blockOtherDomains: !!block,
  };
}

module.exports = { normalizeDomain, normalizeEntry, makeConfig, parsePlatforms };
