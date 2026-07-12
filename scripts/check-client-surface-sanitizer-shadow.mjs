#!/usr/bin/env node
// C5FT: report-only client-surface sanitizer shadow (CI audit).
// This script NEVER fails the build: it runs the shared sanitizer core in
// AUDIT mode (REPORT_ONLY semantics) over blogs.json and always exits 0;
// the workflow step additionally sets continue-on-error: true.
//
// VENDORED CORE — do not hand-edit the core section. Provenance:
//   mechanically transpiled (esbuild --format=esm --target=node22) from
//   debthelpform.backend shared/client-surface-sanitizer.ts
//   @ e163450d873d63275ddf6806492cf98a2fecea1d
//   core build sha256 3986158c48f7cc91aef159705e7d5e4e9b582d8f244ac8c070f509b1cb7ba1c8
//   policy hash pin d4d966acdeadded7 (self-checked at runtime; a mismatch is
//   reported as SELF_CHECK_FAILED and the build still passes).
import { readFileSync } from "node:fs";

// ===== vendored core (begin) =====
const CLIENT_SURFACE_SANITIZER_VERSION = "c5ft-sanitizer-core-v1";
const ISSUE_CLASS_ORDER = [
  "client_surface_duplicate_pretty_url",
  "client_surface_canonical_collision",
  "client_surface_invalid_canonical",
  "client_surface_exact_content_duplicate",
  "client_surface_date_suffix_slug_mutant",
  "client_surface_index_url_malformed"
];
function fnv1a64Hex(text) {
  let hi = 3421674724, lo = 2216829733;
  for (let i = 0; i < text.length; i += 1) {
    lo ^= text.charCodeAt(i);
    const loProd = (lo & 65535) * 435 + ((lo >>> 16) * 435 << 16);
    hi = hi * 435 + lo * 256 + loProd / 4294967296 >>> 0;
    lo = loProd >>> 0;
  }
  return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
}
const CLIENT_SURFACE_SANITIZER_POLICY_HASH = fnv1a64Hex(
  `${CLIENT_SURFACE_SANITIZER_VERSION}:${ISSUE_CLASS_ORDER.join(",")}`
);
const DATE_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;
function basename(path) {
  const clean = String(path || "").split("?")[0];
  return clean.slice(clean.lastIndexOf("/") + 1);
}
function isDateSuffixSlugMutant(slug, contentUrl) {
  if (!DATE_SUFFIX_RE.test(slug)) return false;
  return !basename(contentUrl).includes(slug);
}
function extractCanonicalHref(html) {
  const source = String(html || "");
  const a = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(source);
  if (a) return a[1];
  const b = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i.exec(source);
  return b ? b[1] : null;
}
function expectedPrettyUrl(profile, slug) {
  return `${profile.blogPathPrefix}${slug}`;
}
function stableSortIssues(issues) {
  return [...issues].sort((x, y) => ISSUE_CLASS_ORDER.indexOf(x.issueClass) - ISSUE_CLASS_ORDER.indexOf(y.issueClass) || (x.subject < y.subject ? -1 : x.subject > y.subject ? 1 : 0) || (x.evidence < y.evidence ? -1 : x.evidence > y.evidence ? 1 : 0));
}
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const rec = value;
  return `{${Object.keys(rec).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(",")}}`;
}
function sanitizeBlogClientSurface(inputs) {
  const { siteProfile, candidateArticle, existingIndex } = inputs;
  const issues = [];
  const repairs = [];
  const urlOwners = /* @__PURE__ */ new Map();
  for (const entry of existingIndex) {
    const owners = urlOwners.get(entry.url) ?? [];
    owners.push(entry.slug);
    urlOwners.set(entry.url, owners);
  }
  for (const [url, owners] of [...urlOwners.entries()].sort()) {
    if (owners.length > 1) {
      issues.push({
        issueClass: "client_surface_duplicate_pretty_url",
        severity: "REPORT_ONLY",
        subject: url,
        evidence: `existing corpus: ${owners.length} entries share this pretty URL (slugs: ${owners.sort().join(", ")})`
      });
    }
  }
  const repairedIndex = existingIndex.map((entry) => {
    const mutant = isDateSuffixSlugMutant(entry.slug, entry.content_url);
    if (mutant) {
      issues.push({
        issueClass: "client_surface_date_suffix_slug_mutant",
        severity: "REPORT_ONLY",
        subject: entry.slug,
        evidence: `slug carries a date suffix its content file lacks (content: ${basename(entry.content_url)})`
      });
    }
    const expected = expectedPrettyUrl(siteProfile, entry.slug);
    if (entry.url !== expected && entry.url === entry.content_url) {
      repairs.push({
        issueClass: "client_surface_index_url_malformed",
        subject: entry.slug,
        before: entry.url,
        after: expected
      });
      issues.push({
        issueClass: "client_surface_index_url_malformed",
        severity: "REPORT_ONLY",
        subject: entry.slug,
        evidence: `index url equals dated content_url; canonical pretty form is ${expected}`
      });
      return { ...entry, url: expected };
    }
    return { ...entry };
  });
  if (candidateArticle) {
    const expected = expectedPrettyUrl(siteProfile, candidateArticle.slug);
    if (isDateSuffixSlugMutant(candidateArticle.slug, candidateArticle.contentUrl)) {
      issues.push({
        issueClass: "client_surface_date_suffix_slug_mutant",
        severity: "PUBLISH_BLOCK",
        subject: candidateArticle.slug,
        evidence: `candidate slug carries a date suffix its content file lacks (content: ${basename(candidateArticle.contentUrl)})`
      });
    }
    const priorOwners = (urlOwners.get(candidateArticle.prettyUrl) ?? []).filter((s) => s !== candidateArticle.slug);
    if (priorOwners.length > 0) {
      issues.push({
        issueClass: "client_surface_duplicate_pretty_url",
        severity: "PUBLISH_BLOCK",
        subject: candidateArticle.prettyUrl,
        evidence: `candidate pretty URL already owned by existing slug(s): ${priorOwners.sort().join(", ")}`
      });
    }
    const canonical = extractCanonicalHref(candidateArticle.html);
    const expectedCanonical = `${siteProfile.publicBaseUrl}${expected}`;
    if (!canonical) {
      issues.push({
        issueClass: "client_surface_invalid_canonical",
        severity: "PUBLISH_BLOCK",
        subject: candidateArticle.slug,
        evidence: "candidate HTML has no self canonical link"
      });
    } else if (canonical !== expectedCanonical && canonical !== expected) {
      const wrongDomain = canonical.startsWith("http") && !canonical.startsWith(siteProfile.publicBaseUrl);
      issues.push({
        issueClass: wrongDomain || canonical.startsWith("http") || canonical.startsWith("/") ? "client_surface_invalid_canonical" : "client_surface_invalid_canonical",
        severity: "PUBLISH_BLOCK",
        subject: candidateArticle.slug,
        evidence: `candidate canonical "${canonical}" != required self canonical "${expectedCanonical}"${wrongDomain ? " (WRONG DOMAIN)" : ""}`
      });
      const collidesWith = existingIndex.filter((e) => {
        const abs = `${siteProfile.publicBaseUrl}${e.url}`;
        return (canonical === abs || canonical === e.url) && e.slug !== candidateArticle.slug;
      });
      for (const hit of collidesWith.sort((a, b) => a.slug < b.slug ? -1 : 1)) {
        issues.push({
          issueClass: "client_surface_canonical_collision",
          severity: "PUBLISH_BLOCK",
          subject: candidateArticle.slug,
          evidence: `candidate canonical targets existing entry "${hit.slug}" (${hit.url})`
        });
      }
    }
    const hashes = inputs.existingContentHashes;
    if (hashes) {
      const candidateHash = fnv1a64Hex(candidateArticle.html);
      const twins = Object.entries(hashes).filter(([, h]) => h === candidateHash).map(([p]) => p).sort();
      for (const twin of twins) {
        issues.push({
          issueClass: "client_surface_exact_content_duplicate",
          severity: "PUBLISH_BLOCK",
          subject: candidateArticle.slug,
          evidence: `candidate HTML hash ${candidateHash} equals existing ${twin}`
        });
      }
    }
  }
  const ordered = stableSortIssues(issues);
  const verdict = ordered.some((i) => i.severity === "PUBLISH_BLOCK") ? "PUBLISH_BLOCK" : ordered.some((i) => i.severity === "OWNER_REVIEW") ? "OWNER_REVIEW" : ordered.length > 0 ? "REPORT_ONLY" : "PASS";
  const inputHash = fnv1a64Hex(canonicalJson({
    p: siteProfile,
    c: candidateArticle,
    e: existingIndex,
    h: inputs.existingContentHashes ?? null
  }));
  const body = {
    sanitizerVersion: CLIENT_SURFACE_SANITIZER_VERSION,
    policyHash: CLIENT_SURFACE_SANITIZER_POLICY_HASH,
    verdict,
    issues: ordered,
    repairs: repairs.sort((a, b) => a.subject < b.subject ? -1 : 1),
    repairedIndex: repairs.length > 0 ? repairedIndex : null,
    inputHash
  };
  return { ...body, outputHash: fnv1a64Hex(canonicalJson(body)), deterministicVerdict: true };
}
export {
  CLIENT_SURFACE_SANITIZER_POLICY_HASH,
  CLIENT_SURFACE_SANITIZER_VERSION,
  extractCanonicalHref,
  fnv1a64Hex,
  isDateSuffixSlugMutant,
  sanitizeBlogClientSurface
};
// ===== vendored core (end) =====

