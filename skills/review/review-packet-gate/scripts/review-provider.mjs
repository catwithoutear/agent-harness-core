import { DIGEST_RE, PROTOCOL, fail, finalizeRecord, isCanonicalRef, isPlainObject, verifyRecordDigest } from "./review-records.mjs";

/**
 * Discovery execution provider binding and capability matrix (R-035).
 *
 * `assurance=deep` requires a provider whose entire capability matrix is true.
 * The controller attestation signing key and the provider-lane result signing
 * key MUST be distinct identities; private material is never serialized.
 */

export const REQUIRED_CAPABILITIES = Object.freeze([
  "fresh_process",
  "fresh_session",
  "no_parent_context",
  "no_history",
  "no_memory_mounts",
  "no_direct_target_mount",
  "broker_only_subject_reads",
  "complete_subject_read_log",
  "disjoint_lane_tokens",
  "write_only_result_channels",
  "closed_tool_set",
  "environment_manifest",
  "signed_receipts",
  "provider_lane_signed_payload"
]);

export const VERIFIER_PHASE_A_FIELDS = Object.freeze([
  "format",
  "format_version",
  "record_type",
  "record_id",
  "created_from",
  "record_digest",
  "canonical_digest",
  "protocol",
  "run_id",
  "phase",
  "assurance",
  "target_fingerprint",
  "run_binding_ref",
  "target_view_ref",
  "target_view_capability_ref",
  "provider_binding_ref",
  "firewall_policy_ref",
  "policy_binding_refs"
]);

const DEEP_PREFLIGHT_FIELDS = new Set([
  "run_binding_ref",
  "target_view_ref",
  "target_view_capability_ref",
  "firewall_policy_ref",
  "policy_binding_refs"
]);

function requireCanonicalRef(value, location) {
  if (
    !isCanonicalRef(value) ||
    Object.keys(value).sort().join(",") !== "digest,id"
  ) {
    fail("VERIFIER_PACKET_INVALID", `${location} must be an exact {id,digest} CanonicalRef`);
  }
  return value;
}

