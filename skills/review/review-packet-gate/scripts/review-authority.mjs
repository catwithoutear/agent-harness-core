import { DIGEST_RE, digestValue, fail, finalizeRecord, isCanonicalRef, isPlainObject } from "./review-records.mjs";

/**
 * Structured review authority (R-004..R-006).
 *
 * Resolves coding and behavioral authority sources/items into an immutable
 * `ReviewAuthority`. Fail-closed: missing digest, unknown availability,
 * conflicting sources, and undecidable activation conditions all produce
 * typed gaps rather than a silent fallback rule.
 */

export const AUTHORITY_KINDS = Object.freeze(["coding", "behavioral"]);

function assertRef(ref, location) {
  if (!isCanonicalRef(ref)) fail("CANONICAL_REF_MISMATCH", `${location} must be a {id,digest} CanonicalRef`);
}

export function buildAuthoritySource({ source_locator, source_kind, scope, precedence, version, digest, availability, activation_conditions = [] }) {
  if (typeof source_locator !== "string" || source_locator.length === 0) fail("RULE_SOURCE_GAP", "source_locator is required");
  if (typeof digest !== "string" || !DIGEST_RE.test(digest)) fail("RULE_VERSION_STALE", `source ${source_locator} has no versioned content digest`);
  if (availability !== "available" && availability !== "unavailable" && availability !== "unknown") {
    fail("RULE_SOURCE_GAP", `source ${source_locator} has unknown availability: ${availability}`);
  }
  return finalizeRecord({
    record_type: "authority-source",
    source_locator,
    source_kind,
    scope,
    precedence,
    version_locator: version,
    digest,
    availability,
    activation_conditions
  }, `src:${digestValue({ source_locator, scope, precedence })}`);
}

export function validateAuthorityItem(item) {
  if (!isPlainObject(item)) fail("INVALID_REVIEW_RECORD", "authority item must be an object");
  for (const field of ["authority_item_id", "authority_kind", "source_ref", "item_anchor", "item_digest", "scope", "precedence", "version_ref", "digest", "availability", "activation_conditions"]) {
    if (item[field] === undefined) fail("INVALID_REVIEW_RECORD", `authority item missing ${field}`);
  }
  if (!AUTHORITY_KINDS.includes(item.authority_kind)) fail("INVALID_REVIEW_RECORD", `invalid authority_kind: ${item.authority_kind}`);
  assertRef(item.source_ref, "authority item source_ref");
  if (typeof item.digest !== "string" || !DIGEST_RE.test(item.digest)) fail("RULE_VERSION_STALE", "authority item has no versioned digest");
  return item;
}

export function buildAuthorityItem({ authority_kind, source_ref, item_anchor, item_digest, scope, precedence, version_ref, digest, availability, activation_conditions = [], requiredness = "required" }) {
  const item = validateAuthorityItem({
    authority_item_id: `auth:${digestValue({ authority_kind, source_ref, item_anchor })}`,
    authority_kind,
    source_ref,
    item_anchor,
    item_digest,
    scope,
    precedence,
    version_ref,
    digest,
    availability,
    activation_conditions,
    requiredness
  });
  return finalizeRecord(item, item.authority_item_id);
}

export function resolveReviewAuthority(authoritySources = [], authorityItems = []) {
  const gapRefs = [];
  const sourceRefs = [];
  const seen = new Map();

  for (const raw of authoritySources) {
    const source = buildAuthoritySource(raw);
    if (raw.availability === "unavailable") {
      gapRefs.push(finalizeRecord({ record_type: "gap", gap_kind: "RULE_SOURCE_GAP", subject_ref: { id: source.record_id, digest: source.record_digest }, requiredness: "required", blocking: true }, `gap:RULE_SOURCE_GAP:${source.record_id}`));
      continue;
    }
    // conflict: same scope+precedence, different digest
    const conflictKey = `${raw.scope}::${raw.precedence}`;
    const prior = seen.get(conflictKey);
    if (prior && prior.digest !== source.digest) {
      gapRefs.push(finalizeRecord({ record_type: "gap", gap_kind: "RULE_AUTHORITY_CONFLICT", subject_ref: { id: source.record_id, digest: source.record_digest }, requiredness: "required", blocking: true }, `gap:RULE_AUTHORITY_CONFLICT:${source.record_id}`));
    } else {
      seen.set(conflictKey, { digest: source.digest });
    }
    sourceRefs.push({ id: source.record_id, digest: source.record_digest });
  }

  const codingRefs = [];
  const behavioralRefs = [];
  for (const raw of authorityItems) {
    const item = buildAuthorityItem(raw);
    const ref = { id: item.record_id, digest: item.record_digest };
    if (item.authority_kind === "coding") codingRefs.push(ref);
    else behavioralRefs.push(ref);
  }

  const base = {
    record_type: "review-authority",
    coding_authority_refs: codingRefs,
    behavioral_authority_refs: behavioralRefs,
    gap_refs: gapRefs,
    complete: gapRefs.length === 0
  };
  return finalizeRecord(base, `rauth:${digestValue({ codingRefs, behavioralRefs })}`);
}
