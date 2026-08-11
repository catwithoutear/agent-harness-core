#!/usr/bin/env node

/**
 * Portable review-run protocol.
 *
 * This is the sole structured review protocol. It stores canonical,
 * immutable JSON records under a regulated change workspace.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const PROTOCOL = "review-run";
export const DIGEST_PREFIX = "sha256:";
export const MODES = new Set(["quick", "standard", "deep"]);
export const GATES = new Set(["READY", "READY_WITH_NOTES", "NOT_READY", "NEEDS_USER_DECISION"]);
export const LEDGER_STATUSES = new Set(["covered", "not-covered", "not-applicable"]);
export const ATTEMPT_STATUSES = new Set(["succeeded", "failed", "cancelled", "stale", "superseded"]);
export const STATES = new Set([
  "created",
  "discovering",
  "planning",
  "running",
  "aggregating",
  "completed",
  "cancelled",
  "invalidated"
]);

const FORBIDDEN_KEYS = new Set([
  "absolute_path",
  "absolute_root",
  "client_session",
  "cwd",
  "local_root",
  "provider_session",
  "session_id",
  "session_path",
  "run_root"
]);

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const RELATIVE_PATH_RE = /^(?![A-Za-z]:[\\/])(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/u;

export class ReviewRunError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ReviewRunError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new ReviewRunError(code, message, details);
}

export function sha256Text(value) {
  return `${DIGEST_PREFIX}${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPortable(value, location = "$", seen = new Set()) {
  if (typeof value === "string") {
    if (value.includes("\0")) {
      fail("INVALID_REVIEW_RECORD", `${location} contains NUL`);
    }
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value)) {
      fail("NON_PORTABLE_RECORD", `${location} must not contain an absolute local path`);
    }
    if ((location.endsWith(".path") || location.endsWith(".root") || location.endsWith(".file") || location.endsWith("_path")) && !RELATIVE_PATH_RE.test(value)) {
      fail("NON_PORTABLE_RECORD", `${location} must be a relative portable path`);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    fail("INVALID_REVIEW_RECORD", `${location} contains a cyclic value`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPortable(item, `${location}[${index}]`, seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key) || key.startsWith("absolute_")) {
        fail("NON_PORTABLE_RECORD", `${location}.${key} is not portable`);
      }
      assertPortable(child, `${location}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
        .map((key) => [key, canonicalValue(value[key])])
    );
  }
  return value;
}

export function canonicalize(value) {
  assertPortable(value);
  return canonicalValue(value);
}

export function canonicalJSONStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function digestValue(value) {
  return sha256Text(canonicalJSONStringify(value));
}

export function recordDigest(value) {
  const copy = structuredClone(value);
  copy.record_digest = "sha256:self";
  copy.canonical_digest = "sha256:self";
  return digestValue(copy);
}

export function finalizeRecord(value, recordId = `${value.record_type}:${value.run_id ?? "unknown"}`) {
  const base = {
    format: PROTOCOL,
    format_version: 1,
    ...value,
    record_id: value.record_id ?? recordId,
    created_from: value.created_from ?? []
  };
  base.record_digest = "sha256:self";
  base.canonical_digest = "sha256:self";
  const digest = recordDigest(base);
  return { ...base, record_digest: digest, canonical_digest: digest };
}

export function verifyRecordDigest(value) {
  const expected = recordDigest(value);
  const actual = value.record_digest ?? value.canonical_digest;
  return typeof actual === "string" && actual === expected && (value.record_digest === undefined || value.record_digest === actual) && (value.canonical_digest === undefined || value.canonical_digest === actual);
}

function verifyInputDigest(value, name) {
  const hasDigest = value.record_digest !== undefined || value.canonical_digest !== undefined;
  if (!hasDigest) return;
  if (typeof value.record_digest !== "string" || typeof value.canonical_digest !== "string" || !verifyRecordDigest(value)) {
    fail("RECORD_DIGEST_MISMATCH", `${name} record digest does not match its content`);
  }
}

/**
 * Parse JSON while rejecting duplicate object keys. JSON.parse alone silently
 * keeps the last key, which would make the self-digest ambiguous.
 */
