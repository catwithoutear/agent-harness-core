import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { frontMatter, readText, splitTableRow, writeText } from "./markdown.js";

export const EXECUTION_MAP_COLUMNS = ["Slice", "Topology", "Status", "Branch", "Worktree", "Base", "Depends On", "Owner", "Last Evidence"];
const COLUMN_KEYS = {
  Slice: "slice",
  Topology: "topology",
  Status: "status",
  Branch: "branch",
  Worktree: "worktree",
  Base: "base",
  "Depends On": "depends_on",
  Owner: "owner",
  "Last Evidence": "last_evidence"
};
const ALLOWED_STATUSES = new Set(["planned", "claimed", "active", "blocked", "ready", "merged", "superseded"]);
const TERMINAL_STATUSES = new Set(["merged", "superseded"]);
const GATED_STATUSES = new Set(["blocked", "ready", "merged", "superseded"]);
const ALLOWED_TOPOLOGIES = new Set(["parallel", "stacked", "standalone"]);

export class ExecutionMapError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExecutionMapError";
  }
}

export function readExecutionMap(changeDir) {
  const filePath = executionMapPath(changeDir);
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      assignments: [],
      frontMatterText: null
    };
  }
  const text = readText(filePath);
  const tableLines = firstTableLines(text);
  return {
    filePath,
    exists: true,
    columns: tableLines.length > 0 ? splitTableRow(tableLines[0]) : [],
    assignments: parseAssignments(tableLines),
    frontMatterText: frontMatterPrefix(text)
  };
}

export function executionMapPayload(changeDir, rootContext) {
  const map = readExecutionMap(changeDir);
  return {
    change_id: path.basename(changeDir),
    exists: map.exists,
    assignments: map.assignments,
    root_context: rootContext
  };
}

export function executionMapSummary(changeDir, worktreesChecked = false) {
  const map = readExecutionMap(changeDir);
  return {
    exists: map.exists,
    assignment_count: map.assignments.length,
    active_assignment_count: map.assignments.filter((assignment) => assignment.status === "active").length,
    worktrees_checked: worktreesChecked
  };
}

export function validateExecutionMapWorktrees(changeDir) {
  const map = readExecutionMap(changeDir);
  const errors = [];
  const warnings = [];
  if (!map.exists) {
    return { errors, warnings };
  }

  const missingColumns = EXECUTION_MAP_COLUMNS.filter((column) => !map.columns.includes(column));
  if (missingColumns.length > 0) {
    errors.push(`${map.filePath}: missing required columns: ${missingColumns.join(", ")}`);
    return { errors, warnings };
  }

  const assignments = map.assignments;
  const bySlice = new Map(assignments.map((assignment) => [assignment.slice, assignment]));
  for (const assignment of assignments) {
    validateStatus(map.filePath, assignment, errors);
    validateSliceLink(changeDir, map.filePath, assignment, errors);
    validateEvidenceReference(changeDir, map.filePath, assignment, errors);
    validateTopology(map.filePath, assignment, assignments, bySlice, errors);
  }
  validateDependencyCycles(map.filePath, assignments, errors);
  validateDependencyStatusGates(map.filePath, assignments, bySlice, errors);
  validateDuplicateWorktrees(map.filePath, assignments, errors);
  validateWorktreePaths(changeDir, map.filePath, assignments, errors, warnings);
  return { errors, warnings };
}

export function assignSlice(changeDir, args, rootContext, cwd = process.cwd()) {
  const current = readExecutionMap(changeDir);
  const assignment = assignmentFromArgs(changeDir, args, rootContext, cwd);
  assertNoDuplicateActiveWorktree(current.assignments, assignment);
  const assignments = upsertAssignment(current.assignments, assignment);
  writeText(current.filePath, renderExecutionMap(current, assignments));
  return {
    path: current.filePath,
    assignment
  };
}

