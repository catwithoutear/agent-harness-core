import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runChangeDoc } from "../lib/change/doc-tool.js";
import { runChangeValidate } from "../lib/change/validator.js";
import {
  acceptRun,
  nativeReviewPacket,
  buildNativeReviewPacket,
  verifierPhaseAPacket,
  validateDispatchPreflight,
  sha256Text,
  admitAttempt,
  aggregateCoverage,
  aggregateRun,
  beginShardPlanning,
  canonicalJSONStringify,
  composeGateResult,
  digestValue,
  finalizeRecord,
  initializeRunRoot,
  checkpointAttempt,
  dispatchRun,
  expireAttempt,
  failAttempt,
  parseJsonStrict,
  persistDiscovery,
  persistShardPlan,
  appendLedgerAttempt,
  cancelRun,
  checkTargetFreshness,
  resumeRun,
  routeRequest,
  runCli,
  validateDispatchContract,
  validateDiscovery,
  validateLedger,
  validateRequest
} from "../skills/review/review-packet-gate/scripts/review-run.mjs";

import { executeReviewTargetDigest } from "../skills/review/review-packet-gate/scripts/review-target-digest.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const cref = (id, character) => ({ id, digest: digest(character) });

function providerPolicy() {
  return {
    provider_id: "isolated-provider",
    version: "v1",
    implementation_digest: digest("1"),
    runtime_verified: true,
    conformance_receipt_ref: cref("receipt:provider", "2"),
    attestation_signing_key_ref: cref("key:controller", "3"),
    lane_result_signing_key_ref: cref("key:lane", "4"),
    capabilities: {
      fresh_process: true,
      fresh_session: true,
      no_parent_context: true,
      no_history: true,
      no_memory_mounts: true,
      no_direct_target_mount: true,
      broker_only_subject_reads: true,
      complete_subject_read_log: true,
      disjoint_lane_tokens: true,
      write_only_result_channels: true,
      closed_tool_set: true,
      environment_manifest: true,
      signed_receipts: true,
      provider_lane_signed_payload: true
    }
  };
}

function executionPolicy() {
  return {
    max_attempts_per_shard: 2,
    attempt_timeout_ms: 1000,
    run_timeout_ms: 10000,
    discovery_timeout_ms: 2000,
    max_discovery_relations: 100,
    max_shards: 8,
    checkpoint_interval_ms: 100
  };
}

function deepPreflight() {
  return {
    run_binding_ref: cref("run-binding:1", "5"),
    target_view_ref: cref("target-view:1", "6"),
    target_view_capability_ref: cref("target-capability:1", "7"),
    firewall_policy_ref: cref("firewall:1", "8"),
    policy_binding_refs: [cref("policy:1", "9")]
  };
}

function contract() {
  return {
    rules: [{ rule_id: "R1", source_ref: "rules/review.md" }],
    scope: ["src"],
    dimensions: [{ dimension_id: "D1", name: "coverage" }],
    relations: [
      {
        relation_id: "rel-1",
        unit_key: { unit_path: "src/a.js", anchor_kind: "function", anchor_value: "run" },
        dimension_id: "D1",
        rule_ref: { rule_id: "R1", source_ref: "rules/review.md" }
      },
      {
        relation_id: "rel-2",
        unit_key: { unit_path: "src/b.js", anchor_kind: "function", anchor_value: "stop" },
        dimension_id: "D1",
        rule_ref: { rule_id: "R1", source_ref: "rules/review.md" }
      }
    ]
  };
}

function request(overrides = {}) {
  return {
    record_type: "request",
    protocol: "review-run",
    request_id: "run-test",
    run_id: "run-test",
    active_change: "review-verifier-v2",
    execution_profile: "isolated",
    target: { fingerprint: "sha256:target", files: ["src/a.js", "src/b.js"] },
    risk_facts: { mandatory_deep: true, risk_level: "critical" },
    execution_policy: executionPolicy(),
    provider_policy: providerPolicy(),
    deep_preflight: deepPreflight(),
    dispatch_contract: contract(),
    ...overrides
  };
}

function discovery(req) {
  return {
    record_type: "discovery",
    protocol: "review-run",
    run_id: req.run_id,
    contract_digest: req.dispatch_contract.contract_digest,
    discovery_sealed: true,
    relations: req.dispatch_contract.relations,
    rule_sources: [{ source_ref: "rules/review.md", digest: "sha256:rules" }],
    unit_keys: req.dispatch_contract.relations.map((relation) => relation.unit_key),
    dimensions: req.dispatch_contract.dimensions,
    exclusions: [],
    unknowns: [],
    boundary_facts: []
  };
}

function plan(req, sealed) {
  return {
    record_type: "shard-plan",
    protocol: "review-run",
    run_id: req.run_id,
    discovery_digest: sealed.record_digest,
    shards: [{ shard_id: "shard-1", relation_ids: ["rel-1", "rel-2"] }]
  };
}

function ledger(req, sealed, status = "covered") {
  return {
    record_type: "review-ledger",
    protocol: "review-run",
    run_id: req.run_id,
    attempt_id: "attempt-1",
    shard_id: "shard-1",
    input_digest: "sha256:attempt-input",
    contract_digest: req.dispatch_contract.contract_digest,
    discovery_digest: sealed.record_digest,
    entries: req.dispatch_contract.relations.map((relation) => ({
      relation_id: relation.relation_id,
      unit_key: relation.unit_key,
      dimension_id: relation.dimension_id,
      rule_ref: relation.rule_ref,
      status,
      evidence: [{ kind: "test", ref: "tests/test-review-run.js" }],
      ...(status === "not-applicable" ? { applicability: { authority: "reviewer", rationale: "explicitly outside target", inferred: false } } : {})
    }))
  };
}

