import { createHash } from "node:crypto";

/**
 * Canonical record primitives: portable JSON, self-digests, and
 * versioned canonical identity (`id = <prefix>-<key-version>:sha256(canonical_key)`).
 *
 * This module is the single authoritative owner of canonicalization and
 * identity. Every other review module must derive identity and digests from
 * here; no module may re-implement key ordering, digest encoding, or the
 * `{id,digest}` reference shape.
 */

export const PROTOCOL = "review-run";
export const DIGEST_PREFIX = "sha256:";
export const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;

const FORBIDDEN_KEYS = new Set([
  "absolute_path",
  "absolute_root",
  "client_session",
  "cwd",
  "local_root",
  "provider_session",
  "session_id",
  "session_path",
  "run_root"
]);

const RELATIVE_PATH_RE = /^(?![A-Za-z]:[\\/])(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/u;

export class ReviewRunError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ReviewRunError";
    this.code = code;
    this.details = details;
  }
}

export function fail(code, message, details = {}) {
  throw new ReviewRunError(code, message, details);
}

export function sha256Text(value) {
  return `${DIGEST_PREFIX}${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertPortable(value, location = "$", seen = new Set()) {
  if (typeof value === "string") {
    if (value.includes("\0")) {
      fail("INVALID_REVIEW_RECORD", `${location} contains NUL`);
    }
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value)) {
      fail("NON_PORTABLE_RECORD", `${location} must not contain an absolute local path`);
    }
    if ((location.endsWith(".path") || location.endsWith(".root") || location.endsWith(".file") || location.endsWith("_path")) && !RELATIVE_PATH_RE.test(value)) {
      fail("NON_PORTABLE_RECORD", `${location} must be a relative portable path`);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    fail("INVALID_REVIEW_RECORD", `${location} contains a cyclic value`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPortable(item, `${location}[${index}]`, seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key) || key.startsWith("absolute_")) {
        fail("NON_PORTABLE_RECORD", `${location}.${key} is not portable`);
      }
      assertPortable(child, `${location}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
        .map((key) => [key, canonicalValue(value[key])])
    );
  }
  return value;
}

export function canonicalize(value) {
  assertPortable(value);
  return canonicalValue(value);
}

export function canonicalJSONStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function digestValue(value) {
  return sha256Text(canonicalJSONStringify(value));
}

export function recordDigest(value) {
  const copy = structuredClone(value);
  copy.record_digest = "sha256:self";
  copy.canonical_digest = "sha256:self";
  return digestValue(copy);
}

export function finalizeRecord(value, recordId = `${value.record_type}:${value.run_id ?? "unknown"}`) {
  const base = {
    format: PROTOCOL,
    format_version: 1,
    ...value,
    record_id: value.record_id ?? recordId,
    created_from: value.created_from ?? []
  };
  base.record_digest = "sha256:self";
  base.canonical_digest = "sha256:self";
  const digest = recordDigest(base);
  return { ...base, record_digest: digest, canonical_digest: digest };
}

export function verifyRecordDigest(value) {
  const expected = recordDigest(value);
  const actual = value.record_digest ?? value.canonical_digest;
  return typeof actual === "string" && actual === expected && (value.record_digest === undefined || value.record_digest === actual) && (value.canonical_digest === undefined || value.canonical_digest === actual);
}

/**
 * Parse JSON while rejecting duplicate object keys. JSON.parse alone silently
 * keeps the last key, which would make the self-digest ambiguous.
 */
export function parseJsonStrict(text, source = "input") {
  const input = String(text);
  let index = 0;

  const error = (message) => fail("INVALID_JSON", `${source}: ${message} at byte ${index}`);
  const skip = () => {
    while (/\s/u.test(input[index] ?? "")) index += 1;
  };
  const parseString = () => {
    if (input[index] !== '"') error("expected string");
    const start = index;
    index += 1;
    let escaped = false;
    while (index < input.length) {
      const character = input[index];
      if (escaped) {
        escaped = false;
        index += 1;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        index += 1;
        continue;
      }
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(input.slice(start, index));
        } catch {
          error("invalid string escape");
        }
      }
      if (character < " ") error("control character in string");
      index += 1;
    }
    error("unterminated string");
  };
  const parseNumber = () => {
    const match = input.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) error("invalid number");
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) error("number is not finite");
    return value;
  };
  const parseValue = () => {
    skip();
    const character = input[index];
    if (character === '"') return parseString();
    if (character === "{") {
      index += 1;
      const object = {};
      const keys = new Set();
      skip();
      if (input[index] === "}") {
        index += 1;
        return object;
      }
      while (index < input.length) {
        skip();
        const key = parseString();
        if (keys.has(key)) error(`duplicate object key ${key}`);
        keys.add(key);
        skip();
        if (input[index] !== ":") error("expected colon");
        index += 1;
        object[key] = parseValue();
        skip();
        if (input[index] === "}") {
          index += 1;
          return object;
        }
        if (input[index] !== ",") error("expected comma");
        index += 1;
      }
      error("unterminated object");
    }
    if (character === "[") {
      index += 1;
      const array = [];
      skip();
      if (input[index] === "]") {
        index += 1;
        return array;
      }
      while (index < input.length) {
        array.push(parseValue());
        skip();
        if (input[index] === "]") {
          index += 1;
          return array;
        }
        if (input[index] !== ",") error("expected comma");
        index += 1;
      }
      error("unterminated array");
    }
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]]) {
      if (input.startsWith(literal, index)) {
        index += literal.length;
        return value;
      }
    }
    if (character === "-" || /\d/u.test(character ?? "")) return parseNumber();
    error("unexpected token");
  };

  const result = parseValue();
  skip();
  if (index !== input.length) error("trailing data");
  return result;
}

