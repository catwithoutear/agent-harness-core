import assert from "node:assert/strict";
import { ReviewRunError, finalizeRecord } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  buildAssignmentPackets,
  buildAssignmentPacket,
  validateAssignmentClosure,
  validateAssignmentPacket
} from "../skills/review/review-packet-gate/scripts/review-dispatch.mjs";

const obligation = (id) => finalizeRecord({ record_type: "relation-obligation" }, id);
const cluster = (id) => finalizeRecord({ record_type: "scope-cluster" }, id);
const oref = (o) => ({ id: o.record_id, digest: o.record_digest });

export async function run(run) {
  await run("closure is valid when every obligation has exactly one primary owner", async () => {
    const obs = [obligation("rel-1"), obligation("rel-2")];
    const assignment = { record_id: "asn-1", primary_relation_refs: obs.map(oref) };
    assert.equal(validateAssignmentClosure([assignment], obs).valid, true);
  });

  await run("unassigned obligation -> ASSIGNMENT_GAP", async () => {
    const obs = [obligation("rel-1"), obligation("rel-2")];
    const assignment = { record_id: "asn-1", primary_relation_refs: [oref(obs[0])] };
    const result = validateAssignmentClosure([assignment], obs);
    assert.equal(result.valid, false);
    assert.ok(result.gaps.some((g) => g.gap_kind === "ASSIGNMENT_GAP" && g.reason === "unassigned primary obligation"));
  });

  await run("duplicate primary owner -> PRIMARY_OWNER_CONFLICT", async () => {
    const obs = [obligation("rel-1")];
    const refs = obs.map(oref);
    const a1 = { record_id: "asn-1", primary_relation_refs: refs };
    const a2 = { record_id: "asn-2", primary_relation_refs: refs };
    const result = validateAssignmentClosure([a1, a2], obs);
    assert.equal(result.valid, false);
    assert.ok(result.gaps.some((g) => g.gap_kind === "PRIMARY_OWNER_CONFLICT"));
  });

  await run("out-of-bound owner -> ASSIGNMENT_GAP", async () => {
    const obs = [obligation("rel-1")];
    const assignment = { record_id: "asn-1", primary_relation_refs: [{ id: "rel-99", digest: "sha256:" + "e".repeat(64) }] };
    const result = validateAssignmentClosure([assignment], obs);
    assert.equal(result.valid, false);
    assert.ok(result.gaps.some((g) => g.gap_kind === "ASSIGNMENT_GAP" && g.reason === "out-of-bound primary owner"));
  });

  await run("buildAssignmentPackets groups obligations by cluster", async () => {
    const c1 = cluster("c1");
    const c2 = cluster("c2");
    const obs = [obligation("rel-1"), obligation("rel-2"), obligation("rel-3")];
    const clusterFor = (o) => (o.record_id === "rel-3" ? c2 : c1);
    const packets = buildAssignmentPackets({ obligations: obs, clusterForObligation: clusterFor });
    assert.equal(packets.length, 2);
  });

  await run("validateAssignmentPacket rejects missing primary refs", async () => {
    assert.throws(() => validateAssignmentPacket({ record_type: "review-assignment", cluster_ref: oref(cluster("c1")) }), ReviewRunError);
  });

  await run("buildAssignmentPacket rejects empty primary relations", async () => {
    assert.throws(() => buildAssignmentPacket({ cluster: cluster("c1"), primaryRelationRefs: [] }), ReviewRunError);
  });
}
