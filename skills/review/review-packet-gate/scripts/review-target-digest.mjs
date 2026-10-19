#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { canonicalJSONStringify, parseJsonStrict } from "./review-records.mjs";

const FORMAT = "review-target";
const HELPER_VERSION = 1;
const HEADER = Buffer.from(`${FORMAT}\0`, "ascii");

class CommandFailure extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(code, message) {
  throw new CommandFailure(code, message);
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function utf8(value) {
  return Buffer.from(value, "utf8");
}

function frameField(label, value) {
  const labelBytes = utf8(label);
  const valueBytes = Buffer.isBuffer(value) ? value : utf8(value);
  const lengths = Buffer.allocUnsafe(12);
  lengths.writeUInt32BE(labelBytes.length, 0);
  lengths.writeBigUInt64BE(BigInt(valueBytes.length), 4);
  return Buffer.concat([lengths.subarray(0, 4), labelBytes, lengths.subarray(4), valueBytes]);
}

function frame(fields, includeHeader = true) {
  const buffers = includeHeader ? [HEADER] : [];
  for (const [label, value] of fields) {
    buffers.push(frameField(label, value));
  }
  return Buffer.concat(buffers);
}

function record(fields) {
  return frame(fields, false);
}

function componentDigest(name, records) {
  return sha256(
    frame([
      ["helper-version", String(HELPER_VERSION)],
      ["component", name],
      ...records.map((value) => ["record", value])
    ])
  );
}

function presentRecord(relativePath, type, executable, valueKind, value) {
  return record([
    ["path", relativePath],
    ["state", "present"],
    ["type", type],
    ["executable", executable],
    ["value-kind", valueKind],
    ["value", value]
  ]);
}

function deletedRecord(relativePath) {
  return record([
    ["path", relativePath],
    ["state", "deleted"]
  ]);
}

function notApplicableRecord() {
  return record([
    ["path", "not-applicable"],
    ["state", "not-applicable"]
  ]);
}

function byteCompare(left, right) {
  return Buffer.compare(utf8(left), utf8(right));
}

function sortPaths(paths) {
  return [...paths].sort(byteCompare);
}

function decodeUtf8(buffer, code, message) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    fail(code, message);
  }
}

function normalizedTextFile(filePath, code, message) {
  let raw;
  try {
    raw = fs.readFileSync(filePath);
  } catch {
    fail(code, message);
  }
  if (raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    fail(code, message);
  }
  const text = decodeUtf8(raw, code, message);
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/u, "");
  return Buffer.from(`${normalized}\n`, "utf8");
}

function normalizeRelativePath(value, { allowDot = true } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "typed path must be a non-empty relative path");
  }
  if (path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/u.test(value)) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "typed path must be relative");
  }
  const normalizedSeparators = value.replaceAll("\\", "/");
  if (normalizedSeparators === ".") {
    if (!allowDot) {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "typed path cannot be the target root");
    }
    return ".";
  }
  const segments = normalizedSeparators.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "typed path must not contain empty, dot, or parent segments");
  }
  return segments.join("/");
}

function uniqueNormalizedPaths(values, optionName) {
  const normalized = values.map((value) => normalizeRelativePath(value));
  const sorted = sortPaths(normalized);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1]) {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", `duplicate ${optionName} path`);
    }
  }
  return sorted;
}

function parseOptions(args, allowed) {
  const values = new Map();
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (!allowed.has(argument)) {
      fail("INVALID_ARGUMENT", "unknown helper option");
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("INVALID_ARGUMENT", "helper option requires a value");
    }
    index += 1;
    const current = values.get(argument) ?? [];
    current.push(value);
    values.set(argument, current);
  }
  return { values, json };
}

function oneOption(values, option, { required = false, fallback } = {}) {
  const entries = values.get(option) ?? [];
  if (entries.length > 1) {
    fail("INVALID_ARGUMENT", `${option} may be supplied only once`);
  }
  if (entries.length === 0) {
    if (required) {
      fail("INVALID_ARGUMENT", `${option} is required`);
    }
    return fallback;
  }
  return entries[0];
}

