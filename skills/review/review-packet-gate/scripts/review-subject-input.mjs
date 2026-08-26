import { DIGEST_RE, digestValue, fail, finalizeRecord, isCanonicalRef, isPlainObject } from "./review-records.mjs";

/**
 * Producer-bound subject inputs and their provenance DAG (R-002).
 *
 * A subject input is a closed-schema, content-addressed input whose provenance
 * DAG must root only in target/normative sources that existed before the run.
 * Current-run producers (expected/observed lane, reviewer, comparison,
 * coordinator) and review-derived semantic classes can never be a subject.
 */

export const SUBJECT_INPUT_KINDS = Object.freeze([
  "source-tree",
  "git-object-metadata",
  "user-authoritative-requirement",
  "normative-catalog"
]);

export const SEMANTIC_CLASSES = Object.freeze(["raw-subject", "normative-input"]);

export const ALLOWED_PRODUCER_ROLES = Object.freeze([
  "target-snapshot-builder",
  "user-authoritative-input",
  "catalog-publisher"
]);

export const FORBIDDEN_PRODUCER_ROLES = Object.freeze([
  "expected-lane",
  "observed-lane",
  "reviewer",
  "comparison",
  "current-run-coordinator"
]);

export const FORBIDDEN_SEMANTIC_CLASSES = Object.freeze([
  "review-inventory",
  "expected-universe",
  "dispatch",
  "finding",
  "arbitrary-artifact"
]);

function isCanonicalRecordRef(ref) {
  return isCanonicalRef(ref);
}

function assertProducerRole(producerRole, location) {
  if (typeof producerRole !== "string" || !ALLOWED_PRODUCER_ROLES.includes(producerRole)) {
    fail(
      "SUBJECT_INPUT_PROVENANCE_GAP",
      `${location}: producer_role ${producerRole} is not an allowed subject producer`
    );
  }
}

/**
 * Build one immutable `SubjectInputRef`. Provenance parents are recursively
 * trusted only if every entry is itself a valid `{id,digest}` ref; the caller
 * is responsible for validating that the graph roots pre-run (done in
 * `validateProvenanceGraph`).
 */
export function buildSubjectInputRef({
  input_kind,
  semantic_class,
  producer_ref,
  producer_role,
  origin_locator,
  content_digest,
  created_before_run,
  provenance_parent_refs = []
}) {
  if (!SUBJECT_INPUT_KINDS.includes(input_kind)) {
    fail("SUBJECT_INPUT_PROVENANCE_GAP", `invalid input_kind: ${input_kind}`);
  }
  if (!SEMANTIC_CLASSES.includes(semantic_class)) {
    fail("SUBJECT_INPUT_PROVENANCE_GAP", `invalid semantic_class: ${semantic_class}`);
  }
  if (FORBIDDEN_SEMANTIC_CLASSES.includes(semantic_class)) {
    fail("SUBJECT_INPUT_PROVENANCE_GAP", `forbidden semantic_class: ${semantic_class}`);
  }
  assertProducerRole(producer_role, origin_locator);
  if (typeof content_digest !== "string" || !DIGEST_RE.test(content_digest)) {
    fail("SUBJECT_INPUT_PROVENANCE_GAP", `invalid content_digest for ${origin_locator}`);
  }
  if (created_before_run !== true) {
    fail("SUBJECT_INPUT_PROVENANCE_GAP", `subject input ${origin_locator} not created before run`);
  }
  if (!isPlainObject(producer_ref) || !isCanonicalRecordRef(producer_ref)) {
    fail("SUBJECT_INPUT_PROVENANCE_GAP", `producer_ref must be a {id,digest} CanonicalRef`);
  }
  for (const parent of provenance_parent_refs) {
    if (!isCanonicalRecordRef(parent)) {
      fail("SUBJECT_INPUT_PROVENANCE_GAP", `provenance parent for ${origin_locator} must be a CanonicalRef`);
    }
  }

  const base = {
    record_type: "subject-input",
    input_kind,
    semantic_class,
    producer_ref,
    producer_role,
    origin_locator,
    content_digest,
    created_before_run,
    provenance_parent_refs
  };
  base.provenance_digest = digestValue(provenance_parent_refs);
  return finalizeRecord(base, `input:${content_digest}`);
}