// ===== audit runner (report-only) =====
const SITE_PROFILE = { siteCode: "GDH", publicBaseUrl: "https://gatewaydebthelp.com", blogPathPrefix: "/blog/" };
const PINNED_POLICY_HASH = "d4d966acdeadded7";

try {
  const raw = readFileSync(new URL("../blogs.json", import.meta.url), "utf8");
  const parsed = JSON.parse(raw);
  const existingIndex = (Array.isArray(parsed) ? parsed : []).map((item) => {
    const row = item && typeof item === "object" ? item : {};
    return {
      slug: String(row.slug ?? ""),
      url: String(row.url ?? ""),
      title: String(row.title ?? ""),
      content_url: String(row.content_url ?? ""),
    };
  });
  const selfCheckOk = CLIENT_SURFACE_SANITIZER_POLICY_HASH === PINNED_POLICY_HASH;
  const result = sanitizeBlogClientSurface({ siteProfile: SITE_PROFILE, candidateArticle: null, existingIndex });
  const issueCounts = {};
  for (const issue of result.issues) issueCounts[issue.issueClass] = (issueCounts[issue.issueClass] ?? 0) + 1;
  console.log("[c5ft-ci-shadow] REPORT-ONLY client-surface audit (never blocks this build)");
  console.log(JSON.stringify({
    shadowVersion: "c5ft-inc-c-ci-shadow-v1",
    site: SITE_PROFILE.siteCode,
    selfCheck: selfCheckOk ? "ok" : "SELF_CHECK_FAILED_policy_hash_mismatch",
    sanitizerVersion: result.sanitizerVersion,
    policyHash: result.policyHash,
    verdict: result.verdict,
    indexEntries: existingIndex.length,
    issueCounts,
    repairsProposed: result.repairs.length,
    inputHash: result.inputHash,
    outputHash: result.outputHash,
  }, null, 2));
  for (const issue of result.issues.slice(0, 40)) {
    console.log(`[c5ft-ci-shadow] ${issue.severity} ${issue.issueClass} :: ${issue.subject} :: ${issue.evidence}`);
  }
  if (result.issues.length > 40) console.log(`[c5ft-ci-shadow] +${result.issues.length - 40} more issues (bounded output)`);
  for (const repair of result.repairs.slice(0, 10)) {
    console.log(`[c5ft-ci-shadow] repair-proposed ${repair.issueClass} :: ${repair.subject} :: ${repair.before} -> ${repair.after} (NOT applied)`);
  }
} catch (error) {
  console.log(`[c5ft-ci-shadow] shadow_failed_open :: ${error instanceof Error ? error.message : String(error)}`);
}
process.exit(0);
