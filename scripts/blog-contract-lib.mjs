// scripts/blog-contract-lib.mjs — shared contract-validator core (§2-§9 of the
// blog-ocp-csp-cadence full-scope spec). Deterministic + idempotent: same tree =>
// same verdict. Legacy policy: blog files whose sha256 matches
// scripts/blog-legacy-manifest.json are REPORT-only; new or changed files BLOCK.
import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

export const SITE = {"site": "gatewaydebthelp", "host": "gatewaydebthelp.com", "button": "Start the secure options check"};

export const CANONICAL_OWNER_TARGETS = [
  'https://debtreliefguard.com/scams.compliance.index',
  'https://debtreliefguard.com/learn/lawsuits-collections/',
  'https://debtreliefguard.com/bankruptcy.alternatives.index',
  'https://gatewaydebthelp.com/credit-card-relief.html',
  'https://gatewaydebthelp.com/credit-counseling.html',
  'https://gatewaydebthelp.com/credit-rebuild.html',
  'https://debthelpform.com/debt-settlement.html',
  'https://debthelpform.com/debt-consolidation.html',
  'https://debthelpform.com/debt-relief-eligibility.html',
];
export const ALL_HOSTS = ['debtreliefguard.com', 'gatewaydebthelp.com', 'debthelpform.com'];
export const CTA_TARGET = `https://${SITE.host}/?ref=blog-leadform#leadForm`;

const __filename = fileURLToPath(import.meta.url);
export const repoRoot = path.resolve(path.dirname(__filename), '..');

export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function loadManifest() {
  try {
    return JSON.parse(await fs.readFile(path.join(repoRoot, 'scripts', 'blog-legacy-manifest.json'), 'utf8'));
  } catch {
    return {};
  }
}

export async function listBlogFiles() {
  const dir = path.join(repoRoot, 'blog');
  let names = [];
  try { names = await fs.readdir(dir); } catch { return []; }
  return names
    .filter((f) => f.endsWith('.html') && !/^index\.html$/i.test(f))
    .sort()
    .map((f) => `blog/${f}`);
}

// classify: 'legacy' (manifest hash match => report-only) | 'blocking' (new/changed)
export async function classify(rel, manifest) {
  const text = await fs.readFile(path.join(repoRoot, rel), 'utf8');
  const digest = sha256(text);
  const mode = manifest[rel] === digest ? 'legacy' : 'blocking';
  return { rel, text, mode };
}

export function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
}
export function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}
export function editorialRegion(html) {
  const article = html.match(/<article[\s>][\s\S]*?<\/article>/i);
  if (article) return article[0];
  const main = html.match(/<main[\s>][\s\S]*?<\/main>/i);
  if (main) return main[0];
  return html;
}
export function parseArticle(html) {
  const region = editorialRegion(html);
  const h1Count = (region.match(/<h1[\s>]/gi) || []).length;
  const h3Count = (region.match(/<h3[\s>]/gi) || []).length;
  const h2Split = region.split(/<h2[^>]*>/i);
  const preamble = h2Split[0] ?? region;
  const h2Sections = [];
  for (let i = 1; i < h2Split.length; i++) {
    const chunk = h2Split[i];
    const headingEnd = chunk.search(/<\/h2>/i);
    const heading = stripTags(headingEnd >= 0 ? chunk.slice(0, headingEnd) : '').trim();
    const body = headingEnd >= 0 ? chunk.slice(headingEnd + 5) : chunk;
    h2Sections.push({ heading, words: countWords(stripTags(body)) });
  }
  const anchors = [];
  const anchorRe = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(region)) !== null) {
    anchors.push({ href: m[1], text: stripTags(m[2]).trim() });
  }
  return {
    h1Count, h3Count, h2Sections, anchors,
    editorialWords: countWords(stripTags(region)),
    hasBrandTrustLinks: /class\s*=\s*"[^"]*brand-trust-links/i.test(region),
    introWordsBeforeFirstH2: countWords(stripTags(preamble.replace(/<h1[\s\S]*?<\/h1>/i, ' '))),
    region,
  };
}
export function hostOf(href) {
  try { return new URL(href).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return null; }
}
export function isSisterLink(href) {
  const h = hostOf(href);
  return !!h && h !== SITE.host && ALL_HOSTS.includes(h);
}
export function normalizeUrl(u) {
  return u.replace(/\/+$/, '').toLowerCase();
}
export const CANONICAL_SET = new Set(CANONICAL_OWNER_TARGETS.map(normalizeUrl));

// Uniform runner: gather violations per file, split by mode, exit 1 only on blocking.
export async function runValidator(name, checkFile) {
  const manifest = await loadManifest();
  const files = await listBlogFiles();
  const blocking = [];
  const legacyReport = [];
  for (const rel of files) {
    const { text, mode } = await classify(rel, manifest);
    const violations = checkFile(text, rel) || [];
    if (!violations.length) continue;
    const bucket = mode === 'blocking' ? blocking : legacyReport;
    for (const v of violations) bucket.push(`${rel}: ${v}`);
  }
  if (legacyReport.length) {
    console.log(`[${name}] legacy report-only (${legacyReport.length}):`);
    for (const v of legacyReport) console.log(`  • ${v}`);
  }
  if (blocking.length) {
    console.error(`[${name}] BLOCKING violations on new/changed posts (${blocking.length}):`);
    for (const v of blocking) console.error(`  • ${v}`);
    process.exitCode = 1;
  } else {
    console.log(`[${name}] no blocking violations (files=${files.length}, legacy-report=${legacyReport.length}).`);
  }
}
