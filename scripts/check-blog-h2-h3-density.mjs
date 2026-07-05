#!/usr/bin/env node
// §5 H2/H3 density + word bands: H2 4-7 with 300-500 words each; H3 0-3; editorial
// body 1750-2350 words. BLOCK new/changed; REPORT legacy.
import { runValidator, parseArticle } from './blog-contract-lib.mjs';

await runValidator('check-blog-h2-h3-density', (html) => {
  const doc = parseArticle(html);
  const v = [];
  const n = doc.h2Sections.length;
  if (n < 4 || n > 7) v.push(`h2_count=${n} (must be 4-7)`);
  if (doc.h3Count > 3) v.push(`h3_count=${doc.h3Count} (max 3)`);
  doc.h2Sections.forEach((s, i) => {
    if (s.words < 300 || s.words > 500) v.push(`h2_section[${i}] "${s.heading.slice(0, 48)}" words=${s.words} (must be 300-500)`);
  });
  if (doc.editorialWords < 1750 || doc.editorialWords > 2350) v.push(`editorial_words=${doc.editorialWords} (must be 1750-2350)`);
  return v;
});