function assignmentFromArgs(changeDir, args, rootContext, cwd) {
  const slice = resolveSlice(changeDir, args.values.get("slice"));
  const status = args.values.get("status") ?? "planned";
  const topology = args.values.get("topology") ?? "standalone";
  const branch = args.values.get("branch") ?? "";
  const worktree = normalizeWorktree(args.values.get("worktree") ?? "", args.values.has("code-root") ? rootContext.code_root : cwd);
  const base = args.values.get("base") ?? "";
  const dependsOn = args.values.get("depends-on") ?? "";
  const owner = args.values.get("owner") ?? "";
  const lastEvidence = args.values.get("last-evidence") ?? "";

  if (!ALLOWED_STATUSES.has(status)) {
    throw new ExecutionMapError(`invalid --status: ${status}`);
  }
  if (!ALLOWED_TOPOLOGIES.has(topology)) {
    throw new ExecutionMapError(`invalid --topology: ${topology}`);
  }
  if (status !== "planned" && (!branch || !worktree)) {
    throw new ExecutionMapError(`${status} assignment requires --branch and --worktree`);
  }
  if (GATED_STATUSES.has(status) && !lastEvidence) {
    throw new ExecutionMapError(`${status} assignment requires --last-evidence`);
  }
  if (lastEvidence) {
    validateEvidenceRef(lastEvidence);
  }
  if (topology === "parallel" && dependsOn && dependsOn !== "none") {
    throw new ExecutionMapError("parallel assignment cannot include --depends-on except none");
  }
  if (topology === "stacked" && !dependsOn && !base) {
    throw new ExecutionMapError("stacked assignment requires --depends-on or --base");
  }

  return {
    slice,
    topology,
    status,
    branch,
    worktree,
    base,
    depends_on: dependsOn,
    owner,
    last_evidence: lastEvidence
  };
}

