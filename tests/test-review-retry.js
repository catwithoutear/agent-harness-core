import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import { createRetryController, maxRetries } from "../skills/review/review-packet-gate/scripts/review-retry.mjs";

const policy = { max_attempts: 2, attempt_deadline: 1000, run_deadline: 10000 };

export async function run(run) {
  await run("maxRetries is derived as max_attempts - 1", async () => {
    assert.equal(maxRetries({ max_attempts: 3 }), 2);
    assert.equal(maxRetries({ max_attempts: 1 }), 0);
  });

  await run("budget exhaustion denies a third attempt", async () => {
    const c = createRetryController();
    assert.equal(c.admit("r", "a1", "d1", policy).admitted, true);
    assert.equal(c.admit("r", "a2", "d2", policy).admitted, true);
    const third = c.admit("r", "a3", "d3", policy);
    assert.equal(third.admitted, false);
    assert.equal(third.gap, "RETRY_BUDGET_EXHAUSTED");
  });

  await run("admit is idempotent for the same attempt id", async () => {
    const c = createRetryController();
    const first = c.admit("r", "a1", "d1", policy);
    const second = c.admit("r", "a1", "d1", policy);
    assert.deepEqual(first.attempt, second.attempt);
  });

  await run("attempt_deadline_at is min(attempt+deadline, run deadline)", async () => {
    let t = 0;
    const c = createRetryController({ now: () => t });
    const admitted = c.admit("r", "a1", "d1", { max_attempts: 2, attempt_deadline: 100, run_deadline: 500 });
    assert.equal(admitted.attempt.attempt_deadline_at, 100); // now=0, min(100, 500)
    t = 450;
    const late = c.admit("r", "a2", "d2", { max_attempts: 2, attempt_deadline: 100, run_deadline: 500 });
    assert.equal(late.attempt.attempt_deadline_at, 500); // min(550, 500)
  });

  await run("transition is idempotent by (run, attempt, transition, digest)", async () => {
    const c = createRetryController();
    c.admit("r", "a1", "d1", policy);
    const first = c.transition("r", "a1", "succeeded", "d1");
    const second = c.transition("r", "a1", "succeeded", "d1");
    assert.equal(first.state, "succeeded");
    assert.deepEqual(first, second);
  });

  await run("transition rejects an invalid state", async () => {
    const c = createRetryController();
    c.admit("r", "a1", "d1", policy);
    assert.throws(() => c.transition("r", "a1", "bogus", "d1"), ReviewRunError);
  });

  await run("rejectLateWrite never enters the snapshot", async () => {
    const c = createRetryController();
    c.admit("r", "a1", "d1", policy);
    const late = c.rejectLateWrite("r", "a1", { result: "x" });
    assert.equal(late.rejected_late, true);
    assert.equal(late.persisted, false);
  });

  await run("expire cancels a past-deadline attempt", async () => {
    let t = 0;
    const c = createRetryController({ now: () => t });
    const admitted = c.admit("r", "a1", "d1", { max_attempts: 2, attempt_deadline: 100, run_deadline: 500 });
    t = 200;
    const expired = c.expire("r", "a1");
    assert.equal(expired.state, "cancelled");
    assert.ok(admitted.attempt.attempt_deadline_at < t);
  });
}