function rootDirectory(root, code) {
  try {
    const resolved = fs.realpathSync(root);
    if (!fs.statSync(resolved).isDirectory()) {
      fail(code, "target root must be a directory");
    }
    return resolved;
  } catch (error) {
    if (error instanceof CommandFailure) {
      throw error;
    }
    fail(code, "target root is unavailable");
  }
}

function pathInside(root, relativePath) {
  const target = path.resolve(root, ...relativePath.split("/"));
  const relation = path.relative(root, target);
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "typed path escapes target root");
  }
  return target;
}

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) {
    const operation = args.includes("diff") ? "diff" : args[0];
    fail("TARGET_FINGERPRINT_UNAVAILABLE", `required Git ${operation} state is unavailable`);
  }
  return Buffer.from(result.stdout ?? []);
}

function runGitStatus(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0 && result.status !== 1) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "required Git target state is unavailable");
  }
  return result.status === 0;
}

function gitText(root, args) {
  return decodeUtf8(runGit(root, args), "TARGET_FINGERPRINT_UNAVAILABLE", "required Git target state is unavailable").trim();
}

function gitRoot(codeRoot) {
  const root = gitText(codeRoot, ["rev-parse", "--show-toplevel"]);
  const resolved = rootDirectory(root, "TARGET_FINGERPRINT_UNAVAILABLE");
  if (path.resolve(resolved) !== path.resolve(codeRoot)) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "code root must be the Git worktree root");
  }
  return resolved;
}

function gitRevision(root, revision) {
  return gitText(root, ["rev-parse", "--verify", `${revision}^{commit}`]);
}

function nulPaths(buffer) {
  const paths = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) {
      continue;
    }
    const value = decodeUtf8(
      buffer.subarray(start, index),
      "TARGET_FINGERPRINT_UNAVAILABLE",
      "Git path is not valid UTF-8"
    );
    if (value.length > 0) {
      paths.push(normalizeRelativePath(value));
    }
    start = index + 1;
  }
  if (start !== buffer.length) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "Git path output is malformed");
  }
  return sortPaths(paths);
}

function indexEntries(buffer) {
  const entries = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) {
      continue;
    }
    const entry = buffer.subarray(start, index);
    const tab = entry.indexOf(0x09);
    if (tab < 0) {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "Git index output is malformed");
    }
    const header = entry.subarray(0, tab).toString("ascii");
    const match = /^(\d+) ([0-9a-f]+) (\d+)$/u.exec(header);
    if (!match) {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "Git index output is malformed");
    }
    entries.push({
      mode: match[1],
      objectId: match[2],
      stage: Number.parseInt(match[3], 10),
      relativePath: normalizeRelativePath(
        decodeUtf8(entry.subarray(tab + 1), "TARGET_FINGERPRINT_UNAVAILABLE", "Git path is not valid UTF-8")
      )
    });
    start = index + 1;
  }
  if (start !== buffer.length) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "Git index output is malformed");
  }
  return entries;
}

function stageEntry(root, relativePath) {
  const entries = indexEntries(runGit(root, ["ls-files", "--stage", "-z", "--", relativePath]));
  const entry = entries.find((candidate) => candidate.stage === 0);
  if (entries.length > 1 || (entries.length === 1 && entries[0].stage !== 0)) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "Git index is unmerged");
  }
  return entry;
}

function stagedRecord(root, relativePath) {
  const entry = stageEntry(root, relativePath);
  if (!entry) {
    return deletedRecord(relativePath);
  }
  if (entry.mode === "160000") {
    return presentRecord(relativePath, "gitlink", "0", "gitlink-object", utf8(entry.objectId));
  }
  if (entry.mode === "120000") {
    return presentRecord(relativePath, "symlink", "0", "symlink-target", runGit(root, ["cat-file", "blob", entry.objectId]));
  }
  if (entry.mode === "100644" || entry.mode === "100755") {
    return presentRecord(
      relativePath,
      "file",
      entry.mode === "100755" ? "1" : "0",
      "blob",
      runGit(root, ["cat-file", "blob", entry.objectId])
    );
  }
  fail("TARGET_FINGERPRINT_UNAVAILABLE", "Git index contains an unsupported file type");
}

