import assert from "node:assert/strict";
import { finalizeRecord } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import { resolveReviewAuthority } from "../skills/review/review-packet-gate/scripts/review-authority.mjs";
import { activateDimensions } from "../skills/review/review-packet-gate/scripts/review-dimensions.mjs";
import { enumerateCandidates, decideApplicability, buildExpectedObligations } from "../skills/review/review-packet-gate/scripts/review-obligations.mjs";
import { buildAssignmentPacket, validateAssignmentClosure } from "../skills/review/review-packet-gate/scripts/review-dispatch.mjs";
import { composeOverallGate } from "../skills/review/review-packet-gate/scripts/review-gates.mjs";
import { runDeepCoverage } from "../skills/review/review-packet-gate/scripts/review-run.mjs";

const digest = (n = "a") => `sha256:${n.repeat(64)}`;

export async function run(run) {
  await run("authority -> dimensions -> obligations -> dispatch -> gates composes end-to-end", async () => {
    // 1. authority
    const authority = resolveReviewAuthority(
      [{ source_locator: "rules/review.md", source_kind: "rules", scope: "*", precedence: 1, version: "v1", digest: digest("1"), availability: "available" }],
      [{ authority_kind: "coding", source_ref: { id: "src-v1:x", digest: digest("b") }, item_anchor: "rule-1", item_digest: digest("2"), scope: "*", precedence: 1, version_ref: "v1", digest: digest("3"), availability: "available" }]
    );
    assert.equal(authority.complete, true);

    // 2. dimensions
    const dimension = finalizeRecord({ record_type: "dimension", dimension_id: "d1", authority_kinds: ["coding"], gate_inputs: ["review_gate"] }, "dim-d1");
    const dimensionAuthority = activateDimensions(
      { coding_authority_refs: authority.coding_authority_refs, behavioral_authority_refs: [] },
      { dimensions: [{ dimension_id: "d1", coverage_mode: "unit", authority_kinds: ["coding"], digest: digest("d") }] }
    );
    assert.equal(dimensionAuthority.complete, true);

    // 3. obligations
    const anchor = finalizeRecord({ record_type: "review-anchor", dimension_id: "d1" }, "anchor-1");
    const item = finalizeRecord({ record_type: "authority-item", authority_kind: "coding" }, "item-1");
    const candidates = enumerateCandidates({ dimensions: [dimension], anchorsByDimension: { d1: [anchor] }, authorityItemsByKind: { coding: [item] } });
    const decisions = decideApplicability(candidates, () => "applicable");
    const obligations = buildExpectedObligations(candidates, decisions);
    assert.equal(obligations.length, 1);

    // 4. dispatch (exactly-once primary ownership)
    const cluster = finalizeRecord({ record_type: "scope-cluster" }, "cluster-1");
    const packet = buildAssignmentPacket({ cluster, primaryRelationRefs: obligations.map((o) => ({ id: o.record_id, digest: o.record_digest })) });
    assert.equal(validateAssignmentClosure([packet], obligations).valid, true);

    // 5. gates (five evidence gates -> derived overall)
    const ready = (name) => ({ gate_name: name, status: "READY", note_refs: [], blocking_reasons: [] });
    const overall = composeOverallGate([
      ready("coverage_gate"), ready("review_gate"), ready("independent_review_gate"), ready("style_gate"), ready("implementation_verification_gate")
    ]);
    assert.equal(overall.status, "READY");
  });

  await run("runDeepCoverage orchestrates the machine path into a READY coverage gate", async () => {
    const targetSnapshot = { record_id: "view-v1:1", record_digest: digest("1"), files: [{ path: "src/a.js", digest: digest("2") }], git_objects: [{ object: "HEAD", digest: digest("3") }] };
    const dimension = finalizeRecord({ record_type: "dimension", dimension_id: "d1", authority_kinds: ["coding"], gate_inputs: ["review_gate"] }, "dim-d1");
    const anchor = finalizeRecord({ record_type: "review-anchor", dimension_id: "d1" }, "anchor-1");
    const item = finalizeRecord({ record_type: "authority-item", authority_kind: "coding" }, "item-1");

    const result = runDeepCoverage({
      targetSnapshot,
      normativeSources: [{ locator: "rules/review.md", digest: digest("4"), producer_ref: { id: "policy-v1:5", digest: digest("5") } }],
      authorityItems: [{ authority_kind: "coding", source_ref: { id: "src-v1:6", digest: digest("6") }, item_anchor: "rule-1", item_digest: digest("7"), scope: "*", precedence: 1, version_ref: "v1", digest: digest("8"), availability: "available" }],
      dimensions: [{ dimension_id: "d1", coverage_mode: "unit", authority_kinds: ["coding"], digest: digest("9") }],
      anchorsByDimension: { d1: [anchor] },
      surface: { inventory_digest: digest("a") }
    });

    assert.equal(result.obligations.length, 1);
    assert.equal(result.dispatchValid, true);
    assert.equal(result.coverageGate.status, "READY");
  });
}
