#!/usr/bin/env node
// §4 article anatomy: 1 H1, intro block before first H2, proof asset (table or >=3-item
// list), no brand-trust-links block. BLOCK new/changed; REPORT legacy.
import { runValidator, parseArticle, hostOf, SITE } from './blog-contract-lib.mjs';

await runValidator('check-blog-article-anatomy', (html) => {
  const doc = parseArticle(html);
  const v = [];
  if (doc.h1Count !== 1) v.push(`h1_count=${doc.h1Count} (must be exactly 1)`);
  if (doc.introWordsBeforeFirstH2 < 20) v.push(`intro_words=${doc.introWordsBeforeFirstH2} (intro block required before first H2)`);
  const hasTable = /<table[\s>]/i.test(doc.region);
  const listItems = (doc.region.match(/<li[\s>]/gi) || []).length;
  if (!hasTable && listItems < 3) v.push('proof asset missing (need a table or >=3-item list)');
  if (doc.hasBrandTrustLinks) v.push('brand-trust-links section present (forbidden)');
  // §9 approved first-party scripts only: foreign-host <script src> is a violation.
  const scriptSrcRe = /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi;
  let sm;
  while ((sm = scriptSrcRe.exec(html)) !== null) {
    const h = hostOf(sm[1]);
    if (h && h !== SITE.host) v.push(`foreign script src "${sm[1]}" (approved first-party scripts only)`);
  }
  return v;
});
