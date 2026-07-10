#!/usr/bin/env node
// E3-FVP proof harness: the §5 density surface excludes 031/033-injected
// chrome/module blocks (backend accepted-contract parity) WITHOUT weakening any
// band or any other check. Runs against pinned fixtures (the first genuinely
// published GDH post + synthetics); exits 1 on any mismatch. Bands are the same
// literals as check-blog-h2-h3-density.mjs — this harness proves counting
// semantics, it does not redefine them.
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArticle } from './blog-contract-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => fs.readFile(path.join(here, 'fixtures', 'e3fvp', name), 'utf8');

// mirrors check-blog-h2-h3-density.mjs verbatim
function densityViolations(html) {
  const doc = parseArticle(html);
  const v = [];
  const n = doc.h2Sections.length;
  if (n < 4 || n > 7) v.push(`h2_count=${n} (must be 4-7)`);
  if (doc.h3Count > 3) v.push(`h3_count=${doc.h3Count} (max 3)`);
  doc.h2Sections.forEach((s, i) => {
    if (s.words < 300 || s.words > 500) v.push(`h2_section[${i}] "${s.heading.slice(0, 48)}" words=${s.words} (must be 300-500)`);
  });
  if (doc.editorialWords < 1750 || doc.editorialWords > 2350) v.push(`editorial_words=${doc.editorialWords} (must be 1750-2350)`);
  return { doc, v };
}

const failures = [];
function check(label, cond, detail) {
  if (!cond) failures.push(`${label}: ${detail}`);
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${cond ? '' : ' — ' + detail}`);
}

{
  const html = await fx('gdh-published-2026-07-10-how-rebuilding-credit-after-debt-relief-works.html');
  const { doc, v } = densityViolations(html);
  check('published GDH post: density clean', v.length === 0, JSON.stringify(v));
  check('published GDH post: 5 editorial H2 sections', doc.h2Sections.length === 5, String(doc.h2Sections.length));
  check('published GDH post: editorial words in 1750-2350', doc.editorialWords >= 1750 && doc.editorialWords <= 2350, String(doc.editorialWords));
  for (const marker of ['leadform-segway', 'required-internal-links', 'cross-domain-clusters', 'compliance-notice', 'related-reading', 'cta-section']) {
    check(`published GDH post: ${marker} still on the page`, doc.region.includes(marker), 'module missing from region (only density exclusion is allowed)');
  }
}
{
  const { doc, v } = densityViolations(await fx('synthetic-chrome-modules.html'));
  check('synthetic chrome modules: density clean', v.length === 0, JSON.stringify(v));
  check('synthetic chrome modules: chrome H2s not counted', doc.h2Sections.length === 5, String(doc.h2Sections.length));
  check('synthetic chrome modules: chrome H3s not counted (editorial only)', doc.h3Count === 2, String(doc.h3Count));
}
{
  const { v } = densityViolations(await fx('synthetic-over-h3.html'));
  check('synthetic editorial over-H3 still fails', v.some((x) => x.startsWith('h3_count=4')), JSON.stringify(v));
}
{
  const { v } = densityViolations(await fx('synthetic-short-section.html'));
  check('synthetic short editorial H2 section still fails', v.some((x) => x.includes('words=120')), JSON.stringify(v));
}
{
  const { doc, v } = densityViolations(await fx('synthetic-brand-trust.html'));
  check('brand-trust block: words excluded from density', v.length === 0, JSON.stringify(v));
  check('brand-trust block: detection unchanged (anatomy/cross-site still block)', doc.hasBrandTrustLinks === true, 'hasBrandTrustLinks=false');
}

if (failures.length) {
  console.error(`[check-blog-density-selftest] FAIL (${failures.length})`);
  process.exitCode = 1;
} else {
  console.log('[check-blog-density-selftest] PASS');
}