/**
 * Versioned canonical identity. The id is derived, never caller-chosen:
 *
 *   id = <type-prefix>-<key-version>:sha256(canonical_json(canonical_key))
 *
 * `kind` selects the type prefix from the frozen table below. `keyV1` is the
 * versioned canonical key (a portable JSON-serializable value). The returned
 * `key_digest` is the content digest of `keyV1` under this module's
 * canonicalization.
 */
export const TYPE_PREFIXES = Object.freeze({
  target_policy: "tpolicy",
  target_view: "view",
  run: "run",
  subject_input: "input",
  manifest: "manifest",
  policy_binding: "policy",
  gap: "gap",
  authority_source: "src",
  authority_item: "auth",
  review_authority: "rauth",
  dimension_authority: "dauth",
  activation_decision: "act",
  dimension: "dim",
  interaction: "mix",
  evidence_policy: "evp",
  finding_policy: "fip",
  changed_file: "file",
  hunk: "hunk",
  line: "line",
  surface_slice: "slice",
  semantic_unit: "unit",
  context_edge: "edge",
  context_boundary: "bnd",
  context_packet: "ctx",
  review_anchor: "anchor",
  applicability_candidate: "cand",
  applicability_decision: "app",
  scope_cluster: "cluster",
  relation: "rel",
  integration: "int",
  actor: "actor",
  signing_key: "skey",
  content_artifact: "artifact",
  result_channel: "channel",
  execution: "exec",
  provider: "provider",
  assignment: "asn",
  dispatch: "dispatch",
  attempt: "attempt",
  completion: "completion",
  receipt: "receipt",
  raw_output_item: "rout",
  output_mapping: "omap",
  output_closure: "oclosure",
  store_snapshot: "snapshot",
  attempt_set: "attemptset",
  finding: "finding",
  disposition: "fdisp",
  disposition_set: "fdispset",
  finding_register: "freg",
  evidence: "ev",
  outcome: "out",
  selection: "sel",
  expected_universe: "euniv",
  observed_universe: "ouniv",
  attestation: "att",
  barrier: "barrier",
  normalization: "norm",
  comparison: "cmp",
  gate: "gate"
});

export function deriveIdentity(kind, keyV1, keyVersion = "v1") {
  const prefix = TYPE_PREFIXES[kind];
  if (!prefix) {
    fail("UNKNOWN_RECORD_KIND", `no type prefix for record kind: ${kind}`);
  }
  const keyDigest = digestValue(keyV1);
  const id = `${prefix}-${keyVersion}:${keyDigest}`;
  return { id, key_digest: keyDigest, schema_version: keyVersion };
}

export function isCanonicalRef(ref) {
  return isPlainObject(ref) && typeof ref.id === "string" && ref.id.length > 0 && typeof ref.digest === "string" && DIGEST_RE.test(ref.digest);
}

export function makeCanonicalRef(record) {
  if (!isPlainObject(record)) {
    fail("INVALID_REVIEW_RECORD", "canonical ref requires an object record");
  }
  const id = record.record_id ?? record.id;
  const digest = record.record_digest ?? record.canonical_digest ?? record.digest;
  if (typeof id !== "string" || id.length === 0) {
    fail("INVALID_REVIEW_RECORD", "record missing canonical id");
  }
  if (typeof digest !== "string" || !DIGEST_RE.test(digest)) {
    fail("INVALID_REVIEW_RECORD", "record missing or malformed canonical digest");
  }
  return { id, digest };
}

export function assertCanonicalRef(ref, expectedRecord) {
  if (!isCanonicalRef(ref)) {
    fail("CANONICAL_REF_MISMATCH", "reference must be a {id,digest} CanonicalRef");
  }
  const expected = makeCanonicalRef(expectedRecord);
  if (ref.id !== expected.id) {
    fail("CANONICAL_REF_MISMATCH", `ref id ${ref.id} does not match record id ${expected.id}`);
  }
  if (ref.digest !== expected.digest) {
    fail("CANONICAL_REF_MISMATCH", `ref digest ${ref.digest} does not match record digest ${expected.digest}`);
  }
}
