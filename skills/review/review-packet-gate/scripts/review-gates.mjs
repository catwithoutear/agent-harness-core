import { DIGEST_RE, digestValue, fail, finalizeRecord, isCanonicalRef, isPlainObject } from "./review-records.mjs";

/**
 * Five evidence gates plus the derived `overall_gate`, and freshness-gated
 * consumption (R-016..R-019).
 *
 * `coverage_gate`, `review_gate`, `independent_review_gate`, `style_gate` and
 * `implementation_verification_gate` are independent evidence gates.
 * `overall_gate` is a derived aggregation — it never grants READY unless all
 * five are READY, and it caps at READY_WITH_NOTES whenever any accepted
 * non-blocking note or optional comparison difference remains.
 */

export const EVIDENCE_GATE_NAMES = Object.freeze([
  "coverage_gate",
  "review_gate",
  "independent_review_gate",
  "style_gate",
  "implementation_verification_gate"
]);

export const GATE_STATUSES = Object.freeze(["READY", "READY_WITH_NOTES", "NOT_READY", "NEEDS_USER_DECISION"]);

const ALLOWED_NOTE_KINDS = Object.freeze(["accepted-nonblocking", "optional-difference"]);

function assertCanonicalRefs(refs, location) {
  if (!Array.isArray(refs)) fail("INVALID_REVIEW_RECORD", `${location} must be an array`);
  for (const ref of refs) {
    if (!isCanonicalRef(ref)) fail("CANONICAL_REF_MISMATCH", `${location} entry must be a {id,digest} CanonicalRef`);
  }
}

function assertNoteKind(noteRef) {
  const kind = noteRef?.note_kind;
  if (!ALLOWED_NOTE_KINDS.includes(kind)) {
    fail("GATE_NOTE_FORBIDDEN", `note_kind ${kind} is not an allowed gate note kind`);
  }
}

export function buildGateResult({
  gate_name,
  status,
  input_refs = [],
  pass_conditions = [],
  blocking_reasons = [],
  note_refs = [],
  evidence_refs = [],
  evaluated_at,
  time_source_ref,
  freshness_basis_ref,
  valid_until = null
}) {
  if (gate_name !== "overall_gate" && !EVIDENCE_GATE_NAMES.includes(gate_name)) {
    fail("GATE_MISSING", `unknown gate name: ${gate_name}`);
  }
  if (!GATE_STATUSES.includes(status)) {
    fail("GATE_STATUS_INVALID", `invalid gate status: ${status}`);
  }
  assertCanonicalRefs(input_refs, "input_refs");
  assertCanonicalRefs(evidence_refs, "evidence_refs");
  for (const note of note_refs) {
    if (!isPlainObject(note) || !isCanonicalRef(note)) {
      fail("CANONICAL_REF_MISMATCH", "note_ref must be a {id,digest} CanonicalRef with a note_kind");
    }
    assertNoteKind(note);
  }
  if (typeof evaluated_at !== "number" && typeof evaluated_at !== "string") {
    fail("INVALID_REVIEW_RECORD", "evaluated_at is required");
  }
  if (typeof time_source_ref !== "string" || typeof freshness_basis_ref !== "string") {
    fail("INVALID_REVIEW_RECORD", "time_source_ref and freshness_basis_ref are required");
  }
  const base = {
    record_type: "gate-result",
    gate_name,
    status,
    input_refs,
    pass_conditions,
    blocking_reasons,
    note_refs,
    evidence_refs,
    evaluated_at,
    time_source_ref,
    freshness_basis_ref,
    valid_until
  };
  return finalizeRecord(base, `gate:${gate_name}:${digestValue({ gate_name, input_refs, evaluated_at })}`);
}

/**
 * Derive `overall_gate` from the five evidence gates (R-016).
 *
 * - all five READY -> READY
 * - all five in {READY, READY_WITH_NOTES}, at least one READY_WITH_NOTES, and
 *   every note_ref has an allowed note_kind -> READY_WITH_NOTES (note_refs is
 *   the union across the five gates and must be non-empty)
 * - anything else -> NOT_READY
 *
 * `note_kind` values are `accepted-nonblocking` (from FindingPolicy) or
 * `optional-difference` (from ComparisonPolicy). An unknown/extra gate, a
 * missing gate, or an illegal note makes the aggregation NOT_READY rather than
 * throwing, so the caller can surface a blocking reason.
 */
/**
 * Evaluate the five evidence gates from their structured inputs (the gate
 * aggregator owns per-gate evaluation; `overall_gate` is derived separately).
 */
export function evaluateCoverageGate(inputs = {}) {
  const complete =
    inputs.authority?.complete !== false &&
    inputs.dimensionAuthority?.complete !== false &&
    inputs.contextGraph?.complete !== false &&
    Boolean(inputs.surface?.inventory_digest) &&
    Array.isArray(inputs.obligations) &&
    inputs.obligations.length > 0 &&
    inputs.dispatchValid === true;
  return { status: complete ? "READY" : "NOT_READY", blocking_reasons: complete ? [] : ["coverage universe incomplete"] };
}