function filesystemRecord(root, relativePath, { allowMissing = false } = {}) {
  const target = pathInside(root, relativePath);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (allowMissing && error && error.code === "ENOENT") {
      return deletedRecord(relativePath);
    }
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "target input is unavailable");
  }
  if (stat.isSymbolicLink()) {
    try {
      return presentRecord(relativePath, "symlink", "0", "symlink-target", utf8(fs.readlinkSync(target)));
    } catch {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "target symlink is unavailable");
    }
  }
  if (stat.isFile()) {
    try {
      return presentRecord(
        relativePath,
        "file",
        stat.mode & 0o111 ? "1" : "0",
        "worktree",
        fs.readFileSync(target)
      );
    } catch {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "target file is unavailable");
    }
  }
  fail("TARGET_FINGERPRINT_UNAVAILABLE", "target input has an unsupported file type");
}

function scopeIncludes(scope, relativePath) {
  return scope === "." || relativePath === scope || relativePath.startsWith(`${scope}/`);
}

function collectFilesystemTree(root, includePaths) {
  const entries = new Map();
  const walk = (relativePath) => {
    const target = pathInside(root, relativePath);
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "target input is unavailable");
    }
    if (stat.isDirectory()) {
      let names;
      try {
        names = fs.readdirSync(target, { encoding: "utf8" });
      } catch {
        fail("TARGET_FINGERPRINT_UNAVAILABLE", "target directory is unavailable");
      }
      for (const name of sortPaths(names)) {
        const child = relativePath === "." ? normalizeRelativePath(name) : `${relativePath}/${normalizeRelativePath(name)}`;
        walk(child);
      }
      return;
    }
    entries.set(relativePath, filesystemRecord(root, relativePath));
  };
  for (const includePath of includePaths) {
    walk(includePath);
  }
  return sortPaths([...entries.keys()]).map((relativePath) => entries.get(relativePath));
}

function collectGitTarget(values) {
  const kind = oneOption(values, "--kind", { required: true });
  if (kind !== "git-worktree") {
    fail("INVALID_ARGUMENT", "git target requires git-worktree kind");
  }
  const codeRoot = rootDirectory(oneOption(values, "--code-root", { required: true }), "TARGET_FINGERPRINT_UNAVAILABLE");
  if (values.has("--artifact-root")) {
    fail("INVALID_ARGUMENT", "git target cannot use artifact root");
  }
  const root = gitRoot(codeRoot);
  if (runGit(root, ["ls-files", "-u", "-z"]).length > 0) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "Git index is unmerged");
  }

  const baseRevision = gitRevision(root, oneOption(values, "--base", { required: true }));
  const headRevision = gitRevision(root, oneOption(values, "--head", { fallback: "HEAD" }));
  const gitObjectFormat = gitText(root, ["rev-parse", "--show-object-format"]);
  const declaration = normalizedTextFile(
    oneOption(values, "--declaration", { required: true }),
    "TARGET_FINGERPRINT_UNAVAILABLE",
    "declaration is unavailable or invalid UTF-8"
  );
  const untrackedScopes = uniqueNormalizedPaths(values.get("--untracked-scope") ?? ["."], "untracked scope");
  const includePaths = uniqueNormalizedPaths(values.get("--include-path") ?? [], "include");

  const stagedPaths = nulPaths(
    runGit(root, [
      "-c",
      "core.quotePath=false",
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      headRevision,
      "--"
    ])
  );
  const unstagedPaths = nulPaths(
    runGit(root, [
      "-c",
      "core.quotePath=false",
      "diff",
      "--name-only",
      "-z",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--"
    ])
  );
  const allUntracked = nulPaths(runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]));
  const untrackedPaths = allUntracked.filter((candidate) => untrackedScopes.some((scope) => scopeIncludes(scope, candidate)));
  const selectedUntracked = new Set(untrackedPaths);

  const declaredRecords = [
    ...untrackedScopes.map((scope) => record([["untracked-scope", scope]])),
    ...includePaths.map((includePath) => record([["include-path", includePath]]))
  ];
  for (const includePath of includePaths) {
    if (runGitStatus(root, ["ls-files", "--error-unmatch", "--", includePath])) {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "included path is tracked");
    }
    if (selectedUntracked.has(includePath)) {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "included path overlaps selected untracked input");
    }
    if (!runGitStatus(root, ["check-ignore", "-q", "--", includePath])) {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "included path is not ignored");
    }
  }
  for (const fileRecord of collectFilesystemTree(root, includePaths)) {
    declaredRecords.push(fileRecord);
  }
  declaredRecords.push(record([["declaration", declaration]]));

  const unstagedRecords = [];
  for (const relativePath of unstagedPaths) {
    const indexed = stageEntry(root, relativePath);
    if (indexed?.mode === "160000") {
      fail("TARGET_FINGERPRINT_UNAVAILABLE", "unstaged Gitlinks are unsupported");
    }
    unstagedRecords.push(filesystemRecord(root, relativePath, { allowMissing: true }));
  }

  const components = {
    committed: componentDigest(
      "committed",
      [record([["base-revision", baseRevision], ["head-revision", headRevision], ["git-object-format", gitObjectFormat]])]
    ),
    staged: componentDigest("staged", stagedPaths.map((relativePath) => stagedRecord(root, relativePath))),
    unstaged: componentDigest("unstaged", unstagedRecords),
    untracked: componentDigest(
      "untracked",
      untrackedPaths.map((relativePath) => filesystemRecord(root, relativePath))
    ),
    "declared-inputs": componentDigest("declared-inputs", declaredRecords)
  };
  return targetResult({
    targetKind: kind,
    baseRevision,
    headRevision,
    gitObjectFormat,
    components,
    untrackedScopes,
    includePaths,
    declaration
  });
}

