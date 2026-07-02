#!/usr/bin/env node
/**
 * Blog-feed integrity gate (deterministic, dependency-free).
 *
 * Enforces the index <-> file consistency invariants whose violation produced the
 * historical null/orphan/dead-link drift. Designed to be the blocking counterpart to
 * worker 033's atomic publish: 033 stops *creating* drift; this stops drift from ever
 * *landing*.
 *
 * Blocking checks (exit 1):
 *   V1  blogs.json parses, is an array, and contains no null entries / null fields
 *   V2  every entry has slug + title and a content_url that resolves to a real file
 *   V3  every blog/*.html on disk is referenced by the index (no orphans)
 *   V4  every entry image/thumbnail resolves to a real file
 *
 * Run from the repo root: `node scripts/verify-blog-feed.mjs`
 * Set IMAGES_BLOCKING=0 to downgrade V4 to advisory (warn only).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const imagesBlocking = process.env.IMAGES_BLOCKING !== "0";

const resolveLocal = (url) => {
  if (!url || typeof url !== "string") return null;
  if (/^https?:\/\//i.test(url)) return "remote"; // external — not our file to verify
  const rel = url.split(/[?#]/)[0].replace(/^\//, "");
  return existsSync(join(ROOT, rel)) ? "ok" : null;
};

// ---- Load + V1 ----
let feed;
try {
  feed = JSON.parse(readFileSync(join(ROOT, "blogs.json"), "utf8"));
} catch (e) {
  fail(`V1 blogs.json does not parse: ${e.message}`);
  report();
}
if (!Array.isArray(feed)) {
  fail("V1 blogs.json is not an array");
  report();
}

const indexedFiles = new Set();
feed.forEach((entry, i) => {
  if (entry === null) return fail(`V1 entry[${i}] is null`);
  if (typeof entry !== "object") return fail(`V1 entry[${i}] is not an object`);
  for (const [k, v] of Object.entries(entry)) {
    if (v === null) fail(`V1 entry[${i}] (${entry.slug || "?"}) field "${k}" is null`);
  }
  // ---- V2 ----
  if (!entry.slug) fail(`V2 entry[${i}] missing slug`);
  if (!entry.title) fail(`V2 entry[${i}] (${entry.slug || "?"}) missing title`);
  const contentUrl = entry.content_url || entry.url || (entry.slug ? `/blog/${entry.slug}.html` : null);
  const res = resolveLocal(contentUrl);
  if (res === null) fail(`V2 dead link: entry "${entry.slug}" content_url "${contentUrl}" has no file`);
  else if (res === "ok") indexedFiles.add(contentUrl.split(/[?#]/)[0].replace(/^\//, ""));
  // ---- V4 ----
  const img = entry.image || entry.thumbnail;
  if (img && resolveLocal(img) === null) {
    (imagesBlocking ? fail : warn)(`V4 missing image: entry "${entry.slug}" -> "${img}"`);
  }
});

// ---- V3 orphans ----
let blogFiles = [];
try {
  blogFiles = readdirSync(join(ROOT, "blog")).filter((f) => f.endsWith(".html") && f !== "index.html");
} catch { /* no blog/ dir */ }
for (const f of blogFiles.sort()) {
  const rel = `blog/${f}`;
  if (!indexedFiles.has(rel)) fail(`V3 orphan: blog/${f} is on disk but not referenced by blogs.json`);
}

report();

function report() {
  const site = ROOT.split("/").pop();
  for (const w of warnings.sort()) console.log(`::warning::[blog-feed] ${w}`);
  if (errors.length === 0) {
    console.log(`✅ [blog-feed:${site}] PASS — ${feed?.length ?? 0} entries, ${blogFiles?.length ?? 0} files, 0 violations` +
      (warnings.length ? ` (${warnings.length} advisory warning(s))` : ""));
    process.exit(0);
  }
  for (const e of errors.sort()) console.log(`::error::[blog-feed] ${e}`);
  console.log(`\n❌ [blog-feed:${site}] FAIL — ${errors.length} blocking violation(s)`);
  process.exit(1);
}
