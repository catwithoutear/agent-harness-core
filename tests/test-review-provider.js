import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  REQUIRED_CAPABILITIES,
  buildDiscoveryLaneAttestation,
  buildProviderBinding,
  selectProvider
} from "../skills/review/review-packet-gate/scripts/review-provider.mjs";

const key = (n) => ({ id: `skey-v1:${n}`, digest: `sha256:${n.repeat(64)}` });
const allCapabilities = () => Object.fromEntries(REQUIRED_CAPABILITIES.map((c) => [c, true]));

export async function run(run) {
  await run("selectProvider accepts a full capability matrix", async () => {
    const binding = selectProvider({ provider_id: "p1", version: "v1", capabilities: allCapabilities(), attestation_signing_key_ref: key("a"), lane_result_signing_key_ref: key("b") });
    assert.equal(binding.provider_id, "p1");
  });

  await run("selectProvider rejects a missing capability", async () => {
    const caps = allCapabilities();
    delete caps.fresh_process;
    assert.throws(() => selectProvider({ provider_id: "p1", capabilities: caps, attestation_signing_key_ref: key("a"), lane_result_signing_key_ref: key("b") }), ReviewRunError);
  });

  await run("provider binding requires distinct attestation and lane keys", async () => {
    assert.throws(() => buildProviderBinding({ provider_id: "p1", attestation_signing_key_ref: key("a"), lane_result_signing_key_ref: key("a") }), ReviewRunError);
  });

  await run("lane attestation rejects an invalid lane_kind", async () => {
    assert.throws(() => buildDiscoveryLaneAttestation({ lane_kind: "bogus", provider_ref: key("p"), signing_key_ref: key("a") }), ReviewRunError);
  });

  await run("lane attestation requires canonical provider/signing refs", async () => {
    assert.throws(() => buildDiscoveryLaneAttestation({ lane_kind: "expected", provider_ref: { id: "bare" }, signing_key_ref: key("a") }), ReviewRunError);
  });
}
