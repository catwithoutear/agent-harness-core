import assert from "node:assert/strict";
import { ReviewRunError, finalizeRecord } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import { createRunStore } from "../skills/review/review-packet-gate/scripts/review-store.mjs";

function record(id, extra = {}) {
  return finalizeRecord({ record_type: "request", run_id: "run-v1:r", request_id: id, ...extra }, id);
}

export async function run(run) {
  await run("append is idempotent for same id + same digest", async () => {
    const store = createRunStore();
    const r = record("r1");
    assert.deepEqual(store.append("run-v1:r", r, "control-v1:0"), r);
    assert.deepEqual(store.append("run-v1:r", r, "control-v1:0"), r); // no throw
  });

  await run("same-id different-digest append -> RESEAL_REQUIRED", async () => {
    const store = createRunStore();
    const a = record("r1", { note: "a" });
    const b = record("r1", { note: "b" });
    store.append("run-v1:r", a, "control-v1:0");
    assert.throws(() => store.append("run-v1:r", b, "control-v1:0"), ReviewRunError);
  });

  await run("invalidation blocks further append", async () => {
    const store = createRunStore();
    store.append("run-v1:r", record("r1"), "control-v1:0");
    const inv = store.invalidate("run-v1:r", "STALE_REVIEW", { old: { a: "1" }, new: { a: "2" } });
    assert.equal(inv.reason, "STALE_REVIEW");
    assert.equal(store.isInvalidated("run-v1:r"), true);
    assert.throws(() => store.append("run-v1:r", record("r2"), "control-v1:0"), ReviewRunError);
  });

  await run("invalidation is idempotent", async () => {
    const store = createRunStore();
    const first = store.invalidate("run-v1:r", "STALE_REVIEW");
    const second = store.invalidate("run-v1:r", "STALE_REVIEW");
    assert.equal(first.record_digest, second.record_digest);
  });

  await run("snapshot enumerates records and closes namespaces", async () => {
    const store = createRunStore();
    store.append("run-v1:r", record("r1"), "control-v1:0");
    store.append("run-v1:r", record("r2"), "control-v1:0");
    const snapshot = store.snapshot("run-v1:r");
    assert.equal(snapshot.record_refs.length, 2);
    assert.equal(snapshot.complete, true);
  });

  await run("createSuccessor produces a fresh run id with supersedes_ref", async () => {
    const store = createRunStore();
    const inv = store.invalidate("run-v1:r", "STALE_REVIEW");
    const { run_id, lineage } = store.createSuccessor(inv, {});
    assert.notEqual(run_id, "run-v1:r");
    assert.equal(lineage.supersedes_ref.id, inv.record_id);
  });
}
