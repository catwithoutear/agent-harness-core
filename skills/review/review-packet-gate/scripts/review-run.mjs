#!/usr/bin/env node

/**
 * Portable review-run protocol.
 *
 * This is the sole structured review protocol. It stores canonical,
 * immutable JSON records under a regulated change workspace.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIGEST_PREFIX,
  PROTOCOL,
  ReviewRunError,
  assertCanonicalRef,
  assertPortable,
  canonicalJSONStringify,
  canonicalize,
  deriveIdentity,
  digestValue,
  fail,
  finalizeRecord,
  isCanonicalRef,
  isPlainObject,
  makeCanonicalRef,
  parseJsonStrict,
  recordDigest,
  sha256Text,
  verifyRecordDigest
} from "./review-records.mjs";

export {
  DIGEST_PREFIX,
  PROTOCOL,
  ReviewRunError,
  assertCanonicalRef,
  canonicalJSONStringify,
  canonicalize,
  deriveIdentity,
  digestValue,
  finalizeRecord,
  isCanonicalRef,
  makeCanonicalRef,
  parseJsonStrict,
  recordDigest,
  sha256Text,
  verifyRecordDigest
} from "./review-records.mjs";

// Facade re-exports of the canonical review modules (migration: the facade is
// the single orchestration entry point; each module owns its own semantics).
export * from "./review-subject-input.mjs";
export * from "./review-authority.mjs";
export * from "./review-dimensions.mjs";
export * from "./review-changed-surface.mjs";
export * from "./review-context.mjs";
export * from "./review-obligations.mjs";
export * from "./review-dispatch.mjs";
export * from "./review-provider.mjs";
export * from "./review-discovery.mjs";
export * from "./review-output.mjs";
export * from "./review-store.mjs";
export * from "./review-retry.mjs";
export * from "./review-gates.mjs";

import { buildSubjectInputManifest } from "./review-subject-input.mjs";
import { resolveReviewAuthority } from "./review-authority.mjs";
import { activateDimensions } from "./review-dimensions.mjs";
import { enumerateCandidates, decideApplicability, buildExpectedObligations } from "./review-obligations.mjs";
import { buildAssignmentPackets, validateAssignmentClosure } from "./review-dispatch.mjs";
import { evaluateCoverageGate } from "./review-gates.mjs";
import {
  preflightDeepDispatch,
  selectProvider,
  validateVerifierDiscoveryEnvelope
} from "./review-provider.mjs";

function groupAuthorityByKind(items) {
  const byKind = {};
  for (const item of items) {
    (byKind[item.authority_kind] ??= []).push(item);
  }
  return byKind;
}

/**
 * Facade orchestration of the machine-computable deep-coverage path
 * (subject -> authority -> dimensions -> obligations -> dispatch -> coverage gate).
 *
 * Reviewer outcomes, provider lanes and independent comparison are runtime
 * evidence and remain fail-closed until a real provider produces them; this
 * entry point synthesizes the deterministic expected universe and its
 * `coverage_gate`.
 */
export function runDeepCoverage({
  targetSnapshot,
  normativeSources = [],
  userRequirements = [],
  authorityItems = [],
  dimensions = [],
  anchorsByDimension = {},
  contextGraph = { complete: true },
  surface = {},
  decide = () => "applicable",
  clusterForObligation = () => ({ record_id: "cluster-1", record_digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" })
}) {
  const manifest = buildSubjectInputManifest(targetSnapshot, normativeSources, { userRequirements });
  const authoritySources = normativeSources.map((source) => ({
    source_locator: source.source_locator ?? source.locator,
    source_kind: source.source_kind ?? "catalog",
    scope: source.scope ?? "*",
    precedence: source.precedence ?? 1,
    version: source.version ?? "v1",
    digest: source.digest,
    availability: source.availability ?? "available"
  }));
  const authority = resolveReviewAuthority(authoritySources, authorityItems);
  const dimensionAuthority = activateDimensions(authority, { dimensions });
  const candidates = enumerateCandidates({ dimensions, anchorsByDimension, authorityItemsByKind: groupAuthorityByKind(authorityItems) });
  const decisions = decideApplicability(candidates, decide);
  const obligations = buildExpectedObligations(candidates, decisions);
  const packets = buildAssignmentPackets({ obligations, clusterForObligation });
  const dispatchValid = validateAssignmentClosure(packets, obligations).valid;
  const coverageGate = evaluateCoverageGate({ authority, dimensionAuthority, contextGraph, surface, obligations, dispatchValid });
  return { manifest, authority, dimensionAuthority, candidates, decisions, obligations, packets, dispatchValid, coverageGate };
}

export const MODES = new Set(["quick", "standard", "deep"]);
export const GATES = new Set(["READY", "READY_WITH_NOTES", "NOT_READY", "NEEDS_USER_DECISION"]);
export const LEDGER_STATUSES = new Set(["covered", "not-covered", "not-applicable"]);
export const ATTEMPT_STATUSES = new Set(["succeeded", "failed", "cancelled", "stale", "superseded"]);
export const STATES = new Set([
  "created",
  "discovering",
  "discovery-sealed",
  "planning",
  "dispatch-ready",
  "running",
  "aggregating",
  "completed",
  "cancelled",
  "invalidated"
]);

export const ATTEMPT_FAILURE_KINDS = new Set([
  "ATTEMPT_CANCELLED",
  "ATTEMPT_TIMEOUT",
  "INTERRUPT_CHANNEL_STALLED",
  "PROVIDER_RUNTIME_GAP",
  "RESULT_CHANNEL_STALLED",
  "STALE_REVIEW",
  "TARGET_UNAVAILABLE"
]);

const GATE_EVIDENCE_OWNERS = Object.freeze({
  review_gate: "reviewer",
  independent_review_gate: "review-verifier",
  style_gate: "reviewer",
  implementation_verification_gate: "verification-workflow"
});

const GATE_REQUIRED_EVIDENCE_KINDS = Object.freeze({
  review_gate: "review-ledger",
  independent_review_gate: "discovery-barrier",
  style_gate: "style-ledger",
  implementation_verification_gate: "verification-report"
});

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function verifyInputDigest(value, name) {
  const hasDigest = value.record_digest !== undefined || value.canonical_digest !== undefined;
  if (!hasDigest) return;
  if (typeof value.record_digest !== "string" || typeof value.canonical_digest !== "string" || !verifyRecordDigest(value)) {
    fail("RECORD_DIGEST_MISMATCH", `${name} record digest does not match its content`);
  }
}

function requireObject(value, name) {
  if (!isPlainObject(value)) fail("INVALID_REVIEW_RECORD", `${name} must be an object`);
  return value;
}

function requireString(value, name, { id = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || (id && !ID_RE.test(value))) {
    fail("INVALID_REVIEW_RECORD", `${name} must be a non-empty${id ? " identifier" : " string"}`);
  }
  return value;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) fail("INVALID_REVIEW_RECORD", `${name} must be an array`);
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail("INVALID_REVIEW_REQUEST", `${name} must be a positive integer`);
  }
  return value;
}

