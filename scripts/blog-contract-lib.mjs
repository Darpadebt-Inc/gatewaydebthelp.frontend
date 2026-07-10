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

// Character-scanner tag stripping (no regex tag-filtering): removes <script>/<style>
// blocks including content, drops other tags keeping inner text. Scanner-based on
// purpose — regex HTML filters are bypassable (CodeQL js/bad-tag-filter) even though
// this is only an offline word-counter.
export function removeElementBlocks(html, tag) {
  const lower = html.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}`;
  let out = '';
  let i = 0;
  while (i < html.length) {
    const start = lower.indexOf(open, i);
    if (start === -1) {
      out += html.slice(i);
      break;
    }
    out += `${html.slice(i, start)} `;
    const end = lower.indexOf(close, start + open.length);
    if (end === -1) break; // unterminated block: drop the remainder
    const gt = lower.indexOf('>', end + close.length);
    i = gt === -1 ? html.length : gt + 1;
  }
  return out;
}

export function dropTags(html) {
  let out = '';
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === '<') {
      inTag = true;
      out += ' ';
      continue;
    }
    if (ch === '>') {
      inTag = false;
      continue;
    }
    if (!inTag) out += ch;
  }
  return out;
}

export function stripTags(html) {
  const noScript = removeElementBlocks(html, 'script');
  const noStyle = removeElementBlocks(noScript, 'style');
  return dropTags(noStyle).replace(/&[a-z#0-9]+;/gi, ' ');
}

// E3-FVP: 031/033-injected chrome & furniture modules. The pipeline gates the
// EDITORIAL artifact against §5 and the publish path then composes non-editorial
// modules around it (lead-form segues, required internal links, cross-domain
// clusters, compliance notice, related reading, the final CTA section). These
// are excluded ONLY from the §5 density surface (H2 sections / H3 count /
// editorial words) so the repo-boundary verdict matches the accepted backend
// contract surface. They are NOT removed from the page, and every other check
// (anchors, CTA, cross-site, brand-trust-links, proof assets, scripts) still
// reads the full region — coverage and all §5 bands are unchanged.
export const CHROME_BLOCK_MARKERS = [
  'leadform-segway',
  'required-internal-links',
  'brand-trust-links',
  'cross-domain-clusters',
  'compliance-notice',
  'related-reading',
  'cta-section',
];
export const CHROME_INLINE_MARKERS = [
  'module-label',
  'module-eyebrow',
  'blog-final-cta',
  'blog-cta-disclaimer',
  'cta-note',
  'compliance-legal-disclaimer',
];
const CHROME_CONTAINER_TAGS = new Set(['section', 'aside', 'div']);
const CHROME_INLINE_TAGS = new Set(['p', 'span']);

function chromeClassMatch(openTagText, markers) {
  const cls = openTagText.match(/class\s*=\s*"([^"]*)"/i);
  if (!cls) return false;
  const names = cls[1].toLowerCase().split(/\s+/).filter(Boolean);
  return markers.some((m) => names.includes(m));
}

function isChromeBlockOpenTag(openTagText) {
  if (chromeClassMatch(openTagText, CHROME_BLOCK_MARKERS)) return true;
  if (/data-blog-module\s*=\s*"related"/i.test(openTagText)) return true;
  if (/data-contentforge-marker\s*=\s*"required-links"/i.test(openTagText)) return true;
  return false;
}

// Character-scanner element dropper (same no-regex-tag-filtering posture as
// removeElementBlocks): removes whole elements whose open tag carries a chrome
// marker, depth-counting same-tag nesting. An unterminated chrome block drops
// the remainder, mirroring removeElementBlocks' unterminated behavior.
export function removeChromeBlocks(html) {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { out += html.slice(i); break; }
    out += html.slice(i, lt);
    const gt = html.indexOf('>', lt);
    if (gt === -1) { out += html.slice(lt); break; }
    const openTagText = html.slice(lt, gt + 1);
    const nameMatch = openTagText.match(/^<\s*([a-z0-9]+)/i);
    const tag = nameMatch ? nameMatch[1].toLowerCase() : null;
    const isChrome = !!tag && (
      (CHROME_CONTAINER_TAGS.has(tag) && isChromeBlockOpenTag(openTagText))
      || (CHROME_INLINE_TAGS.has(tag) && chromeClassMatch(openTagText, CHROME_INLINE_MARKERS))
    );
    if (!isChrome) { out += openTagText; i = gt + 1; continue; }
    if (openTagText.endsWith('/>')) { out += ' '; i = gt + 1; continue; }
    const open = `<${tag}`;
    const close = `</${tag}`;
    let depth = 1;
    let j = gt + 1;
    while (j < html.length && depth > 0) {
      const nextClose = lower.indexOf(close, j);
      if (nextClose === -1) { j = html.length; break; }
      let nextOpen = -1;
      let k = j;
      while (k < html.length) {
        k = lower.indexOf(open, k);
        if (k === -1 || k > nextClose) break;
        const ch = lower[k + open.length];
        if (ch === '>' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '/') { nextOpen = k; break; }
        k += open.length;
      }
      if (nextOpen !== -1) {
        depth += 1;
        j = nextOpen + open.length;
      } else {
        depth -= 1;
        const cg = lower.indexOf('>', nextClose);
        j = cg === -1 ? html.length : cg + 1;
      }
    }
    out += ' ';
    i = j;
  }
  return out;
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
  // §5 density is computed on the chrome-stripped surface (E3-FVP backend
  // parity); every other field below stays on the full region.
  const densityRegion = removeChromeBlocks(region);
  const h1Count = (region.match(/<h1[\s>]/gi) || []).length;
  const h3Count = (densityRegion.match(/<h3[\s>]/gi) || []).length;
  const h2Split = densityRegion.split(/<h2[^>]*>/i);
  const preamble = h2Split[0] ?? densityRegion;
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
    editorialWords: countWords(stripTags(densityRegion)),
    hasBrandTrustLinks: /class\s*=\s*"[^"]*brand-trust-links/i.test(region),
    introWordsBeforeFirstH2: countWords(stripTags(preamble.replace(/<h1[\s\S]*?<\/h1>/i, ' '))),
    region,
    densityRegion,
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
