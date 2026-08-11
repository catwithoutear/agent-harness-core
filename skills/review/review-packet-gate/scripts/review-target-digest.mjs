#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function main(argv) {
  const action = argv[0];
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
    return { exitCode: 0, body: main(argv) };
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
