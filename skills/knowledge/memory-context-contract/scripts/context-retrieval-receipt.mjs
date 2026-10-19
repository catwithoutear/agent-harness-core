#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTEXT_RECEIPT_SCHEMA = "codebase-build.context-retrieval-receipt";
export const CONTEXT_RECEIPT_VERSION = 1;
export const CONTEXT_RECEIPT_TYPE = "retrieval";
export const CONTEXT_RECEIPT_STATES = Object.freeze([
  "CONTEXT_READY",
  "NO_RELEVANT_HIT",
  "DEGRADED",
  "QUERY_FAILED",
  "PLANNED"
]);
export const CONTEXT_RECEIPT_DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
export const CONTEXT_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "version",
  "receipt_type",
  "claim_id",
  "lane",
  "query",
  "created_at",
  "route",
  "worktree",
  "ok",
  "state",
  "execution",
  "transport",
  "query_outcome",
  "provider",
  "search",
  "read",
  "error",
  "digest"
]);

const RECEIPT_FIELD_SET = new Set(CONTEXT_RECEIPT_FIELDS);
const LANES = new Set(["architecture", "reuse", "governance", "risk"]);
const EXECUTIONS = new Set(["EXECUTED", "PLANNED"]);
const TRANSPORTS = new Set(["mcp", "unavailable"]);
const QUERY_OUTCOMES = new Set([
  "PLANNED",
  "FAILED",
  "NO_HIT",
  "READ_SELECTION_REQUIRED",
  "HIT_READ"
]);
const GATE_BY_STATE = Object.freeze({
  CONTEXT_READY: Object.freeze({
    gate_status: "READY",
    outcome: "已读取",
    context_gap: false,
    exit_code: 0,
    ok: true
  }),
  NO_RELEVANT_HIT: Object.freeze({
    gate_status: "READY_WITH_NOTES",
    outcome: "仅尝试",
    context_gap: false,
    exit_code: 0,
    ok: true
  }),
  DEGRADED: Object.freeze({
    gate_status: "READY_WITH_NOTES",
    outcome: "context gap",
    context_gap: true,
    exit_code: 0,
    ok: true
  }),
  QUERY_FAILED: Object.freeze({
    gate_status: "READY_WITH_NOTES",
    outcome: "context gap",
    context_gap: true,
    exit_code: 0,
    ok: true
  }),
  PLANNED: Object.freeze({
    gate_status: "NOT_READY",
    outcome: "未就绪",
    context_gap: true,
    exit_code: 1,
    ok: false
  })
});

export class ContextRetrievalReceiptError extends Error {
  constructor(code, message, details = {}, exitCode = 2) {
    super(message);
    this.name = "ContextRetrievalReceiptError";
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
    this.exit_code = exitCode;
  }
}