function collectArtifactTarget(values) {
  const kind = oneOption(values, "--kind", { required: true });
  if (kind !== "artifact-set") {
    fail("INVALID_ARGUMENT", "artifact target requires artifact-set kind");
  }
  if (values.has("--code-root") || values.has("--base") || values.has("--head") || values.has("--untracked-scope")) {
    fail("INVALID_ARGUMENT", "artifact target cannot use Git target options");
  }
  const root = rootDirectory(oneOption(values, "--artifact-root", { required: true }), "TARGET_FINGERPRINT_UNAVAILABLE");
  const includePaths = uniqueNormalizedPaths(values.get("--include-path") ?? [], "include");
  if (includePaths.length === 0) {
    fail("TARGET_FINGERPRINT_UNAVAILABLE", "artifact target requires one or more include paths");
  }
  const declaration = normalizedTextFile(
    oneOption(values, "--declaration", { required: true }),
    "TARGET_FINGERPRINT_UNAVAILABLE",
    "declaration is unavailable or invalid UTF-8"
  );
  const declaredRecords = [
    ...includePaths.map((includePath) => record([["include-path", includePath]])),
    ...collectFilesystemTree(root, includePaths),
    record([["declaration", declaration]])
  ];
  const components = {
    committed: componentDigest("committed", [notApplicableRecord()]),
    staged: componentDigest("staged", [notApplicableRecord()]),
    unstaged: componentDigest("unstaged", [notApplicableRecord()]),
    untracked: componentDigest("untracked", [notApplicableRecord()]),
    "declared-inputs": componentDigest("declared-inputs", declaredRecords)
  };
  return targetResult({
    targetKind: kind,
    baseRevision: "N/A",
    headRevision: "N/A",
    gitObjectFormat: "N/A",
    components,
    untrackedScopes: [],
    includePaths,
    declaration
  });
}

