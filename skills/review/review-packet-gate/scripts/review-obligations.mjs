import { deriveIdentity, digestValue, fail, finalizeRecord, isPlainObject } from "./review-records.mjs";

/**
 * Applicability candidate universe and immutable obligation derivation
 * (R-012, R-013, R-029, R-032).
 *
 * The candidate set is the mechanical cross-product over every activated
 * dimension's complete anchor set and every authority item of the declared
 * kinds — never pre-filtered by scope/applicability. Totality requires exactly
 * one decision per candidate and exactly one relation obligation per
 * applicable decision (zero per not-applicable, and `unknown` blocks seal).
 */

const DECISION_STATUSES = Object.freeze(["applicable", "not_applicable", "unknown"]);

function ref(record) {
  return { id: record.record_id, digest: record.record_digest };
}

export function buildCandidate({ anchor, dimension, authorityItem, contextPacket, evidencePolicy }) {
  const key = {
    review_anchor_ref: ref(anchor),
    dimension_ref: ref(dimension),
    authority_item_ref: ref(authorityItem),
    context_packet_ref: contextPacket ? ref(contextPacket) : undefined,
    evidence_policy_ref: evidencePolicy
  };
  const identity = deriveIdentity("applicability_candidate", key, "v1");
  return finalizeRecord({ record_type: "applicability-candidate", candidate_key: key }, identity.id);
}

export function enumerateCandidates({ dimensions, anchorsByDimension, authorityItemsByKind }) {
  if (!Array.isArray(dimensions)) fail("INVALID_REVIEW_RECORD", "dimensions must be an array");
  const candidates = [];
  for (const dimension of dimensions) {
    const anchors = anchorsByDimension?.[dimension.dimension_id] ?? [];
    const items = (dimension.authority_kinds ?? []).flatMap((kind) => authorityItemsByKind?.[kind] ?? []);
    for (const anchor of anchors) {
      for (const item of items) {
        candidates.push(buildCandidate({
          anchor,
          dimension,
          authorityItem: item,
          contextPacket: anchor.context_packet_ref ?? null,
          evidencePolicy: dimension.evidence_policy_ref ?? null
        }));
      }
    }
  }
  return candidates;
}

export function decideApplicability(candidates, decide) {
  if (typeof decide !== "function") fail("INVALID_REVIEW_RECORD", "decide must be a function");
  const decisions = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.record_id)) fail("DUPLICATE_RELATION_KEY", `duplicate candidate ${candidate.record_id}`);
    seen.add(candidate.record_id);
    const status = decide(candidate);
    if (!DECISION_STATUSES.includes(status)) {
      fail("APPLICABILITY_GAP", `invalid decision status ${status} for ${candidate.record_id}`);
    }
    decisions.push(finalizeRecord({
      record_type: "applicability-decision",
      candidate_ref: ref(candidate),
      status,
      reason_code: status === "applicable" ? "matches-scope" : status === "not_applicable" ? "outside-scope" : "undecidable"
    }, `app:${candidate.record_id}`));
  }
  return decisions;
}

export function assertCandidateTotality(candidates, decisions) {
  const decisionByCandidate = new Map();
  for (const decision of decisions) {
    const key = decision.candidate_ref?.id;
    if (decisionByCandidate.has(key)) fail("APPLICABILITY_GAP", `duplicate decision for candidate ${key}`);
    decisionByCandidate.set(key, decision);
  }
  if (decisionByCandidate.size !== candidates.length) {
    fail("APPLICABILITY_GAP", `candidate/decision set mismatch: ${candidates.length} candidates vs ${decisionByCandidate.size} decisions`);
  }
  for (const candidate of candidates) {
    if (!decisionByCandidate.has(candidate.record_id)) {
      fail("APPLICABILITY_GAP", `candidate ${candidate.record_id} has no decision`);
    }
  }
  return true;
}

export function deriveRelationIdentity(relationKeyV1) {
  return deriveIdentity("relation", relationKeyV1, "v1");
}

export function buildExpectedObligations(candidates, decisions, { evidencePolicyRef } = {}) {
  if (!Array.isArray(candidates) || !Array.isArray(decisions)) {
    fail("INVALID_REVIEW_RECORD", "candidates and decisions must be arrays");
  }
  assertCandidateTotality(candidates, decisions);
  const decisionByCandidate = new Map(decisions.map((decision) => [decision.candidate_ref?.id, decision]));
  const relations = [];
  const unknowns = [];
  for (const candidate of candidates) {
    const decision = decisionByCandidate.get(candidate.record_id);
    if (decision.status === "unknown") {
      unknowns.push(decision);
      continue;
    }
    if (decision.status === "not_applicable") continue; // zero relations
    const relationKey = {
      review_anchor_ref: candidate.candidate_key.review_anchor_ref,
      dimension_ref: candidate.candidate_key.dimension_ref,
      authority_item_ref: candidate.candidate_key.authority_item_ref,
      applicability_decision_ref: ref(decision),
      context_packet_ref: candidate.candidate_key.context_packet_ref,
      evidence_policy_ref: evidencePolicyRef ?? candidate.candidate_key.evidence_policy_ref
    };
    const identity = deriveRelationIdentity(relationKey);
    relations.push(finalizeRecord({
      record_type: "relation-obligation",
      relation_key: relationKey,
      required: true
    }, identity.id));
  }
  if (unknowns.length > 0) {
    fail("APPLICABILITY_GAP", `${unknowns.length} unknown decisions block obligation seal`);
  }
  return relations;
}

export function buildIntegrationObligations({ clusters, interactions, boundaryEdges = [] }) {
  if (!Array.isArray(clusters) || !Array.isArray(interactions)) {
    fail("INVALID_REVIEW_RECORD", "clusters and interactions must be arrays");
  }
  const obligations = [];
  for (const cluster of clusters) {
    for (const interaction of interactions) {
      const key = {
        cluster_ref: ref(cluster),
        interaction_ref: ref(interaction),
        participating_dimension_refs: interaction.participating_dimension_refs ?? [],
        boundary_edge_refs: boundaryEdges.map(ref),
        context_packet_ref: cluster.context_packet_ref ?? null
      };
      const identity = deriveIdentity("integration", key, "v1");
      obligations.push(finalizeRecord({
        record_type: "integration-obligation",
        integration_key: key,
        required: true
      }, identity.id));
    }
  }
  return obligations;
}
