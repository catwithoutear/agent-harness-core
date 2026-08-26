import { digestValue, fail, finalizeRecord, isCanonicalRef, isPlainObject } from "./review-records.mjs";

/**
 * Raw discovery normalization and bidirectional comparison (R-007, R-011, R-035, R-036).
 *
 * Normalization is a conservation proof: every raw observation maps exactly
 * once, the normalized set is exactly the mapping image, and distinct raw
 * observations never collapse onto one normalized object (except a sealed,
 * proven alias). Comparison is always bidirectional and its required
 * differences are non-discretionary.
 */

export function buildNormalizationClosure(rawObservations, normalize) {
  if (!Array.isArray(rawObservations)) fail("NORMALIZATION_CLOSURE_GAP", "raw observations must be an array");
  if (typeof normalize !== "function") fail("NORMALIZATION_CLOSURE_GAP", "normalize must be a function");

  const mappings = [];
  const image = new Map();

  for (const raw of rawObservations) {
    const normalized = normalize(raw);
    if (normalized === undefined || normalized === null) {
      return { complete: false, gap_kind: "NORMALIZATION_CLOSURE_GAP", reason: "unmapped raw observation", mappings };
    }
    const key = normalized.record_id ?? normalized.id;
    if (typeof key !== "string" || !key) {
      return { complete: false, gap_kind: "NORMALIZATION_CLOSURE_GAP", reason: "normalized object missing id", mappings };
    }
    mappings.push({ raw_id: raw.record_id ?? raw.id, normalized_key: key, status: "mapped" });
    if (!image.has(key)) image.set(key, []);
    image.get(key).push(raw.record_id ?? raw.id);
  }

  // injective (no many-to-one collapse)
  for (const [key, rawIds] of image) {
    if (rawIds.length > 1) {
      return { complete: false, gap_kind: "NORMALIZATION_CLOSURE_GAP", reason: `many-to-one collapse: ${key}`, mappings };
    }
  }

  return { complete: true, mappings, normalized_keys: [...image.keys()] };
}

function idOf(ref) {
  return typeof ref === "string" ? ref : ref?.id;
}

export function compareUniverses(expected, observed) {
  const expectedById = new Map();
  for (const item of expected ?? []) {
    const id = idOf(item);
    if (id) expectedById.set(id, item);
  }
  const observedById = new Map();
  for (const item of observed ?? []) {
    const id = idOf(item);
    if (id) observedById.set(id, item);
  }

  const coordinatorOnly = [];
  const independentOnly = [];
  const conflicts = [];
  const common = [];

  for (const [id, item] of expectedById) {
    if (!observedById.has(id)) {
      coordinatorOnly.push(item);
    } else if (item?.digest && observedById.get(id)?.digest && item.digest !== observedById.get(id).digest) {
      conflicts.push({ id, expected: item, observed: observedById.get(id) });
    } else {
      common.push(item);
    }
  }
  for (const [id, item] of observedById) {
    if (!expectedById.has(id)) independentOnly.push(item);
  }

  const requiredDifferences = coordinatorOnly.length + independentOnly.length + conflicts.length;
  return { coordinator_only: coordinatorOnly, independent_only: independentOnly, conflicts, common, required_differences: requiredDifferences };
}

const NON_BLOCKING_DISPOSITIONS = Object.freeze([
  "CANONICAL_ALIAS_EQUIVALENT",
  "DECLARED_SCOPE_EXCLUSION",
  "OPTIONAL_OBSERVATION"
]);

export function applyComparisonDisposition(difference, comparisonPolicy = {}) {
  if (!isPlainObject(difference)) fail("INVALID_REVIEW_RECORD", "difference must be an object");
  const requiredness = difference.requiredness ?? "required";
  const proposed = difference.proposed_disposition;
  if (requiredness === "required" && !NON_BLOCKING_DISPOSITIONS.includes(proposed)) {
    fail("COMPARISON_DISPOSITION_FORBIDDEN", `required difference cannot be disposed as ${proposed}`);
  }
  if (requiredness === "required" && !(comparisonPolicy.allowed_dispositions ?? []).includes(proposed)) {
    fail("COMPARISON_DISPOSITION_FORBIDDEN", `disposition ${proposed} not allowed by sealed policy`);
  }
  return finalizeRecord({
    record_type: "comparison-disposition",
    difference_kind: difference.kind,
    disposition_kind: proposed,
    status: requiredness === "required" ? "blocking" : "non-blocking"
  }, `cmp:${digestValue({ kind: difference.kind, proposed })}`);
}

export function verifyMethodDiversity(familyRules) {
  if (!Array.isArray(familyRules)) fail("VERIFIER_METHOD_NOT_INDEPENDENT", "family rules must be an array");
  const gaps = [];
  for (const rule of familyRules) {
    const independentMethods = rule.mode === "independent-methods" && rule.expected_implementation_digest && rule.observed_implementation_digest && rule.expected_implementation_digest !== rule.observed_implementation_digest;
    const trustedOracle = rule.mode === "trusted-oracle" && Boolean(rule.oracle_ref && rule.oracle_conformance_contract_ref);
    if (!independentMethods && !trustedOracle) {
      gaps.push({ object_family: rule.object_family, gap_kind: "VERIFIER_METHOD_NOT_INDEPENDENT" });
    }
  }
  return { complete: gaps.length === 0, gaps };
}