function fail(code, message, details = {}, exitCode = 2) {
  throw new ContextRetrievalReceiptError(code, message, details, exitCode);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value, stack, location) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("INVALID_RECEIPT", `canonical JSON rejects non-finite number at ${location}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") fail("INVALID_RECEIPT", `canonical JSON rejects ${typeof value} at ${location}`);
  if (stack.has(value)) fail("INVALID_RECEIPT", `canonical JSON rejects cycle at ${location}`);

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      const result = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) fail("INVALID_RECEIPT", `canonical JSON rejects sparse array at ${location}[${index}]`);
        result.push(canonicalize(value[index], stack, `${location}[${index}]`));
      }
      return result;
    }
    if (!isPlainObject(value)) fail("INVALID_RECEIPT", `canonical JSON rejects non-plain object at ${location}`);
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      fail("INVALID_RECEIPT", `canonical JSON rejects symbol key at ${location}`);
    }
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: canonicalize(value[key], stack, `${location}.${key}`),
        writable: true
      });
    }
    return result;
  } finally {
    stack.delete(value);
  }
}

/** Return the Codebase canonical JSON representation used by receipt digests. */
export function canonicalReceiptJson(value) {
  return JSON.stringify(canonicalize(value, new Set(), "$"));
}

/** Hash a producer receipt after excluding its self-referential digest field. */
export function canonicalReceiptDigest(value) {
  if (!isPlainObject(value)) fail("INVALID_RECEIPT", "receipt payload must be an object");
  const payload = { ...value };
  delete payload.digest;
  return `sha256:${createHash("sha256").update(canonicalReceiptJson(payload), "utf8").digest("hex")}`;
}

export const canonicalHash = canonicalReceiptDigest;

function assertExactFields(value) {
  const fields = Object.keys(value);
  if (fields.length !== CONTEXT_RECEIPT_FIELDS.length || fields.some((field) => !RECEIPT_FIELD_SET.has(field))) {
    const unknown = fields.find((field) => !RECEIPT_FIELD_SET.has(field));
    if (unknown) fail("INVALID_RECEIPT", `unknown field: ${unknown}`);
    fail("INVALID_RECEIPT", "receipt top-level fields are incomplete");
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) fail("INVALID_RECEIPT", `${field} must be a non-empty string`);
}

function assertExactObject(value, fields, field) {
  if (!isPlainObject(value)) fail("INVALID_RECEIPT", `${field} must be an object`);
  const actual = Object.keys(value);
  if (actual.length !== fields.length || actual.some((key) => !fields.includes(key))) {
    const unknown = actual.find((key) => !fields.includes(key));
    fail("INVALID_RECEIPT", unknown ? `${field} has unknown field: ${unknown}` : `${field} fields are incomplete`);
  }
}

function assertObjectWithOptionalFields(value, required, optional, field) {
  if (!isPlainObject(value)) fail("INVALID_RECEIPT", `${field} must be an object`);
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !allowed.has(key));
  if (unknown) fail("INVALID_RECEIPT", `${field} has unknown field: ${unknown}`);
  const missing = required.find((key) => !Object.hasOwn(value, key));
  if (missing) fail("INVALID_RECEIPT", `${field} is missing field: ${missing}`);
}

function assertRoute(route) {
  assertExactObject(route, ["scheme", "host", "path"], "route");
  if (!["http", "https"].includes(route.scheme)) fail("INVALID_RECEIPT", "route.scheme must be http or https");
  assertNonEmptyString(route.host, "route.host");
  assertNonEmptyString(route.path, "route.path");
  if (!route.path.startsWith("/")) fail("INVALID_RECEIPT", "route.path must start with /");
}

function assertWorktree(worktree) {
  assertExactObject(worktree, ["project_root", "head", "dirty_digest"], "worktree");
  assertNonEmptyString(worktree.project_root, "worktree.project_root");
  if (!worktree.project_root.startsWith("/")) fail("INVALID_RECEIPT", "worktree.project_root must be absolute");
  if (worktree.head !== null && (typeof worktree.head !== "string" || !/^[a-f0-9]{40}$/u.test(worktree.head))) {
    fail("INVALID_RECEIPT", "worktree.head must be null or a 40-character Git SHA");
  }
  if (typeof worktree.dirty_digest !== "string" || !CONTEXT_RECEIPT_DIGEST_RE.test(worktree.dirty_digest)) {
    fail("INVALID_RECEIPT", "worktree.dirty_digest must be a sha256 digest");
  }
}

function assertProvider(provider) {
  if (provider === null) return;
  assertObjectWithOptionalFields(
    provider,
    ["name", "version"],
    ["title", "description", "websiteUrl", "icons"],
    "provider"
  );
  assertNonEmptyString(provider.name, "provider.name");
  assertNonEmptyString(provider.version, "provider.version");
  for (const field of ["title", "description"]) {
    if (provider[field] !== undefined && typeof provider[field] !== "string") {
      fail("INVALID_RECEIPT", `provider.${field} must be a string`);
    }
  }
  if (provider.websiteUrl !== undefined && (typeof provider.websiteUrl !== "string" || provider.websiteUrl.length === 0)) {
    fail("INVALID_RECEIPT", "provider.websiteUrl must be a non-empty string");
  }
  if (provider.icons !== undefined) {
    if (!Array.isArray(provider.icons)) fail("INVALID_RECEIPT", "provider.icons must be an array");
    for (const [index, icon] of provider.icons.entries()) {
      assertObjectWithOptionalFields(icon, ["src"], ["mimeType", "sizes", "theme"], `provider.icons[${index}]`);
      assertNonEmptyString(icon.src, `provider.icons[${index}].src`);
      if (icon.mimeType !== undefined && typeof icon.mimeType !== "string") fail("INVALID_RECEIPT", "provider icon mimeType must be a string");
      if (icon.sizes !== undefined && (!Array.isArray(icon.sizes) || icon.sizes.some((size) => typeof size !== "string"))) {
        fail("INVALID_RECEIPT", "provider icon sizes must be an array of strings");
      }
      if (icon.theme !== undefined && !["light", "dark"].includes(icon.theme)) {
        fail("INVALID_RECEIPT", "provider icon theme must be light or dark");
      }
    }
  }
}

function assertSearch(search) {
  if (search === null) return;
  assertExactObject(search, ["tool", "candidate_uris"], "search");
  if (search.tool !== "find") fail("INVALID_RECEIPT", "search.tool must be find");
  if (!Array.isArray(search.candidate_uris) || search.candidate_uris.some((uri) => typeof uri !== "string" || uri.length === 0 || !uri.startsWith("viking://"))) {
    fail("INVALID_RECEIPT", "search.candidate_uris must be an array of viking:// URIs");
  }
  if (new Set(search.candidate_uris).size !== search.candidate_uris.length) {
    fail("INVALID_RECEIPT", "search.candidate_uris must not contain duplicates");
  }
}

function assertRead(read) {
  if (read === null) return;
  assertExactObject(read, ["uri", "bytes", "content_digest"], "read");
  assertNonEmptyString(read.uri, "read.uri");
  if (!read.uri.startsWith("viking://")) fail("INVALID_RECEIPT", "read.uri must use viking://");
  if (!Number.isInteger(read.bytes) || read.bytes < 0) fail("INVALID_RECEIPT", "read.bytes must be a non-negative integer");
  if (typeof read.content_digest !== "string" || !CONTEXT_RECEIPT_DIGEST_RE.test(read.content_digest)) {
    fail("INVALID_RECEIPT", "read.content_digest must be a sha256 digest");
  }
}

function assertError(error) {
  if (error === null) return;
  assertExactObject(error, ["code"], "error");
  assertNonEmptyString(error.code, "error.code");
}

function assertReceiptShape(receipt) {
  if (!isPlainObject(receipt)) fail("INVALID_RECEIPT", "receipt must be a plain object");
  assertExactFields(receipt);
  if (receipt.schema !== CONTEXT_RECEIPT_SCHEMA) fail("INVALID_RECEIPT", "schema is not the Codebase context receipt schema");
  if (receipt.version !== CONTEXT_RECEIPT_VERSION) fail("INVALID_RECEIPT", "version must be 1");
  if (receipt.receipt_type !== CONTEXT_RECEIPT_TYPE) fail("INVALID_RECEIPT", "receipt_type must be retrieval");
  assertNonEmptyString(receipt.claim_id, "claim_id");
  if (!LANES.has(receipt.lane)) fail("INVALID_RECEIPT", "lane is not supported");
  assertNonEmptyString(receipt.query, "query");
  assertNonEmptyString(receipt.created_at, "created_at");
  const createdAt = Date.parse(receipt.created_at);
  if (!Number.isFinite(createdAt) || new Date(createdAt).toISOString() !== receipt.created_at) {
    fail("INVALID_RECEIPT", "created_at must be an ISO timestamp");
  }
  assertRoute(receipt.route);
  assertWorktree(receipt.worktree);
  if (typeof receipt.ok !== "boolean") fail("INVALID_RECEIPT", "ok must be a boolean");
  if (!CONTEXT_RECEIPT_STATES.includes(receipt.state)) fail("INVALID_RECEIPT", "state is not supported");
  if (!EXECUTIONS.has(receipt.execution)) fail("INVALID_RECEIPT", "execution is not supported");
  if (!TRANSPORTS.has(receipt.transport)) fail("INVALID_RECEIPT", "transport is not supported");
  if (!QUERY_OUTCOMES.has(receipt.query_outcome)) fail("INVALID_RECEIPT", "query_outcome is not supported");
  assertProvider(receipt.provider);
  assertSearch(receipt.search);
  assertRead(receipt.read);
  assertError(receipt.error);
  if (typeof receipt.digest !== "string" || !CONTEXT_RECEIPT_DIGEST_RE.test(receipt.digest)) {
    fail("INVALID_RECEIPT", "digest must be a sha256 digest");
  }
  if (canonicalReceiptDigest(receipt) !== receipt.digest) {
    fail("RECEIPT_DIGEST_MISMATCH", "canonical digest mismatch");
  }

  const hasSearch = receipt.search !== null;
  const hasRead = receipt.read !== null;
  const hasError = receipt.error !== null;
  if (receipt.state === "PLANNED") {
    if (receipt.execution !== "PLANNED") fail("INVALID_RECEIPT", "PLANNED requires execution=PLANNED");
    if (receipt.ok !== true || receipt.transport !== "unavailable" || receipt.query_outcome !== "PLANNED") {
      fail("INVALID_RECEIPT", "PLANNED receipt fields are inconsistent");
    }
    if (hasSearch || hasRead || hasError || receipt.provider !== null) {
      fail("INVALID_RECEIPT", "PLANNED requires null provider, search, read, and error");
    }
    return;
  }

  if (receipt.execution !== "EXECUTED") fail("INVALID_RECEIPT", `${receipt.state} requires execution=EXECUTED`);
  if (receipt.state === "CONTEXT_READY") {
    if (receipt.ok !== true || receipt.transport !== "mcp" || receipt.query_outcome !== "HIT_READ" || !hasSearch || !hasRead || hasError) {
      fail("INVALID_RECEIPT", "CONTEXT_READY requires executed search and read with no error");
    }
    if (!receipt.search.candidate_uris.includes(receipt.read.uri)) {
      fail("INVALID_RECEIPT", "CONTEXT_READY read.uri must be returned by search");
    }
    return;
  }
  if (receipt.state === "NO_RELEVANT_HIT") {
    if (receipt.ok !== true || receipt.transport !== "mcp" || receipt.query_outcome !== "NO_HIT" || !hasSearch || hasRead || hasError) {
      fail("INVALID_RECEIPT", "NO_RELEVANT_HIT requires executed search and null read/error");
    }
    if (receipt.search.candidate_uris.length !== 0) fail("INVALID_RECEIPT", "NO_RELEVANT_HIT search must have no candidates");
    return;
  }

  if (receipt.transport === "unavailable" && receipt.provider !== null) {
    fail("INVALID_RECEIPT", `${receipt.state} unavailable transport requires provider=null`);
  }
  if (receipt.ok !== false || !hasError || hasRead || receipt.query_outcome === "PLANNED" || receipt.transport !== "mcp" && receipt.state === "QUERY_FAILED") {
    fail("INVALID_RECEIPT", `${receipt.state} fields are inconsistent`);
  }
  if (receipt.state === "DEGRADED" && !["FAILED", "READ_SELECTION_REQUIRED"].includes(receipt.query_outcome)) {
    fail("INVALID_RECEIPT", "DEGRADED query_outcome is inconsistent");
  }
  if (receipt.state === "DEGRADED" && receipt.query_outcome === "READ_SELECTION_REQUIRED" && (!hasSearch || receipt.search.candidate_uris.length === 0)) {
    fail("INVALID_RECEIPT", "DEGRADED read selection requires search candidates");
  }
  if (receipt.state === "QUERY_FAILED" && receipt.query_outcome !== "FAILED") {
    fail("INVALID_RECEIPT", "QUERY_FAILED query_outcome must be FAILED");
  }
}

/**
 * Validate a provider-neutral Codebase receipt and translate its retrieval
 * state into the harness context gate. Validation errors throw; PLANNED is a
 * valid receipt that deliberately returns a non-zero readiness result.
 */
export function validateContextRetrievalReceipt(receipt) {
  assertReceiptShape(receipt);
  const mapping = GATE_BY_STATE[receipt.state];
  return Object.freeze({
    ok: mapping.ok,
    receipt_status: receipt.state,
    gate_status: mapping.gate_status,
    outcome: mapping.outcome,
    context_gap: mapping.context_gap,
    exit_code: mapping.exit_code
  });
}

export function contextReceiptGate(receipt) {
  return validateContextRetrievalReceipt(receipt);
}

function parseCliArgs(args) {
  let receiptPath = null;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--receipt") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail("INVALID_ARGUMENT", "--receipt requires a path");
      receiptPath = resolve(value);
      index += 1;
    } else if (argument === "--json") {
      json = true;
    } else {
      fail("INVALID_ARGUMENT", `unknown argument: ${argument}`);
    }
  }
  if (!receiptPath) fail("INVALID_ARGUMENT", "--receipt is required");
  if (!json) fail("INVALID_ARGUMENT", "--json is required");
  return { receiptPath };
}

export async function runContextReceiptCli(args = process.argv.slice(2), io = {}) {
  const writeOut = io.writeOut ?? ((text) => process.stdout.write(text));
  const writeErr = io.writeErr ?? ((text) => process.stderr.write(text));
  try {
    const { receiptPath } = parseCliArgs(args);
    let text;
    try {
      text = await (io.readFile ?? readFile)(receiptPath, "utf8");
    } catch (error) {
      fail("RECEIPT_READ_FAILED", `cannot read receipt: ${error?.code ?? "unknown error"}`);
    }
    let receipt;
    try {
      receipt = JSON.parse(text);
    } catch {
      fail("INVALID_JSON", "invalid JSON receipt");
    }
    const result = validateContextRetrievalReceipt(receipt);
    writeOut(`${JSON.stringify(result, null, 2)}\n`);
    return result.exit_code;
  } catch (error) {
    const payload = {
      ok: false,
      error: {
        code: error?.code ?? "INVALID_RECEIPT",
        message: error?.message ?? String(error)
      }
    };
    writeErr(`${JSON.stringify(payload, null, 2)}\n`);
    return Number.isInteger(error?.exitCode) ? error.exitCode : 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runContextReceiptCli();
}