export function parseJsonStrict(text, source = "input") {
  const input = String(text);
  let index = 0;

  const error = (message) => fail("INVALID_JSON", `${source}: ${message} at byte ${index}`);
  const skip = () => {
    while (/\s/u.test(input[index] ?? "")) index += 1;
  };
  const parseString = () => {
    if (input[index] !== '"') error("expected string");
    const start = index;
    index += 1;
    let escaped = false;
    while (index < input.length) {
      const character = input[index];
      if (escaped) {
        escaped = false;
        index += 1;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        index += 1;
        continue;
      }
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(input.slice(start, index));
        } catch {
          error("invalid string escape");
        }
      }
      if (character < " ") error("control character in string");
      index += 1;
    }
    error("unterminated string");
  };
  const parseNumber = () => {
    const match = input.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) error("invalid number");
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) error("number is not finite");
    return value;
  };
  const parseValue = () => {
    skip();
    const character = input[index];
    if (character === '"') return parseString();
    if (character === "{") {
      index += 1;
      const object = {};
      const keys = new Set();
      skip();
      if (input[index] === "}") {
        index += 1;
        return object;
      }
      while (index < input.length) {
        skip();
        const key = parseString();
        if (keys.has(key)) error(`duplicate object key ${key}`);
        keys.add(key);
        skip();
        if (input[index] !== ":") error("expected colon");
        index += 1;
        object[key] = parseValue();
        skip();
        if (input[index] === "}") {
          index += 1;
          return object;
        }
        if (input[index] !== ",") error("expected comma");
        index += 1;
      }
      error("unterminated object");
    }
    if (character === "[") {
      index += 1;
      const array = [];
      skip();
      if (input[index] === "]") {
        index += 1;
        return array;
      }
      while (index < input.length) {
        array.push(parseValue());
        skip();
        if (input[index] === "]") {
          index += 1;
          return array;
        }
        if (input[index] !== ",") error("expected comma");
        index += 1;
      }
      error("unterminated array");
    }
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]]) {
      if (input.startsWith(literal, index)) {
        index += literal.length;
        return value;
      }
    }
    if (character === "-" || /\d/u.test(character ?? "")) return parseNumber();
    error("unexpected token");
  };

  const result = parseValue();
  skip();
  if (index !== input.length) error("trailing data");
  return result;
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
  const copy = finalizeRecord({ ...value, run_id: value.run_id ?? value.request_id, dispatch_contract: contract }, `request:${value.request_id}`);
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

export function validateDiscovery(discovery, contract) {
  const value = requireObject(discovery, "discovery");
  if (value.record_type !== "discovery") fail("INVALID_DISCOVERY", "record_type must be discovery");
  const normalizedContract = validateDispatchContract(contract);
  if (value.contract_digest !== normalizedContract.contract_digest) fail("CONTRACT_DIGEST_MISMATCH", "discovery contract digest mismatch");
  if (value.discovery_sealed !== true) fail("DISCOVERY_CLOSURE_FAILED", "discovery must be explicitly sealed");
  verifyInputDigest(value, "discovery");
  const relations = requireArray(value.relations, "discovery.relations");
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
  const attemptStatus = value.attempt_status ?? "succeeded";
  if (!ATTEMPT_STATUSES.has(attemptStatus)) fail("INVALID_LEDGER", `unsupported attempt status ${attemptStatus}`);
  const entries = requireArray(value.entries, "ledger.entries");
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
    .map((ledger) => ({ attempt_id: ledger.attempt_id, shard_id: ledger.shard_id ?? null, status: ledger.attempt_status }));
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
    exact_gaps: gaps,
    invalid_attempts: invalid,
    failed_or_stale: uniqueFailureRecords([...(control.failed_or_stale ?? []), ...invalid]),
    boundary_facts: discovery.boundary_facts ?? [],
    coverage_gate: gateForCoverage(gaps, [...entriesByRelation.values()].flat()),
    terminal_reason: gaps.length > 0 ? "coverage_not_closed" : "coverage_closed"
  };
  return finalizeRecord(report, `aggregate:${discovery.run_id}`);
}