export function validateExecutionPolicy(policy) {
  const value = requireObject(policy, "request.execution_policy");
  const allowed = new Set([
    "max_attempts_per_shard",
    "attempt_timeout_ms",
    "run_timeout_ms",
    "discovery_timeout_ms",
    "max_discovery_relations",
    "max_shards",
    "checkpoint_interval_ms"
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail("INVALID_REVIEW_REQUEST", `execution_policy contains unknown fields: ${unknown.join(", ")}`);
  const normalized = Object.fromEntries([...allowed].map((key) => [key, requirePositiveInteger(value[key], `request.execution_policy.${key}`)]));
  if (normalized.attempt_timeout_ms > normalized.run_timeout_ms || normalized.discovery_timeout_ms > normalized.run_timeout_ms) {
    fail("INVALID_REVIEW_REQUEST", "attempt/discovery timeout must not exceed run timeout");
  }
  if (normalized.checkpoint_interval_ms >= normalized.attempt_timeout_ms) {
    fail("INVALID_REVIEW_REQUEST", "checkpoint interval must be shorter than attempt timeout");
  }
  return normalized;
}

function uniqueIds(values, name) {
  const seen = new Set();
  for (const value of values) {
    requireString(value, name, { id: true });
    if (seen.has(value)) fail("INVALID_REVIEW_RECORD", `${name} contains duplicate ${value}`);
    seen.add(value);
  }
  return seen;
}

function normalizeRelation(relation, location = "relation") {
  const item = requireObject(relation, location);
  const relationId = requireString(item.relation_id, `${location}.relation_id`, { id: true });
  const unitKey = requireObject(item.unit_key, `${location}.unit_key`);
  requireString(unitKey.unit_path, `${location}.unit_key.unit_path`);
  requireString(unitKey.anchor_kind, `${location}.unit_key.anchor_kind`);
  requireString(unitKey.anchor_value, `${location}.unit_key.anchor_value`);
  const dimensionId = requireString(item.dimension_id, `${location}.dimension_id`, { id: true });
  const ruleRef = requireObject(item.rule_ref, `${location}.rule_ref`);
  requireString(ruleRef.rule_id, `${location}.rule_ref.rule_id`, { id: true });
  requireString(ruleRef.source_ref, `${location}.rule_ref.source_ref`);
  return { relation_id: relationId, unit_key: unitKey, dimension_id: dimensionId, rule_ref: ruleRef };
}

export function contractWithoutDigest(contract) {
  const copy = structuredClone(requireObject(contract, "dispatch_contract"));
  delete copy.contract_digest;
  return copy;
}

export function validateDispatchContract(contract) {
  const value = requireObject(contract, "dispatch_contract");
  const rules = requireArray(value.rules, "dispatch_contract.rules");
  const scope = requireArray(value.scope, "dispatch_contract.scope");
  const dimensions = requireArray(value.dimensions, "dispatch_contract.dimensions");
  const relations = requireArray(value.relations, "dispatch_contract.relations");
  const ruleIds = uniqueIds(rules.map((item) => requireObject(item, "dispatch_contract.rules[]").rule_id), "rule_id");
  scope.forEach((item, index) => requireString(item, `dispatch_contract.scope[${index}]`));
  const dimensionIds = uniqueIds(dimensions.map((item) => requireObject(item, "dispatch_contract.dimensions[]").dimension_id), "dimension_id");
  const relationIds = new Set();
  const normalizedRelations = relations.map((item, index) => {
    const normalized = normalizeRelation(item, `dispatch_contract.relations[${index}]`);
    if (relationIds.has(normalized.relation_id)) fail("INVALID_REVIEW_RECORD", `duplicate relation ${normalized.relation_id}`);
    relationIds.add(normalized.relation_id);
    if (!dimensionIds.has(normalized.dimension_id)) fail("INVALID_REVIEW_RECORD", `relation ${normalized.relation_id} references unknown dimension ${normalized.dimension_id}`);
    if (!ruleIds.has(normalized.rule_ref.rule_id)) fail("INVALID_REVIEW_RECORD", `relation ${normalized.relation_id} references unknown rule ${normalized.rule_ref.rule_id}`);
    return normalized;
  });
  for (const [index, rule] of rules.entries()) {
    const ruleObject = requireObject(rule, `dispatch_contract.rules[${index}]`);
    requireString(ruleObject.source_ref, `dispatch_contract.rules[${index}].source_ref`);
  }
  if (relations.length === 0) fail("INVALID_REVIEW_RECORD", "dispatch_contract.relations must not be empty");
  const digest = digestValue(contractWithoutDigest(value));
  if (value.contract_digest !== undefined && value.contract_digest !== digest) {
    fail("CONTRACT_DIGEST_MISMATCH", "dispatch contract digest does not match its content", {
      expected: digest,
      actual: value.contract_digest
    });
  }
  return {
    ...value,
    contract_digest: digest,
    rules,
    scope,
    dimensions,
    relations: normalizedRelations
  };
}

function validateTarget(target) {
  const value = requireObject(target, "target");
  requireString(value.fingerprint, "target.fingerprint");
  if (value.files !== undefined) {
    const files = requireArray(value.files, "target.files");
    files.forEach((file, index) => requireString(file, `target.files[${index}]`));
  }
  return value;
}

export function validateRequest(request) {
  const value = requireObject(request, "request");
  if (value.record_type !== "request") fail("INVALID_REVIEW_REQUEST", "record_type must be request");
  if (value.protocol !== PROTOCOL) fail("UNSUPPORTED_REVIEW_PROTOCOL", `protocol must be ${PROTOCOL}`);
  if (value.format !== undefined && value.format !== PROTOCOL) fail("INVALID_REVIEW_REQUEST", `format must be ${PROTOCOL}`);
  if (value.format_version !== undefined && value.format_version !== 1) fail("INVALID_REVIEW_REQUEST", "format_version must be 1");
  requireString(value.request_id, "request.request_id", { id: true });
  requireString(value.run_id ?? value.request_id, "request.run_id", { id: true });
  requireString(value.active_change, "request.active_change", { id: true });
  validateTarget(value.target);
  verifyInputDigest(value, "request");
  if (Array.isArray(value.risk_facts)) {
    value.risk_facts.forEach((fact, index) => {
      const item = requireObject(fact, `request.risk_facts[${index}]`);
      requireString(item.id, `request.risk_facts[${index}].id`, { id: true });
      evidenceList(item.evidence_refs, `request.risk_facts[${index}].evidence_refs`);
    });
  } else {
    requireObject(value.risk_facts, "request.risk_facts");
  }
  const contract = validateDispatchContract(value.dispatch_contract);
  const executionPolicy = validateExecutionPolicy(value.execution_policy);
  const copy = finalizeRecord({
    ...value,
    run_id: value.run_id ?? value.request_id,
    dispatch_contract: contract,
    execution_policy: executionPolicy
  }, `request:${value.request_id}`);
  return copy;
}

export function routeRequest(request) {
  const value = validateRequest(request);
  const risk = Array.isArray(value.risk_facts)
    ? {
        mandatory_deep: value.risk_facts.some((fact) => ["independent_or_exhaustive", "security_or_trust_boundary", "destructive_or_data_loss", "public_or_serialized_contract", "persistence_or_migration", "concurrency_or_lifecycle", "unresolved_impact", "reviewer_conflict"].includes(fact.id)),
        requested_assurance: value.requested_assurance
      }
    : value.risk_facts;
  const requested = value.requested_assurance ?? risk.requested_assurance ?? "standard";
  if (!MODES.has(requested)) fail("INVALID_REVIEW_REQUEST", `unsupported requested assurance ${requested}`);
  const mandatoryDeep = risk.mandatory_deep === true || ["high", "critical"].includes(String(risk.risk_level ?? "").toLowerCase());
  const ownerOverride = value.owner_override ?? {};
  const allowDowngrade = (value.allow_downgrade === true || ownerOverride.mode === "downgrade") && (typeof value.downgrade_reason === "string" || typeof ownerOverride.reason === "string") && (value.downgrade_reason ?? ownerOverride.reason).length > 0;
  const selectedMode = mandatoryDeep && !allowDowngrade ? "deep" : requested;
  const downgrade = mandatoryDeep && allowDowngrade && requested !== "deep";
  const decision = {
    record_type: "routing-decision",
    protocol: PROTOCOL,
    request_id: value.request_id,
    run_id: value.run_id,
    request_digest: value.record_digest,
    contract_digest: value.dispatch_contract.contract_digest,
    policy_version: "review-run-routing",
    mandatory_deep: mandatoryDeep,
    requested_assurance: requested,
    selected_mode: selectedMode,
    downgrade,
    downgrade_reason: downgrade ? (value.downgrade_reason ?? ownerOverride.reason) : null,
    created_at: value.created_at ?? null
  };
  return finalizeRecord(decision, `routing:${value.request_id}`);
}

function relationMap(relations) {
  return new Map(relations.map((relation) => [relation.relation_id, relation]));
}

export function validateDispatchPreflight(preflight, request, routing) {
  const value = requireObject(preflight, "dispatch-preflight");
  if (value.record_type !== "dispatch-preflight" || value.passed !== true) {
    fail("PROVIDER_RUNTIME_GAP", "dispatch preflight must be a passed dispatch-preflight record");
  }
  if (value.run_id !== request.run_id || value.selected_mode !== routing.selected_mode) {
    fail("PROVIDER_RUNTIME_GAP", "dispatch preflight does not match the accepted run");
  }
  if (value.request_ref?.id !== request.record_id || value.request_ref?.digest !== request.record_digest) {
    fail("PROVIDER_RUNTIME_GAP", "dispatch preflight request binding is stale");
  }
  const provider = requireObject(value.provider_binding, "dispatch-preflight.provider_binding");
  if (provider.record_type !== "provider-binding" || !verifyRecordDigest(provider)) {
    fail("PROVIDER_RUNTIME_GAP", "dispatch preflight provider binding is invalid");
  }
  const revalidatedProvider = selectProvider(provider);
  if (revalidatedProvider.record_digest !== provider.record_digest) {
    fail("PROVIDER_RUNTIME_GAP", "dispatch preflight provider binding is not canonical");
  }
  if (value.routing_ref?.id !== routing.record_id || value.routing_ref?.digest !== routing.record_digest) {
    fail("PROVIDER_RUNTIME_GAP", "dispatch preflight routing binding is stale");
  }
  const providerRef = { id: provider.record_id, digest: provider.record_digest };
  validateVerifierDiscoveryEnvelope(value.verifier_discovery_envelope, {
    run_id: request.run_id,
    target_fingerprint: request.target.fingerprint,
    provider_binding_ref: providerRef
  });
  verifyInputDigest(value, "dispatch preflight");
  return value;
}

export function validateDiscovery(discovery, contract, executionPolicy = null) {
  const value = requireObject(discovery, "discovery");
  if (value.record_type !== "discovery") fail("INVALID_DISCOVERY", "record_type must be discovery");
  const normalizedContract = validateDispatchContract(contract);
  if (value.contract_digest !== normalizedContract.contract_digest) fail("CONTRACT_DIGEST_MISMATCH", "discovery contract digest mismatch");
  if (value.discovery_sealed !== true) fail("DISCOVERY_CLOSURE_FAILED", "discovery must be explicitly sealed");
  verifyInputDigest(value, "discovery");
  const relations = requireArray(value.relations, "discovery.relations");
  if (executionPolicy && relations.length > executionPolicy.max_discovery_relations) {
    fail("BOUNDARY_TOO_LARGE", "discovery relation budget exceeded", {
      observed: relations.length,
      maximum: executionPolicy.max_discovery_relations
    });
  }
  const expected = relationMap(normalizedContract.relations);
  const ruleSources = new Map(normalizedContract.rules.map((rule) => [rule.rule_id, rule.source_ref]));
  const dimensionIds = new Set(normalizedContract.dimensions.map((dimension) => dimension.dimension_id));
  const seen = new Set();
  const normalized = relations.map((relation, index) => {
    const raw = requireObject(relation, `discovery.relations[${index}]`);
    const item = normalizeRelation(raw, `discovery.relations[${index}]`);
    if (seen.has(item.relation_id)) fail("DISCOVERY_CLOSURE_FAILED", `discovery duplicates relation ${item.relation_id}`);
    seen.add(item.relation_id);
    if (expected.has(item.relation_id)) {
      const expectedRelation = expected.get(item.relation_id);
      if (canonicalJSONStringify(item) !== canonicalJSONStringify(expectedRelation)) {
        fail("DISCOVERY_CLOSURE_FAILED", `discovery relation ${item.relation_id} differs from dispatch contract`);
      }
      return item;
    }
    if (raw.discovery_origin !== "target-derived") {
      fail("DISCOVERY_CLOSURE_FAILED", `discovery relation ${item.relation_id} is an expansion without discovery_origin=target-derived`);
    }
    if (!dimensionIds.has(item.dimension_id)) {
      fail("DISCOVERY_CLOSURE_FAILED", `discovery relation ${item.relation_id} references unknown dimension ${item.dimension_id}`);
    }
    if (!ruleSources.has(item.rule_ref.rule_id) || ruleSources.get(item.rule_ref.rule_id) !== item.rule_ref.source_ref) {
      fail("DISCOVERY_CLOSURE_FAILED", `discovery relation ${item.relation_id} references an unassigned rule source`);
    }
    return { ...item, discovery_origin: "target-derived" };
  });
  const missing = [...expected.keys()].filter((id) => !seen.has(id));
  if (missing.length > 0) fail("DISCOVERY_CLOSURE_FAILED", "discovery omitted contract relations", { missing });
  requireArray(value.rule_sources, "discovery.rule_sources");
  requireArray(value.unit_keys, "discovery.unit_keys");
  requireArray(value.dimensions, "discovery.dimensions");
  requireArray(value.exclusions, "discovery.exclusions");
  requireArray(value.unknowns, "discovery.unknowns");
  const normalizedRecord = finalizeRecord({ ...value, relations: normalized }, `discovery:${value.run_id ?? "unknown"}`);
  if ((value.record_digest !== undefined || value.canonical_digest !== undefined) && !verifyRecordDigest(normalizedRecord)) fail("RECORD_DIGEST_MISMATCH", "discovery record digest mismatch");
  return normalizedRecord;
}

export function validateShardPlan(plan, discovery) {
  const value = requireObject(plan, "shard-plan");
  if (value.record_type !== "shard-plan") fail("INVALID_SHARD_PLAN", "record_type must be shard-plan");
  if (value.discovery_digest !== discovery.record_digest) fail("DISCOVERY_CLOSURE_FAILED", "shard plan is based on a different discovery record");
  verifyInputDigest(value, "shard plan");
  const shards = requireArray(value.shards, "shard-plan.shards");
  const expected = new Set(discovery.relations.map((relation) => relation.relation_id));
  const owners = new Map();
  for (const [index, shard] of shards.entries()) {
    requireObject(shard, `shard-plan.shards[${index}]`);
    requireString(shard.shard_id, `shard-plan.shards[${index}].shard_id`, { id: true });
    const relationIds = requireArray(shard.relation_ids, `shard-plan.shards[${index}].relation_ids`);
    for (const relationId of relationIds) {
      requireString(relationId, "shard relation id", { id: true });
      if (!expected.has(relationId)) fail("DISCOVERY_CLOSURE_FAILED", `shard plan contains unknown relation ${relationId}`);
      if (owners.has(relationId)) fail("DISCOVERY_CLOSURE_FAILED", `relation ${relationId} has multiple shard owners`);
      owners.set(relationId, shard.shard_id);
    }
  }
  const missing = [...expected].filter((relationId) => !owners.has(relationId));
  if (missing.length > 0) fail("DISCOVERY_CLOSURE_FAILED", "shard plan left relations unassigned", { missing });
  return finalizeRecord(value, `shard-plan:${value.run_id ?? "unknown"}`);
}

function evidenceList(value, location) {
  const evidence = requireArray(value, location);
  if (evidence.length === 0) fail("EVIDENCE_INVALID", `${location} must not be empty`);
  for (const [index, item] of evidence.entries()) {
    const evidenceItem = requireObject(item, `${location}[${index}]`);
    requireString(evidenceItem.kind, `${location}[${index}].kind`);
    requireString(evidenceItem.ref, `${location}[${index}].ref`);
    if (evidenceItem.ref.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(evidenceItem.ref)) fail("NON_PORTABLE_RECORD", `${location}[${index}].ref must be portable`);
  }
  return evidence;
}

export function validateLedger(ledger, discovery, shardPlan = null) {
  const value = requireObject(ledger, "review-ledger");
  if (value.record_type !== "review-ledger") fail("INVALID_LEDGER", "record_type must be review-ledger");
  if (value.contract_digest !== discovery.contract_digest) fail("CONTRACT_DIGEST_MISMATCH", "ledger contract digest mismatch");
  if (value.discovery_digest !== discovery.record_digest) fail("DISCOVERY_CLOSURE_FAILED", "ledger discovery digest mismatch");
  verifyInputDigest(value, "ledger");
  requireString(value.attempt_id, "ledger.attempt_id", { id: true });
  requireString(value.input_digest, "ledger.input_digest");
  const attemptStatus = value.attempt_status ?? "succeeded";
  if (!ATTEMPT_STATUSES.has(attemptStatus)) fail("INVALID_LEDGER", `unsupported attempt status ${attemptStatus}`);
  const entries = requireArray(value.entries, "ledger.entries");
  if (attemptStatus !== "succeeded") {
    const failure = requireObject(value.failure, "ledger.failure");
    if (!ATTEMPT_FAILURE_KINDS.has(failure.kind)) fail("INVALID_LEDGER", `unsupported failure kind ${failure.kind}`);
    requireString(failure.phase, "ledger.failure.phase", { id: true });
    requireString(failure.message, "ledger.failure.message");
    if (failure.diagnostic_checkpoint !== undefined && failure.diagnostic_checkpoint !== null) {
      const checkpoint = requireObject(failure.diagnostic_checkpoint, "ledger.failure.diagnostic_checkpoint");
      if (checkpoint.coverage_eligible !== false || checkpoint.independent_evidence !== false) {
        fail("INVALID_LEDGER", "diagnostic checkpoint must be explicitly ineligible for coverage and independent evidence");
      }
    }
    if (entries.length > 0) fail("INVALID_LEDGER", "non-success ledger entries must be empty diagnostic evidence");
  }
  const expected = relationMap(discovery.relations);
  const shardAssigned = shardPlan ? new Set() : null;
  if (shardPlan) {
    requireString(value.shard_id, "ledger.shard_id", { id: true });
    const shard = (shardPlan.shards ?? []).find((candidate) => candidate.shard_id === value.shard_id);
    if (!shard) fail("INVALID_LEDGER", `ledger references unknown shard ${value.shard_id}`);
    for (const relationId of shard.relation_ids ?? []) shardAssigned.add(relationId);
  }
  const seen = new Set();
  const normalizedEntries = entries.map((entry, index) => {
    const item = requireObject(entry, `ledger.entries[${index}]`);
    const relationId = requireString(item.relation_id, `ledger.entries[${index}].relation_id`, { id: true });
    if (!expected.has(relationId)) fail("INVALID_LEDGER", `ledger contains unknown relation ${relationId}`);
    if (seen.has(relationId)) fail("INVALID_LEDGER", `ledger duplicates relation ${relationId}`);
    if (shardPlan && !shardAssigned.has(relationId)) fail("INVALID_LEDGER", `ledger relation ${relationId} is outside shard ${value.shard_id}`);
    seen.add(relationId);
    const expectedRelation = normalizeRelation(expected.get(relationId), `discovery.relations.${relationId}`);
    const observedRelation = normalizeRelation({
      relation_id: relationId,
      unit_key: item.unit_key,
      dimension_id: item.dimension_id,
      rule_ref: item.rule_ref
    }, `ledger.entries[${index}]`);
    if (canonicalJSONStringify(observedRelation) !== canonicalJSONStringify(expectedRelation)) {
      fail("INVALID_LEDGER", `ledger relation ${relationId} identity differs from discovery`);
    }
    if (!LEDGER_STATUSES.has(item.status)) fail("INVALID_LEDGER", `unsupported ledger status ${item.status}`);
    const evidence = evidenceList(item.evidence, `ledger.entries[${index}].evidence`);
    if (item.status === "not-applicable") {
      const applicability = requireObject(item.applicability, `ledger.entries[${index}].applicability`);
      if (applicability.authority !== "reviewer") fail("INVALID_LEDGER", `not-applicable relation ${relationId} requires reviewer authority`);
      if (applicability.inferred === true) fail("INVALID_LEDGER", `not-applicable relation ${relationId} cannot be inferred`);
      requireString(applicability.rationale, `ledger.entries[${index}].applicability.rationale`);
    }
    return { ...item, ...observedRelation, relation_id: relationId, evidence };
  });
  if (attemptStatus === "succeeded" && normalizedEntries.length === 0) fail("INVALID_LEDGER", "successful ledger.entries must not be empty");
  const normalizedRecord = finalizeRecord({ ...value, attempt_status: attemptStatus, entries: normalizedEntries }, `attempt:${value.attempt_id}`);
  if ((value.record_digest !== undefined || value.canonical_digest !== undefined) && !verifyRecordDigest(normalizedRecord)) fail("RECORD_DIGEST_MISMATCH", "ledger record digest mismatch");
  return normalizedRecord;
}

function gateForCoverage(gaps, entries) {
  if (gaps.length > 0) return "NOT_READY";
  return entries.some((entry) => entry.status === "not-applicable") ? "READY_WITH_NOTES" : "READY";
}

function uniqueFailureRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = canonicalJSONStringify(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function aggregateCoverage(discovery, ledgers, control = {}) {
  const normalizedDiscovery = requireObject(discovery, "discovery");
  if (normalizedDiscovery.record_type !== "discovery" || normalizedDiscovery.discovery_sealed !== true) {
    fail("DISCOVERY_CLOSURE_FAILED", "coverage aggregation requires a sealed discovery record");
  }
  const normalizedLedgers = ledgers.map((ledger) => validateLedger(ledger, normalizedDiscovery));
  const acceptedLedgers = normalizedLedgers.filter((ledger) => ledger.attempt_status === "succeeded");
  const expected = relationMap(normalizedDiscovery.relations);
  const entriesByRelation = new Map();
  const invalid = normalizedLedgers
    .filter((ledger) => ledger.attempt_status !== "succeeded")
    .map((ledger) => ({
      attempt_id: ledger.attempt_id,
      shard_id: ledger.shard_id ?? null,
      status: ledger.attempt_status,
      failure_kind: ledger.failure?.kind ?? null
    }));
  for (const ledger of acceptedLedgers) {
    for (const entry of ledger.entries) {
      const list = entriesByRelation.get(entry.relation_id) ?? [];
      list.push({ ...entry, attempt_id: ledger.attempt_id });
      entriesByRelation.set(entry.relation_id, list);
    }
  }
  const gaps = [];
  for (const relationId of expected.keys()) {
    const entries = entriesByRelation.get(relationId) ?? [];
    if (entries.length === 0) {
      gaps.push({ type: "MISSING_RELATION", relation_id: relationId });
    } else if (entries.length > 1) {
      gaps.push({ type: "DUPLICATE_RELATION", relation_id: relationId, attempts: entries.map((entry) => entry.attempt_id) });
    } else if (entries[0].status === "not-covered") {
      gaps.push({ type: "NOT_COVERED", relation_id: relationId, evidence: entries[0].evidence });
    }
  }
  const report = {
    record_type: "aggregate-report",
    protocol: PROTOCOL,
    run_id: discovery.run_id,
    contract_digest: discovery.contract_digest,
    discovery_digest: discovery.record_digest,
    control_digest: control.record_digest ?? null,
    expected_relation_count: expected.size,
    observed_relation_count: entriesByRelation.size,
    successful_attempt_count: acceptedLedgers.length,
    successful_attempt_refs: acceptedLedgers.map((ledger) => ({ id: ledger.record_id, digest: ledger.record_digest })),
    exact_gaps: gaps,
    invalid_attempts: invalid,
    failed_or_stale: uniqueFailureRecords([...(control.failed_or_stale ?? []), ...invalid]),
    boundary_facts: discovery.boundary_facts ?? [],
    coverage_gate: gateForCoverage(gaps, [...entriesByRelation.values()].flat()),
    terminal_reason: gaps.length > 0 ? "coverage_not_closed" : "coverage_closed"
  };
  return finalizeRecord(report, `aggregate:${discovery.run_id}`);
}

function resolveGateEvidence(gateEvidence, gateName) {
  const expectedOwner = GATE_EVIDENCE_OWNERS[gateName];
  const matches = gateEvidence.filter((item) => item?.gate_name === gateName);
  if (matches.length !== 1) {
    return {
      gate_name: gateName,
      owner: expectedOwner,
      status: "NOT_READY",
      evidence: [],
      blocking_reasons: [matches.length === 0 ? "GATE_EVIDENCE_MISSING" : "GATE_EVIDENCE_DUPLICATE"]
    };
  }
  const item = requireObject(matches[0], `gate evidence ${gateName}`);
  if (item.owner !== expectedOwner) {
    return {
      gate_name: gateName,
      owner: expectedOwner,
      status: "NOT_READY",
      evidence: [],
      blocking_reasons: [`GATE_OWNER_MISMATCH:${item.owner ?? "missing"}`]
    };
  }
  if (!isCanonicalRef(item.owner_receipt_ref)) {
    return {
      gate_name: gateName,
      owner: expectedOwner,
      status: "NOT_READY",
      evidence: [],
      blocking_reasons: ["GATE_OWNER_RECEIPT_MISSING"]
    };
  }
  if (!GATES.has(item.status)) {
    return {
      gate_name: gateName,
      owner: expectedOwner,
      status: "NOT_READY",
      evidence: [],
      blocking_reasons: [`INVALID_GATE_STATUS:${item.status ?? "missing"}`]
    };
  }
  let evidence;
  try {
    evidence = evidenceList(item.evidence, `gate evidence ${gateName}.evidence`);
  } catch (error) {
    return {
      gate_name: gateName,
      owner: expectedOwner,
      status: "NOT_READY",
      evidence: [],
      blocking_reasons: [error.code ?? "EVIDENCE_INVALID"]
    };
  }
  const requiredKind = GATE_REQUIRED_EVIDENCE_KINDS[gateName];
  if (!evidence.some((item) => item.kind === requiredKind)) {
    return {
      gate_name: gateName,
      owner: expectedOwner,
      owner_receipt_ref: item.owner_receipt_ref,
      status: "NOT_READY",
      evidence,
      blocking_reasons: [`GATE_EVIDENCE_KIND_MISSING:${requiredKind}`]
    };
  }
  if (item.status === "READY_WITH_NOTES" && (!Array.isArray(item.notes) || item.notes.length === 0)) {
    return {
      gate_name: gateName,
      owner: expectedOwner,
      status: "NOT_READY",
      evidence,
      blocking_reasons: ["READY_WITH_NOTES_REQUIRES_NOTES"]
    };
  }
  return {
    gate_name: gateName,
    owner: expectedOwner,
    owner_receipt_ref: item.owner_receipt_ref,
    status: item.status,
    evidence,
    notes: item.notes ?? [],
    blocking_reasons: item.blocking_reasons ?? []
  };
}

function normalizeCoordinatorSourceAssessment(assessment) {
  if (assessment === undefined || assessment === null) return null;
  const value = requireObject(assessment, "coordinator_source_assessment");
  if (value.owner !== "coordinator") fail("GATE_OWNER_MISMATCH", "coordinator source assessment owner must be coordinator");
  if (!GATES.has(value.status)) fail("INVALID_GATE_RESULT", `coordinator source assessment has invalid status ${value.status}`);
  return {
    owner: "coordinator",
    status: value.status,
    evidence: evidenceList(value.evidence, "coordinator_source_assessment.evidence"),
    notes: value.notes ?? [],
    gating: false
  };
}

export function composeGateResult({
  aggregate,
  selectedMode = "standard",
  gateEvidence = [],
  coordinatorSourceAssessment = null,
  residualRisk = []
}) {
  if (!aggregate || aggregate.record_type !== "aggregate-report") fail("INVALID_GATE_RESULT", "aggregate report is required");
  if (!GATES.has(aggregate.coverage_gate)) fail("INVALID_GATE_RESULT", `coverage_gate has invalid value ${aggregate.coverage_gate}`);
  if (!Array.isArray(gateEvidence)) fail("INVALID_GATE_RESULT", "gateEvidence must be an array");
  const resolved = Object.fromEntries(Object.keys(GATE_EVIDENCE_OWNERS).map((name) => [name, resolveGateEvidence(gateEvidence, name)]));
  if ((aggregate.successful_attempt_count ?? 0) === 0 && ["READY", "READY_WITH_NOTES"].includes(resolved.review_gate.status)) {
    resolved.review_gate = {
      ...resolved.review_gate,
      status: "NOT_READY",
      blocking_reasons: ["REVIEW_LEDGER_MISSING"]
    };
  }
  const independentClosed = ["READY", "READY_WITH_NOTES"].includes(resolved.independent_review_gate.status);
  const coverageGate = selectedMode === "deep" && !independentClosed ? "NOT_READY" : aggregate.coverage_gate;
  const gates = [
    coverageGate,
    resolved.review_gate.status,
    resolved.independent_review_gate.status,
    resolved.style_gate.status,
    resolved.implementation_verification_gate.status
  ];
  const overallGate = gates.includes("NOT_READY") ? "NOT_READY" : gates.includes("NEEDS_USER_DECISION") ? "NEEDS_USER_DECISION" : gates.includes("READY_WITH_NOTES") ? "READY_WITH_NOTES" : "READY";
  const coordinatorAssessment = normalizeCoordinatorSourceAssessment(coordinatorSourceAssessment);
  const result = {
    record_type: "gate-result",
    protocol: PROTOCOL,
    run_id: aggregate.run_id,
    aggregate_digest: aggregate.record_digest,
    coverage_gate: coverageGate,
    coordinator_coverage_assessment: aggregate.coverage_gate,
    review_gate: resolved.review_gate.status,
    independent_review_gate: resolved.independent_review_gate.status,
    style_gate: resolved.style_gate.status,
    implementation_verification_gate: resolved.implementation_verification_gate.status,
    overall_gate: overallGate,
    gate_evidence: Object.values(resolved),
    coordinator_source_assessment: coordinatorAssessment,
    gate_failures: [
      ...(selectedMode === "deep" && !independentClosed ? ["INDEPENDENT_DISCOVERY_NOT_CLOSED"] : []),
      ...Object.values(resolved).flatMap((item) => item.blocking_reasons ?? [])
    ],
    residual_risk: residualRisk,
    owner: "coordinator"
  };
  return finalizeRecord(result, `gate-result:${aggregate.run_id}`);
}

function assertRunId(runRoot) {
  const runId = path.basename(path.resolve(runRoot));
  if (!ID_RE.test(runId) || runId === "." || runId === "..") fail("INVALID_RUN_ID", `invalid run id ${runId}`);
  return runId;
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(temporary, `${canonicalJSONStringify(value)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function readRecord(filePath) {
  if (!fs.existsSync(filePath)) fail("RUN_RECORD_MISSING", `missing run record ${filePath}`);
  return parseJsonStrict(fs.readFileSync(filePath, "utf8"), filePath);
}

function recordPath(runRoot, recordType) {
  const names = {
    request: "request.json",
    "routing-decision": "routing-decision.json",
    "dispatch-preflight": "dispatch-preflight.json",
    discovery: "discovery.json",
    "shard-plan": "shard-plan.json",
    "aggregate-report": "aggregate-report.json",
    "gate-result": "gate-result.json"
  };
  if (!names[recordType]) fail("INVALID_REVIEW_RECORD", `record type ${recordType} has no singleton path`);
  return path.join(runRoot, names[recordType]);
}

function readControl(runRoot) {
  return readRecord(path.join(runRoot, "control", "current.json"));
}

function writeControl(runRoot, current, expectedEpoch = null) {
  const lockPath = path.join(runRoot, "control", ".coordinator.lock");
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, "wx");
  } catch {
    fail("COORDINATOR_FENCED", "another coordinator currently owns the control update");
  }
  try {
    const previous = fs.existsSync(path.join(runRoot, "control", "current.json")) ? readControl(runRoot) : null;
    if (expectedEpoch !== null && previous?.epoch !== expectedEpoch) fail("COORDINATOR_FENCED", "control epoch changed before write");
    const epoch = (previous?.epoch ?? 0) + 1;
    const revision = {
      record_type: "control-revision",
      protocol: PROTOCOL,
      run_id: current.run_id,
      predecessor: previous?.record_digest ?? null,
      epoch,
      state: current.state,
      required_slots: current.required_slots ?? [],
      accepted_attempt_digests: current.accepted_attempt_digests ?? [],
      failed_or_stale: current.failed_or_stale ?? [],
      active_attempts: current.active_attempts ?? [],
      run_started_at: current.run_started_at ?? null,
      run_deadline_at: current.run_deadline_at ?? null,
      preflight_digest: current.preflight_digest ?? null,
      terminal_reason: current.terminal_reason ?? null
    };
    const withDigest = finalizeRecord(revision, `control:${current.run_id}:${epoch}`);
    atomicWrite(path.join(runRoot, "control", "revisions", `${String(epoch).padStart(6, "0")}.json`), withDigest);
    atomicWrite(path.join(runRoot, "control", "current.json"), withDigest);
    return withDigest;
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lockPath);
  }
}

function ensureRunRoot(runRoot) {
  const resolved = path.resolve(runRoot);
  const runId = assertRunId(resolved);
  fs.mkdirSync(path.join(resolved, "control", "revisions"), { recursive: true });
  fs.mkdirSync(path.join(resolved, "attempts"), { recursive: true });
  if (!fs.existsSync(path.join(resolved, "control", "current.json"))) {
    writeControl(resolved, { run_id: runId, state: "created" });
  }
  return resolved;
}

export function initializeRunRoot(runRoot) {
  return ensureRunRoot(runRoot);
}

function writeSingleton(runRoot, record) {
  const filePath = recordPath(runRoot, record.record_type);
  if (fs.existsSync(filePath)) {
    const existing = readRecord(filePath);
    if (existing.record_digest === record.record_digest) return existing;
    fail("REQUEST_ID_CONFLICT", `${record.record_type} already exists with a different digest`);
  }
  atomicWrite(filePath, record);
  return record;
}

export function acceptRun(runRoot, request, { now = Date.now } = {}) {
  const root = ensureRunRoot(runRoot);
  const normalized = validateRequest(request);
  const runId = path.basename(root);
  if (normalized.run_id !== runId) fail("REQUEST_ID_CONFLICT", "request run_id does not match run root");
  const existingRequest = fs.existsSync(recordPath(root, "request")) ? readRecord(recordPath(root, "request")) : null;
  if (existingRequest && existingRequest.record_digest !== normalized.record_digest) fail("REQUEST_ID_CONFLICT", "run already accepted a different request");
  const routing = routeRequest(normalized);
  const preflight = preflightDeepDispatch({ request: normalized, routing });
  const acceptedAt = now();
  if (!Number.isFinite(acceptedAt)) fail("INVALID_REVIEW_RECORD", "clock returned an invalid timestamp");
  writeSingleton(root, normalized);
  writeSingleton(root, routing);
  if (preflight) writeSingleton(root, preflight);
  const control = readControl(root);
  if (control.state === "created") {
    writeControl(root, {
      ...control,
      state: "discovering",
      run_started_at: acceptedAt,
      run_deadline_at: acceptedAt + normalized.execution_policy.run_timeout_ms,
      preflight_digest: preflight?.record_digest ?? null
    }, control.epoch);
  }
  return { request: normalized, routing, preflight, control: readControl(root) };
}

export function verifierPhaseAPacket(runRoot) {
  const root = ensureRunRoot(runRoot);
  const routing = readRecord(recordPath(root, "routing-decision"));
  if (routing.selected_mode !== "deep") fail("INVALID_STATE_TRANSITION", "Phase A packet is required only for deep review");
  const preflight = readRecord(recordPath(root, "dispatch-preflight"));
  const request = validateRequest(readRecord(recordPath(root, "request")));
  return validateDispatchPreflight(preflight, request, routing).verifier_discovery_envelope;
}

export function persistDiscovery(runRoot, discovery, { now = Date.now } = {}) {
  const root = ensureRunRoot(runRoot);
  const request = validateRequest(readRecord(recordPath(root, "request")));
  const control = readControl(root);
  if (control.state !== "discovering") fail("INVALID_STATE_TRANSITION", `cannot seal discovery in ${control.state}`);
  if (now() > control.run_started_at + request.execution_policy.discovery_timeout_ms) {
    fail("DISCOVERY_TIMEOUT", "discovery exceeded its declared time budget");
  }
  const routing = readRecord(recordPath(root, "routing-decision"));
  if (routing.selected_mode === "deep") {
    const preflight = readRecord(recordPath(root, "dispatch-preflight"));
    validateDispatchPreflight(preflight, request, routing);
  }
  const normalized = validateDiscovery(
    { ...discovery, run_id: discovery.run_id ?? request.run_id },
    request.dispatch_contract,
    request.execution_policy
  );
  writeSingleton(root, normalized);
  writeControl(root, { ...control, state: "discovery-sealed" }, control.epoch);
  return normalized;
}

export function beginShardPlanning(runRoot) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  if (control.state !== "discovery-sealed") {
    fail("INVALID_STATE_TRANSITION", `cannot begin shard planning in ${control.state}`);
  }
  return writeControl(root, { ...control, state: "planning" }, control.epoch);
}

export function persistShardPlan(runRoot, plan) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  if (control.state !== "planning") fail("INVALID_STATE_TRANSITION", `cannot persist shard plan in ${control.state}`);
  const discovery = readRecord(recordPath(root, "discovery"));
  const normalized = validateShardPlan(plan, discovery);
  const request = validateRequest(readRecord(recordPath(root, "request")));
  if (normalized.shards.length > request.execution_policy.max_shards) {
    fail("BOUNDARY_TOO_LARGE", "shard plan exceeds max_shards", {
      observed: normalized.shards.length,
      maximum: request.execution_policy.max_shards
    });
  }
  writeSingleton(root, normalized);
  writeControl(root, { ...control, state: "dispatch-ready", required_slots: normalized.shards.map((shard) => shard.shard_id) }, control.epoch);
  return normalized;
}

export function dispatchRun(runRoot) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  if (control.state !== "dispatch-ready") fail("INVALID_STATE_TRANSITION", `cannot dispatch reviewers in ${control.state}`);
  readRecord(recordPath(root, "shard-plan"));
  return writeControl(root, { ...control, state: "running" }, control.epoch);
}

function attemptFile(root, attemptId) {
  return path.join(root, "attempts", `${attemptId}.json`);
}

function activeAttempt(control, attemptId) {
  return (control.active_attempts ?? []).find((attempt) => attempt.attempt_id === attemptId) ?? null;
}

function terminalAttempts(root, shardId) {
  return fs
    .readdirSync(path.join(root, "attempts"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => readRecord(path.join(root, "attempts", name)))
    .filter((attempt) => attempt.shard_id === shardId);
}

export function admitAttempt(runRoot, attempt, { now = Date.now } = {}) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  if (control.state !== "running") fail("INVALID_STATE_TRANSITION", `cannot admit attempt in ${control.state}`);
  const value = requireObject(attempt, "attempt admission");
  const attemptId = requireString(value.attempt_id, "attempt.attempt_id", { id: true });
  const shardId = requireString(value.shard_id, "attempt.shard_id", { id: true });
  const inputDigest = requireString(value.input_digest, "attempt.input_digest");
  const phase = requireString(value.phase ?? "correctness-review", "attempt.phase", { id: true });
  const plan = readRecord(recordPath(root, "shard-plan"));
  if (!(plan.shards ?? []).some((shard) => shard.shard_id === shardId)) fail("INVALID_LEDGER", `attempt references unknown shard ${shardId}`);
  if (fs.existsSync(attemptFile(root, attemptId))) fail("REQUEST_ID_CONFLICT", `attempt ${attemptId} is already terminal`);
  const existing = activeAttempt(control, attemptId);
  if (existing) {
    if (existing.input_digest !== inputDigest || existing.shard_id !== shardId) {
      fail("REQUEST_ID_CONFLICT", `attempt ${attemptId} was admitted with different inputs`);
    }
    return existing;
  }
  const request = validateRequest(readRecord(recordPath(root, "request")));
  const priorCount = terminalAttempts(root, shardId).length + (control.active_attempts ?? []).filter((item) => item.shard_id === shardId).length;
  if (priorCount >= request.execution_policy.max_attempts_per_shard) {
    fail("RETRY_EXHAUSTED", `attempt budget exhausted for shard ${shardId}`);
  }
  const admittedAt = now();
  if (admittedAt >= control.run_deadline_at) fail("RUN_DEADLINE_EXCEEDED", "review run deadline has expired");
  const admitted = {
    attempt_id: attemptId,
    shard_id: shardId,
    input_digest: inputDigest,
    phase,
    admitted_at: admittedAt,
    deadline_at: Math.min(admittedAt + request.execution_policy.attempt_timeout_ms, control.run_deadline_at),
    checkpoint: null
  };
  writeControl(root, { ...control, active_attempts: [...(control.active_attempts ?? []), admitted] }, control.epoch);
  return admitted;
}

export function checkpointAttempt(runRoot, checkpoint, { now = Date.now } = {}) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  if (control.state !== "running") fail("INVALID_STATE_TRANSITION", `cannot checkpoint attempt in ${control.state}`);
  const value = requireObject(checkpoint, "attempt checkpoint");
  const attemptId = requireString(value.attempt_id, "checkpoint.attempt_id", { id: true });
  const active = activeAttempt(control, attemptId);
  if (!active) fail("ATTEMPT_TIMEOUT", `attempt ${attemptId} is not active`);
  const recordedAt = now();
  if (recordedAt >= active.deadline_at) fail("ATTEMPT_TIMEOUT", `attempt ${attemptId} exceeded its deadline`);
  const evidence = value.evidence === undefined ? [] : evidenceList(value.evidence, "checkpoint.evidence");
  const diagnostic = {
    checkpoint_id: requireString(value.checkpoint_id, "checkpoint.checkpoint_id", { id: true }),
    phase: requireString(value.phase, "checkpoint.phase", { id: true }),
    summary: requireString(value.summary, "checkpoint.summary"),
    evidence,
    recorded_at: recordedAt,
    coverage_eligible: false,
    independent_evidence: false
  };
  const updated = (control.active_attempts ?? []).map((item) => item.attempt_id === attemptId ? { ...item, checkpoint: diagnostic } : item);
  writeControl(root, { ...control, active_attempts: updated }, control.epoch);
  return diagnostic;
}

function persistFinalAttempt(root, normalized, control) {
  atomicWrite(attemptFile(root, normalized.attempt_id), normalized);
  const remaining = (control.active_attempts ?? []).filter((attempt) => attempt.attempt_id !== normalized.attempt_id);
  writeControl(root, {
    ...control,
    state: "running",
    active_attempts: remaining,
    accepted_attempt_digests: normalized.attempt_status === "succeeded"
      ? [...(control.accepted_attempt_digests ?? []), normalized.record_digest]
      : control.accepted_attempt_digests ?? [],
    failed_or_stale: normalized.attempt_status === "succeeded"
      ? control.failed_or_stale ?? []
      : [...(control.failed_or_stale ?? []), {
          attempt_id: normalized.attempt_id,
          shard_id: normalized.shard_id ?? null,
          status: normalized.attempt_status,
          failure_kind: normalized.failure?.kind ?? null
        }]
  }, control.epoch);
  return normalized;
}

export function appendLedgerAttempt(runRoot, ledger, { now = Date.now, allowExpired = false } = {}) {
  const root = ensureRunRoot(runRoot);
  const discovery = readRecord(recordPath(root, "discovery"));
  const plan = fs.existsSync(recordPath(root, "shard-plan")) ? readRecord(recordPath(root, "shard-plan")) : null;
  const normalized = validateLedger(ledger, discovery, plan);
  const attemptPath = attemptFile(root, normalized.attempt_id);
  if (fs.existsSync(attemptPath)) {
    const existing = readRecord(attemptPath);
    if (existing.record_digest !== normalized.record_digest) fail("LATE_RESULT_REJECTED", `attempt ${normalized.attempt_id} already has a terminal result`);
    const control = readControl(root);
    if (activeAttempt(control, normalized.attempt_id)) return persistFinalAttempt(root, existing, control);
    return existing;
  }
  const control = readControl(root);
  if (control.state !== "running") fail("INVALID_STATE_TRANSITION", `cannot complete attempt in ${control.state}`);
  const active = activeAttempt(control, normalized.attempt_id);
  if (!active) fail("ATTEMPT_NOT_ADMITTED", `attempt ${normalized.attempt_id} was not admitted`);
  if (active.shard_id !== normalized.shard_id || active.input_digest !== normalized.input_digest) {
    fail("INVALID_LEDGER", `attempt ${normalized.attempt_id} does not match its admission`);
  }
  if (!allowExpired && now() >= active.deadline_at) {
    fail("LATE_RESULT_REJECTED", `attempt ${normalized.attempt_id} completed after its deadline`);
  }
  return persistFinalAttempt(root, normalized, control);
}

export function failAttempt(runRoot, failure, { now = Date.now, allowExpired = false } = {}) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  const value = requireObject(failure, "attempt failure");
  const attemptId = requireString(value.attempt_id, "failure.attempt_id", { id: true });
  const active = activeAttempt(control, attemptId);
  if (!active) fail("ATTEMPT_NOT_ADMITTED", `attempt ${attemptId} was not admitted`);
  if (!ATTEMPT_FAILURE_KINDS.has(value.kind)) fail("INVALID_LEDGER", `unsupported failure kind ${value.kind}`);
  const request = validateRequest(readRecord(recordPath(root, "request")));
  const discovery = readRecord(recordPath(root, "discovery"));
  const ledger = {
    record_type: "review-ledger",
    protocol: PROTOCOL,
    run_id: request.run_id,
    attempt_id: attemptId,
    shard_id: active.shard_id,
    input_digest: active.input_digest,
    contract_digest: request.dispatch_contract.contract_digest,
    discovery_digest: discovery.record_digest,
    attempt_status: value.kind === "ATTEMPT_CANCELLED" ? "cancelled" : "failed",
    entries: [],
    failure: {
      kind: value.kind,
      phase: value.phase ?? active.phase,
      message: value.message,
      recorded_at: now(),
      diagnostic_checkpoint: active.checkpoint
    }
  };
  return appendLedgerAttempt(root, ledger, { now, allowExpired });
}

export function expireAttempt(runRoot, attemptId, { now = Date.now } = {}) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  const active = activeAttempt(control, attemptId);
  if (!active) fail("ATTEMPT_NOT_ADMITTED", `attempt ${attemptId} was not admitted`);
  if (now() < active.deadline_at) fail("ATTEMPT_NOT_EXPIRED", `attempt ${attemptId} has not reached its deadline`);
  return failAttempt(root, {
    attempt_id: attemptId,
    kind: "ATTEMPT_TIMEOUT",
    phase: active.phase,
    message: `attempt exceeded deadline ${active.deadline_at}`
  }, { now, allowExpired: true });
}

export function sweepExpiredAttempts(runRoot, { now = Date.now } = {}) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  const observedAt = now();
  const expired = (control.active_attempts ?? []).filter((attempt) => observedAt >= attempt.deadline_at);
  return expired.map((attempt) => expireAttempt(root, attempt.attempt_id, { now: () => observedAt }));
}

export function aggregateRun(runRoot, options = {}) {
  const root = ensureRunRoot(runRoot);
  sweepExpiredAttempts(root, { now: options.now ?? Date.now });
  const discovery = readRecord(recordPath(root, "discovery"));
  const attemptFiles = fs.readdirSync(path.join(root, "attempts")).filter((name) => name.endsWith(".json")).sort();
  const ledgers = attemptFiles.map((name) => readRecord(path.join(root, "attempts", name)));
  const control = readControl(root);
  if (control.state !== "running" && control.state !== "aggregating") fail("INVALID_STATE_TRANSITION", `cannot aggregate in ${control.state}`);
  if ((control.active_attempts ?? []).length > 0) {
    fail("ATTEMPT_STILL_RUNNING", "cannot aggregate while attempts remain active", {
      attempt_ids: control.active_attempts.map((attempt) => attempt.attempt_id)
    });
  }
  const plan = fs.existsSync(recordPath(root, "shard-plan")) ? readRecord(recordPath(root, "shard-plan")) : null;
  if (!plan) fail("DISCOVERY_CLOSURE_FAILED", "cannot aggregate before shard plan is persisted");
  let report = aggregateCoverage(discovery, ledgers, control);
  if (options.terminalReason) {
    report = finalizeRecord({
      ...report,
      coverage_gate: "NOT_READY",
      terminal_reason: options.terminalReason
    }, `aggregate:${discovery.run_id}`);
  }
  writeControl(root, { ...control, state: "aggregating" }, control.epoch);
  const storedReport = writeSingleton(root, report);
  const routing = readRecord(recordPath(root, "routing-decision"));
  const gateResult = composeGateResult({
    aggregate: storedReport,
    selectedMode: routing.selected_mode,
    gateEvidence: options.gateEvidence ?? [],
    coordinatorSourceAssessment: options.coordinatorSourceAssessment ?? null,
    residualRisk: options.residualRisk ?? []
  });
  writeSingleton(root, gateResult);
  const terminal = "completed";
  writeControl(root, { ...readControl(root), state: terminal, terminal_reason: report.terminal_reason }, readControl(root).epoch);
  return { aggregate: storedReport, gate_result: gateResult, control: readControl(root) };
}

function persistTerminalFailure(root, control, reason) {
  const requestPath = recordPath(root, "request");
  const discoveryPath = recordPath(root, "discovery");
  const request = fs.existsSync(requestPath) ? readRecord(requestPath) : null;
  const discovery = fs.existsSync(discoveryPath) ? readRecord(discoveryPath) : null;
  const gap = discovery
    ? { type: "SHARD_PLAN_NOT_PERSISTED" }
    : { type: "DISCOVERY_NOT_SEALED" };
  const aggregate = finalizeRecord({
    record_type: "aggregate-report",
    protocol: PROTOCOL,
    run_id: control.run_id,
    contract_digest: request?.dispatch_contract?.contract_digest ?? null,
    discovery_digest: discovery?.record_digest ?? null,
    control_digest: control.record_digest ?? null,
    expected_relation_count: discovery?.relations?.length ?? 0,
    observed_relation_count: 0,
    successful_attempt_count: 0,
    successful_attempt_refs: [],
    exact_gaps: [gap],
    invalid_attempts: [],
    failed_or_stale: control.failed_or_stale ?? [],
    boundary_facts: discovery?.boundary_facts ?? [],
    coverage_gate: "NOT_READY",
    terminal_reason: reason
  }, `aggregate:${control.run_id}`);
  const storedAggregate = writeSingleton(root, aggregate);
  const gateResult = composeGateResult({ aggregate: storedAggregate });
  const storedGateResult = writeSingleton(root, gateResult);
  return { aggregate: storedAggregate, gate_result: storedGateResult };
}

export function cancelRun(runRoot, reason = "RUN_CANCELLED") {
  const root = ensureRunRoot(runRoot);
  let control = readControl(root);
  if (["completed", "cancelled"].includes(control.state)) return { control, aggregate: fs.existsSync(recordPath(root, "aggregate-report")) ? readRecord(recordPath(root, "aggregate-report")) : null };
  for (const attempt of [...(control.active_attempts ?? [])]) {
    failAttempt(root, {
      attempt_id: attempt.attempt_id,
      kind: "ATTEMPT_CANCELLED",
      phase: attempt.phase,
      message: reason
    }, { allowExpired: true });
  }
  control = readControl(root);
  const aggregating = writeControl(root, { ...control, state: "aggregating", terminal_reason: reason }, control.epoch);
  const hasDiscovery = fs.existsSync(recordPath(root, "discovery"));
  const hasPlan = fs.existsSync(recordPath(root, "shard-plan"));
  const result = hasDiscovery && hasPlan
    ? aggregateRun(root, { terminalReason: reason })
    : persistTerminalFailure(root, aggregating, reason);
  const cancelled = writeControl(root, { ...readControl(root), state: "cancelled", terminal_reason: reason }, readControl(root).epoch);
  return { ...result, control: cancelled };
}

export function invalidateRun(runRoot, reason = "STALE_REVIEW") {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  if (control.state === "completed") {
    return writeControl(root, { ...control, state: "invalidated", terminal_reason: reason }, control.epoch);
  }
  return writeControl(root, { ...control, state: "invalidated", terminal_reason: reason }, control.epoch);
}

export function checkTargetFreshness(runRoot, currentFingerprint) {
  const root = ensureRunRoot(runRoot);
  const request = readRecord(recordPath(root, "request"));
  if (request.target?.fingerprint !== currentFingerprint) {
    invalidateRun(root, "STALE_REVIEW");
    fail("STALE_REVIEW", "current target fingerprint differs from accepted review target", {
      accepted: request.target?.fingerprint,
      current: currentFingerprint
    });
  }
  return true;
}

export function resumeRun(runRoot, options = {}) {
  const root = ensureRunRoot(runRoot);
  const control = readControl(root);
  if (["cancelled", "invalidated"].includes(control.state)) {
    fail("RESEAL_REQUIRED", `terminal ${control.state} run requires a successor run`);
  }
  if (control.state !== "aggregating") return control;
  const hasDiscovery = fs.existsSync(recordPath(root, "discovery"));
  const hasPlan = fs.existsSync(recordPath(root, "shard-plan"));
  const nextState = options.state ?? (hasDiscovery && hasPlan && fs.existsSync(recordPath(root, "aggregate-report"))
      ? "aggregating"
      : hasDiscovery
        ? (hasPlan ? "dispatch-ready" : "planning")
        : "discovering");
  if (!STATES.has(nextState) || ["created", "completed"].includes(nextState)) fail("INVALID_STATE_TRANSITION", `cannot resume to ${nextState}`);
  return writeControl(root, { ...control, state: nextState, terminal_reason: null }, control.epoch);
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  let json = false;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("--")) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) fail("INVALID_ARGUMENT", `${arg} requires a value`);
      values.set(arg.slice(2), value);
      index += 1;
    } else {
      fail("INVALID_ARGUMENT", `unexpected argument ${arg}`);
    }
  }
  return { command, values, json };
}

function inputRecord(values) {
  const input = values.get("input");
  if (!input) fail("INVALID_ARGUMENT", "--input is required");
  return parseJsonStrict(fs.readFileSync(input, "utf8"), input);
}

export function runCli(argv = process.argv.slice(2)) {
  try {
    const { command, values, json } = parseCli(argv);
    const runRoot = values.get("run-root");
    if (!runRoot) fail("INVALID_ARGUMENT", "--run-root is required");
    let result;
    if (command === "accept") result = acceptRun(runRoot, inputRecord(values));
    else if (command === "phase-a-packet") result = verifierPhaseAPacket(runRoot);
    else if (command === "discover") result = persistDiscovery(runRoot, inputRecord(values));
    else if (command === "begin-planning") result = beginShardPlanning(runRoot);
    else if (command === "plan") result = persistShardPlan(runRoot, inputRecord(values));
    else if (command === "dispatch") result = dispatchRun(runRoot);
    else if (command === "admit-attempt") result = admitAttempt(runRoot, inputRecord(values));
    else if (command === "checkpoint-attempt") result = checkpointAttempt(runRoot, inputRecord(values));
    else if (command === "append-attempt") result = appendLedgerAttempt(runRoot, inputRecord(values));
    else if (command === "fail-attempt") result = failAttempt(runRoot, inputRecord(values));
    else if (command === "expire-attempt") {
      const attemptId = values.get("attempt-id");
      if (!attemptId) fail("INVALID_ARGUMENT", "expire-attempt requires --attempt-id");
      result = expireAttempt(runRoot, attemptId);
    }
    else if (command === "sweep-timeouts") result = sweepExpiredAttempts(runRoot);
    else if (command === "aggregate") {
      const options = values.has("input") ? inputRecord(values) : {};
      result = aggregateRun(runRoot, {
        gateEvidence: options.gate_evidence,
        coordinatorSourceAssessment: options.coordinator_source_assessment,
        residualRisk: options.residual_risk
      });
    }
    else if (command === "cancel") result = cancelRun(runRoot, values.get("reason") ?? "RUN_CANCELLED");
    else if (command === "invalidate") result = invalidateRun(runRoot, values.get("reason") ?? "STALE_REVIEW");
    else if (command === "check-target") {
      const fingerprint = values.get("target-fingerprint");
      if (!fingerprint) fail("INVALID_ARGUMENT", "check-target requires --target-fingerprint");
      result = checkTargetFreshness(runRoot, fingerprint);
    }
    else if (command === "resume") result = resumeRun(runRoot);
    else fail("INVALID_ARGUMENT", `unknown review-run command ${command}`);
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const payload = {
      ok: false,
      error: error.code ?? "INTERNAL_ERROR",
      message: error.message
    };
    if (error.details && Object.keys(error.details).length > 0) payload.details = error.details;
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
