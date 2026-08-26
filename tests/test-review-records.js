import assert from "node:assert/strict";
import {
  ReviewRunError,
  assertCanonicalRef,
  canonicalJSONStringify,
  canonicalize,
  deriveIdentity,
  digestValue,
  finalizeRecord,
  isCanonicalRef,
  makeCanonicalRef,
  parseJsonStrict,
  recordDigest,
  verifyRecordDigest
} from "../skills/review/review-packet-gate/scripts/review-records.mjs";

export async function run(run) {
  await run("canonicalize sorts object keys", async () => {
    const value = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    assert.equal(JSON.stringify(value), JSON.stringify({ a: { c: 3, d: 2 }, b: 1 }));
  });

  await run("canonicalJSONStringify is order-independent", async () => {
    const left = canonicalJSONStringify({ a: 1, b: [2, 3] });
    const right = canonicalJSONStringify({ b: [2, 3], a: 1 });
    assert.equal(left, right);
  });

  await run("digestValue is stable across key order", async () => {
    assert.equal(digestValue({ x: 1, y: 2 }), digestValue({ y: 2, x: 1 }));
    assert.match(digestValue({ x: 1 }), /^sha256:[0-9a-f]{64}$/u);
  });

  await run("finalizeRecord + verifyRecordDigest round-trip", async () => {
    const record = finalizeRecord({ record_type: "request", run_id: "r1", protocol: "review-run" }, "request:r1");
    assert.equal(verifyRecordDigest(record), true);
    const tampered = { ...record, request_id: "r2" };
    assert.equal(verifyRecordDigest(tampered), false);
  });

  await run("recordDigest treats self-placeholders deterministically", async () => {
    const a = recordDigest({ record_type: "x" });
    const b = recordDigest({ record_type: "x" });
    assert.equal(a, b);
  });

  await run("parseJsonStrict rejects duplicate object keys", async () => {
    assert.throws(() => parseJsonStrict('{"a":1,"a":2}'), ReviewRunError);
  });

  await run("parseJsonStrict rejects trailing data", async () => {
    assert.throws(() => parseJsonStrict('{"a":1} extra'), ReviewRunError);
  });

  await run("parseJsonStrict parses nested values", async () => {
    assert.deepEqual(parseJsonStrict('{"a":[1,2,{"b":true}]}'), { a: [1, 2, { b: true }] });
  });

  await run("canonicalize rejects absolute portable paths", async () => {
    assert.throws(() => canonicalize({ unit_path: "/etc/passwd" }), ReviewRunError);
  });

  await run("canonicalize rejects NUL and cycles", async () => {
    assert.throws(() => canonicalize({ value: "a\0b" }), ReviewRunError);
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => canonicalize(cyclic), ReviewRunError);
  });

  await run("deriveIdentity is deterministic and prefixed", async () => {
    const key = { relation_key: { anchor: "a", dimension: "d" } };
    const first = deriveIdentity("relation", key, "v1");
    const second = deriveIdentity("relation", key, "v1");
    assert.deepEqual(first, second);
    assert.ok(first.id.startsWith("rel-v1:sha256:"));
    assert.match(first.key_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(first.schema_version, "v1");
  });

  await run("deriveIdentity rejects unknown kind", async () => {
    assert.throws(() => deriveIdentity("nonsense_kind", {}, "v1"), ReviewRunError);
  });

  await run("makeCanonicalRef extracts {id,digest}", async () => {
    const record = finalizeRecord({ record_type: "request", run_id: "r1", protocol: "review-run" }, "request:r1");
    const ref = makeCanonicalRef(record);
    assert.equal(ref.id, record.record_id);
    assert.equal(ref.digest, record.record_digest);
    assert.equal(isCanonicalRef(ref), true);
  });

  await run("assertCanonicalRef passes on match and fails on digest mismatch", async () => {
    const record = finalizeRecord({ record_type: "request", run_id: "r1", protocol: "review-run" }, "request:r1");
    const ref = makeCanonicalRef(record);
    assert.doesNotThrow(() => assertCanonicalRef(ref, record));
    assert.throws(() => assertCanonicalRef({ ...ref, digest: "sha256:" + "0".repeat(64) }, record), ReviewRunError);
    assert.throws(() => assertCanonicalRef({ id: ref.id }, record), ReviewRunError);
  });
}