export function composeGateResult({ aggregate, reviewGate = "NOT_READY", implementationVerificationGate = "NOT_READY", evidence = [], residualRisk = [] }) {
  if (!aggregate || aggregate.record_type !== "aggregate-report") fail("INVALID_GATE_RESULT", "aggregate report is required");
  for (const [name, gate] of [["coverage_gate", aggregate.coverage_gate], ["review_gate", reviewGate], ["implementation_verification_gate", implementationVerificationGate]]) {
    if (!GATES.has(gate)) fail("INVALID_GATE_RESULT", `${name} has invalid value ${gate}`);
  }
  const gates = [aggregate.coverage_gate, reviewGate, implementationVerificationGate];
  const overallGate = gates.includes("NOT_READY") ? "NOT_READY" : gates.includes("NEEDS_USER_DECISION") ? "NEEDS_USER_DECISION" : gates.includes("READY_WITH_NOTES") ? "READY_WITH_NOTES" : "READY";
  const result = {
    record_type: "gate-result",
    protocol: PROTOCOL,
    run_id: aggregate.run_id,
    aggregate_digest: aggregate.record_digest,
    coverage_gate: aggregate.coverage_gate,
    review_gate: reviewGate,
    implementation_verification_gate: implementationVerificationGate,
    overall_gate: overallGate,
    evidence,
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

export function acceptRun(runRoot, request) {
  const root = ensureRunRoot(runRoot);
  const normalized = validateRequest(request);
  const runId = path.basename(root);
  if (normalized.run_id !== runId) fail("REQUEST_ID_CONFLICT", "request run_id does not match run root");
  const existingRequest = fs.existsSync(recordPath(root, "request")) ? readRecord(recordPath(root, "request")) : null;
  if (existingRequest && existingRequest.record_digest !== normalized.record_digest) fail("REQUEST_ID_CONFLICT", "run already accepted a different request");
  writeSingleton(root, normalized);
  const routing = routeRequest(normalized);
  writeSingleton(root, routing);
  const control = readControl(root);
  if (control.state === "created") writeControl(root, { ...control, state: "discovering" }, control.epoch);
  return { request: normalized, routing, control: readControl(root) };
}

export function persistDiscovery(runRoot, discovery) {
  const root = ensureRunRoot(runRoot);
  const request = validateRequest(readRecord(recordPath(root, "request")));
  const normalized = validateDiscovery({ ...discovery, run_id: discovery.run_id ?? request.run_id }, request.dispatch_contract);
  writeSingleton(root, normalized);
  const control = readControl(root);
  if (!["discovering", "planning"].includes(control.state)) fail("INVALID_STATE_TRANSITION", `cannot persist discovery in ${control.state}`);
  writeControl(root, { ...control, state: "planning" }, control.epoch);
  return normalized;
}

export function persistShardPlan(runRoot, plan) {
  const root = ensureRunRoot(runRoot);
  const discovery = readRecord(recordPath(root, "discovery"));
  const normalized = validateShardPlan(plan, discovery);
  writeSingleton(root, normalized);
  const control = readControl(root);
  if (control.state !== "planning") fail("INVALID_STATE_TRANSITION", `cannot persist shard plan in ${control.state}`);
  writeControl(root, { ...control, state: "running", required_slots: normalized.shards.map((shard) => shard.shard_id) }, control.epoch);
  return normalized;
}

export function appendLedgerAttempt(runRoot, ledger) {
  const root = ensureRunRoot(runRoot);
  const discovery = readRecord(recordPath(root, "discovery"));
  const plan = fs.existsSync(recordPath(root, "shard-plan")) ? readRecord(recordPath(root, "shard-plan")) : null;
  const normalized = validateLedger(ledger, discovery, plan);
  const attemptPath = path.join(root, "attempts", `${normalized.attempt_id}.json`);
  if (fs.existsSync(attemptPath)) {
    const existing = readRecord(attemptPath);
    if (existing.record_digest !== normalized.record_digest) fail("REQUEST_ID_CONFLICT", `attempt ${normalized.attempt_id} already exists`);
    return existing;
  }
  if (plan) {
    const shard = (plan.shards ?? []).find((candidate) => candidate.shard_id === normalized.shard_id);
    const retryBudget = shard?.retry_budget ?? plan.retry_budget ?? 2;
    const priorAttempts = fs
      .readdirSync(path.join(root, "attempts"))
      .filter((name) => name.endsWith(".json"))
      .map((name) => readRecord(path.join(root, "attempts", name)))
      .filter((attempt) => attempt.shard_id === normalized.shard_id);
    if (priorAttempts.length >= retryBudget + 1) fail("RETRY_EXHAUSTED", `retry budget exhausted for shard ${normalized.shard_id}`, { retry_budget: retryBudget });
  }
  atomicWrite(attemptPath, normalized);
  const control = readControl(root);
  writeControl(root, {
    ...control,
    state: "running",
    accepted_attempt_digests: normalized.attempt_status === "succeeded"
      ? [...(control.accepted_attempt_digests ?? []), normalized.record_digest]
      : control.accepted_attempt_digests ?? [],
    failed_or_stale: normalized.attempt_status === "succeeded"
      ? control.failed_or_stale ?? []
      : [...(control.failed_or_stale ?? []), { attempt_id: normalized.attempt_id, shard_id: normalized.shard_id ?? null, status: normalized.attempt_status }]
  }, control.epoch);
  return normalized;
}

export function aggregateRun(runRoot, options = {}) {
  const root = ensureRunRoot(runRoot);
  const discovery = readRecord(recordPath(root, "discovery"));
  const attemptFiles = fs.readdirSync(path.join(root, "attempts")).filter((name) => name.endsWith(".json")).sort();
  const ledgers = attemptFiles.map((name) => readRecord(path.join(root, "attempts", name)));
  const control = readControl(root);
  if (control.state !== "running" && control.state !== "aggregating") fail("INVALID_STATE_TRANSITION", `cannot aggregate in ${control.state}`);
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
  const gateResult = composeGateResult({
    aggregate: storedReport,
    ...(options.gateResult ?? {})
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
  const control = readControl(root);
  if (["completed", "cancelled"].includes(control.state)) return { control, aggregate: fs.existsSync(recordPath(root, "aggregate-report")) ? readRecord(recordPath(root, "aggregate-report")) : null };
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
  if (!["cancelled", "invalidated", "aggregating"].includes(control.state)) return control;
  const hasDiscovery = fs.existsSync(recordPath(root, "discovery"));
  const hasPlan = fs.existsSync(recordPath(root, "shard-plan"));
  const nextState = options.state ?? (control.state === "invalidated"
    ? "discovering"
    : hasDiscovery && hasPlan && fs.existsSync(recordPath(root, "aggregate-report"))
      ? "aggregating"
      : hasDiscovery
        ? "planning"
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
    else if (command === "discover") result = persistDiscovery(runRoot, inputRecord(values));
    else if (command === "plan") result = persistShardPlan(runRoot, inputRecord(values));
    else if (command === "append-attempt") result = appendLedgerAttempt(runRoot, inputRecord(values));
    else if (command === "aggregate") result = aggregateRun(runRoot);
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
