import { digestValue, fail, finalizeRecord, isCanonicalRef, isPlainObject } from "./review-records.mjs";

/**
 * Unit/context-first reviewer dispatch and exactly-once primary ownership
 * (R-026, R-027, R-028).
 *
 * Dispatch builds bounded scope-cluster assignment packets; `dimension` is a
 * lens on the cluster, never a slicing axis. Ownership closure requires every
 * primary relation obligation to have exactly one primary owner:
 *
 *   ∀i: P_i ⊆ R
 *   union(P_i) = R
 *   ∀i≠j: P_i ∩ P_j = ∅
 *
 * Secondary overlap is explicit and never counts toward coverage.
 */

function obligationId(obligation) {
  return obligation.record_id ?? obligation.id;
}

function ref(record) {
  return { id: record.record_id ?? record.id, digest: record.record_digest ?? record.digest };
}

export function buildAssignmentPacket({ cluster, primaryRelationRefs, secondaryRelationRefs = [], dimensionRefs = [], authorityItemRefs = [], targetViewRef, expectedUniverseRef, contextPacketRef, evidencePolicyRefs = [] }) {
  if (!isPlainObject(cluster)) fail("ASSIGNMENT_CONTEXT_GAP", "assignment packet requires a cluster");
  if (!Array.isArray(primaryRelationRefs) || primaryRelationRefs.length === 0) {
    fail("ASSIGNMENT_GAP", "assignment packet has no primary relations");
  }
  for (const r of primaryRelationRefs) {
    if (!isCanonicalRef(r)) fail("CANONICAL_REF_MISMATCH", "primary relation ref must be a {id,digest} CanonicalRef");
  }
  const base = {
    record_type: "review-assignment",
    reviewer_kind: "specialist",
    cluster_ref: ref(cluster),
    primary_relation_refs: primaryRelationRefs,
    secondary_relation_refs: secondaryRelationRefs,
    dimension_refs: dimensionRefs,
    authority_item_refs: authorityItemRefs,
    context_packet_ref: contextPacketRef,
    target_view_ref: targetViewRef,
    expected_universe_ref: expectedUniverseRef,
    evidence_policy_refs: evidencePolicyRefs
  };
  return finalizeRecord(base, `asn:${digestValue(base.primary_relation_refs)}`);
}

export function validateAssignmentPacket(packet, expectedUniverseRef) {
  if (!isPlainObject(packet)) fail("INVALID_REVIEW_RECORD", "assignment packet must be an object");
  if (packet.record_type !== "review-assignment") fail("ASSIGNMENT_GAP", "not a review-assignment record");
  if (!packet.cluster_ref || !isCanonicalRef(packet.cluster_ref)) fail("ASSIGNMENT_CONTEXT_GAP", "assignment missing cluster_ref");
  if (!Array.isArray(packet.primary_relation_refs) || packet.primary_relation_refs.length === 0) {
    fail("ASSIGNMENT_GAP", "assignment missing primary_relation_refs");
  }
  if (!packet.context_packet_ref && !packet.target_view_ref) {
    fail("ASSIGNMENT_CONTEXT_GAP", "assignment missing context/target binding");
  }
  if (expectedUniverseRef && packet.expected_universe_ref && packet.expected_universe_ref.id !== expectedUniverseRef.id) {
    fail("ASSIGNMENT_GAP", "assignment bound to a stale expected universe");
  }
  return packet;
}

export function buildDispatchPlan(assignments, { expectedUniverseRef } = {}) {
  if (!Array.isArray(assignments) || assignments.length === 0) fail("ASSIGNMENT_GAP", "dispatch requires assignments");
  const base = {
    record_type: "dispatch-plan",
    expected_universe_ref: expectedUniverseRef,
    review_assignment_refs: assignments.map(ref),
    integration_assignment_refs: [],
    primary_relation_owner_entries: [],
    primary_integration_owner_entries: [],
    required_slot_closure: true
  };
  return finalizeRecord(base, `dispatch:${digestValue(assignments.map(ref))}`);
}

export function validateAssignmentClosure(assignments, relationObligations) {
  const R = new Set(relationObligations.map(obligationId));
  const gaps = [];
  const owned = new Map();

  for (const assignment of assignments) {
    const primaries = assignment.primary_relation_refs ?? [];
    for (const r of primaries) {
      if (!isCanonicalRef(r)) {
        gaps.push({ gap_kind: "CANONICAL_REF_MISMATCH", obligation: r?.id, assignment: assignment.record_id ?? assignment.id });
        continue;
      }
      if (!R.has(r.id)) {
        gaps.push({ gap_kind: "ASSIGNMENT_GAP", obligation: r.id, reason: "out-of-bound primary owner" });
        continue;
      }
      if (owned.has(r.id)) {
        gaps.push({ gap_kind: "PRIMARY_OWNER_CONFLICT", obligation: r.id, assignment: assignment.record_id ?? assignment.id, prior: owned.get(r.id) });
      } else {
        owned.set(r.id, assignment.record_id ?? assignment.id);
      }
    }
  }

  for (const id of R) {
    if (!owned.has(id)) {
      gaps.push({ gap_kind: "ASSIGNMENT_GAP", obligation: id, reason: "unassigned primary obligation" });
    }
  }

  return { valid: gaps.length === 0, gaps };
}

export function buildAssignmentPackets({ obligations, clusterForObligation, extra = {} }) {
  if (!Array.isArray(obligations)) fail("INVALID_REVIEW_RECORD", "obligations must be an array");
  if (typeof clusterForObligation !== "function") fail("INVALID_REVIEW_RECORD", "clusterForObligation must be a function");
  const byCluster = new Map();
  for (const obligation of obligations) {
    const cluster = clusterForObligation(obligation);
    const key = cluster.record_id ?? cluster.id;
    if (!byCluster.has(key)) byCluster.set(key, { cluster, obligations: [] });
    byCluster.get(key).obligations.push(obligation);
  }
  const packets = [];
  for (const { cluster, obligations: obs } of byCluster.values()) {
    packets.push(buildAssignmentPacket({
      cluster,
      primaryRelationRefs: obs.map((o) => ({ id: o.record_id ?? o.id, digest: o.record_digest ?? o.digest })),
      ...extra
    }));
  }
  return packets;
}
