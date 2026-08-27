import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  EVIDENCE_GATE_NAMES,
  buildGateResult,
  composeOverallGate,
  consumeGateResult,
  evaluateCoverageGate,
  evaluateImplementationGate,
  evaluateIndependentGate,
  evaluateReviewGate,
  evaluateStyleGate
} from "../skills/review/review-packet-gate/scripts/review-gates.mjs";

const digest = (n = "a") => `sha256:${n.repeat(64)}`;
const inputRef = (n) => ({ id: `view-v1:${n}`, digest: digest(n) });

function gate(status, name = "coverage_gate", extra = {}) {
  return {
    gate_name: name,
    status,
    note_refs: [],
    blocking_reasons: [],
    ...extra
  };
}

function five(statuses) {
  return EVIDENCE_GATE_NAMES.map((name, i) => gate(statuses[i], name));
}

export async function run(run) {
  await run("all five READY -> overall READY", async () => {
    const result = composeOverallGate(five(["READY", "READY", "READY", "READY", "READY"]));
    assert.equal(result.status, "READY");
  });

  await run("all READY/READY_WITH_NOTES + valid notes -> READY_WITH_NOTES with note union", async () => {
    const note = { id: "finding-v1:x", digest: digest("f"), note_kind: "accepted-nonblocking" };
    const gates = five(["READY", "READY", "READY", "READY", "READY_WITH_NOTES"]);
    gates[4].note_refs = [note];
    const result = composeOverallGate(gates);
    assert.equal(result.status, "READY_WITH_NOTES");
    assert.deepEqual(result.note_refs, [note]);
  });

  await run("one NOT_READY -> overall NOT_READY", async () => {
    const result = composeOverallGate(five(["READY", "NOT_READY", "READY", "READY", "READY"]));
    assert.equal(result.status, "NOT_READY");
  });

  await run("missing gate -> NOT_READY", async () => {
    const result = composeOverallGate(five(["READY", "READY", "READY", "READY", "READY"]).slice(0, 4));
    assert.equal(result.status, "NOT_READY");
  });

  await run("duplicate gate -> NOT_READY", async () => {
    const result = composeOverallGate([gate("READY", "coverage_gate"), gate("READY", "coverage_gate"), gate("READY", "review_gate"), gate("READY", "independent_review_gate"), gate("READY", "style_gate")]);
    assert.equal(result.status, "NOT_READY");
  });

  await run("READY_WITH_NOTES without note refs -> NOT_READY", async () => {
    const result = composeOverallGate(five(["READY", "READY", "READY", "READY", "READY_WITH_NOTES"]));
    assert.equal(result.status, "NOT_READY");
  });

  await run("illegal note_kind -> NOT_READY", async () => {
    const gates = five(["READY", "READY", "READY", "READY", "READY_WITH_NOTES"]);
    gates[4].note_refs = [{ id: "f", digest: digest("f"), note_kind: "arbitrary-note" }];
    const result = composeOverallGate(gates);
    assert.equal(result.status, "NOT_READY");
  });

  await run("NEEDS_USER_DECISION is not READY", async () => {
    const result = composeOverallGate(five(["READY", "READY", "READY", "READY", "NEEDS_USER_DECISION"]));
    assert.equal(result.status, "NOT_READY");
  });

  await run("buildGateResult rejects unknown gate name and bad status", async () => {
    assert.throws(() => buildGateResult({ gate_name: "bogus_gate", status: "READY", evaluated_at: 1, time_source_ref: "t", freshness_basis_ref: "f" }), ReviewRunError);
    assert.throws(() => buildGateResult({ gate_name: "coverage_gate", status: "MAYBE", evaluated_at: 1, time_source_ref: "t", freshness_basis_ref: "f" }), ReviewRunError);
  });

  await run("consumeGateResult accepts current READY and rejects expired", async () => {
    const result = buildGateResult({ gate_name: "coverage_gate", status: "READY", evaluated_at: 100, time_source_ref: "clock", freshness_basis_ref: "f", valid_until: 200 });
    const consumption = consumeGateResult(result, { consumed_at: 150 });
    assert.equal(consumption.accepted, true);
    assert.throws(() => consumeGateResult(result, { consumed_at: 250 }), ReviewRunError);
  });

  await run("consumeGateResult rejects non-consumable status", async () => {
    const result = buildGateResult({ gate_name: "coverage_gate", status: "NOT_READY", evaluated_at: 100, time_source_ref: "clock", freshness_basis_ref: "f" });
    assert.throws(() => consumeGateResult(result, { consumed_at: 150 }), ReviewRunError);
  });

  await run("consumeGateResult rejects non-canonical input digest", async () => {
    const result = buildGateResult({ gate_name: "coverage_gate", status: "READY", evaluated_at: 100, time_source_ref: "clock", freshness_basis_ref: "f" });
    assert.throws(() => consumeGateResult(result, { consumed_at: 150, input_digests: [{ id: "bare" }] }), ReviewRunError);
  });

  await run("evaluateCoverageGate requires a complete coverage universe", async () => {
    assert.equal(evaluateCoverageGate({ authority: { complete: true }, dimensionAuthority: { complete: true }, contextGraph: { complete: true }, surface: { inventory_digest: digest("s") }, obligations: [{ id: "rel-1" }], dispatchValid: true }).status, "READY");
    assert.equal(evaluateCoverageGate({ authority: { complete: false }, obligations: [{ id: "rel-1" }], dispatchValid: true }).status, "NOT_READY");
    assert.equal(evaluateCoverageGate({ authority: { complete: true }, obligations: [], dispatchValid: true }).status, "NOT_READY");
  });

  await run("evaluateReviewGate blocks on open findings and caps at notes", async () => {
    assert.equal(evaluateReviewGate({ selectionsValid: true, openBlocking: 0, openNonblocking: 0 }).status, "READY");
    assert.equal(evaluateReviewGate({ selectionsValid: true, openBlocking: 1 }).status, "NOT_READY");
    assert.equal(evaluateReviewGate({ selectionsValid: true, acceptedNonblocking: 1 }).status, "READY_WITH_NOTES");
  });

  await run("evaluateIndependentGate requires a closed barrier with zero required differences", async () => {
    assert.equal(evaluateIndependentGate({ barrierClosed: true, requiredDifferences: 0 }).status, "READY");
    assert.equal(evaluateIndependentGate({ barrierClosed: false }).status, "NOT_READY");
    assert.equal(evaluateIndependentGate({ barrierClosed: true, requiredDifferences: 1 }).status, "NOT_READY");
    assert.equal(evaluateIndependentGate({ barrierClosed: true, optionalDifferences: 1 }).status, "READY_WITH_NOTES");
  });

  await run("evaluateStyleGate and evaluateImplementationGate reflect their inputs", async () => {
    assert.equal(evaluateStyleGate({ styleClosed: true }).status, "READY");
    assert.equal(evaluateStyleGate({ styleClosed: true, unresolvedStyleFindings: 1 }).status, "NOT_READY");
    assert.equal(evaluateImplementationGate({ evidenceCurrent: false }).status, "NOT_READY");
    assert.equal(evaluateImplementationGate({ evidenceCurrent: true }).status, "READY");
  });
}
