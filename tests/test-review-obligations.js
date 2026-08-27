import assert from "node:assert/strict";
import { ReviewRunError, finalizeRecord } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  assertCandidateTotality,
  buildExpectedObligations,
  buildIntegrationObligations,
  decideApplicability,
  deriveRelationIdentity,
  enumerateCandidates
} from "../skills/review/review-packet-gate/scripts/review-obligations.mjs";

const dimension = finalizeRecord({ record_type: "dimension", dimension_id: "d1", authority_kinds: ["coding"] }, "dim-d1");
const anchor = (id) => finalizeRecord({ record_type: "review-anchor", dimension_id: "d1" }, id);
const item = (id) => finalizeRecord({ record_type: "authority-item", authority_kind: "coding" }, id);

export async function run(run) {
  await run("enumerates the full cross-product", async () => {
    const candidates = enumerateCandidates({
      dimensions: [dimension],
      anchorsByDimension: { d1: [anchor("a1"), anchor("a2")] },
      authorityItemsByKind: { coding: [item("i1"), item("i2")] }
    });
    assert.equal(candidates.length, 4); // 2 anchors x 2 items
  });

  await run("decideApplicability yields exactly one decision per candidate", async () => {
    const candidates = enumerateCandidates({ dimensions: [dimension], anchorsByDimension: { d1: [anchor("a1")] }, authorityItemsByKind: { coding: [item("i1")] } });
    const decisions = decideApplicability(candidates, () => "applicable");
    assert.equal(decisions.length, candidates.length);
    assert.equal(decisions[0].status, "applicable");
  });

  await run("assertCandidateTotality rejects a missing decision", async () => {
    const candidates = enumerateCandidates({ dimensions: [dimension], anchorsByDimension: { d1: [anchor("a1"), anchor("a2")] }, authorityItemsByKind: { coding: [item("i1")] } });
    const decisions = decideApplicability(candidates.slice(0, 1), () => "applicable");
    assert.throws(() => assertCandidateTotality(candidates, decisions), ReviewRunError);
  });

  await run("buildExpectedObligations: applicable -> 1 relation, not-applicable -> 0", async () => {
    const candidates = enumerateCandidates({ dimensions: [dimension], anchorsByDimension: { d1: [anchor("a1"), anchor("a2")] }, authorityItemsByKind: { coding: [item("i1")] } });
    const decisions = decideApplicability(candidates, (c) => (c.candidate_key.review_anchor_ref.id === "a1" ? "applicable" : "not_applicable"));
    const relations = buildExpectedObligations(candidates, decisions);
    assert.equal(relations.length, 1);
    assert.ok(relations[0].record_id.startsWith("rel-v1:sha256:"));
  });

  await run("buildExpectedObligations blocks on unknown decisions", async () => {
    const candidates = enumerateCandidates({ dimensions: [dimension], anchorsByDimension: { d1: [anchor("a1")] }, authorityItemsByKind: { coding: [item("i1")] } });
    const decisions = decideApplicability(candidates, () => "unknown");
    assert.throws(() => buildExpectedObligations(candidates, decisions), ReviewRunError);
  });

  await run("deriveRelationIdentity is stable and prefixed", async () => {
    const key = { review_anchor_ref: { id: "x", digest: "sha256:" + "a".repeat(64) }, dimension_ref: { id: "y", digest: "sha256:" + "b".repeat(64) } };
    const first = deriveRelationIdentity(key);
    const second = deriveRelationIdentity(key);
    assert.deepEqual(first, second);
    assert.ok(first.id.startsWith("rel-v1:sha256:"));
  });

  await run("buildIntegrationObligations derives cluster x interaction", async () => {
    const cluster = finalizeRecord({ record_type: "scope-cluster" }, "cluster-1");
    const interaction = finalizeRecord({ record_type: "interaction", participating_dimension_refs: [{ id: "dim-a", digest: "sha256:" + "c".repeat(64) }, { id: "dim-b", digest: "sha256:" + "d".repeat(64) }] }, "mix-1");
    const obligations = buildIntegrationObligations({ clusters: [cluster], interactions: [interaction] });
    assert.equal(obligations.length, 1);
    assert.ok(obligations[0].record_id.startsWith("int-v1:sha256:"));
  });
}