function readyGateEvidence() {
  return [
    { gate_name: "review_gate", owner: "reviewer", owner_receipt_ref: cref("receipt:reviewer", "a"), status: "READY", evidence: [{ kind: "review-ledger", ref: "attempts/attempt-1.json" }] },
    { gate_name: "independent_review_gate", owner: "review-verifier", owner_receipt_ref: cref("receipt:verifier", "b"), status: "READY", evidence: [{ kind: "discovery-barrier", ref: "evidence/discovery-barrier.json" }] },
    { gate_name: "style_gate", owner: "reviewer", owner_receipt_ref: cref("receipt:style", "c"), status: "READY", evidence: [{ kind: "style-ledger", ref: "evidence/style-ledger.json" }] },
    { gate_name: "implementation_verification_gate", owner: "verification-workflow", owner_receipt_ref: cref("receipt:verification", "d"), status: "READY", evidence: [{ kind: "verification-report", ref: "evidence/verification-report.json" }] }
  ];
}

export async function run(test) {
  await test("native default binds returned output, source evidence and machine packets with validator parity", () => {
    withTempDir((repo) => {
      writeStructuredChange(repo);
      const codeRoot = path.join(repo, "code");
      fs.mkdirSync(path.join(codeRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(codeRoot, "src/a.js"), "function run() {}\n");
      fs.writeFileSync(path.join(codeRoot, "src/b.js"), "function stop() {}\n");
      fs.mkdirSync(path.join(codeRoot, "context"));
      fs.writeFileSync(path.join(codeRoot, "context/api.js"), "function api() {}\n");
      const snapshot = executeReviewTargetDigest(["source-snapshot", "--code-root", codeRoot, "--include-path", "src", "--include-path", "context", "--target-path", "src"]).body;
      const manifest = path.join(repo, "snapshot.json");
      fs.writeFileSync(manifest, JSON.stringify(snapshot));
      const receipts = snapshot.files.map((file) => executeReviewTargetDigest(["source-read", "--code-root", codeRoot, "--snapshot", manifest, "--path", file.path]).body);
      const change = path.join(repo, ".changes/review-verifier-v2");
      const runRoot = path.join(change, "review-runs/native-run");
      fs.mkdirSync(path.join(change, "reviews/materials/native-run"), { recursive: true });
      fs.writeFileSync(path.join(change, "reviews/README.md"), artifactFrontMatter("reviews-index", "workflow") + "# Reviews\n\n## Child Index\n\n| path | artifact | status | order | description |\n|---|---|---|---|---|\n");
      const material = (name, value) => {
        const text = JSON.stringify(value, null, 2) + "\n";
        const relative = `reviews/materials/native-run/${name}.json`;
        fs.writeFileSync(path.join(change, relative), text);
        return { path: relative, digest: sha256Text(text) };
      };
      const execution = (id, packet, raw, name) => ({ execution_id: id, execution_status: "completed", input_digest: packet.record_digest,
        output_ref: material(name, raw), source_receipts_ref: material(`${name}-receipts`, receipts) });
      const rawRequest = request({ request_id: "native-run", run_id: "native-run", native_preflight: { source_snapshot: snapshot } });
      delete rawRequest.execution_profile;
      delete rawRequest.provider_policy;
      delete rawRequest.deep_preflight;
      initializeRunRoot(runRoot);
      const accepted = acceptRun(runRoot, rawRequest, { now: () => 0 });
      assert.equal(accepted.routing.execution_profile, "native");
      assert.equal(accepted.preflight.provider_binding, undefined);
      const extraRelation = { ...accepted.request.dispatch_contract.relations[0], relation_id: "context-relation", unit_key: { unit_path: "context/api.js", anchor_kind: "function", anchor_value: "api" }, discovery_origin: "target-derived" };
      const expanded = validateDiscovery({ ...discovery(accepted.request), relations: [...accepted.request.dispatch_contract.relations, extraRelation] }, accepted.request.dispatch_contract);
      const expandedPlan = { ...plan(accepted.request, expanded), shards: [{ shard_id: "shard-1", relation_ids: expanded.relations.map((item) => item.relation_id) }] };
      assert.throws(() => buildNativeReviewPacket({ request: accepted.request, preflight: accepted.preflight, discovery: expanded, plan: expandedPlan, shard_id: "shard-1", attempt_id: "context-attempt" }), /assigned unit/);
      const phaseA = verifierPhaseAPacket(runRoot);
      assert.equal(phaseA.expected_relations, undefined);
      assert.equal(phaseA.contract_digest, undefined);
      assert.deepEqual(phaseA.source_snapshot, snapshot);
      assert.throws(() => validateDispatchPreflight(finalizeRecord({ ...accepted.preflight, execution_profile: "isolated" }), accepted.request, accepted.routing), /profile mismatch/);
      const inventory = { observed_units: rawRequest.dispatch_contract.relations.map((relation) => relation.unit_key),
        observations: rawRequest.dispatch_contract.relations.map((relation) => ({ unit_key: relation.unit_key, dimension_id: "correctness", disposition: "inspect", evidence_refs: [relation.unit_key.unit_path] })), source_refs: ["src/a.js", "src/b.js"] };
      inventory.observations.push({ unit_key: inventory.observed_units[0], dimension_id: "context", disposition: "context only", evidence_refs: ["src/a.js"] });
      const rawDiscovery = discovery(accepted.request);
      rawDiscovery.native_inventory = inventory;
      rawDiscovery.native_observation_mapping = [{ observation_index: 0, relation_ids: ["rel-1"] }, { observation_index: 1, relation_ids: ["rel-2"] }, { observation_index: 2, relation_ids: [], reason: "Context preserved for Phase B assessment" }];
      rawDiscovery.native_execution = execution("child-inventory", phaseA, inventory, "inventory");
      assert.throws(() => persistDiscovery(runRoot, rawDiscovery, { now: () => 100 }), /code-root/);
      for (const status of ["queued", "running", "failed"]) assert.throws(() => persistDiscovery(runRoot, { ...rawDiscovery, native_execution: { ...rawDiscovery.native_execution, execution_status: status } }, { now: () => 100, codeRoot }), /completed child/);
      assert.throws(() => persistDiscovery(runRoot, { ...rawDiscovery, native_execution: { ...rawDiscovery.native_execution, input_digest: digest("9") } }, { now: () => 100, codeRoot }), /machine packet/);
      assert.throws(() => persistDiscovery(runRoot, { ...rawDiscovery, native_observation_mapping: [{ observation_index: 0, relation_ids: ["rel-1", "rel-2"] }] }, { now: () => 100, codeRoot }), /dropped observations/);
      const forgedReceipts = structuredClone(receipts);
      forgedReceipts[0].lines[0].text = "invented";
      assert.throws(() => persistDiscovery(runRoot, { ...rawDiscovery, native_execution: { ...rawDiscovery.native_execution, source_receipts_ref: material("forged", forgedReceipts) } }, { now: () => 100, codeRoot }), /source evidence failed/);
      fs.symlinkSync(manifest, path.join(change, "reviews/materials/native-run/escape.json"));
      assert.throws(() => persistDiscovery(runRoot, { ...rawDiscovery, native_execution: { ...rawDiscovery.native_execution, output_ref: { path: "reviews/materials/native-run/escape.json", digest: sha256Text(fs.readFileSync(manifest)) } } }, { now: () => 100, codeRoot }), /escapes reviews/);
      fs.writeFileSync(path.join(codeRoot, "src/b.js"), "changed\n");
      assert.throws(() => persistDiscovery(runRoot, rawDiscovery, { now: () => 100, codeRoot }), /source evidence failed/);
      fs.writeFileSync(path.join(codeRoot, "src/b.js"), "function stop() {}\n");
      const sealed = persistDiscovery(runRoot, rawDiscovery, { now: () => 100, codeRoot });
      beginShardPlanning(runRoot);
      persistShardPlan(runRoot, plan(accepted.request, sealed));
      dispatchRun(runRoot);
      const packet = nativeReviewPacket(runRoot, { shard_id: "shard-1", attempt_id: "attempt-1" });
      assert.deepEqual(packet.relations.map((relation) => relation.relation_id), ["rel-1", "rel-2"]);
      assert.throws(() => admitAttempt(runRoot, { shard_id: "shard-1", attempt_id: "attempt-1", input_digest: digest("7") }, { now: () => 200 }), /machine reviewer packet/);
      admitAttempt(runRoot, { shard_id: "shard-1", attempt_id: "attempt-1", input_digest: packet.record_digest }, { now: () => 200 });
      const failedPacket = nativeReviewPacket(runRoot, { shard_id: "shard-1", attempt_id: "failed-native" });
      admitAttempt(runRoot, { shard_id: "shard-1", attempt_id: "failed-native", input_digest: failedPacket.record_digest }, { now: () => 200 });
      const failed = failAttempt(runRoot, { attempt_id: "failed-native", kind: "PROVIDER_RUNTIME_GAP", phase: "correctness-review", message: "Child returned no successful output" }, { now: () => 250 });
      assert.equal(failed.attempt_status, "failed");
      assert.equal(failed.native_execution, undefined);
      const rawLedger = { ...ledger(accepted.request, sealed), input_digest: packet.record_digest };
      const nativeLedger = { ...rawLedger, native_execution: execution("child-reviewer", packet, rawLedger, "reviewer") };
      assert.throws(() => appendLedgerAttempt(runRoot, { ...nativeLedger, native_execution: { ...nativeLedger.native_execution, execution_id: "child-inventory" } }, { now: () => 300, codeRoot }), /reused Phase A/);
      appendLedgerAttempt(runRoot, nativeLedger, { now: () => 300, codeRoot });
      const result = aggregateRun(runRoot, { now: () => 400, gateEvidence: readyGateEvidence() });
      assert.equal(result.gate_result.overall_gate, "READY");
      const jsValidate = () => capture(() => runChangeValidate(["--state-root", repo, "--change", "review-verifier-v2", "--strict-layout"]));
      const pyValidate = () => spawnSync("python3", ["lib/change/harness_change_validate.py", "--state-root", repo, "--change", "review-verifier-v2", "--strict-layout"], { encoding: "utf8" });
      const js = jsValidate();
      assert.equal(js.status, 0, js.stdout + js.stderr);
      const py = pyValidate();
      assert.equal(py.status, 0, py.stdout + py.stderr);
      const ledgerPath = path.join(runRoot, "attempts/attempt-1.json");
      const originalLedgerBytes = fs.readFileSync(ledgerPath);
      const originalOutputBytes = fs.readFileSync(path.join(change, nativeLedger.native_execution.output_ref.path));
      const missingExecution = JSON.parse(originalLedgerBytes.toString("utf8"));
      delete missingExecution.attempt_status;
      delete missingExecution.native_execution;
      fs.writeFileSync(ledgerPath, JSON.stringify(finalizeRecord(missingExecution)));
      const jsMissingExecution = jsValidate();
      const pyMissingExecution = pyValidate();
      assert.notEqual(jsMissingExecution.status, 0);
      assert.match(jsMissingExecution.stdout + jsMissingExecution.stderr, /native_execution|native execution/);
      assert.notEqual(pyMissingExecution.status, 0);
      assert.match(pyMissingExecution.stdout + pyMissingExecution.stderr, /native execution/);
      fs.writeFileSync(ledgerPath, originalLedgerBytes);
      assert.deepEqual(fs.readFileSync(path.join(change, nativeLedger.native_execution.output_ref.path)), originalOutputBytes);
      assert.equal(jsValidate().status, 0);
      assert.equal(pyValidate().status, 0);
      const tamperedRequest = finalizeRecord({ ...accepted.request, target: { ...accepted.request.target, files: ["missing.js"] } });
      const tamperedRouting = finalizeRecord({ ...accepted.routing, request_digest: tamperedRequest.record_digest });
      const tamperedPreflight = finalizeRecord({ ...accepted.preflight, request_ref: { id: tamperedRequest.record_id, digest: tamperedRequest.record_digest }, routing_ref: { id: tamperedRouting.record_id, digest: tamperedRouting.record_digest } });
      for (const [name, record] of [["request", tamperedRequest], ["routing-decision", tamperedRouting], ["dispatch-preflight", tamperedPreflight]]) fs.writeFileSync(path.join(runRoot, `${name}.json`), JSON.stringify(record));
      const jsScopeGap = jsValidate();
      const pyScopeGap = pyValidate();
      assert.notEqual(jsScopeGap.status, 0);
      assert.match(jsScopeGap.stdout + jsScopeGap.stderr, /does not cover declared target files/);
      assert.notEqual(pyScopeGap.status, 0);
      assert.match(pyScopeGap.stdout + pyScopeGap.stderr, /does not cover declared target files/);
      for (const [name, record] of [["request", accepted.request], ["routing-decision", accepted.routing], ["dispatch-preflight", accepted.preflight]]) fs.writeFileSync(path.join(runRoot, `${name}.json`), JSON.stringify(record));
      const discoveryPath = path.join(runRoot, "discovery.json");
      const contaminated = structuredClone(sealed);
      contaminated.native_inventory.observations[0].expected_relation_id = "rel-1";
      const contaminatedRaw = material("contaminated-inventory", contaminated.native_inventory);
      contaminated.native_execution.output_ref = contaminatedRaw;
      fs.writeFileSync(discoveryPath, JSON.stringify(finalizeRecord(contaminated)));
      assert.notEqual(jsValidate().status, 0);
      assert.notEqual(pyValidate().status, 0);
      fs.writeFileSync(discoveryPath, JSON.stringify(sealed));
      material("inventory", inventory);
      fs.writeFileSync(path.join(change, "reviews/unowned.json"), "{}");
      assert.notEqual(jsValidate().status, 0);
      assert.notEqual(pyValidate().status, 0);
    });
  });

  await test("native machine assignment explicitly rejects quick and standard dispatched runs", () => {
    withTempDir((root) => {
      for (const assurance of ["quick", "standard"]) {
        const runRoot = path.join(root, assurance);
        const raw = request({ request_id: assurance, run_id: assurance, execution_profile: "native", requested_assurance: assurance, risk_facts: { mandatory_deep: false } });
        delete raw.provider_policy;
        delete raw.deep_preflight;
        initializeRunRoot(runRoot);
        const accepted = acceptRun(runRoot, raw);
        const sealed = persistDiscovery(runRoot, discovery(accepted.request));
        beginShardPlanning(runRoot);
        persistShardPlan(runRoot, plan(accepted.request, sealed));
        assert.equal(dispatchRun(runRoot).state, "running");
        assert.throws(() => nativeReviewPacket(runRoot, { shard_id: "shard-1", attempt_id: "attempt-1" }), (error) => error.code === "INVALID_STATE_TRANSITION" && error.message.includes("supports deep"));
      }
    });
  });

  await test("legacy persisted profile remains isolated without rewriting immutable routing or preflight", () => {
    withTempDir((root) => {
      const runRoot = path.join(root, "run-test");
      initializeRunRoot(runRoot);
      const accepted = acceptRun(runRoot, request());
      const legacyRequest = structuredClone(accepted.request);
      delete legacyRequest.execution_profile;
      const normalized = finalizeRecord(legacyRequest);
      const legacyRouting = structuredClone(accepted.routing);
      delete legacyRouting.execution_profile;
      legacyRouting.request_digest = normalized.record_digest;
      const routing = finalizeRecord(legacyRouting);
      const legacyPreflight = structuredClone(accepted.preflight);
      delete legacyPreflight.execution_profile;
      legacyPreflight.request_ref = { id: normalized.record_id, digest: normalized.record_digest };
      legacyPreflight.routing_ref = { id: routing.record_id, digest: routing.record_digest };
      const preflight = finalizeRecord(legacyPreflight);
      for (const [name, record] of [["request", normalized], ["routing-decision", routing], ["dispatch-preflight", preflight]]) fs.writeFileSync(path.join(runRoot, `${name}.json`), JSON.stringify(record));
      const before = ["routing-decision", "dispatch-preflight"].map((name) => fs.readFileSync(path.join(runRoot, `${name}.json`), "utf8"));
      assert.equal(acceptRun(runRoot, normalized).routing.execution_profile, undefined);
      assert.equal(verifierPhaseAPacket(runRoot).provider_binding_ref.id, preflight.provider_binding.record_id);
      assert.deepEqual(["routing-decision", "dispatch-preflight"].map((name) => fs.readFileSync(path.join(runRoot, `${name}.json`), "utf8")), before);
      assert.throws(() => validateRequest(request({ execution_profile: "unknown" })), /unknown execution_profile/);
      const invalidRoot = path.join(root, "null-profile");
      initializeRunRoot(invalidRoot);
      assert.throws(() => acceptRun(invalidRoot, request({ request_id: "null-profile", run_id: "null-profile", execution_profile: null })), /unknown execution_profile/);
      assert.equal(fs.existsSync(path.join(invalidRoot, "request.json")), false);
      assert.equal(fs.existsSync(path.join(invalidRoot, "routing-decision.json")), false);
    });
  });

  await test("canonical JSON is key-order independent and duplicate-key safe", () => {
    const left = { b: 2, a: { z: true, y: ["x", 1] } };
    const right = { a: { y: ["x", 1], z: true }, b: 2 };
    assert.equal(canonicalJSONStringify(left), canonicalJSONStringify(right));
    assert.equal(digestValue(left), digestValue(right));
    assert.throws(() => parseJsonStrict('{"a":1,"a":2}'), /duplicate object key/);
  });

  await test("review request carries the exact immutable dispatch contract and routes deep", () => {
    const normalized = validateRequest(request());
    assert.match(normalized.dispatch_contract.contract_digest, /^sha256:/);
    assert.equal(routeRequest(normalized).selected_mode, "deep");
    assert.throws(
      () => validateRequest(request({ protocol: "review-run-v2" })),
      /protocol must be review-run/
    );
    assert.throws(
      () => validateRequest(request({ protocol: undefined })),
      /protocol must be review-run/
    );
    assert.throws(
      () => validateRequest(request({ dispatch_contract: { ...contract(), dimensions: [] } })),
      /dimensions must be an array|relations|dimension/
    );
  });

  await test("deep dispatch fails before persistence when provider preflight is not attestable", () => {
    withTempDir((root) => {
      const runRoot = path.join(root, "preflight-run");
      initializeRunRoot(runRoot);
      const broken = request({
        request_id: "preflight-run",
        run_id: "preflight-run",
        provider_policy: { ...providerPolicy(), runtime_verified: false }
      });
      assert.throws(() => acceptRun(runRoot, broken), /runtime conformance receipt/);
      assert.equal(fs.existsSync(path.join(runRoot, "request.json")), false);
    });
  });

  await test("discovery may add only auditable target-derived relations", () => {
    const req = validateRequest(request());
    const extra = {
      relation_id: "rel-discovered",
      unit_key: { unit_path: "src/discovered.js", anchor_kind: "function", anchor_value: "expand" },
      dimension_id: "D1",
      rule_ref: { rule_id: "R1", source_ref: "rules/review.md" },
      discovery_origin: "target-derived"
    };
    const expanded = validateDiscovery({
      ...discovery(req),
      relations: [...req.dispatch_contract.relations, extra],
      unit_keys: [...req.dispatch_contract.relations.map((relation) => relation.unit_key), extra.unit_key]
    }, req.dispatch_contract);
    assert.equal(expanded.relations.length, 3);
    assert.equal(expanded.relations[2].discovery_origin, "target-derived");
    const expandedLedger = ledger(req, expanded);
    expandedLedger.entries.push({
      ...extra,
      status: "covered",
      evidence: [{ kind: "test", ref: "tests/test-review-run.js" }]
    });
    assert.equal(validateLedger(expandedLedger, expanded).entries.length, 3);
    assert.throws(
      () => validateDiscovery({ ...discovery(req), relations: [...req.dispatch_contract.relations, { ...extra, discovery_origin: undefined }] }, req.dispatch_contract),
      /discovery_origin=target-derived/
    );
  });

  await test("explicit downgrade is visible rather than inferred", () => {
    const normalized = validateRequest(request({
      requested_assurance: "standard",
      allow_downgrade: true,
      downgrade_reason: "owner accepted bounded scope"
    }));
    const routing = routeRequest(normalized);
    assert.equal(routing.selected_mode, "standard");
    assert.equal(routing.downgrade, true);
    assert.equal(routing.downgrade_reason, "owner accepted bounded scope");
  });

  await test("relation ledger requires evidence and explicit reviewer N/A", () => {
    const req = validateRequest(request());
    const sealed = requireDiscovery(req);
    const persisted = finalizeRecord(ledger(req, sealed), "attempt:attempt-1");
    assert.throws(
      () => validateLedger({ ...persisted, entries: persisted.entries.slice(1) }, sealed),
      /record digest does not match/
    );
    assert.throws(
      () => validateLedger({ ...ledger(req, sealed), entries: [{ ...ledger(req, sealed).entries[0], evidence: [] }, ledger(req, sealed).entries[1]] }, sealed),
      /must not be empty/
    );
    assert.throws(
      () => validateLedger({ ...ledger(req, sealed, "not-applicable"), entries: ledger(req, sealed, "not-applicable").entries.map((entry) => ({ ...entry, applicability: { authority: "system", rationale: "guess" } })) }, sealed),
      /requires reviewer authority/
    );
  });

  await test("ledger closure validates references without attesting semantic evidence adequacy", () => {
    const req = validateRequest(request());
    const sealed = requireDiscovery(req);
    const unsupported = ledger(req, sealed);
    for (const entry of unsupported.entries) {
      entry.evidence = [{ kind: "source", ref: "unread/blanket-coverage-claim.md" }];
    }
    // The runtime deliberately has no target resolver here. A machine READY
    // is not proof that the cited document exists or substantiates a keep reason.
    assert.doesNotThrow(() => validateLedger(unsupported, sealed));
    const aggregate = aggregateCoverage(sealed, [unsupported]);
    assert.equal(aggregate.coverage_gate, "READY");
    const gateEvidence = readyGateEvidence();
    const independent = gateEvidence.find((item) => item.gate_name === "independent_review_gate");
    independent.status = "NOT_READY";
    independent.blocking_reasons = ["EVIDENCE_GAP: comparison unavailable"];
    for (const selectedMode of ["quick", "standard", "deep"]) {
      const result = composeGateResult({ aggregate, selectedMode, gateEvidence });
      assert.equal(result.independent_review_gate, "NOT_READY");
      assert.equal(result.overall_gate, "NOT_READY");
      if (selectedMode === "deep") assert.equal(result.coverage_gate, "NOT_READY");
    }
    unsupported.entries[0].evidence = [];
    assert.throws(() => validateLedger(unsupported, sealed), /must not be empty/);
  });

  await test("durable run lifecycle enforces the discovery barrier and persists five evidence gates plus overall", () => {
    withTempDir((root) => {
      const runRoot = path.join(root, "run-test");
      initializeRunRoot(runRoot);
      const accepted = acceptRun(runRoot, request(), { now: () => 0 });
      assert.equal(accepted.preflight.passed, true);
      assert.throws(() => beginShardPlanning(runRoot), /cannot begin shard planning/);
      const sealed = persistDiscovery(runRoot, discovery(accepted.request), { now: () => 100 });
      assert.throws(() => persistShardPlan(runRoot, plan(accepted.request, sealed)), /cannot persist shard plan/);
      beginShardPlanning(runRoot);
      const shardPlan = persistShardPlan(runRoot, plan(accepted.request, sealed));
      assert.equal(shardPlan.record_type, "shard-plan");
      dispatchRun(runRoot);
      admitAttempt(runRoot, {
        attempt_id: "attempt-1",
        shard_id: "shard-1",
        input_digest: "sha256:attempt-input",
        phase: "correctness-review"
      }, { now: () => 200 });
      const acceptedLedger = appendLedgerAttempt(runRoot, ledger(accepted.request, sealed), { now: () => 300 });
      const result = aggregateRun(runRoot, {
        gateEvidence: readyGateEvidence()
      });
      assert.equal(acceptedLedger.record_type, "review-ledger");
      assert.equal(result.aggregate.coverage_gate, "READY");
      assert.equal(result.gate_result.overall_gate, "READY");
      assert.equal(result.control.state, "completed");
      assert.equal(fs.existsSync(path.join(runRoot, "control", "current.json")), true);
      assert.equal(fs.existsSync(path.join(runRoot, "aggregate-report.json")), true);
      assert.equal(fs.existsSync(path.join(runRoot, "gate-result.json")), true);
    });
  });

  await test("pending owner attempt and not-covered block acceptance while a new run preserves prior evidence", () => {
    withTempDir((root) => {
      function start(runId) {
        const runRoot = path.join(root, runId);
        const accepted = acceptRun(runRoot, request({ request_id: runId, run_id: runId }), { now: () => 0 });
        const sealed = persistDiscovery(runRoot, discovery(accepted.request), { now: () => 100 });
        beginShardPlanning(runRoot);
        persistShardPlan(runRoot, plan(accepted.request, sealed));
        dispatchRun(runRoot);
        admitAttempt(runRoot, { attempt_id: "attempt-1", shard_id: "shard-1", input_digest: "sha256:attempt-input" }, { now: () => 200 });
        return { runRoot, req: accepted.request, sealed };
      }
      const first = start("return-open");
      // An owner has not yet resolved the coordinator return. An assessment
      // or passing verification receipt cannot stand in for that response.
      const coordinatorSourceAssessment = {
        owner: "coordinator", status: "READY",
        evidence: [{ kind: "source-review", ref: "reports/coordinator-assessment.md" }]
      };
      assert.throws(() => aggregateRun(first.runRoot, { now: () => 250, gateEvidence: readyGateEvidence(), coordinatorSourceAssessment }), /attempts remain active/);
      const response = ledger(first.req, first.sealed);
      response.entries[0].status = "not-covered";
      response.entries[0].evidence = [{ kind: "source-review", ref: "reports/unresolved-comparison.md" }];
      const accepted = appendLedgerAttempt(first.runRoot, response, { now: () => 300 });
      const priorBytes = fs.readFileSync(path.join(first.runRoot, "attempts", "attempt-1.json"), "utf8");
      const blocked = aggregateRun(first.runRoot, { now: () => 400, gateEvidence: readyGateEvidence(), coordinatorSourceAssessment });
      assert.equal(blocked.control.state, "completed");
      assert.equal(blocked.gate_result.coverage_gate, "NOT_READY");
      assert.equal(blocked.gate_result.overall_gate, "NOT_READY");
      assert.equal(blocked.gate_result.coordinator_source_assessment.gating, false);
      assert.deepEqual(blocked.aggregate.exact_gaps.map((gap) => [gap.type, gap.relation_id]), [["NOT_COVERED", "rel-1"]]);
      const amended = ledger(first.req, first.sealed);
      assert.throws(() => appendLedgerAttempt(first.runRoot, amended), /already has a terminal result/);

      const successor = start("return-corrected");
      assert.equal(successor.req.target.fingerprint, first.req.target.fingerprint);
      assert.equal(successor.req.dispatch_contract.contract_digest, first.req.dispatch_contract.contract_digest);
      const corrected = ledger(successor.req, successor.sealed);
      // This reference is coordinator-supplied lineage, not validated by the
      // filesystem runtime. The original report/return belongs in Review Packet.
      corrected.created_from = [accepted.record_digest];
      corrected.entries[0].evidence = [{ kind: "source-review", ref: "reports/corrected-comparison.md" }];
      // Correctness of this comparison is an owner/coordinator judgment. These
      // synthetic receipts exercise only the already-owned runtime lifecycle.
      appendLedgerAttempt(successor.runRoot, corrected, { now: () => 300 });
      const closed = aggregateRun(successor.runRoot, { now: () => 400, gateEvidence: readyGateEvidence() });
      assert.equal(closed.gate_result.overall_gate, "READY");
      assert.equal(fs.readFileSync(path.join(first.runRoot, "attempts", "attempt-1.json"), "utf8"), priorBytes);
      assert.equal(JSON.parse(fs.readFileSync(path.join(first.runRoot, "gate-result.json"), "utf8")).overall_gate, "NOT_READY");
    });
  });

  await test("overlapping successful retry cannot replace a sealed not-covered relation", () => {
    withTempDir((root) => {
      const runRoot = path.join(root, "duplicate-return");
      const { request: req } = acceptRun(runRoot, request({ request_id: "duplicate-return", run_id: "duplicate-return" }), { now: () => 0 });
      const sealed = persistDiscovery(runRoot, discovery(req), { now: () => 100 });
      beginShardPlanning(runRoot);
      persistShardPlan(runRoot, plan(req, sealed));
      dispatchRun(runRoot);
      for (const [index, attemptId] of ["attempt-1", "attempt-2"].entries()) {
        admitAttempt(runRoot, { attempt_id: attemptId, shard_id: "shard-1", input_digest: "sha256:attempt-input" }, { now: () => 200 + index * 100 });
        const response = ledger(req, sealed);
        response.attempt_id = attemptId;
        if (index === 0) response.entries[0].status = "not-covered";
        appendLedgerAttempt(runRoot, response, { now: () => 250 + index * 100 });
      }
      const result = aggregateRun(runRoot, { now: () => 400, gateEvidence: readyGateEvidence() });
      assert.equal(result.aggregate.coverage_gate, "NOT_READY");
      assert(result.aggregate.exact_gaps.some((gap) => gap.type === "DUPLICATE_RELATION" && gap.relation_id === "rel-1"));
      assert.equal(result.gate_result.overall_gate, "NOT_READY");
    });
  });

  await test("gate ownership is fail-closed and coordinator source assessment is non-gating", () => {
    const aggregate = finalizeRecord({
      record_type: "aggregate-report",
      protocol: "review-run",
      run_id: "gate-run",
      coverage_gate: "READY"
    }, "aggregate:gate-run");
    const evidence = readyGateEvidence().filter((item) => item.gate_name !== "independent_review_gate");
    evidence.find((item) => item.gate_name === "review_gate").owner = "coordinator";
    const result = composeGateResult({
      aggregate,
      selectedMode: "deep",
      gateEvidence: evidence,
      coordinatorSourceAssessment: {
        owner: "coordinator",
        status: "READY_WITH_NOTES",
        evidence: [{ kind: "source-review", ref: "reports/coordinator-source-review.json" }]
      }
    });
    assert.equal(result.coordinator_coverage_assessment, "READY");
    assert.equal(result.coverage_gate, "NOT_READY");
    assert.equal(result.review_gate, "NOT_READY");
    assert.equal(result.independent_review_gate, "NOT_READY");
    assert.equal(result.coordinator_source_assessment.gating, false);
    assert.equal(result.overall_gate, "NOT_READY");
  });

  await test("aggregation sweeps expired attempts into durable failed ledgers", () => {
    withTempDir((root) => {
      const runRoot = path.join(root, "timeout-run");
      initializeRunRoot(runRoot);
      const accepted = acceptRun(runRoot, request({ request_id: "timeout-run", run_id: "timeout-run" }), { now: () => 0 });
      const sealed = persistDiscovery(runRoot, discovery(accepted.request), { now: () => 100 });
      beginShardPlanning(runRoot);
      persistShardPlan(runRoot, plan(accepted.request, sealed));
      dispatchRun(runRoot);
      admitAttempt(runRoot, { attempt_id: "timed-out", shard_id: "shard-1", input_digest: "sha256:timed-out", phase: "correctness-review" }, { now: () => 200 });
      const result = aggregateRun(runRoot, { now: () => 1300 });
      assert.equal(result.aggregate.coverage_gate, "NOT_READY");
      const persisted = JSON.parse(fs.readFileSync(path.join(runRoot, "attempts", "timed-out.json"), "utf8"));
      assert.equal(persisted.failure.kind, "ATTEMPT_TIMEOUT");
      assert.equal(result.gate_result.overall_gate, "NOT_READY");
    });
  });

  await test("review-run CLI accepts canonical input and emits machine-readable errors", () => {
    withTempDir((root) => {
      const runRoot = path.join(root, "cli-run");
      initializeRunRoot(runRoot);
      const input = path.join(root, "request.json");
      fs.writeFileSync(input, `${JSON.stringify(request({ request_id: "cli-run", run_id: "cli-run" }))}\n`);
      const accepted = capture(() => runCli(["accept", "--run-root", runRoot, "--input", input, "--json"]));
      assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
      assert.match(accepted.stdout, /routing/);
      const malformed = path.join(root, "malformed.json");
      fs.writeFileSync(malformed, "{\"record_type\":\"request\",\"record_type\":\"request\"}\n");
      const rejected = capture(() => runCli(["accept", "--run-root", runRoot, "--input", malformed, "--json"]));
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /INVALID_JSON|REQUEST_ID_CONFLICT/);
    });
  });

  await test("failed attempts remain visible, retry is bounded, cancellation is terminal, and stale targets invalidate", () => {
    withTempDir((root) => {
      const runRoot = path.join(root, "recovery-run");
      initializeRunRoot(runRoot);
      const accepted = acceptRun(runRoot, request({ request_id: "recovery-run", run_id: "recovery-run" }), { now: () => 0 });
      const sealed = persistDiscovery(runRoot, discovery(accepted.request), { now: () => 100 });
      beginShardPlanning(runRoot);
      persistShardPlan(runRoot, plan(accepted.request, sealed));
      dispatchRun(runRoot);
      admitAttempt(runRoot, { attempt_id: "failed-1", shard_id: "shard-1", input_digest: "sha256:failed-input", phase: "correctness-review" }, { now: () => 200 });
      const checkpoint = checkpointAttempt(runRoot, {
        attempt_id: "failed-1",
        checkpoint_id: "checkpoint-1",
        phase: "source-read",
        summary: "partial source inventory",
        evidence: [{ kind: "diagnostic", ref: "attempt-output/checkpoint-1.json" }]
      }, { now: () => 300 });
      assert.equal(checkpoint.coverage_eligible, false);
      const failed = expireAttempt(runRoot, "failed-1", { now: () => 1300 });
      assert.equal(failed.failure.kind, "ATTEMPT_TIMEOUT");
      assert.equal(failed.failure.diagnostic_checkpoint.independent_evidence, false);
      admitAttempt(runRoot, { attempt_id: "success-1", shard_id: "shard-1", input_digest: "sha256:attempt-input", phase: "correctness-review" }, { now: () => 1400 });
      const successful = { ...ledger(accepted.request, sealed), attempt_id: "success-1" };
      appendLedgerAttempt(runRoot, successful, { now: () => 1500 });
      const result = aggregateRun(runRoot, { gateEvidence: readyGateEvidence() });
      assert.equal(result.aggregate.coverage_gate, "READY");
      assert.equal(result.aggregate.failed_or_stale.some((item) => item.attempt_id === "failed-1"), true);
      assert.equal(result.aggregate.failed_or_stale.filter((item) => item.attempt_id === "failed-1").length, 1);

      assert.throws(() => checkTargetFreshness(runRoot, "sha256:changed"), (error) => error.code === "STALE_REVIEW");
      assert.throws(() => resumeRun(runRoot), /successor run/);

      const cancelRoot = path.join(root, "cancel-run");
      initializeRunRoot(cancelRoot);
      const cancelAccepted = acceptRun(cancelRoot, request({ request_id: "cancel-run", run_id: "cancel-run" }));
      const cancelDiscovery = persistDiscovery(cancelRoot, discovery(cancelAccepted.request));
      beginShardPlanning(cancelRoot);
      persistShardPlan(cancelRoot, plan(cancelAccepted.request, cancelDiscovery));
      const cancelled = cancelRun(cancelRoot);
      assert.equal(cancelled.control.state, "cancelled");
      assert.equal(cancelled.aggregate.terminal_reason, "RUN_CANCELLED");
      assert.equal(cancelled.aggregate.coverage_gate, "NOT_READY");

      const earlyRoot = path.join(root, "early-cancel-run");
      initializeRunRoot(earlyRoot);
      const earlyCancelled = cancelRun(earlyRoot);
      assert.equal(earlyCancelled.control.state, "cancelled");
      assert.equal(earlyCancelled.aggregate.exact_gaps[0].type, "DISCOVERY_NOT_SEALED");
      assert.equal(earlyCancelled.gate_result.overall_gate, "NOT_READY");
      assert.throws(() => resumeRun(earlyRoot), /successor run/);
    });
  });

  await test("JS and Python init-review-run commands own the same skeleton contract", () => {
    withTempDir((repo) => {
      writeStructuredChange(repo);
      const js = capture(() => runChangeDoc(["--state-root", repo, "init-review-run", "review-verifier-v2", "--run-id", "py-js-parity", "--json"]));
      assert.equal(js.status, 0, js.stdout + js.stderr);
      const jsPayload = JSON.parse(js.stdout);
      assert.equal(jsPayload.run_root, "review-runs/py-js-parity");
      assert.equal(fs.existsSync(path.join(repo, ".changes", "review-verifier-v2", "review-runs", "py-js-parity", "attempts")), true);

      const py = spawnSync("python3", ["lib/change/harness_change_doc.py", "--state-root", repo, "init-review-run", "review-verifier-v2", "--run-id", "python-run", "--json"], { encoding: "utf8" });
      assert.equal(py.status, 0, py.stdout + py.stderr);
      const pyPayload = JSON.parse(py.stdout);
      assert.deepEqual(Object.keys(pyPayload).sort(), Object.keys(jsPayload).sort());
      assert.equal(pyPayload.schema, jsPayload.schema);
    });
  });

  await test("strict change validation recognizes valid review-run evidence and rejects malformed records", () => {
    withTempDir((repo) => {
      writeStructuredChange(repo);
      const change = path.join(repo, ".changes", "review-verifier-v2");
      const runRoot = path.join(change, "review-runs", "validation-run");
      initializeRunRoot(runRoot);
      const req = request({ request_id: "validation-run", run_id: "validation-run" });
      const accepted = acceptRun(runRoot, req);
      const sealed = persistDiscovery(runRoot, discovery(accepted.request));
      beginShardPlanning(runRoot);
      persistShardPlan(runRoot, plan(accepted.request, sealed));
      dispatchRun(runRoot);
      admitAttempt(runRoot, { attempt_id: "attempt-1", shard_id: "shard-1", input_digest: "sha256:attempt-input", phase: "correctness-review" });
      appendLedgerAttempt(runRoot, ledger(accepted.request, sealed));
      aggregateRun(runRoot, { gateEvidence: readyGateEvidence() });

      const valid = capture(() => runChangeValidate(["--state-root", repo, "--change", "review-verifier-v2", "--strict-layout"]));
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);
      assert.match(valid.stdout, /errors=0/);
      const pyValid = spawnSync("python3", ["lib/change/harness_change_validate.py", "--state-root", repo, "--change", "review-verifier-v2", "--strict-layout"], { encoding: "utf8" });
      assert.equal(pyValid.status, 0, pyValid.stdout + pyValid.stderr);

      fs.writeFileSync(path.join(runRoot, "gate-result.json"), "{\"record_type\":\"gate-result\",\"record_type\":\"gate-result\"}\n");
      const invalid = capture(() => runChangeValidate(["--state-root", repo, "--change", "review-verifier-v2", "--strict-layout"]));
      assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
      assert.match(invalid.stdout, /gate-result\.json/);
    });
  });
}

