import { spawnSync } from "node:child_process";
import { digestValue, fail, finalizeRecord, sha256Text } from "./review-records.mjs";

/**
 * Deterministic changed-surface inventory (R-008, R-009).
 *
 * Shells out to git to enumerate changed files, hunks and changed lines from
 * the declared base/head plus index/worktree/untracked state, then seals an
 * immutable `ChangedSurface` with a stable inventory digest.
 */

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error) fail("TARGET_RECOMPUTE_UNAVAILABLE", result.error.message);
  if (!allowFailure && result.status !== 0) {
    fail("TARGET_RECOMPUTE_UNAVAILABLE", result.stderr?.trim() || `git ${args[0]} failed`);
  }
  return result.stdout;
}

const STATUS_KIND = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "modified"
};

function collectChangedFiles(root, { base, head }) {
  const byPath = new Map();
  const add = (statusCode, path, oldPath) => {
    const kind = STATUS_KIND[statusCode] ?? "modified";
    const file = finalizeRecord({
      record_type: "changed-file",
      path,
      old_path: oldPath,
      status: kind,
      binary: false,
      generated: false
    }, `file:${digestValue({ path, status: kind })}`);
    byPath.set(path, file);
    return file;
  };

  // committed base..head
  for (const line of git(root, ["diff", "--name-status", "--no-renames", `${base}..${head}`, "--"]).split("\n")) {
    if (!line) continue;
    const [code, ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (code && path) add(code[0], path);
  }
  // staged (index)
  for (const line of git(root, ["diff", "--name-status", "--cached", "--no-renames", "--"]).split("\n")) {
    if (!line) continue;
    const [code, ...rest] = line.split("\t");
    if (code && rest.length) add(code[0], rest.join("\t"));
  }
  // unstaged (worktree)
  for (const line of git(root, ["diff", "--name-status", "--no-renames", "--"]).split("\n")) {
    if (!line) continue;
    const [code, ...rest] = line.split("\t");
    if (code && rest.length) add(code[0], rest.join("\t"));
  }
  // untracked
  for (const path of git(root, ["ls-files", "--others", "--exclude-standard"]).split("\n")) {
    if (path) add("A", path);
  }

  return [...byPath.values()];
}

function collectHunks(root, file, { base, head }) {
  const path = file.path;
  if (file.status === "deleted" || file.binary) return [];

  const committed = git(root, ["diff", "-U0", `${base}..${head}`, "--", path], { allowFailure: true });
  const staged = git(root, ["diff", "-U0", "--cached", "--", path], { allowFailure: true });
  const unstaged = git(root, ["diff", "-U0", "--", path], { allowFailure: true });
  const diff = [committed, staged, unstaged].filter(Boolean).join("\n");
  const results = [];
  let current = null;
  let newLine = 0;
  let oldLine = 0;

  const flush = () => {
    if (current) {
      results.push({ hunk: finalizeHunk(file, current), lines: current.lines });
      current = null;
    }
  };

  for (const line of diff.split("\n")) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u);
    if (hunkMatch) {
      flush();
      current = { old_start: Number(hunkMatch[1]), old_count: hunkMatch[2] ? Number(hunkMatch[2]) : 1, new_start: Number(hunkMatch[3]), new_count: hunkMatch[4] ? Number(hunkMatch[4]) : 1, lines: [] };
      newLine = Number(hunkMatch[3]);
      oldLine = Number(hunkMatch[1]);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.lines.push({ side: "new", number: newLine, kind: "added", content_digest: sha256Text(line.slice(1)) });
      newLine += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.lines.push({ side: "old", number: oldLine, kind: "deleted", content_digest: sha256Text(line.slice(1)) });
      oldLine += 1;
    }
  }
  flush();
  return results;
}

function finalizeHunk(file, hunk) {
  return finalizeRecord({
    record_type: "changed-hunk",
    file_ref: { id: file.record_id, digest: file.record_digest },
    old_range: { start: hunk.old_start, count: hunk.old_count },
    new_range: { start: hunk.new_start, count: hunk.new_count },
    patch_digest: digestValue({ old_range: hunk.old_start, new_range: hunk.new_start, lines: hunk.lines })
  }, `hunk:${digestValue({ file: file.path, old: hunk.old_start, new: hunk.new_start })}`);
}

export function collectChangedSurface(repoRoot, options = {}) {
  const base = options.base ?? "HEAD";
  const head = options.head ?? "HEAD";

  const files = collectChangedFiles(repoRoot, { base, head });
  const hunks = [];
  const lines = [];

  for (const file of files) {
    const fileHunks = collectHunks(repoRoot, file, { base, head });
    for (const { hunk, lines: rawLines } of fileHunks) {
      hunks.push(hunk);
      for (const rawLine of rawLines) {
        lines.push(finalizeRecord({
          record_type: "changed-line",
          hunk_ref: { id: hunk.record_id, digest: hunk.record_digest },
          side: rawLine.side,
          number: rawLine.number,
          kind: rawLine.kind,
          content_digest: rawLine.content_digest
        }, `line:${digestValue({ hunk: hunk.record_id, side: rawLine.side, number: rawLine.number })}`));
      }
    }
  }

  const inventoryEntries = files.map((file) => ({ path: file.path, status: file.status, old_path: file.old_path })).sort((a, b) => (a.path < b.path ? -1 : 1));
  const surface = finalizeRecord({
    record_type: "changed-surface",
    target_view_ref: options.target_view_ref,
    target_policy_ref: options.target_policy_ref,
    file_refs: files.map((file) => ({ id: file.record_id, digest: file.record_digest })),
    hunk_refs: hunks.map((hunk) => ({ id: hunk.record_id, digest: hunk.record_digest })),
    line_refs: lines.map((line) => ({ id: line.record_id, digest: line.record_digest })),
    slice_refs: [],
    inventory_digest: digestValue(inventoryEntries)
  }, `surface:${digestValue(inventoryEntries)}`);

  return { surface, files, hunks, lines };
}

export function normalizeHunk(raw) {
  if (!raw || typeof raw.old_range !== "object" || typeof raw.new_range !== "object") {
    fail("HUNK_GAP", "hunk missing old_range/new_range");
  }
  return finalizeRecord({
    record_type: "changed-hunk",
    file_ref: raw.file_ref,
    old_range: raw.old_range,
    new_range: raw.new_range,
    patch_digest: raw.patch_digest
  }, raw.record_id ?? `hunk:${digestValue(raw)}`);
}

export function normalizeChangedLine(raw) {
  if (!raw || typeof raw.number !== "number") {
    fail("LINE_COVERAGE_GAP", "changed line missing number");
  }
  if (!raw.hunk_ref) {
    fail("UNIT_IDENTITY_GAP", "changed line has no hunk_ref");
  }
  return finalizeRecord({
    record_type: "changed-line",
    hunk_ref: raw.hunk_ref,
    side: raw.side,
    number: raw.number,
    kind: raw.kind,
    content_digest: raw.content_digest
  }, raw.record_id ?? `line:${digestValue(raw)}`);
}