function targetResult({
  targetKind,
  baseRevision,
  headRevision,
  gitObjectFormat,
  components,
  untrackedScopes,
  includePaths,
  declaration
}) {
  const targetFingerprint = sha256(
    frame([
      ["helper-version", String(HELPER_VERSION)],
      ["target-kind", targetKind],
      ["git-object-format", gitObjectFormat],
      ["base-revision", baseRevision],
      ["head-revision", headRevision],
      ...["committed", "staged", "unstaged", "untracked", "declared-inputs"].map((name) => [
        `component:${name}`,
        components[name]
      ])
    ])
  );
  return {
    command: "target",
    status: "ok",
    fingerprint_format: FORMAT,
    helper_version: HELPER_VERSION,
    digest_algorithm: "sha256",
    target_kind: targetKind,
    target_fingerprint: targetFingerprint,
    base_revision: baseRevision,
    head_revision: headRevision,
    git_object_format: gitObjectFormat,
    components: Object.fromEntries(
      Object.entries(components).map(([name, digest]) => [
        name,
        { digest, summary: targetKind === "artifact-set" && name !== "declared-inputs" ? "N/A" : "canonical records" }
      ])
    ),
    untracked_scopes: untrackedScopes,
    include_paths: includePaths,
    declaration_digest: sha256(declaration)
  };
}

// Ordinary review navigation uses the same explicit-root owner as target identity.
// These receipts are source evidence, never protocol records or semantic gates.
function sourceLocation(root, relative) {
  let resolved;
  try {
    resolved = fs.realpathSync(pathInside(root, relative));
  } catch {
    fail("SOURCE_UNAVAILABLE", `source unavailable: ${relative}`);
  }
  const inside = path.relative(root, resolved);
  if (inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
    fail("SOURCE_OUTSIDE_ROOT", `source escapes explicit root: ${relative}`);
  }
  return resolved;
}

function sourceFile(root, relativePath) {
  const relative = normalizeRelativePath(relativePath, { allowDot: false });
  const resolved = sourceLocation(root, relative);
  if (!fs.statSync(resolved).isFile()) fail("SOURCE_UNAVAILABLE", `source is not a file: ${relative}`);
  const bytes = fs.readFileSync(resolved);
  const text = decodeUtf8(bytes, "SOURCE_UNAVAILABLE", `source is not UTF-8: ${relative}`);
  const lines = text.split(/\r\n|\n|\r/u);
  if (lines.at(-1) === "") lines.pop();
  return { path: relative, sha256: sha256(bytes), bytes: bytes.length, lines, text };
}

function sourceDigest(snapshot) {
  const { snapshot_digest, ...body } = snapshot;
  return sha256(utf8(canonicalJSONStringify(body)));
}

function createSourceSnapshot(root, values) {
  const includes = uniqueNormalizedPaths(values.get("--include-path") ?? [], "include-path");
  const targets = uniqueNormalizedPaths(values.get("--target-path") ?? [], "target-path");
  if (!includes.length || !targets.length) fail("INVALID_ARGUMENT", "source snapshot requires include-path and target-path");
  const selected = new Set();
  function walk(relative) {
    if (relative.split("/").includes(".git")) fail("SOURCE_OUTSIDE_SCOPE", "Git metadata is not review source");
    const location = sourceLocation(root, relative);
    let stat;
    try { stat = fs.lstatSync(location); } catch { fail("SOURCE_UNAVAILABLE", `source unavailable: ${relative}`); }
    if (stat.isDirectory()) {
      for (const name of sortPaths(fs.readdirSync(location))) {
        if (name === ".git") continue;
        walk(relative === "." ? normalizeRelativePath(name) : `${relative}/${normalizeRelativePath(name)}`);
      }
    } else {
      selected.add(relative);
    }
  }
  includes.forEach(walk);
  const files = sortPaths([...selected]).map((relative) => {
    const file = sourceFile(root, relative);
    return { path: relative, sha256: file.sha256, bytes: file.bytes, line_count: file.lines.length };
  });
  if (!files.length || targets.some((target) => !files.some((file) => scopeIncludes(target, file.path)))) {
    fail("SOURCE_OUTSIDE_SCOPE", "each target must have source in the selected includes");
  }
  const snapshot = { format: "review-source", version: 1, files, target_paths: targets };
  return { ...snapshot, snapshot_digest: sourceDigest(snapshot) };
}

function readSourceSnapshot(file) {
  let snapshot;
  try { snapshot = parseJsonStrict(fs.readFileSync(file, "utf8")); } catch { fail("SOURCE_SNAPSHOT_INVALID", "source snapshot is unavailable or invalid"); }
  return validateSourceSnapshot(snapshot);
}

