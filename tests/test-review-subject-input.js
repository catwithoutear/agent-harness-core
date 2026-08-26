import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  buildSubjectInputManifest,
  buildSubjectInputRef,
  validateProvenanceGraph
} from "../skills/review/review-packet-gate/scripts/review-subject-input.mjs";

const digest = (n = "a") => `sha256:${n.repeat(64)}`;
const targetSnapshot = () => ({
  record_type: "target-snapshot",
  record_id: "view-v1:snap",
  record_digest: digest("1"),
  files: [{ path: "src/a.js", digest: digest("2") }],
  git_objects: [{ object: "HEAD", digest: digest("3") }]
});

export async function run(run) {
  await run("builds source-tree and git-object inputs from target snapshot", async () => {
    const manifest = buildSubjectInputManifest(targetSnapshot(), []);
    const kinds = manifest.input_refs.map((ref) => ref.input_kind);
    assert.deepEqual(kinds, ["source-tree", "git-object-metadata"]);
    assert.equal(manifest.complete, true);
  });

  await run("builds normative and user-authoritative inputs", async () => {
    const manifest = buildSubjectInputManifest(
      targetSnapshot(),
      [{ locator: "rules/review.md", digest: digest("4"), producer_ref: { id: "policy-v1:catalog", digest: digest("5") } }],
      { userRequirements: [{ locator: "spec.md", digest: digest("6"), producer_ref: { id: "policy-v1:user", digest: digest("7") } }] }
    );
    const kinds = manifest.input_refs.map((ref) => ref.input_kind);
    assert.ok(kinds.includes("normative-catalog"));
    assert.ok(kinds.includes("user-authoritative-requirement"));
  });

  await run("rejects a current-run producer role", async () => {
    assert.throws(
      () => buildSubjectInputRef({
        input_kind: "source-tree",
        semantic_class: "raw-subject",
        producer_ref: { id: "x", digest: digest() },
        producer_role: "expected-lane",
        origin_locator: "src/a.js",
        content_digest: digest("8"),
        created_before_run: true
      }),
      ReviewRunError
    );
  });

  await run("rejects a forbidden semantic class", async () => {
    assert.throws(
      () => buildSubjectInputRef({
        input_kind: "source-tree",
        semantic_class: "expected-universe",
        producer_ref: { id: "x", digest: digest() },
        producer_role: "target-snapshot-builder",
        origin_locator: "src/a.js",
        content_digest: digest("9"),
        created_before_run: true
      }),
      ReviewRunError
    );
  });

  await run("rejects a not-created-before-run input", async () => {
    assert.throws(
      () => buildSubjectInputRef({
        input_kind: "source-tree",
        semantic_class: "raw-subject",
        producer_ref: { id: "x", digest: digest() },
        producer_role: "target-snapshot-builder",
        origin_locator: "src/a.js",
        content_digest: digest(),
        created_before_run: false
      }),
      ReviewRunError
    );
  });

  await run("rejects a malformed content digest", async () => {
    assert.throws(
      () => buildSubjectInputRef({
        input_kind: "source-tree",
        semantic_class: "raw-subject",
        producer_ref: { id: "x", digest: digest() },
        producer_role: "target-snapshot-builder",
        origin_locator: "src/a.js",
        content_digest: "not-a-digest",
        created_before_run: true
      }),
      ReviewRunError
    );
  });

  await run("rejects a non-canonical provenance parent", async () => {
    assert.throws(
      () => buildSubjectInputRef({
        input_kind: "normative-catalog",
        semantic_class: "normative-input",
        producer_ref: { id: "x", digest: digest() },
        producer_role: "catalog-publisher",
        origin_locator: "rules/review.md",
        content_digest: digest(),
        created_before_run: true,
        provenance_parent_refs: [{ id: "bare-id" }]
      }),
      ReviewRunError
    );
  });

  await run("validateProvenanceGraph accepts canonical refs and rejects duplicates", async () => {
    const refs = [{ id: "a", digest: digest("1") }, { id: "b", digest: digest("2") }];
    assert.equal(validateProvenanceGraph(refs), true);
    assert.throws(() => validateProvenanceGraph([{ id: "a", digest: digest("1") }, { id: "a", digest: digest("1") }]), ReviewRunError);
  });
}
