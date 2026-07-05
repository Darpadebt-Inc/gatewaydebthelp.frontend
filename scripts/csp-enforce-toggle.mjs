#!/usr/bin/env node
// scripts/csp-enforce-toggle.mjs — §14.1 staged CSP activation tool.
// Deterministic + idempotent flip of _headers between Report-Only and enforce.
//   node scripts/csp-enforce-toggle.mjs --status    -> prints current mode, exit 0
//   node scripts/csp-enforce-toggle.mjs --enforce   -> Report-Only -> enforce (no-op if already enforced)
//   node scripts/csp-enforce-toggle.mjs --rollback  -> enforce -> Report-Only (no-op if already Report-Only)
// Gate discipline (spec §14.1): run --enforce ONLY after the 015 /csp-report stream
// shows 0 unresolved violations for THIS site; one site at a time; rollback on any
// new violation. The flip preserves the policy value byte-for-byte (header name only).
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headersPath = path.join(repoRoot, '_headers');
const RO = 'Content-Security-Policy-Report-Only:';
const ENF = 'Content-Security-Policy:';

const mode = process.argv[2] || '--status';
const text = await fs.readFile(headersPath, 'utf8');
const hasRO = text.includes(RO);
const hasENF = text.split('\n').some((l) => l.trim().startsWith(ENF));

if (mode === '--status') {
  console.log(hasRO ? 'mode=report-only' : hasENF ? 'mode=enforce' : 'mode=absent');
  process.exit(0);
}
if (mode === '--enforce') {
  if (!hasRO) { console.log(hasENF ? 'already enforced (no-op)' : 'no CSP header found'); process.exit(hasENF ? 0 : 1); }
  await fs.writeFile(headersPath, text.replaceAll(RO, ENF));
  console.log('flipped Report-Only -> enforce (policy value unchanged)');
  process.exit(0);
}
if (mode === '--rollback') {
  if (!hasENF) { console.log(hasRO ? 'already report-only (no-op)' : 'no CSP header found'); process.exit(hasRO ? 0 : 1); }
  await fs.writeFile(headersPath, text.replaceAll(`\n  ${ENF}`, `\n  ${RO}`));
  console.log('rolled back enforce -> Report-Only');
  process.exit(0);
}
console.error('usage: csp-enforce-toggle.mjs [--status|--enforce|--rollback]');
process.exit(2);