function requireDiscovery(req) {
  const sealed = discovery(req);
  return {
    ...sealed,
    record_digest: digestValue({ ...sealed, record_digest: undefined })
  };
}

function withTempDir(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-run-"));
  try {
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeStructuredChange(repo) {
  const change = path.join(repo, ".changes", "review-verifier-v2");
  fs.mkdirSync(path.join(change, "specs"), { recursive: true });
  fs.writeFileSync(path.join(change, "README.md"), [
    "---", "artifact: change-index", "status: draft", "tags: [workflow, review-verifier-v2]", "description: \"test\"", "---", "", "# Change", "", "## Task Tag Registry", "", "| tag | description |", "|---|---|", "| review-verifier-v2 | test |", "", "| review-scale | test |", "", "## Child Index", "", "| path | artifact | status | order | description |", "|---|---|---|---|---|", ""
  ].join("\n"));
  fs.writeFileSync(path.join(change, "proposal.md"), artifactFrontMatter("proposal", "proposal") + "## Why\nTest.\n## What Changes\n- Test.\n## Impact\n- Test.\n## Validation\n- Run validation.\n## Rollback\n- Revert.\n");
  fs.writeFileSync(path.join(change, "tasks.md"), artifactFrontMatter("tasks", "implementation") + "## 1. Implementation\n- [x] Create review run.\n## 2. Validation\n- [ ] Run strict validation.\n");
  fs.writeFileSync(path.join(change, "requirements.md"), artifactFrontMatter("requirements", "requirements") + "## Goal\nValidate review-run evidence.\n");
  fs.writeFileSync(path.join(change, "design.md"), artifactFrontMatter("design", "design") + "## Context\nReview-run fixture.\n\n## Detailed Design Index\n\n| Area | Document |\n|---|---|\n");
  fs.writeFileSync(path.join(change, "specs", "README.md"), artifactFrontMatter("specs-index", "workflow") + "# Specs\n");
  fs.writeFileSync(path.join(change, "specs", "review-run.md"), artifactFrontMatter("delta-spec", "workflow") + "## Purpose\nValidate review-run evidence.\n## Traceability\n- Requirement source: requirements.md\n## ADDED Requirements\n### Requirement: Validate review-run evidence\n#### Scenario: Valid review run\nGiven a structured change workspace\nWhen strict validation runs\nThen it succeeds\n");
}

function artifactFrontMatter(artifact, tags) {
  return `---\nartifact: ${artifact}\nstatus: draft\ntags: [${tags}]\ndescription: "test"\n---\n`;
}

function capture(fn) {
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  try {
    return { status: fn(), stdout, stderr };
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}