function rejectUnknownFields(value, allowed, location) {
  if (!isPlainObject(value)) fail("VERIFIER_PACKET_INVALID", `${location} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail("VERIFIER_INPUT_CONTAMINATED", `${location} contains forbidden or unknown fields: ${unknown.join(", ")}`, { unknown_fields: unknown });
  }
}

export function selectProvider(providerPolicy) {
  if (!isPlainObject(providerPolicy)) fail("PROVIDER_RUNTIME_GAP", "provider policy must be an object");
  if (providerPolicy.runtime_verified !== true || !isCanonicalRef(providerPolicy.conformance_receipt_ref)) {
    fail("PROVIDER_RUNTIME_GAP", "provider requires a current runtime conformance receipt");
  }
  if (typeof providerPolicy.version !== "string" || !providerPolicy.version || !DIGEST_RE.test(providerPolicy.implementation_digest ?? "")) {
    fail("PROVIDER_RUNTIME_GAP", "provider version and implementation_digest are required");
  }
  const capabilities = providerPolicy.capabilities ?? {};
  const missing = REQUIRED_CAPABILITIES.filter((name) => capabilities[name] !== true);
  if (missing.length > 0) {
    fail("PROVIDER_RUNTIME_GAP", `provider missing capabilities: ${missing.join(", ")}`);
  }
  return buildProviderBinding(providerPolicy);
}

export function buildProviderBinding({
  provider_id,
  version,
  implementation_digest,
  conformance_receipt_ref,
  attestation_signing_key_ref,
  lane_result_signing_key_ref,
  capabilities = {}
}) {
  if (typeof provider_id !== "string" || !provider_id) fail("PROVIDER_RUNTIME_GAP", "provider_id is required");
  if (!isCanonicalRef(conformance_receipt_ref)) fail("PROVIDER_RUNTIME_GAP", "conformance_receipt_ref must be a CanonicalRef");
  if (!isCanonicalRef(attestation_signing_key_ref) || !isCanonicalRef(lane_result_signing_key_ref)) {
    fail("PROVIDER_RUNTIME_GAP", "attestation and lane result keys must be {id,digest} CanonicalRefs");
  }
  if (attestation_signing_key_ref.id === lane_result_signing_key_ref.id) {
    fail("PROVIDER_RUNTIME_GAP", "controller attestation key and provider lane result key must be distinct");
  }
  return finalizeRecord({
    record_type: "provider-binding",
    provider_id,
    version,
    implementation_digest,
    capabilities,
    runtime_verified: true,
    conformance_receipt_ref,
    attestation_signing_key_ref,
    lane_result_signing_key_ref
  }, `provider:${provider_id}`);
}

export function validateVerifierDiscoveryEnvelope(envelope, expected = {}) {
  rejectUnknownFields(envelope, new Set(VERIFIER_PHASE_A_FIELDS), "verifier discovery envelope");
  if (envelope.protocol !== PROTOCOL) fail("UNSUPPORTED_REVIEW_PROTOCOL", `protocol must be ${PROTOCOL}`);
  if (envelope.record_type !== undefined && envelope.record_type !== "verifier-discovery-envelope") {
    fail("VERIFIER_PACKET_INVALID", "record_type must be verifier-discovery-envelope");
  }
  if ((envelope.record_digest !== undefined || envelope.canonical_digest !== undefined) && !verifyRecordDigest(envelope)) {
    fail("RECORD_DIGEST_MISMATCH", "verifier discovery envelope digest does not match its content");
  }
  if (typeof envelope.run_id !== "string" || !envelope.run_id) fail("VERIFIER_PACKET_INVALID", "run_id is required");
  if (envelope.phase !== "inventory") fail("VERIFIER_PACKET_INVALID", "Phase A envelope phase must be inventory");
  if (envelope.assurance !== "deep") fail("VERIFIER_PACKET_INVALID", "Phase A envelope assurance must be deep");
  if (typeof envelope.target_fingerprint !== "string" || !envelope.target_fingerprint) {
    fail("VERIFIER_PACKET_INVALID", "target_fingerprint is required");
  }
  for (const field of [
    "run_binding_ref",
    "target_view_ref",
    "target_view_capability_ref",
    "provider_binding_ref",
    "firewall_policy_ref"
  ]) {
    requireCanonicalRef(envelope[field], field);
  }
  if (!Array.isArray(envelope.policy_binding_refs) || envelope.policy_binding_refs.length === 0) {
    fail("VERIFIER_PACKET_INVALID", "policy_binding_refs must be a non-empty array");
  }
  envelope.policy_binding_refs.forEach((ref, index) => requireCanonicalRef(ref, `policy_binding_refs[${index}]`));
  if (expected.run_id && envelope.run_id !== expected.run_id) fail("VERIFIER_PACKET_INVALID", "envelope run_id does not match request");
  if (expected.target_fingerprint && envelope.target_fingerprint !== expected.target_fingerprint) {
    fail("STALE_REVIEW", "envelope target_fingerprint does not match request target");
  }
  if (expected.provider_binding_ref && (
    envelope.provider_binding_ref.id !== expected.provider_binding_ref.id ||
    envelope.provider_binding_ref.digest !== expected.provider_binding_ref.digest
  )) {
    fail("PROVIDER_RUNTIME_GAP", "envelope provider binding does not match selected provider");
  }
  return finalizeRecord({ ...envelope, record_type: "verifier-discovery-envelope" }, `verifier-envelope:${envelope.run_id}`);
}

export function buildVerifierDiscoveryEnvelope({ request, providerBinding }) {
  if (!isPlainObject(request)) fail("VERIFIER_PACKET_INVALID", "request is required");
  const input = request.deep_preflight;
  rejectUnknownFields(input, DEEP_PREFLIGHT_FIELDS, "request.deep_preflight");
  const providerRef = {
    id: providerBinding.record_id,
    digest: providerBinding.record_digest
  };
  return validateVerifierDiscoveryEnvelope({
    protocol: PROTOCOL,
    run_id: request.run_id,
    phase: "inventory",
    assurance: "deep",
    target_fingerprint: request.target?.fingerprint,
    run_binding_ref: input.run_binding_ref,
    target_view_ref: input.target_view_ref,
    target_view_capability_ref: input.target_view_capability_ref,
    provider_binding_ref: providerRef,
    firewall_policy_ref: input.firewall_policy_ref,
    policy_binding_refs: input.policy_binding_refs
  }, {
    run_id: request.run_id,
    target_fingerprint: request.target?.fingerprint,
    provider_binding_ref: providerRef
  });
}

export function preflightDeepDispatch({ request, routing }) {
  if (routing.selected_mode !== "deep") return null;
  const providerBinding = selectProvider(request.provider_policy);
  const verifierEnvelope = buildVerifierDiscoveryEnvelope({ request, providerBinding });
  return finalizeRecord({
    record_type: "dispatch-preflight",
    protocol: PROTOCOL,
    run_id: request.run_id,
    selected_mode: routing.selected_mode,
    passed: true,
    request_ref: { id: request.record_id, digest: request.record_digest },
    routing_ref: { id: routing.record_id, digest: routing.record_digest },
    provider_binding: providerBinding,
    verifier_discovery_envelope: verifierEnvelope
  }, `dispatch-preflight:${request.run_id}`);
}

export function buildDiscoveryLaneAttestation({
  lane_kind,
  execution_identity_ref,
  provider_ref,
  input_manifest_ref,
  target_view_ref,
  broker_token_ref,
  subject_read_log_ref,
  result_channel_ref,
  result_universe_ref,
  environment_manifest_ref,
  lane_payload_ref,
  controller_receipt_ref,
  signing_key_ref,
  denied_roots = []
}) {
  if (lane_kind !== "expected" && lane_kind !== "observed") {
    fail("VERIFIER_INPUT_CONTAMINATED", `invalid lane_kind: ${lane_kind}`);
  }
  for (const [name, ref] of Object.entries({
    execution_identity_ref,
    provider_ref,
    input_manifest_ref,
    target_view_ref,
    broker_token_ref,
    subject_read_log_ref,
    result_channel_ref,
    result_universe_ref,
    environment_manifest_ref,
    lane_payload_ref,
    controller_receipt_ref,
    signing_key_ref
  })) {
    if (!isCanonicalRef(ref)) fail("CANONICAL_REF_MISMATCH", `${name} must be a CanonicalRef`);
  }
  const base = {
    record_type: "discovery-lane-attestation",
    lane_kind,
    execution_identity_ref,
    provider_ref,
    fresh_context_identity_ref: execution_identity_ref,
    parent_context_identity_ref: null,
    inherited_conversation: false,
    inherited_memory_mounts: [],
    input_manifest_ref,
    target_view_ref,
    broker_token_ref,
    subject_read_log_ref,
    result_channel_ref,
    result_universe_ref,
    environment_manifest_ref,
    lane_payload_ref,
    controller_receipt_ref,
    denied_roots,
    signing_key_ref
  };
  return finalizeRecord(base, `att:${lane_kind}:${provider_ref.id}`);
}

export function validateBilateralLaneAttestations(expected, observed) {
  if (expected?.record_type !== "discovery-lane-attestation" || observed?.record_type !== "discovery-lane-attestation") {
    fail("PROVIDER_RUNTIME_GAP", "both discovery lane attestations are required");
  }
  if (expected.lane_kind !== "expected" || observed.lane_kind !== "observed") {
    fail("VERIFIER_INPUT_CONTAMINATED", "lane attestations have incorrect roles");
  }
  if (expected.provider_ref.id !== observed.provider_ref.id || expected.provider_ref.digest !== observed.provider_ref.digest) {
    fail("PROVIDER_RUNTIME_GAP", "lane attestations must bind the same selected provider");
  }
  for (const field of ["execution_identity_ref", "broker_token_ref", "subject_read_log_ref", "result_channel_ref"]) {
    if (expected[field].id === observed[field].id) {
      fail("VERIFIER_INPUT_CONTAMINATED", `expected and observed lanes reuse ${field}`);
    }
  }
  if (
    expected.parent_context_identity_ref !== null ||
    observed.parent_context_identity_ref !== null ||
    expected.inherited_conversation !== false ||
    observed.inherited_conversation !== false ||
    expected.inherited_memory_mounts.length !== 0 ||
    observed.inherited_memory_mounts.length !== 0
  ) {
    fail("VERIFIER_INPUT_CONTAMINATED", "lane attestation reports inherited context");
  }
  return { complete: true, expected_ref: { id: expected.record_id, digest: expected.record_digest }, observed_ref: { id: observed.record_id, digest: observed.record_digest } };
}