/**
 * Build a complete `SubjectInputManifest` from a target snapshot, a normative
 * source set, and optional user-authoritative requirements.
 *
 * - target snapshot files -> `source-tree` / `git-object-metadata` inputs
 *   produced by `target-snapshot-builder`.
 * - normative sources -> `normative-catalog` inputs produced by
 *   `catalog-publisher`.
 * - user requirements -> `user-authoritative-requirement` inputs produced by
 *   `user-authoritative-input`.
 *
 * Any input whose producer is a current-run role or whose semantic class is
 * review-derived is rejected with `SUBJECT_INPUT_PROVENANCE_GAP`.
 */
export function buildSubjectInputManifest(targetSnapshot, normativeSources = [], options = {}) {
  if (!isPlainObject(targetSnapshot)) {
    fail("SUBJECT_INPUT_PROVENANCE_GAP", "target snapshot must be an object");
  }
  const targetRef = { id: targetSnapshot.record_id, digest: targetSnapshot.record_digest };
  if (!isCanonicalRecordRef(targetRef)) {
    fail("SUBJECT_INPUT_PROVENANCE_GAP", "target snapshot must carry a canonical {id,digest}");
  }

  const inputRefs = [];

  for (const file of targetSnapshot.files ?? []) {
    inputRefs.push(
      buildSubjectInputRef({
        input_kind: "source-tree",
        semantic_class: "raw-subject",
        producer_ref: targetRef,
        producer_role: "target-snapshot-builder",
        origin_locator: file.path,
        content_digest: file.digest,
        created_before_run: true
      })
    );
  }

  for (const meta of targetSnapshot.git_objects ?? []) {
    inputRefs.push(
      buildSubjectInputRef({
        input_kind: "git-object-metadata",
        semantic_class: "raw-subject",
        producer_ref: targetRef,
        producer_role: "target-snapshot-builder",
        origin_locator: meta.object,
        content_digest: meta.digest,
        created_before_run: true
      })
    );
  }

  for (const source of normativeSources) {
    inputRefs.push(
      buildSubjectInputRef({
        input_kind: "normative-catalog",
        semantic_class: "normative-input",
        producer_ref: source.producer_ref,
        producer_role: "catalog-publisher",
        origin_locator: source.locator,
        content_digest: source.digest,
        created_before_run: true,
        provenance_parent_refs: source.provenance_parent_refs ?? []
      })
    );
  }

  for (const requirement of options.userRequirements ?? []) {
    inputRefs.push(
      buildSubjectInputRef({
        input_kind: "user-authoritative-requirement",
        semantic_class: "normative-input",
        producer_ref: requirement.producer_ref,
        producer_role: "user-authoritative-input",
        origin_locator: requirement.locator,
        content_digest: requirement.digest,
        created_before_run: true,
        provenance_parent_refs: requirement.provenance_parent_refs ?? []
      })
    );
  }

  const base = {
    record_type: "subject-input-manifest",
    allowed_input_kinds: [...SUBJECT_INPUT_KINDS],
    allowed_semantic_classes: [...SEMANTIC_CLASSES],
    forbidden_producer_roles: [...FORBIDDEN_PRODUCER_ROLES],
    forbidden_semantic_classes: [...FORBIDDEN_SEMANTIC_CLASSES],
    input_refs: inputRefs,
    provenance_graph_digest: digestValue(inputRefs.map((ref) => ({ id: ref.record_id, digest: ref.record_digest }))),
    complete: true
  };
  return finalizeRecord(base, `manifest:${base.provenance_graph_digest}`);
}

/**
 * Recursively reject any provenance parent that is itself not content-bound
 * pre-run. This is a helper for callers that want to validate a whole graph,
 * not just one manifest's direct refs.
 */
export function validateProvenanceGraph(inputRefs) {
  const seen = new Set();
  for (const ref of inputRefs) {
    if (!isCanonicalRecordRef(ref)) {
      fail("SUBJECT_INPUT_PROVENANCE_GAP", "provenance graph contains a non-canonical ref");
    }
    if (seen.has(`${ref.id}:${ref.digest}`)) {
      fail("SUBJECT_INPUT_PROVENANCE_GAP", `duplicate provenance node ${ref.id}`);
    }
    seen.add(`${ref.id}:${ref.digest}`);
  }
  return true;
}
