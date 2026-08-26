import { fail, finalizeRecord, isCanonicalRef, isPlainObject } from "./review-records.mjs";

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

export function selectProvider(providerPolicy) {
  if (!isPlainObject(providerPolicy)) fail("PROVIDER_RUNTIME_GAP", "provider policy must be an object");
  const capabilities = providerPolicy.capabilities ?? {};
  const missing = REQUIRED_CAPABILITIES.filter((name) => capabilities[name] !== true);
  if (missing.length > 0) {
    fail("PROVIDER_RUNTIME_GAP", `provider missing capabilities: ${missing.join(", ")}`);
  }
  return buildProviderBinding(providerPolicy);
}

export function buildProviderBinding({ provider_id, version, implementation_digest, attestation_signing_key_ref, lane_result_signing_key_ref, capabilities = {} }) {
  if (typeof provider_id !== "string" || !provider_id) fail("PROVIDER_RUNTIME_GAP", "provider_id is required");
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
    attestation_signing_key_ref,
    lane_result_signing_key_ref
  }, `provider:${provider_id}`);
}

export function buildDiscoveryLaneAttestation({ lane_kind, execution_identity_ref, provider_ref, input_manifest_ref, target_view_ref, subject_read_log_ref, result_universe_ref, signing_key_ref, denied_roots = [] }) {
  if (lane_kind !== "expected" && lane_kind !== "observed") {
    fail("VERIFIER_INPUT_CONTAMINATED", `invalid lane_kind: ${lane_kind}`);
  }
  if (!isCanonicalRef(provider_ref)) fail("CANONICAL_REF_MISMATCH", "provider_ref must be a CanonicalRef");
  if (!isCanonicalRef(signing_key_ref)) fail("CANONICAL_REF_MISMATCH", "signing_key_ref must be a CanonicalRef");
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
    subject_read_log_ref,
    result_universe_ref,
    denied_roots,
    signing_key_ref
  };
  return finalizeRecord(base, `att:${lane_kind}:${provider_ref.id}`);
}
