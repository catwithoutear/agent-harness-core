import { digestValue, fail, finalizeRecord, isPlainObject } from "./review-records.mjs";

/**
 * Raw reviewer output conservation and correctness separation (R-034).
 *
 * Reviewer raw output maps to canonical outcome/finding records by a strict
 * bijection; finding-parent association is preserved. `execution_status` (did
 * the reviewer return a protocol record?) is separate from `conclusion` (is the
 * code acceptable?), and `conclusion` is derived with a fixed precedence that a
 * reviewer/coordinator cannot override.
 */

export const CONCLUSIONS = Object.freeze(["clear", "nonblocking_only", "blocking", "applicability_challenge", "inconclusive"]);

export function deriveConclusion({ execution_status, findings = [], completeness = true, applicability_challenge = false }) {
  if (execution_status !== "succeeded") return "inconclusive";
  if (applicability_challenge) return "applicability_challenge";
  if (!completeness) return "inconclusive";
  const blocking = findings.some((f) => f.blocking_class === "blocking");
  const nonblocking = findings.some((f) => f.blocking_class === "nonblocking");
  if (blocking) return "blocking";
  if (nonblocking) return "nonblocking_only";
  return "clear";
}

export function verifyOutputReceipt({ receipt, artifact_digest }) {
  if (!isPlainObject(receipt)) fail("REVIEW_OUTPUT_RECEIPT_INVALID", "receipt must be an object");
  if (typeof receipt.raw_bytes_digest !== "string" || typeof receipt.byte_length !== "number") {
    fail("REVIEW_OUTPUT_RECEIPT_INVALID", "receipt missing raw bytes digest/length");
  }
  if (receipt.raw_bytes_digest !== artifact_digest) {
    fail("REVIEW_OUTPUT_RECEIPT_INVALID", "receipt digest does not match the raw output artifact");
  }
  if (!receipt.issuer_signature || typeof receipt.issuer_signature !== "string") {
    fail("REVIEW_OUTPUT_RECEIPT_INVALID", "receipt missing issuer signature");
  }
  return finalizeRecord({
    record_type: "receipt-verification",
    receipt_ref: { id: receipt.record_id, digest: receipt.record_digest },
    verified: true
  }, `rv:${artifact_digest}`);
}

export function normalizeReviewOutput({ raw_items, normalize }) {
  if (!Array.isArray(raw_items)) fail("REVIEW_OUTPUT_NOT_CONSERVED", "raw items must be an array");
  if (typeof normalize !== "function") fail("REVIEW_OUTPUT_NOT_CONSERVED", "normalize must be a function");

  const mappings = [];
  const image = new Map(); // canonical_key -> raw_ids[]
  const parentByRaw = new Map(raw_items.map((item) => [item.raw_id, item.parent_raw_id]));

  for (const raw of raw_items) {
    const normalized = normalize(raw);
    if (normalized === undefined || normalized === null) {
      return { complete: false, gap_kind: "REVIEW_OUTPUT_NOT_CONSERVED", reason: "unmapped raw item", mappings };
    }
    const key = normalized.record_id ?? normalized.id;
    if (typeof key !== "string" || !key) {
      return { complete: false, gap_kind: "REVIEW_OUTPUT_NOT_CONSERVED", reason: "canonical record missing id", mappings };
    }
    mappings.push({ raw_id: raw.raw_id, canonical_key: key, kind: raw.kind, parent_raw_id: raw.parent_raw_id });
    if (!image.has(key)) image.set(key, []);
    image.get(key).push(raw.raw_id);
  }

  // injective: distinct raw items never collapse onto one canonical record
  for (const [key, rawIds] of image) {
    if (rawIds.length > 1) {
      return { complete: false, gap_kind: "REVIEW_OUTPUT_NOT_CONSERVED", reason: `many-to-one collapse: ${key}`, mappings };
    }
  }

  // finding-parent association preserved: raw finding's parent must be the raw outcome
  const outcomeByRaw = new Map(raw_items.filter((i) => i.kind === "outcome").map((i) => [i.raw_id, i]));
  for (const raw of raw_items) {
    if (raw.kind !== "finding") continue;
    if (!raw.parent_raw_id || !outcomeByRaw.has(raw.parent_raw_id)) {
      return { complete: false, gap_kind: "REVIEW_OUTPUT_NOT_CONSERVED", reason: `finding ${raw.raw_id} has no valid outcome parent`, mappings };
    }
  }

  return { complete: true, mappings, canonical_keys: [...image.keys()] };
}

export function buildFindingRegister({ findings, dispositions = [] }) {
  if (!Array.isArray(findings)) fail("INVALID_REVIEW_RECORD", "findings must be an array");
  const disposed = new Set(dispositions.map((d) => d.finding_ref?.id).filter(Boolean));
  const open_blocking = findings.filter((f) => f.blocking_class === "blocking" && !disposed.has(f.record_id ?? f.id));
  const open_nonblocking = findings.filter((f) => f.blocking_class === "nonblocking" && !disposed.has(f.record_id ?? f.id));
  const accepted_nonblocking = dispositions
    .filter((d) => d.disposition_kind === "accepted_nonblocking")
    .map((d) => d.finding_ref?.id)
    .filter(Boolean);
  return finalizeRecord({
    record_type: "finding-register",
    finding_refs: findings.map((f) => ({ id: f.record_id ?? f.id, digest: f.record_digest })),
    open_blocking_refs: open_blocking.map((f) => ({ id: f.record_id ?? f.id, digest: f.record_digest })),
    open_nonblocking_refs: open_nonblocking.map((f) => ({ id: f.record_id ?? f.id, digest: f.record_digest })),
    accepted_nonblocking_refs: accepted_nonblocking
  }, `freg:${digestValue(findings.map((f) => f.record_id ?? f.id).sort())}`);
}

export function selectCurrentOutcomes({ outcomes, obligations }) {
  if (!Array.isArray(outcomes) || !Array.isArray(obligations)) {
    fail("OUTCOME_SELECTION_GAP", "outcomes and obligations must be arrays");
  }
  const byObligation = new Map();
  for (const outcome of outcomes) {
    const key = outcome.obligation_ref?.id;
    if (!key) fail("OUTCOME_SELECTION_GAP", "outcome missing obligation_ref");
    if (outcome.execution_status !== "succeeded" || outcome.conclusion !== "clear") continue;
    if (byObligation.has(key)) fail("OUTCOME_SELECTION_GAP", `multiple selected outcomes for obligation ${key}`);
    byObligation.set(key, outcome);
  }
  const selections = [];
  for (const obligation of obligations) {
    const id = obligation.record_id ?? obligation.id;
    if (!byObligation.has(id)) {
      fail("OUTCOME_SELECTION_GAP", `obligation ${id} has no current succeeded+clear outcome`);
    }
    selections.push(finalizeRecord({
      record_type: "outcome-selection",
      obligation_kind: "relation",
      obligation_ref: { id, digest: obligation.record_digest },
      selected_outcome_ref: { id: byObligation.get(id).record_id ?? byObligation.get(id).id, digest: byObligation.get(id).record_digest }
    }, `sel:${id}`));
  }
  return selections;
}