export function validateSourceSnapshot(snapshot) {
  if (snapshot?.format !== "review-source" || snapshot.version !== 1 || !Array.isArray(snapshot.files) || !snapshot.files.length ||
      !Array.isArray(snapshot.target_paths) || !snapshot.target_paths.length ||
      Object.keys(snapshot).some((key) => !["format", "version", "files", "target_paths", "snapshot_digest"].includes(key))) {
    fail("SOURCE_SNAPSHOT_INVALID", "invalid source snapshot shape");
  }
  const paths = new Set();
  for (const file of snapshot.files) {
    if (!file || typeof file !== "object" || Array.isArray(file)) fail("SOURCE_SNAPSHOT_INVALID", "invalid source file identity");
    const relative = normalizeRelativePath(file.path, { allowDot: false });
    if (relative !== file.path || paths.has(relative) || !/^sha256:[0-9a-f]{64}$/u.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !Number.isSafeInteger(file.line_count) || file.line_count < 0 ||
        Object.keys(file).some((key) => !["path", "sha256", "bytes", "line_count"].includes(key))) {
      fail("SOURCE_SNAPSHOT_INVALID", "invalid/duplicate source file identity");
    }
    paths.add(relative);
  }
  for (const target of snapshot.target_paths) {
    if (normalizeRelativePath(target) !== target || !snapshot.files.some((file) => scopeIncludes(target, file.path))) {
      fail("SOURCE_SNAPSHOT_INVALID", "snapshot target has no selected source");
    }
  }
  if (snapshot.snapshot_digest !== sourceDigest(snapshot)) fail("SOURCE_SNAPSHOT_INVALID", "snapshot digest mismatch");
  return snapshot;
}

function selectedSource(root, snapshot, relative) {
  const entry = snapshot.files.find((file) => file.path === relative);
  if (!entry) fail("SOURCE_OUTSIDE_SCOPE", "source was not selected in the snapshot");
  const current = sourceFile(root, relative);
  if (current.sha256 !== entry.sha256 || current.bytes !== entry.bytes || current.lines.length !== entry.line_count) {
    fail("SOURCE_CHANGED", `source changed since dispatch: ${relative}`);
  }
  return current;
}

function sourceRead(root, snapshot, relative, start = 1, end) {
  const file = selectedSource(root, snapshot, relative);
  end ??= Math.min(start + 159, file.lines.length);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || start > file.lines.length) {
    fail("SOURCE_RANGE_INVALID", "source range must select existing lines");
  }
  end = Math.min(end, file.lines.length);
  return { format: "review-source-read", snapshot_digest: snapshot.snapshot_digest,
    path: relative, sha256: file.sha256, start_line: start, end_line: end,
    lines: file.lines.slice(start - 1, end).map((text, offset) => ({ number: start + offset, text })) };
}

export function checkSourceEvidence(root, snapshot, evidence) {
  if (!Array.isArray(evidence) || !evidence.length) fail("SOURCE_EVIDENCE_GAP", "source check requires read receipts");
  const gaps = [];
  // Check the entire delivered corpus, including context not quoted in a report.
  for (const file of snapshot.files) {
    try { selectedSource(root, snapshot, file.path); } catch (error) {
      if (!(error instanceof CommandFailure)) throw error;
      gaps.push({ path: file.path, kind: error.code });
    }
  }
  for (const receipt of evidence) {
    try {
      if (receipt?.format !== "review-source-read" || receipt.snapshot_digest !== snapshot.snapshot_digest) {
        fail("SOURCE_EVIDENCE_GAP", "receipt is not bound to this snapshot");
      }
      const actual = sourceRead(root, snapshot, receipt.path, receipt.start_line, receipt.end_line);
      if (!isDeepStrictEqual(receipt, actual)) {
        fail("SOURCE_EXCERPT_MISMATCH", "receipt does not match the actual source slice");
      }
    } catch (error) {
      if (!(error instanceof CommandFailure)) throw error;
      gaps.push({ path: receipt?.path ?? null, kind: error.code });
    }
  }
  return { status: gaps.length ? "gap" : "ok", snapshot_digest: snapshot.snapshot_digest,
    source_identity_verified: gaps.length === 0, semantics_verified: false, gaps };
}