function resolveSlice(changeDir, value) {
  if (!value) {
    throw new ExecutionMapError("assign-slice requires --slice");
  }
  const tasksDir = path.join(changeDir, "tasks");
  const candidates = [];
  if (/^\d{3}$/.test(value) && fs.existsSync(tasksDir)) {
    candidates.push(
      ...fs
        .readdirSync(tasksDir)
        .filter((name) => name.startsWith(`slice-${value}-`) && name.endsWith(".md"))
        .map((name) => path.join(tasksDir, name))
    );
  } else {
    const raw = value.replace(/^\.?\//, "");
    if (raw.startsWith("tasks/")) {
      candidates.push(path.join(changeDir, raw));
    } else {
      candidates.push(path.join(tasksDir, path.basename(raw)));
    }
  }

  const existing = candidates.filter((candidate) => fs.existsSync(candidate));
  if (existing.length !== 1) {
    throw new ExecutionMapError(`slice not found or ambiguous: ${value}`);
  }
  return path.relative(changeDir, existing[0]).split(path.sep).join("/");
}

function normalizeWorktree(value, base) {
  if (!value) {
    return "";
  }
  return path.resolve(path.isAbsolute(value) ? value : path.join(base, value));
}

function validateEvidenceRef(value) {
  if (path.isAbsolute(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new ExecutionMapError(`invalid --last-evidence: ${value}`);
  }
  const [relPath, fragment = ""] = value.split("#", 2);
  if (!relPath.endsWith(".md") || relPath.split("/").includes("..") || relPath.split("/").includes("")) {
    throw new ExecutionMapError(`invalid --last-evidence: ${value}`);
  }
  if (fragment && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fragment)) {
    throw new ExecutionMapError(`invalid --last-evidence: ${value}`);
  }
}

function assertNoDuplicateActiveWorktree(assignments, assignment) {
  if (!assignment.worktree || TERMINAL_STATUSES.has(assignment.status)) {
    return;
  }
  const nextPath = comparablePath(assignment.worktree);
  const duplicate = assignments.find(
    (existing) =>
      existing.slice !== assignment.slice &&
      existing.worktree &&
      !TERMINAL_STATUSES.has(existing.status) &&
      comparablePath(existing.worktree) === nextPath
  );
  if (duplicate) {
    throw new ExecutionMapError(`duplicate active worktree: ${assignment.worktree}`);
  }
}

function comparablePath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function upsertAssignment(assignments, assignment) {
  const index = assignments.findIndex((entry) => entry.slice === assignment.slice);
  if (index === -1) {
    return [...assignments, assignment];
  }
  const next = assignments.slice();
  next[index] = assignment;
  return next;
}

function renderExecutionMap(current, assignments) {
  const prefix =
    current.frontMatterText ??
    frontMatter("execution-map", "draft", ["execution-map"], "Slice-to-worktree execution map.");
  const rows = assignments.map((assignment) => `| ${EXECUTION_MAP_COLUMNS.map((column) => assignment[COLUMN_KEYS[column]] ?? "").join(" | ")} |`);
  return [
    prefix.trimEnd(),
    "# Execution Map",
    "",
    `| ${EXECUTION_MAP_COLUMNS.join(" | ")} |`,
    `|${EXECUTION_MAP_COLUMNS.map(() => "---").join("|")}|`,
    ...rows,
    ""
  ].join("\n");
}

function parseAssignments(tableLines) {
  if (tableLines.length < 2) {
    return [];
  }
  const headers = splitTableRow(tableLines[0]);
  return tableLines.slice(2).map((line) => {
    const cells = splitTableRow(line);
    const assignment = {};
    headers.forEach((header, index) => {
      const key = COLUMN_KEYS[header];
      if (key) {
        assignment[key] = cells[index] ?? "";
      }
    });
    for (const key of Object.values(COLUMN_KEYS)) {
      assignment[key] ??= "";
    }
    return assignment;
  });
}

function validateSliceLink(changeDir, filePath, assignment, errors) {
  if (!/^tasks\/slice-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(assignment.slice)) {
    errors.push(`${filePath}: ${assignment.slice || "<blank>"}: referenced slice must use tasks/slice-<nnn>-<slug>.md`);
    return;
  }
  if (!fs.existsSync(path.join(changeDir, assignment.slice))) {
    errors.push(`${filePath}: ${assignment.slice}: referenced slice missing`);
  }
}

function validateStatus(filePath, assignment, errors) {
  if (!ALLOWED_STATUSES.has(assignment.status)) {
    errors.push(`${filePath}: ${assignment.slice}: invalid status ${assignment.status}`);
  }
}

function validateEvidenceReference(changeDir, filePath, assignment, errors) {
  const evidence = assignment.last_evidence ?? "";
  if (GATED_STATUSES.has(assignment.status) && !evidence) {
    errors.push(`${filePath}: ${assignment.slice}: blank Last Evidence for ${assignment.status}`);
    return;
  }
  if (!evidence) {
    return;
  }
  const parts = evidence.split("#");
  const relPath = parts[0];
  const fragment = parts[1] ?? "";
  if (
    parts.length > 2 ||
    path.isAbsolute(relPath) ||
    /^[a-z][a-z0-9+.-]*:/i.test(evidence) ||
    relPath.split("/").includes("..") ||
    relPath.split("/").includes("")
  ) {
    errors.push(`${filePath}: ${assignment.slice}: invalid Last Evidence ${evidence}`);
    return;
  }
  const evidencePath = path.resolve(changeDir, relPath);
  if (!evidencePath.startsWith(`${path.resolve(changeDir)}${path.sep}`) && evidencePath !== path.resolve(changeDir)) {
    errors.push(`${filePath}: ${assignment.slice}: invalid Last Evidence ${evidence}`);
    return;
  }
  if (!fs.existsSync(evidencePath)) {
    errors.push(`${filePath}: ${assignment.slice}: missing Last Evidence path ${evidence}`);
    return;
  }
  if (fragment && path.extname(evidencePath) !== ".md") {
    errors.push(`${filePath}: ${assignment.slice}: Last Evidence fragment on non-Markdown file ${evidence}`);
    return;
  }
  if (fragment && !markdownHeadingExists(evidencePath, fragment)) {
    errors.push(`${filePath}: ${assignment.slice}: missing Markdown heading ${fragment} in Last Evidence ${evidence}`);
  }
}

function validateTopology(filePath, assignment, assignments, bySlice, errors) {
  const deps = dependencyList(assignment, assignments);
  if (!ALLOWED_TOPOLOGIES.has(assignment.topology)) {
    errors.push(`${filePath}: ${assignment.slice}: invalid topology ${assignment.topology}`);
    return;
  }
  if ((assignment.topology === "parallel" || assignment.topology === "standalone") && deps.length > 0) {
    errors.push(`${filePath}: ${assignment.topology} row ${assignment.slice} must not depend on ${deps.join(", ")}`);
  }
  if (assignment.topology === "stacked" && deps.length === 0 && !assignment.base) {
    errors.push(`${filePath}: stacked row ${assignment.slice} requires dependency or base`);
  }
  for (const dep of deps) {
    if (!bySlice.has(dep)) {
      errors.push(`${filePath}: ${assignment.slice}: dependency ${dep} missing from execution map`);
    }
  }
}

function validateDependencyCycles(filePath, assignments, errors) {
  const bySlice = new Map(assignments.map((assignment) => [assignment.slice, assignment]));
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(slice) {
    if (visiting.has(slice)) {
      const cycle = [...stack.slice(stack.indexOf(slice)), slice].join(" -> ");
      errors.push(`${filePath}: dependency cycle: ${cycle}`);
      return;
    }
    if (visited.has(slice)) {
      return;
    }
    visiting.add(slice);
    stack.push(slice);
    for (const dep of dependencyList(bySlice.get(slice), assignments)) {
      if (bySlice.has(dep)) {
        visit(dep);
      }
    }
    stack.pop();
    visiting.delete(slice);
    visited.add(slice);
  }

  for (const assignment of assignments) {
    visit(assignment.slice);
  }
}

function validateDependencyStatusGates(filePath, assignments, bySlice, errors) {
  for (const assignment of assignments) {
    if (assignment.topology !== "stacked" || !["ready", "merged"].includes(assignment.status)) {
      continue;
    }
    for (const dep of dependencyList(assignment, assignments)) {
      const dependency = bySlice.get(dep);
      if (!dependency) {
        continue;
      }
      if (assignment.status === "ready" && !["ready", "merged"].includes(dependency.status)) {
        errors.push(`${filePath}: ready stacked row ${assignment.slice} dependency ${dep} status ${dependency.status}`);
      }
      if (assignment.status === "merged" && dependency.status !== "merged") {
        errors.push(`${filePath}: merged stacked row ${assignment.slice} dependency ${dep} status ${dependency.status}`);
      }
    }
  }
}

function validateDuplicateWorktrees(filePath, assignments, errors) {
  const seen = new Map();
  for (const assignment of assignments) {
    if (!assignment.worktree || TERMINAL_STATUSES.has(assignment.status)) {
      continue;
    }
    const key = comparablePath(assignment.worktree);
    const prior = seen.get(key);
    if (prior) {
      errors.push(`${filePath}: duplicate active worktree ${assignment.worktree} used by ${prior} and ${assignment.slice}`);
    } else {
      seen.set(key, assignment.slice);
    }
  }
}

function validateWorktreePaths(changeDir, filePath, assignments, errors, warnings) {
  const changeId = path.basename(changeDir);
  for (const assignment of assignments) {
    if (!assignment.worktree) {
      continue;
    }
    if (!fs.existsSync(assignment.worktree)) {
      appendWorktreeIssue(errors, warnings, assignment, `${filePath}: ${assignment.slice} (${assignment.status}): missing worktree path ${assignment.worktree}`, "liveness");
      continue;
    }
    try {
      fs.accessSync(assignment.worktree, fs.constants.R_OK | fs.constants.X_OK);
    } catch {
      appendWorktreeIssue(errors, warnings, assignment, `${filePath}: ${assignment.slice} (${assignment.status}): unreadable worktree path ${assignment.worktree}`, "liveness");
      continue;
    }
    if (!TERMINAL_STATUSES.has(assignment.status) && !isGitWorktree(assignment.worktree)) {
      appendWorktreeIssue(errors, warnings, assignment, `${filePath}: ${assignment.slice} (${assignment.status}): non-git worktree path ${assignment.worktree}`, "liveness");
    }
    const duplicateState = path.join(assignment.worktree, ".changes", changeId);
    if (fs.existsSync(duplicateState) && path.resolve(duplicateState) !== path.resolve(changeDir)) {
      appendWorktreeIssue(errors, warnings, assignment, `${filePath}: ${assignment.slice} (${assignment.status}): duplicate local change state ${duplicateState}`, "duplicate-state");
    }
  }
}

function appendWorktreeIssue(errors, warnings, assignment, message, kind) {
  const severity = worktreeIssueSeverity(assignment.status, kind);
  if (severity === "ignore") {
    return;
  }
  if (severity === "error") {
    errors.push(message);
  } else {
    warnings.push(message);
  }
}

function worktreeIssueSeverity(status, kind) {
  if (kind === "duplicate-state") {
    return ["planned", "merged", "superseded"].includes(status) ? "warn" : "error";
  }
  if (["merged", "superseded"].includes(status)) {
    return "ignore";
  }
  if (["active", "ready"].includes(status)) {
    return "error";
  }
  return "warn";
}

function dependencyList(assignment, assignments) {
  if (!assignment?.depends_on) {
    return [];
  }
  return assignment.depends_on
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && item !== "none")
    .map((item) => normalizeDependency(item, assignments));
}

function normalizeDependency(value, assignments) {
  if (value.startsWith("tasks/")) {
    return value;
  }
  if (value.startsWith("slice-")) {
    return `tasks/${value}`;
  }
  if (/^\d{3}$/.test(value)) {
    return assignments.find((assignment) => assignment.slice.startsWith(`tasks/slice-${value}-`))?.slice ?? value;
  }
  return value;
}

function markdownHeadingExists(filePath, fragment) {
  return readText(filePath)
    .split("\n")
    .some((line) => line.startsWith("#") && headingSlug(line) === fragment);
}

function headingSlug(line) {
  return line
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isGitWorktree(worktree) {
  const result = spawnSync("git", ["-C", worktree, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === "true";
}

function firstTableLines(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("|"));
  if (start === -1) {
    return [];
  }
  const table = [];
  for (const line of lines.slice(start)) {
    if (!line.trim().startsWith("|")) {
      break;
    }
    table.push(line.trim());
  }
  return table;
}

function frontMatterPrefix(text) {
  const match = text.match(/^---\n[\s\S]*?\n---\n+/);
  return match ? match[0] : null;
}

function executionMapPath(changeDir) {
  return path.join(changeDir, "execution-map.md");
}