export function evaluateReviewGate({ selectionsValid = false, openBlocking = 0, openNonblocking = 0, acceptedNonblocking = 0 } = {}) {
  if (!selectionsValid || openBlocking > 0 || openNonblocking > 0) {
    return { status: "NOT_READY", blocking_reasons: ["selection or finding closure incomplete"] };
  }
  if (acceptedNonblocking > 0) return { status: "READY_WITH_NOTES", note_refs: [] };
  return { status: "READY", note_refs: [] };
}

export function evaluateIndependentGate({ barrierClosed = false, requiredDifferences = 0, optionalDifferences = 0 } = {}) {
  if (!barrierClosed || requiredDifferences > 0) {
    return { status: "NOT_READY", blocking_reasons: ["independent discovery barrier or required difference unresolved"] };
  }
  if (optionalDifferences > 0) return { status: "READY_WITH_NOTES", note_refs: [] };
  return { status: "READY", note_refs: [] };
}

export function evaluateStyleGate({ styleClosed = false, unresolvedStyleFindings = 0 } = {}) {
  if (!styleClosed || unresolvedStyleFindings > 0) {
    return { status: "NOT_READY", blocking_reasons: ["changed-line style closure incomplete"] };
  }
  return { status: "READY", note_refs: [] };
}

export function evaluateImplementationGate({ evidenceCurrent = false } = {}) {
  return { status: evidenceCurrent ? "READY" : "NOT_READY", blocking_reasons: evidenceCurrent ? [] : ["implementation evidence not current"] };
}

export function composeOverallGate(evidenceGates) {
  const byName = new Map();
  for (const gate of evidenceGates) {
    if (!isPlainObject(gate) || !EVIDENCE_GATE_NAMES.includes(gate.gate_name)) {
      return { status: "NOT_READY", blocking_reasons: ["unknown or extra gate input"] };
    }
    if (byName.has(gate.gate_name)) {
      return { status: "NOT_READY", blocking_reasons: [`duplicate gate: ${gate.gate_name}`] };
    }
    byName.set(gate.gate_name, gate);
  }
  const missing = EVIDENCE_GATE_NAMES.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    return { status: "NOT_READY", blocking_reasons: missing.map((name) => `missing gate: ${name}`) };
  }

  const gates = EVIDENCE_GATE_NAMES.map((name) => byName.get(name));
  const statuses = gates.map((gate) => gate.status);
  const allReady = statuses.every((status) => status === "READY");
  const allReadyOrNotes = statuses.every((status) => status === "READY" || status === "READY_WITH_NOTES");
  const anyNotes = statuses.some((status) => status === "READY_WITH_NOTES");

  if (allReady) {
    return { status: "READY", note_refs: [], blocking_reasons: [] };
  }

  if (allReadyOrNotes && anyNotes) {
    const noteRefs = gates.flatMap((gate) => gate.note_refs ?? []);
    if (noteRefs.length === 0) {
      return { status: "NOT_READY", blocking_reasons: ["READY_WITH_NOTES gate without note refs"] };
    }
    for (const note of noteRefs) {
      if (!ALLOWED_NOTE_KINDS.includes(note.note_kind)) {
        return { status: "NOT_READY", blocking_reasons: [`illegal note_kind: ${note.note_kind}`] };
      }
    }
    return { status: "READY_WITH_NOTES", note_refs: noteRefs, blocking_reasons: [] };
  }

  const blocking = [];
  for (const gate of gates) {
    if (gate.status === "NOT_READY" || gate.status === "NEEDS_USER_DECISION") {
      blocking.push(...(gate.blocking_reasons ?? [`${gate.gate_name}=${gate.status}`]));
    }
  }
  return { status: "NOT_READY", blocking_reasons: blocking.length > 0 ? blocking : ["evidence gates not all READY"] };
}

/**
 * Consume a READY/READY_WITH_NOTES gate result (R-019). Returns a
 * GateConsumption-shaped record, or throws `STALE_REVIEW` when the result is
 * expired or an input digest no longer matches.
 */
export function consumeGateResult(gateResult, { consumed_at, input_digests = [], time_source_ref } = {}) {
  if (!isPlainObject(gateResult)) fail("INVALID_REVIEW_RECORD", "gate result must be an object");
  if (gateResult.status !== "READY" && gateResult.status !== "READY_WITH_NOTES") {
    fail("STALE_REVIEW", `gate ${gateResult.gate_name} is not consumable: ${gateResult.status}`);
  }
  if (typeof consumed_at !== "number") fail("INVALID_REVIEW_RECORD", "consumed_at is required");
  if (typeof gateResult.valid_until === "number" && consumed_at > gateResult.valid_until) {
    fail("STALE_REVIEW", `gate ${gateResult.gate_name} expired at ${gateResult.valid_until}`);
  }
  for (const ref of input_digests) {
    if (!isCanonicalRef(ref)) fail("CANONICAL_REF_MISMATCH", "input digest must be a CanonicalRef");
  }
  const base = {
    record_type: "gate-consumption",
    gate_result_ref: { id: gateResult.record_id, digest: gateResult.record_digest },
    consumed_at,
    time_source_ref: time_source_ref ?? gateResult.time_source_ref,
    recomputed_input_refs: input_digests,
    freshness_status: "current",
    accepted: true
  };
  return finalizeRecord(base, `gate-consumption:${gateResult.record_id}:${consumed_at}`);
}
