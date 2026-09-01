import { fail } from "./review-records.mjs";

/**
 * Bounded retry admission, timeout/cancel fencing and late-write rejection.
 *
 * `max_attempts` is the only caller budget; `max_retries = max_attempts - 1`
 * is derived. Every transition is idempotent by
 * `(run_id, attempt_id, transition, input_digest)`.
 */

export const ATTEMPT_STATES = Object.freeze(["admitted", "running", "succeeded", "failed", "cancelled", "stale"]);
const TERMINAL_ATTEMPT_STATES = new Set(["succeeded", "failed", "cancelled", "stale"]);

export function maxRetries(policy) {
  return Math.max(0, (policy.max_attempts ?? 1) - 1);
}

export function createRetryController({ now = () => Date.now() } = {}) {
  const runs = new Map();

  function runState(runId, policy = {}) {
    if (!runs.has(runId)) {
      runs.set(runId, {
        attempts: new Map(),
        run_deadline_at: now() + (policy.run_deadline ?? Infinity),
        transitions: new Set()
      });
    }
    return runs.get(runId);
  }

  return {
    admit(runId, attemptId, inputDigest, policy = {}) {
      const run = runState(runId, policy);
      if (run.attempts.has(attemptId)) {
        const existing = run.attempts.get(attemptId);
        if (existing.input_digest !== inputDigest) fail("RESEAL_REQUIRED", `attempt ${attemptId} was admitted with different input`);
        return { admitted: true, attempt: existing }; // idempotent
      }
      const maxAttempts = policy.max_attempts ?? 1;
      if (run.attempts.size >= maxAttempts) {
        return { admitted: false, gap: "RETRY_BUDGET_EXHAUSTED" };
      }
      if (now() >= run.run_deadline_at) {
        return { admitted: false, gap: "RETRY_BUDGET_EXHAUSTED" };
      }
      const attempt = {
        attempt_id: attemptId,
        input_digest: inputDigest,
        state: "admitted",
        admitted_at: now(),
        attempt_deadline_at: Math.min(now() + (policy.attempt_deadline ?? Infinity), run.run_deadline_at)
      };
      run.attempts.set(attemptId, attempt);
      return { admitted: true, attempt };
    },

    transition(runId, attemptId, to, inputDigest) {
      const run = runState(runId);
      const attempt = run.attempts.get(attemptId);
      if (!attempt) fail("ATTEMPT_TIMEOUT", `unknown attempt ${attemptId}`);
      if (!ATTEMPT_STATES.includes(to)) fail("INVALID_REVIEW_RECORD", `invalid attempt state ${to}`);
      if (attempt.input_digest !== inputDigest) fail("RESEAL_REQUIRED", `attempt ${attemptId} transition input digest changed`);
      const key = `${runId}:${attemptId}:${to}:${inputDigest}`;
      if (run.transitions.has(key)) return attempt; // idempotent
      if (TERMINAL_ATTEMPT_STATES.has(attempt.state)) fail("LATE_RESULT_REJECTED", `attempt ${attemptId} is already terminal: ${attempt.state}`);
      attempt.state = to;
      run.transitions.add(key);
      return attempt;
    },

    expire(runId, attemptId) {
      const run = runState(runId);
      const attempt = run.attempts.get(attemptId);
      if (!attempt) fail("ATTEMPT_TIMEOUT", `unknown attempt ${attemptId}`);
      if (now() >= attempt.attempt_deadline_at) {
        attempt.state = "failed";
        attempt.failure_kind = "ATTEMPT_TIMEOUT";
      }
      return attempt;
    },

    checkpoint(runId, attemptId, checkpoint) {
      const run = runState(runId);
      const attempt = run.attempts.get(attemptId);
      if (!attempt) fail("ATTEMPT_TIMEOUT", `unknown attempt ${attemptId}`);
      if (TERMINAL_ATTEMPT_STATES.has(attempt.state) || now() >= attempt.attempt_deadline_at) {
        fail("ATTEMPT_TIMEOUT", `attempt ${attemptId} cannot accept a checkpoint`);
      }
      attempt.checkpoint = {
        ...checkpoint,
        recorded_at: now(),
        coverage_eligible: false,
        independent_evidence: false
      };
      return attempt.checkpoint;
    },

    rejectLateWrite(runId, attemptId, receipt) {
      const run = runState(runId);
      if (!run.attempts.has(attemptId)) fail("LATE_RESULT_REJECTED", `unknown attempt ${attemptId}`);
      // a late write is persisted as rejected evidence, never enters the snapshot
      return { attempt_id: attemptId, rejected_late: true, receipt, persisted: false };
    },

    maxRetries(policy) {
      return maxRetries(policy);
    },

    _attempt(runId, attemptId) {
      return runState(runId).attempts.get(attemptId);
    }
  };
}
