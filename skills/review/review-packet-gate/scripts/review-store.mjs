import { digestValue, fail, finalizeRecord, isPlainObject } from "./review-records.mjs";

/**
 * Immutable run store and successor lineage (R-003, R-020, R-021).
 *
 * The store is the single state writer. Sealed records are append-only; a
 * same-id/different-digest write, a write after invalidation, or a write into a
 * closed fact namespace is rejected and forces a successor run.
 */

export function createRunStore() {
  const runs = new Map();

  function state(runId) {
    if (!runs.has(runId)) {
      runs.set(runId, {
        records: new Map(), // record_id -> { id, digest, record }
        controlRevision: "control-v1:0",
        invalidated: null,
        closedNamespaces: new Set()
      });
    }
    return runs.get(runId);
  }

  function idOf(record) {
    return record.record_id ?? record.id;
  }

  function assertAppendable(run, runId) {
    if (run.invalidated) {
      fail("RESEAL_REQUIRED", `run ${runId} is invalidated; create a successor instead of appending`);
    }
  }

  return {
    append(runId, record, expectedControlRevision) {
      const run = state(runId);
      assertAppendable(run, runId);
      if (!isPlainObject(record)) fail("INVALID_REVIEW_RECORD", "record must be an object");
      const id = idOf(record);
      if (typeof id !== "string" || !id) fail("INVALID_REVIEW_RECORD", "record missing id");
      if (typeof record.record_digest !== "string" && typeof record.canonical_digest !== "string") {
        fail("INVALID_REVIEW_RECORD", "record missing digest");
      }
      if (run.records.has(id)) {
        const existing = run.records.get(id);
        if (existing.digest !== (record.record_digest ?? record.canonical_digest)) {
          fail("RESEAL_REQUIRED", `same-id different-digest write for ${id}`);
        }
        return existing.record; // idempotent
      }
      run.records.set(id, { id, digest: record.record_digest ?? record.canonical_digest, record });
      return record;
    },

    snapshot(runId) {
      const run = state(runId);
      const entries = [...run.records.values()];
      const snapshot = finalizeRecord({
        record_type: "store-snapshot",
        run_id: runId,
        covered_fact_namespaces: [...run.closedNamespaces],
        high_water_mark: String(entries.length),
        record_refs: entries.map((e) => ({ id: e.id, digest: e.digest })),
        complete: true
      }, `snapshot:${runId}:${entries.length}`);
      // close fact namespaces for future appends
      run.closedNamespaces.add("fact");
      return snapshot;
    },

    invalidate(runId, reason, observedDigests = {}) {
      const run = state(runId);
      if (run.invalidated) return run.invalidated; // idempotent
      const invalidation = finalizeRecord({
        record_type: "invalidation",
        run_id: runId,
        reason,
        old_digests: observedDigests.old ?? {},
        observed_values: observedDigests.new ?? {},
        superseded_by: null
      }, `invalidation:${runId}:${reason}`);
      run.invalidated = invalidation;
      return invalidation;
    },

    createSuccessor(invalidation, freshBinding = {}) {
      if (!isPlainObject(invalidation) || invalidation.record_type !== "invalidation") {
        fail("INVALID_REVIEW_RECORD", "successor requires an invalidation record");
      }
      const freshRunId = freshBinding.run_id ?? `run-v1:${digestValue({ supersedes: invalidation.run_id, reason: invalidation.reason })}`;
      const successor = state(freshRunId);
      successor.controlRevision = "control-v1:0";
      const lineage = finalizeRecord({
        record_type: "successor-lineage",
        run_id: freshRunId,
        supersedes_ref: { id: invalidation.record_id, digest: invalidation.record_digest },
        reason: invalidation.reason
      }, `successor:${freshRunId}`);
      return { run_id: freshRunId, lineage };
    },

    isInvalidated(runId) {
      return Boolean(state(runId).invalidated);
    }
  };
}