function sourceCommand(action, args) {
  const common = ["--code-root", "--snapshot"];
  const options = {
    "source-snapshot": ["--code-root", "--include-path", "--target-path"],
    "source-inventory": [...common, "--prefix"],
    "source-read": [...common, "--path", "--start", "--end"],
    "source-check": [...common, "--evidence"],
    "source-return": [...common, "--path", "--start", "--end", "--report", "--claim", "--invariant"]
  };
  const { values } = parseOptions(args, new Set(options[action]));
  const root = rootDirectory(oneOption(values, "--code-root", { required: true }), "SOURCE_UNAVAILABLE");
  if (action === "source-snapshot") return createSourceSnapshot(root, values);
  const snapshot = readSourceSnapshot(oneOption(values, "--snapshot", { required: true }));
  if (action === "source-inventory") {
    const prefix = normalizeRelativePath(oneOption(values, "--prefix", { fallback: "." }));
    return { snapshot_digest: snapshot.snapshot_digest, target_paths: snapshot.target_paths,
      files: snapshot.files.filter((file) => scopeIncludes(prefix, file.path)).map((entry) => {
        selectedSource(root, snapshot, entry.path);
        return entry;
      }) };
  }
  if (action === "source-check") {
    let receipts;
    try { receipts = parseJsonStrict(fs.readFileSync(oneOption(values, "--evidence", { required: true }), "utf8")); }
    catch { fail("SOURCE_EVIDENCE_GAP", "read receipts are unavailable or invalid"); }
    return checkSourceEvidence(root, snapshot, receipts);
  }
  const relative = normalizeRelativePath(oneOption(values, "--path", { required: true }), { allowDot: false });
  const start = Number(oneOption(values, "--start", { fallback: "1" }));
  const endValue = oneOption(values, "--end");
  const receipt = sourceRead(root, snapshot, relative, start, endValue === undefined ? undefined : Number(endValue));
  if (action === "source-read") return receipt;
  const claim = oneOption(values, "--claim", { required: true });
  const invariant = oneOption(values, "--invariant", { required: true });
  if (!claim.trim() || !invariant.trim()) fail("INVALID_ARGUMENT", "return requires a concrete claim and invariant");
  let report;
  try { report = fs.readFileSync(oneOption(values, "--report", { required: true })); }
  catch { fail("SOURCE_EVIDENCE_GAP", "original report unavailable"); }
  return { format: "review-source-return", original_report_sha256: sha256(report), block: receipt,
    unsupported_claim: claim, invariant, semantics_verified: false,
    requested_action: "Recheck this premise and final call under the named invariant; return corrected evidence or explicitly unsubstantiated coverage. Preserve the original report." };
}

function main(argv) {
  const action = argv[0];
  if (["source-snapshot", "source-inventory", "source-read", "source-check", "source-return"].includes(action)) {
    return sourceCommand(action, argv.slice(1));
  }
  if (action === "target") {
    const { values } = parseOptions(
      argv.slice(1),
      new Set([
        "--kind",
        "--code-root",
        "--artifact-root",
        "--base",
        "--head",
        "--untracked-scope",
        "--include-path",
        "--declaration"
      ])
    );
    const kind = oneOption(values, "--kind", { required: true });
    if (kind === "git-worktree") {
      return collectGitTarget(values);
    }
    if (kind === "artifact-set") {
      return collectArtifactTarget(values);
    }
    fail("INVALID_ARGUMENT", "target kind is unsupported");
  }
  fail("INVALID_ARGUMENT", "helper command is unsupported");
}

export function executeReviewTargetDigest(argv) {
  const action = argv[0] ?? "unknown";
  try {
    const body = main(argv);
    return { exitCode: action === "source-check" && body.status === "gap" ? 1 : 0, body };
  } catch (error) {
    const code = error instanceof CommandFailure ? error.code : "INTERNAL_ERROR";
    const message = error instanceof CommandFailure ? error.message : "helper failed unexpectedly";
    return {
      exitCode: 1,
      body: { command: action, status: "error", error_code: code, message }
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = executeReviewTargetDigest(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.body)}\n`);
  process.exitCode = result.exitCode;
}
