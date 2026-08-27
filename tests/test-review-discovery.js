import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  applyComparisonDisposition,
  buildNormalizationClosure,
  compareUniverses,
  verifyMethodDiversity
} from "../skills/review/review-packet-gate/scripts/review-discovery.mjs";

const digest = (n) => `sha256:${n.repeat(64)}`;

export async function run(run) {
  await run("normalization closure is total and injective", async () => {
    const raw = [{ record_id: "r1" }, { record_id: "r2" }];
    const result = buildNormalizationClosure(raw, (o) => ({ record_id: `n-${o.record_id}` }));
    assert.equal(result.complete, true);
    assert.equal(result.mappings.length, 2);
  });

  await run("normalization rejects many-to-one collapse", async () => {
    const raw = [{ record_id: "r1" }, { record_id: "r2" }];
    const result = buildNormalizationClosure(raw, () => ({ record_id: "same" }));
    assert.equal(result.complete, false);
    assert.equal(result.gap_kind, "NORMALIZATION_CLOSURE_GAP");
  });

  await run("normalization rejects an unmapped raw observation", async () => {
    const result = buildNormalizationClosure([{ record_id: "r1" }], () => null);
    assert.equal(result.complete, false);
  });

  await run("compareUniverses reports both omission directions and conflicts", async () => {
    const expected = [{ id: "a", digest: digest("1") }, { id: "b", digest: digest("2") }];
    const observed = [{ id: "b", digest: digest("2") }, { id: "c", digest: digest("3") }];
    const result = compareUniverses(expected, observed);
    assert.equal(result.coordinator_only.length, 1);
    assert.equal(result.coordinator_only[0].id, "a");
    assert.equal(result.independent_only.length, 1);
    assert.equal(result.independent_only[0].id, "c");
    assert.equal(result.common.length, 1);
    assert.equal(result.required_differences, 2);
  });

  await run("compareUniverses detects same-key different-digest conflict", async () => {
    const result = compareUniverses([{ id: "a", digest: digest("1") }], [{ id: "a", digest: digest("2") }]);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.required_differences, 1);
  });

  await run("required difference with a non-allowed disposition is forbidden", async () => {
    assert.throws(() => applyComparisonDisposition({ kind: "coordinator-only", requiredness: "required", proposed_disposition: "WAIVER" }, { allowed_dispositions: ["CANONICAL_ALIAS_EQUIVALENT"] }), ReviewRunError);
  });

  await run("allowed non-blocking disposition succeeds", async () => {
    const record = applyComparisonDisposition({ kind: "coordinator-only", requiredness: "required", proposed_disposition: "CANONICAL_ALIAS_EQUIVALENT" }, { allowed_dispositions: ["CANONICAL_ALIAS_EQUIVALENT"] });
    assert.equal(record.disposition_kind, "CANONICAL_ALIAS_EQUIVALENT");
  });

  await run("method diversity requires different digests or a trusted oracle", async () => {
    assert.equal(verifyMethodDiversity([{ object_family: "authority", mode: "independent-methods", expected_implementation_digest: digest("1"), observed_implementation_digest: digest("2") }]).complete, true);
    assert.equal(verifyMethodDiversity([{ object_family: "authority", mode: "independent-methods", expected_implementation_digest: digest("1"), observed_implementation_digest: digest("1") }]).complete, false);
    assert.equal(verifyMethodDiversity([{ object_family: "authority", mode: "trusted-oracle", oracle_ref: { id: "o", digest: digest("o") }, oracle_conformance_contract_ref: { id: "c", digest: digest("c") } }]).complete, true);
  });
}
