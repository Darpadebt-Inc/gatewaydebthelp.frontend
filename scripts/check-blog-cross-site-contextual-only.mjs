#!/usr/bin/env node
// §8 cross-site contract: sister-site links only as contextual in-body references,
// max 2, each to a §3 canonical owner target; no brand-trust-links; no cross-site CTA.
// BLOCK new/changed; REPORT legacy.
import { runValidator, parseArticle, isSisterLink, normalizeUrl, CANONICAL_SET } from './blog-contract-lib.mjs';

await runValidator('check-blog-cross-site-contextual-only', (html) => {
  const doc = parseArticle(html);
  const v = [];
  if (doc.hasBrandTrustLinks) v.push('brand-trust-links section present (forbidden)');
  const sisters = doc.anchors.filter((a) => isSisterLink(a.href));
  const ctaSisters = sisters.filter((a) => a.href.includes('?ref=blog-leadform') || a.href.includes('#leadForm'));
  const contextual = sisters.filter((a) => !ctaSisters.includes(a));
  if (ctaSisters.length) v.push(`cross-site CTA links=${ctaSisters.length} (must be 0)`);
  if (contextual.length > 2) v.push(`sister links=${contextual.length} (max 2)`);
  for (const a of contextual) {
    const norm = normalizeUrl(a.href.replace(/[?#].*$/, ''));
    if (!CANONICAL_SET.has(norm)) v.push(`sister link "${a.href}" not a §3 canonical owner target`);
  }
  return v;
});
