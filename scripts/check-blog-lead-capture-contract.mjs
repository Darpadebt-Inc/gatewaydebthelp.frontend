#!/usr/bin/env node
// §7 lead-capture contract: exactly ONE final same-site CTA (?ref=blog-leadform#leadForm),
// zero cross-site CTAs, non-guarantee language present. BLOCK new/changed; REPORT legacy.
import { runValidator, parseArticle, isSisterLink, stripTags, CTA_TARGET } from './blog-contract-lib.mjs';

const NON_GUARANTEE_RE = /(no guarantee|not guaranteed|results (?:may |can )?vary|does not guarantee|individual results)/i;

await runValidator('check-blog-lead-capture-contract', (html) => {
  const doc = parseArticle(html);
  const v = [];
  const ctaAnchors = doc.anchors.filter((a) => a.href.includes('?ref=blog-leadform'));
  const own = ctaAnchors.filter((a) => !isSisterLink(a.href));
  const cross = ctaAnchors.filter((a) => isSisterLink(a.href));
  if (own.length !== 1) v.push(`final_cta_count=${own.length} (must be exactly 1 -> ${CTA_TARGET})`);
  if (cross.length) v.push(`cross_site_cta_count=${cross.length} (must be 0)`);
  if (!NON_GUARANTEE_RE.test(stripTags(doc.region))) v.push('non-guarantee language missing (§7)');
  return v;
});
