import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  buildFindingRegister,
  deriveConclusion,
  normalizeReviewOutput,
  selectCurrentOutcomes,
  verifyOutputReceipt
} from "../skills/review/review-packet-gate/scripts/review-output.mjs";

const digest = (n) => `sha256:${n.repeat(64)}`;

export async function run(run) {
  await run("deriveConclusion follows the fixed precedence", async () => {
    assert.equal(deriveConclusion({ execution_status: "failed" }), "inconclusive");
    assert.equal(deriveConclusion({ execution_status: "succeeded", applicability_challenge: true }), "applicability_challenge");
    assert.equal(deriveConclusion({ execution_status: "succeeded", completeness: false }), "inconclusive");
    assert.equal(deriveConclusion({ execution_status: "succeeded", findings: [{ blocking_class: "blocking" }] }), "blocking");
    assert.equal(deriveConclusion({ execution_status: "succeeded", findings: [{ blocking_class: "nonblocking" }] }), "nonblocking_only");
    assert.equal(deriveConclusion({ execution_status: "succeeded", findings: [] }), "clear");
  });

  await run("verifyOutputReceipt accepts a matching digest and rejects mismatch", async () => {
    const receipt = { record_id: "rc-1", record_digest: digest("r"), raw_bytes_digest: digest("a"), byte_length: 10, issuer_signature: "sig" };
    const verified = verifyOutputReceipt({ receipt, artifact_digest: digest("a") });
    assert.equal(verified.verified, true);
    assert.throws(() => verifyOutputReceipt({ receipt, artifact_digest: digest("b") }), ReviewRunError);
  });

  await run("normalizeReviewOutput is a strict bijection with preserved parents", async () => {
    const raw = [
      { raw_id: "o1", kind: "outcome" },
      { raw_id: "f1", kind: "finding", parent_raw_id: "o1" }
    ];
    const result = normalizeReviewOutput({ raw_items: raw, normalize: (r) => ({ record_id: `n-${r.raw_id}` }) });
    assert.equal(result.complete, true);
    assert.equal(result.mappings.length, 2);
  });

  await run("normalizeReviewOutput rejects many-to-one collapse", async () => {
    const raw = [{ raw_id: "o1", kind: "outcome" }, { raw_id: "o2", kind: "outcome" }];
    const result = normalizeReviewOutput({ raw_items: raw, normalize: () => ({ record_id: "same" }) });
    assert.equal(result.complete, false);
  });

  await run("normalizeReviewOutput rejects a finding without an outcome parent", async () => {
    const raw = [{ raw_id: "f1", kind: "finding", parent_raw_id: "missing" }];
    const result = normalizeReviewOutput({ raw_items: raw, normalize: (r) => ({ record_id: `n-${r.raw_id}` }) });
    assert.equal(result.complete, false);
  });

  await run("buildFindingRegister tracks open blocking findings", async () => {
    const findings = [{ record_id: "f1", record_digest: digest("1"), blocking_class: "blocking" }, { record_id: "f2", record_digest: digest("2"), blocking_class: "nonblocking" }];
    const register = buildFindingRegister({ findings });
    assert.equal(register.open_blocking_refs.length, 1);
    assert.equal(register.open_nonblocking_refs.length, 1);
  });

  await run("selectCurrentOutcomes requires exactly one succeeded+clear per obligation", async () => {
    const obligation = { record_id: "rel-1", record_digest: digest("o") };
    const outcome = { record_id: "out-1", record_digest: digest("x"), obligation_ref: { id: "rel-1" }, execution_status: "succeeded", conclusion: "clear" };
    const selections = selectCurrentOutcomes({ outcomes: [outcome], obligations: [obligation] });
    assert.equal(selections.length, 1);
  });

  await run("selectCurrentOutcomes rejects zero or non-clear outcomes", async () => {
    const obligation = { record_id: "rel-1", record_digest: digest("o") };
    assert.throws(() => selectCurrentOutcomes({ outcomes: [], obligations: [obligation] }), ReviewRunError);
    const blockingOutcome = { record_id: "out-1", record_digest: digest("x"), obligation_ref: { id: "rel-1" }, execution_status: "succeeded", conclusion: "blocking" };
    assert.throws(() => selectCurrentOutcomes({ outcomes: [blockingOutcome], obligations: [obligation] }), ReviewRunError);
  });
}
