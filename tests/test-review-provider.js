import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  REQUIRED_CAPABILITIES,
  buildVerifierDiscoveryEnvelope,
  buildDiscoveryLaneAttestation,
  buildProviderBinding,
  selectProvider,
  validateBilateralLaneAttestations,
  validateVerifierDiscoveryEnvelope
} from "../skills/review/review-packet-gate/scripts/review-provider.mjs";

const key = (n) => ({ id: `skey-v1:${n}`, digest: `sha256:${n.repeat(64)}` });
const ref = (id, n) => ({ id, digest: `sha256:${n.repeat(64)}` });
const allCapabilities = () => Object.fromEntries(REQUIRED_CAPABILITIES.map((c) => [c, true]));
const providerPolicy = (overrides = {}) => ({
  provider_id: "p1",
  version: "v1",
  implementation_digest: `sha256:${"1".repeat(64)}`,
  runtime_verified: true,
  conformance_receipt_ref: key("c"),
  capabilities: allCapabilities(),
  attestation_signing_key_ref: key("a"),
  lane_result_signing_key_ref: key("b"),
  ...overrides
});

const refs = () => ({
  run_binding_ref: key("a"),
  target_view_ref: key("b"),
  target_view_capability_ref: key("c"),
  firewall_policy_ref: key("f"),
  policy_binding_refs: [key("d")]
});

function laneAttestation(laneKind, laneId) {
  return buildDiscoveryLaneAttestation({
    lane_kind: laneKind,
    execution_identity_ref: ref(`exec:${laneId}`, laneKind === "expected" ? "1" : "2"),
    provider_ref: ref("provider:p1", "3"),
    input_manifest_ref: ref("manifest:input", "4"),
    target_view_ref: ref("view:target", "5"),
    broker_token_ref: ref(`token:${laneId}`, laneKind === "expected" ? "6" : "7"),
    subject_read_log_ref: ref(`read-log:${laneId}`, laneKind === "expected" ? "8" : "9"),
    result_channel_ref: ref(`channel:${laneId}`, laneKind === "expected" ? "a" : "b"),
    result_universe_ref: ref(`universe:${laneId}`, laneKind === "expected" ? "c" : "d"),
    environment_manifest_ref: ref(`environment:${laneId}`, "e"),
    lane_payload_ref: ref(`payload:${laneId}`, "f"),
    controller_receipt_ref: ref(`receipt:${laneId}`, laneKind === "expected" ? "1" : "2"),
    signing_key_ref: key("a"),
    denied_roots: ["code-root", "state-root", "memory-root"]
  });
}

export async function run(run) {
  await run("selectProvider accepts a full capability matrix", async () => {
    const binding = selectProvider(providerPolicy());
    assert.equal(binding.provider_id, "p1");
  });

  await run("selectProvider rejects a missing capability", async () => {
    const caps = allCapabilities();
    delete caps.fresh_process;
    assert.throws(() => selectProvider(providerPolicy({ capabilities: caps })), ReviewRunError);
  });

  await run("selectProvider rejects self-asserted capability without runtime conformance", async () => {
    assert.throws(() => selectProvider(providerPolicy({ runtime_verified: false })), /runtime conformance receipt/);
  });

  await run("provider binding requires distinct attestation and lane keys", async () => {
    assert.throws(() => buildProviderBinding({ ...providerPolicy(), attestation_signing_key_ref: key("a"), lane_result_signing_key_ref: key("a") }), ReviewRunError);
  });

  await run("lane attestation rejects an invalid lane_kind", async () => {
    assert.throws(() => buildDiscoveryLaneAttestation({ lane_kind: "bogus", provider_ref: key("p"), signing_key_ref: key("a") }), ReviewRunError);
  });

  await run("lane attestation requires canonical provider/signing refs", async () => {
    assert.throws(() => buildDiscoveryLaneAttestation({ lane_kind: "expected", provider_ref: { id: "bare" }, signing_key_ref: key("a") }), ReviewRunError);
  });

  await run("Phase A packet is machine-built from a closed neutral input", async () => {
    const providerBinding = selectProvider(providerPolicy());
    const request = {
      run_id: "run-1",
      target: { fingerprint: "sha256:target" },
      deep_preflight: refs()
    };
    const packet = buildVerifierDiscoveryEnvelope({ request, providerBinding });
    assert.equal(packet.protocol, "review-run");
    assert.equal(packet.phase, "inventory");
    assert.equal(packet.target_fingerprint, "sha256:target");
    assert.equal(packet.expected_relations, undefined);
  });

  await run("Phase A packet rejects expected-lane leakage and stale identity", async () => {
    const providerBinding = selectProvider(providerPolicy());
    assert.throws(
      () => buildVerifierDiscoveryEnvelope({
        request: {
          run_id: "run-1",
          target: { fingerprint: "sha256:target" },
          deep_preflight: { ...refs(), expected_relations: ["rel-1"] }
        },
        providerBinding
      }),
      /forbidden or unknown fields/
    );
    const packet = buildVerifierDiscoveryEnvelope({
      request: { run_id: "run-1", target: { fingerprint: "sha256:target" }, deep_preflight: refs() },
      providerBinding
    });
    assert.throws(
      () => validateVerifierDiscoveryEnvelope(packet, { run_id: "run-2" }),
      /run_id does not match/
    );
    assert.throws(
      () => validateVerifierDiscoveryEnvelope({ ...packet, protocol: undefined }),
      /protocol must be review-run/
    );
  });

  await run("bilateral attestations reject reused execution identity even under separate lane labels", async () => {
    const expected = laneAttestation("expected", "expected-1");
    const observed = laneAttestation("observed", "observed-1");
    assert.equal(validateBilateralLaneAttestations(expected, observed).complete, true);
    const contaminated = { ...observed, execution_identity_ref: expected.execution_identity_ref };
    assert.throws(() => validateBilateralLaneAttestations(expected, contaminated), /reuse execution_identity_ref/);
  });
}
