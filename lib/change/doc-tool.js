import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, printJson } from "../cli/args.js";
import {
  CHANGE_CHILD_DIRECTORIES,
  ARTIFACTS,
  JSON_EVIDENCE_DIRECTORIES,
  directoryIndexFields,
  projectionPolicy
} from "./js-policy.js";
import {
  frontMatter,
  insertMarkdownTableRowAfterHeading,
  kebabSlug,
  markdownTableAfterHeading,
  parseFrontMatter,
  readText,
  splitCsv,
  walkFiles,
  writeText
} from "./markdown.js";
import { assignSlice, executionMapPayload, ExecutionMapError } from "./execution-map.js";
import { resolveChangeContextFromArgs, writeRootContextError } from "./root-resolution.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function runChangeDoc(argv) {
  const args = parseArgs(argv);
  const command = args.positionals[0];

  if (!command || args.flags.has("help")) {
    process.stdout.write("harness-change-doc <command> [options]\n");
    return 0;
  }

  const globalRootContext = resolveChangeContextFromArgs(args, { cwd: process.cwd(), env: process.env });
  if (globalRootContext.unresolved_reason === "conflicting-explicit-roots") {
    writeRootContextError(globalRootContext);
    return 2;
  }
  const repoRoot = globalRootContext.state_root ?? path.resolve(args.values.get("repo-root") ?? ".");

  if (command === "policy") {
    printJson(projectionPolicy());
    return 0;
  }

  if (command === "memory-index") {
    printJson(buildMemoryIndex(repoRoot));
    return 0;
  }

  if (command === "memory-retrofit") {
    printJson(buildMemoryRetrofit(repoRoot, args.flags.has("dry-run")));
    return 0;
  }

  if (command === "resolve") {
    return commandResolve(args);
  }
  const task = args.positionals[1];
  if (!task) {
    process.stderr.write(`ERROR: ${command} requires a change id\n`);
    return 2;
  }
  const rootContext = resolveChangeContextFromArgs(args, { changeId: task, cwd: process.cwd(), env: process.env });
  if (rootContext.unresolved_reason) {
    writeRootContextError(rootContext);
    return 2;
  }
  const taskRepoRoot = rootContext.state_root;
  const target = changeDir(taskRepoRoot, task);
  if (command === "init") {
    return commandInit(target, taskRepoRoot, task, args);
  }
  if (!fs.existsSync(target)) {
    process.stderr.write(`ERROR: change not found: ${target}\n`);
    return 2;
  }

  if (command === "index") {
    printJson(buildIndex(taskRepoRoot, task));
    return 0;
  }
  if (command === "list") {
    return commandList(taskRepoRoot, task, args.flags.has("json"));
  }
  if (command === "locate") {
    return commandLocate(taskRepoRoot, task, args);
  }
  if (command === "read") {
    return commandRead(taskRepoRoot, task, args);
  }
  if (command === "init-review-run") {
    return commandInitReviewRun(target, task, args);
  }
  if (command === "execution-map") {
    return commandExecutionMap(target, task, rootContext, args);
  }
  if (command === "assign-slice") {
    return commandAssignSlice(target, rootContext, args);
  }
  if (command === "add-terminology") {
    return commandAddTerminology(target, args);
  }
  if (command === "add-implementation-design") {
    return commandAddImplementationDesign(target, args);
  }
  if (command === "add-review") {
    return commandAddReview(target, args);
  }
  if (command === "add-decision") {
    return commandAddChild(target, args, "decisions", {
      artifact: "decision-record",
      title: `DR: ${args.values.get("slug") ?? "decision"}`,
      filename: (directoryPath) =>
        `DR-${String(nextNumber(directoryPath, /^DR-(\d+)/)).padStart(3, "0")}-${kebabSlug(args.values.get("slug"))}.md`,
      order: (filePath) => path.basename(filePath).split("-", 2)[1],
      sections: ["## Context", "## Decision", "## Alternatives Considered", "## Consequences"]
    });
  }
  if (command === "add-timeline") {
    const dateKey = args.values.get("date-key") ?? new Date().toISOString().slice(0, 10);
    return commandAddChild(target, args, "timeline", {
      artifact: "timeline-event",
      title: args.values.get("slug") ?? "event",
      filename: (directoryPath) =>
        `${dateKey}-${String(nextNumber(directoryPath, new RegExp(`^${dateKey}-(\\d+)`))).padStart(3, "0")}-${kebabSlug(args.values.get("slug"))}.md`,
      order: (filePath) => path.basename(filePath).split("-", 4).join("-"),
      sections: ["## Event", "## Decision", "## Evidence", "## Residual Risk"]
    });
  }
  if (command === "add-task-slice") {
    return commandAddChild(target, args, "tasks", {
      artifact: "task-slice",
      title: `Slice: ${args.values.get("slug") ?? "implementation"}`,
      filename: (directoryPath) =>
        `slice-${String(nextNumber(directoryPath, /^slice-(\d+)/)).padStart(3, "0")}-${kebabSlug(args.values.get("slug"))}.md`,
      order: (filePath) => path.basename(filePath).split("-", 2)[1],
      sections: [
        "## Objective",
        "## Scope\n\n- Source design:\n- Goal:\n- Non-goals:\n- Scope:\n- Subsystem:\n- Module:\n- Changed surfaces:\n- Prerequisites:",
        "## Steps\n\n- [ ] ",
        "## Validation\n\n- [ ] ",
        "## Review\n\n- Review packet:\n- Review owner:",
        "## Rollback\n\n- ",
        "## Open Decisions\n\n- None"
      ]
    });
  }
  if (command === "migrate") {
    return commandMigrate(taskRepoRoot, task, args);
  }

  process.stderr.write(`ERROR: unknown command: ${command}\n`);
  return 2;
}

function commandResolve(args) {
  const rootContext = resolveChangeContextFromArgs(args, {
    changeId: args.values.get("change") ?? args.positionals[1],
    cwd: process.cwd(),
    env: process.env
  });
  if (args.flags.has("json")) {
    printJson(rootContext);
    return rootContext.unresolved_reason === "conflicting-explicit-roots" ? 2 : 0;
  }
  if (rootContext.unresolved_reason) {
    writeRootContextError(rootContext);
    return 2;
  }
  process.stdout.write(`STATE_ROOT: ${rootContext.state_root}\n`);
  process.stdout.write(`CODE_ROOT: ${rootContext.code_root}\n`);
  return 0;
}

function commandExecutionMap(target, task, rootContext, args) {
  if (!args.flags.has("json")) {
    process.stderr.write("ERROR: execution-map requires --json\n");
    return 2;
  }
  printJson(executionMapPayload(target, rootContext));
  return 0;
}

function commandAssignSlice(target, rootContext, args) {
  try {
    const result = assignSlice(target, args, rootContext, process.cwd());
    if (args.flags.has("json")) {
      printJson(result);
    } else {
      process.stdout.write(`${result.path}\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof ExecutionMapError) {
      process.stderr.write(`ERROR: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

export function buildIndex(repoRoot, task) {
  const target = changeDir(repoRoot, task);
  const taskTags = parseTagRegistry(path.join(target, "README.md"), "Task Tag Registry");
  const artifacts = walkFiles(target, (filePath) => filePath.endsWith(".md")).map((filePath) => {
    const relPath = path.relative(target, filePath).split(path.sep).join("/");
    const meta = parseFrontMatter(filePath) ?? {};
    return {
      path: relPath,
      artifact: meta.artifact ?? inferChangeArtifact(relPath),
      status: meta.status,
      tags: meta.tags ?? [],
      description: meta.description ?? "",
      indexed: isIndexedChild(target, relPath)
    };
  });
  return {
    change_id: task,
    task_tags: taskTags,
    artifacts,
    diagnostics: []
  };
}

function commandList(repoRoot, task, json) {
  const index = buildIndex(repoRoot, task);
  if (json) {
    printJson(index);
    return 0;
  }
  for (const artifact of index.artifacts) {
    process.stdout.write(`${artifact.path}\t${artifact.artifact ?? "-"}\t${artifact.status ?? "-"}\n`);
  }
  return 0;
}

function commandLocate(repoRoot, task, args) {
  const matches = filterArtifacts(buildIndex(repoRoot, task).artifacts, args);
  if (args.flags.has("json")) {
    printJson({ change_id: task, matches });
  } else {
    const target = changeDir(repoRoot, task);
    for (const artifact of matches) {
      process.stdout.write(`${path.join(target, artifact.path)}\n`);
    }
  }
  return 0;
}

function commandRead(repoRoot, task, args) {
  const target = changeDir(repoRoot, task);
  const matches = filterArtifacts(buildIndex(repoRoot, task).artifacts, args);
  if (args.flags.has("paths-only")) {
    for (const artifact of matches) {
      process.stdout.write(`${path.join(target, artifact.path)}\n`);
    }
    return 0;
  }
  for (const artifact of matches) {
    const filePath = path.join(target, artifact.path);
    process.stdout.write(`===== ${filePath} =====\n`);
    process.stdout.write(readText(filePath));
    if (!readText(filePath).endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  return 0;
}

function commandInitReviewRun(target, task, args) {
  const runId = args.values.get("run-id");
  const policy = JSON_EVIDENCE_DIRECTORIES["review-runs"];
  if (!runId || !policy.runIdRegex.test(runId)) {
    process.stderr.write("ERROR: init-review-run requires a portable --run-id identifier\n");
    return 2;
  }
  const reviewRunsRoot = path.join(target, "review-runs");
  const runRoot = path.join(reviewRunsRoot, runId);
  if (fs.existsSync(runRoot)) {
    process.stderr.write(`ERROR: review run already exists: ${runRoot}\n`);
    return 2;
  }
  fs.mkdirSync(path.join(runRoot, "control", "revisions"), { recursive: true });
  fs.mkdirSync(path.join(runRoot, "attempts"), { recursive: true });
  const result = {
    change_id: task,
    run_id: runId,
    run_root: path.relative(target, runRoot).split(path.sep).join("/"),
    schema: policy.recordSchema,
    initialized: true
  };
  if (args.flags.has("json")) printJson(result);
  else process.stdout.write(`${runRoot}\n`);
  return 0;
}

const CHANGE_WORKSPACE_TEMPLATES = [
  ["README.md", "change-index", ["workflow"], "Change workspace index."],
  ["requirements.md", "requirements", ["requirements"], "Settled requirements and constraints."],
  ["research.md", "research", ["research"], "Source-backed change research."],
  ["proposal.md", "proposal", ["proposal"], "Change proposal."],
  ["design.md", "design", ["design"], "Change design."],
  ["plan.md", "plan", ["workflow"], "Change implementation plan."],
  ["tasks.md", "tasks", ["implementation"], "Change task checklist."],
  ["specs/README.md", "specs-index", ["workflow"], "Change specification index."]
];

function commandInit(target, repoRoot, task, args) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task)) {
    process.stderr.write(`ERROR: invalid change id: ${task}\n`);
    return 2;
  }
  if (fs.existsSync(target)) {
    process.stderr.write(`ERROR: change already exists: ${target}\n`);
    return 1;
  }

  const changesRoot = path.join(repoRoot, ".changes");
  fs.mkdirSync(changesRoot, { recursive: true });
  const changesStat = fs.lstatSync(changesRoot);
  if (!changesStat.isDirectory() || changesStat.isSymbolicLink()) {
    process.stderr.write(`ERROR: managed changes root must be a real directory: ${changesRoot}\n`);
    return 1;
  }

  const temporary = fs.mkdtempSync(path.join(changesRoot, `.init-${task}-`));
  try {
    const workspaceDescription = args.values.get("description") ?? "Change workspace index.";
    for (const [relPath, artifact, tags, defaultDescription] of CHANGE_WORKSPACE_TEMPLATES) {
      const description = relPath === "README.md" ? workspaceDescription : defaultDescription;
      let body = stripFrontMatter(readText(path.join(packageRoot, "templates", "changes", relPath)));
      if (relPath === "README.md") {
        body = body.replace("- Task:", `- Task: \`${task}\``);
      }
      writeText(path.join(temporary, relPath), frontMatter(artifact, "draft", tags, description) + body);
    }
    for (const directory of Object.keys(CHANGE_CHILD_DIRECTORIES)) {
      ensureChildIndex(path.join(temporary, directory), directory);
    }
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    process.stderr.write(`ERROR: failed to initialize change workspace: ${error.message}\n`);
    return 1;
  }

  const result = {
    change_id: task,
    change_root: path.relative(repoRoot, target).split(path.sep).join("/"),
    initialized: true
  };
  if (args.flags.has("json")) printJson(result);
  else process.stdout.write(`${target}\n`);
  return 0;
}

function commandAddTerminology(target, args) {
  const filePath = path.join(target, "terminology.md");
  if (fs.existsSync(filePath) && !args.flags.has("force")) {
    process.stderr.write(`ERROR: terminology already exists: ${filePath}\n`);
    return 1;
  }
  const status = args.values.get("status") ?? "draft";
  const tags = splitCsv(args.values.get("tags") ?? "terminology");
  const description = args.values.get("description") ?? "Task-local terminology.";
  writeText(
    filePath,
    frontMatter("terminology", status, tags, description) +
      ["# Terminology", "", "## Terms", "", "| Term | Meaning | Scope |", "|---|---|---|", ""].join("\n")
  );
  process.stdout.write(`${filePath}\n`);
  return 0;
}

function commandAddReview(target, args) {
  const reviewTarget = args.values.get("target");
  const round = Number.parseInt(args.values.get("round") ?? "", 10);
  if (!reviewTarget || !Number.isInteger(round)) {
    process.stderr.write("ERROR: add-review requires --target and --round\n");
    return 2;
  }
  const reviewsDir = path.join(target, "reviews");
  ensureChildIndex(reviewsDir, "reviews");
  const roundId = `r${String(round).padStart(2, "0")}`;
  const filename = `${reviewTarget}-${roundId}.md`;
  const filePath = path.join(reviewsDir, filename);
  if (fs.existsSync(filePath) && !args.flags.has("force")) {
    process.stderr.write(`ERROR: review already exists: ${filePath}\n`);
    return 1;
  }
  const status = args.values.get("status") ?? "draft";
  const tags = splitCsv(args.values.get("tags") ?? "review");
  const description = args.values.get("description") ?? `${reviewTarget} review round ${round}`;
  try {
    appendChildIndex(path.join(reviewsDir, "README.md"), "reviews", filename, "review-round", status, roundId, description);
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    return 1;
  }
  writeText(
    filePath,
    frontMatter("review-round", status, tags, description) +
      [
        `# ${reviewTarget} Review Round ${round}`,
        "",
        "## Decision",
        "",
        "`DRAFT`",
        "",
        "## Findings",
        "",
        "| ID | Severity | Resolution |",
        "|---|---|---|",
        ""
      ].join("\n")
  );
  process.stdout.write(`${filePath}\n`);
  return 0;
}

const IMPLEMENTATION_DESIGN_DOCS = [
  {
    file: "01-problem.md",
    description: "Detailed design problem, goals, non-goals, and boundaries."
  },
  {
    file: "02-code-topology.md",
    description: "Subsystem and module topology, dependency direction, and forbidden dependencies."
  },
  {
    file: "03-class-design.md",
    description: "Class/interface design, responsibility table, ownership, lifecycle, and test seams."
  },
  {
    file: "04-runtime-flow.md",
    description: "Object lifecycle, normal flow, failure flow, rollback flow, and state transitions."
  },
  {
    file: "05-error-model.md",
    description: "Error contract, retry, rollback, idempotency, and observability model."
  },
  {
    file: "06-implementation-plan.md",
    description: "Smallest verifiable implementation steps mapped to subsystems, modules, files, and tests."
  },
  {
    file: "07-constraints.md",
    description: "Design constraints, anti-pattern checks, and readiness self-review."
  }
];

function commandAddImplementationDesign(target, args) {
  if (!isStructuredChangeWorkspace(target)) {
    process.stderr.write(
      `ERROR: add-implementation-design requires a structured change workspace with README.md and specs/README.md: ${target}\n`
    );
    process.stderr.write("GUIDE: create or migrate the structured workspace before adding implementation-design.\n");
    return 1;
  }
  const directoryPath = path.join(target, "implementation-design");
  fs.mkdirSync(directoryPath, { recursive: true });
  const status = args.values.get("status") ?? "draft";
  const tags = splitCsv(args.values.get("tags") ?? "design,implementation");
  const created = [];
  const skipped = [];
  const indexPath = path.join(directoryPath, "README.md");
  const indexDescription = args.values.get("description") ?? "Detailed implementation design pack.";
  const indexBody =
    frontMatter("implementation-design-index", status, tags, indexDescription) +
    implementationDesignTemplateBody("README.md");
  writeDesignFile(indexPath, indexBody, args.flags.has("force"), created, skipped);

  for (const doc of IMPLEMENTATION_DESIGN_DOCS) {
    const body =
      frontMatter("implementation-design-detail", status, tags, doc.description) +
      implementationDesignTemplateBody(doc.file);
    writeDesignFile(path.join(directoryPath, doc.file), body, args.flags.has("force"), created, skipped);
  }
  for (const filePath of created) {
    process.stdout.write(`${filePath}\n`);
  }
  for (const filePath of skipped) {
    process.stdout.write(`SKIP existing: ${filePath}\n`);
  }
  return 0;
}

function isStructuredChangeWorkspace(target) {
  return fs.existsSync(path.join(target, "README.md")) && fs.existsSync(path.join(target, "specs", "README.md"));
}

function implementationDesignTemplateBody(file) {
  const templatePath = path.join(packageRoot, "templates", "changes", "implementation-design", file);
  return stripFrontMatter(readText(templatePath));
}

function stripFrontMatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

function writeDesignFile(filePath, body, force, created, skipped) {
  if (fs.existsSync(filePath) && !force) {
    skipped.push(filePath);
    return;
  }
  writeText(filePath, body);
  created.push(filePath);
}

function commandAddChild(target, args, directory, options) {
  if (!args.values.get("slug")) {
    process.stderr.write(`ERROR: add document in ${directory} requires --slug\n`);
    return 2;
  }
  const directoryPath = path.join(target, directory);
  ensureChildIndex(directoryPath, directory);
  const filePath = path.join(directoryPath, options.filename(directoryPath));
  if (fs.existsSync(filePath) && !args.flags.has("force")) {
    process.stderr.write(`ERROR: document already exists: ${filePath}\n`);
    return 1;
  }
  const status = args.values.get("status") ?? "draft";
  const tags = splitCsv(args.values.get("tags") ?? defaultTagsForArtifact(options.artifact).join(","));
  const description = args.values.get("description") ?? options.title;
  try {
    appendChildIndex(
      path.join(directoryPath, "README.md"),
      directory,
      path.basename(filePath),
      options.artifact,
      status,
      options.order(filePath),
      description
    );
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    return 1;
  }
  writeText(
    filePath,
    frontMatter(options.artifact, status, tags, description) +
      `# ${options.title}\n\n${options.sections.join("\n\n")}\n`
  );
  process.stdout.write(`${filePath}\n`);
  return 0;
}

function ensureChildIndex(directoryPath, directory) {
  const contract = CHANGE_CHILD_DIRECTORIES[directory];
  const indexPath = path.join(directoryPath, "README.md");
  if (fs.existsSync(indexPath)) {
    return;
  }
  const title = directory.replaceAll("-", " ").replace(/\b\w/g, (value) => value.toUpperCase());
  const columns = contract.columns;
  writeText(
    indexPath,
    frontMatter(contract.indexArtifact, "draft", defaultTagsForArtifact(contract.indexArtifact), `${title} index.`) +
      [
        `# ${title}`,
        "",
        "## Responsibility",
        "",
        `This directory indexes ${directory} child documents.`,
        "",
        "## Child Index",
        "",
        `| ${columns.join(" | ")} |`,
        `|${columns.map(() => "---").join("|")}|`,
        ""
      ].join("\n")
  );
}

function appendChildIndex(indexPath, directory, relPath, artifact, status, orderKey, description) {
  const columns = directoryIndexFields(directory);
  const values = {
    path: `\`${relPath}\``,
    artifact,
    status,
    order: orderKey,
    date_key: orderKey,
    description
  };
  const row = `| ${columns.map((column) => values[column] ?? "").join(" | ")} |`;
  const text = readText(indexPath);
  const updated = insertMarkdownTableRowAfterHeading(text, "Child Index", columns, row);
  if (updated !== text) {
    writeText(indexPath, updated);
  }
}

function filterArtifacts(artifacts, args) {
  return artifacts.filter((artifact) => {
    if (args.values.get("artifact") && artifact.artifact !== args.values.get("artifact")) {
      return false;
    }
    if (args.values.get("status") && artifact.status !== args.values.get("status")) {
      return false;
    }
    if (args.values.get("tag") && !(artifact.tags ?? []).includes(args.values.get("tag"))) {
      return false;
    }
    return true;
  });
}

function parseTagRegistry(indexPath, heading) {
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  return markdownTableAfterHeading(readText(indexPath), heading)
    .filter((row) => row.tag)
    .map((row) => ({ tag: row.tag, description: row.description ?? "" }));
}

function inferChangeArtifact(relPath) {
  for (const [artifactName, artifactPolicy] of Object.entries(ARTIFACTS)) {
    if (artifactPolicy.naming === relPath) {
      return artifactName;
    }
  }
  if (relPath.startsWith("specs/") && relPath.endsWith(".md") && relPath !== "specs/README.md") {
    return "delta-spec";
  }
  if (
    relPath.startsWith("implementation-design/") &&
    relPath.endsWith(".md") &&
    relPath !== "implementation-design/README.md"
  ) {
    return "implementation-design-detail";
  }
  return null;
}

function isIndexedChild(target, relPath) {
  const [directory, child] = relPath.split("/", 2);
  if (!child || !CHANGE_CHILD_DIRECTORIES[directory] || child === "README.md") {
    return true;
  }
  const indexPath = path.join(target, directory, "README.md");
  if (!fs.existsSync(indexPath)) {
    return false;
  }
  return markdownTableAfterHeading(readText(indexPath), "Child Index").some((row) => row.path === child);
}

function nextNumber(directoryPath, regex) {
  if (!fs.existsSync(directoryPath)) {
    return 1;
  }
  let maxSeen = 0;
  for (const name of fs.readdirSync(directoryPath)) {
    const match = name.match(regex);
    if (match) {
      maxSeen = Math.max(maxSeen, Number.parseInt(match[1], 10));
    }
  }
  return maxSeen + 1;
}

function defaultTagsForArtifact(artifactName) {
  if (["reviews-index", "review-round"].includes(artifactName)) {
    return ["review"];
  }
  if (["decision-index", "decision-record"].includes(artifactName)) {
    return ["decision"];
  }
  if (["tasks-index", "task-slice"].includes(artifactName)) {
    return ["implementation"];
  }
  return ["workflow"];
}

function commandMigrate(repoRoot, task, args) {
  const dryRun = args.flags.has("dry-run");
  const apply = args.flags.has("apply");
  if (dryRun === apply) {
    process.stderr.write("ERROR: migrate requires exactly one of --dry-run or --apply\n");
    return 2;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task)) {
    process.stderr.write(`ERROR: invalid change id: ${task}\n`);
    return 2;
  }
  try {
    const plan = buildMigrationPlan(repoRoot, task);
    printJson(dryRun ? plan : applyMigration(repoRoot, task, plan));
    return 0;
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    return 1;
  }
}



const LEGACY_MIGRATION_PATHS = [
  ["review-log.md", "reviews"],
  ["timeline.md", "timeline"],
  ["tasks.md", "tasks"]
];

function buildMigrationPlan(repoRoot, task) {
  const target = changeDir(repoRoot, task);
  assertMigrationPath(repoRoot, target);
  assertMigrationPath(repoRoot, path.join(target, "proposal.md"));
  if (!fs.existsSync(path.join(target, "proposal.md"))) {
    throw new Error("migration requires a legacy proposal workspace with proposal.md");
  }

  const legacySources = migrationLegacySources(repoRoot, target, task);
  if (legacySources.length === 0) {
    throw new Error("migration requires a legacy review-log.md, timeline.md, tasks.md, or archived equivalent");
  }

  const alreadyMigrated = legacySources.every((source) => source.source_state === "absent");
  const outputs = alreadyMigrated ? new Map() : buildMigrationOutputs(repoRoot, target, task, legacySources);
  return {
    mode: "dry-run",
    change_id: task,
    legacy_sources: legacySources,
    generated_paths: [...outputs.keys()].sort(),
    already_migrated: alreadyMigrated
  };
}

function migrationLegacySources(repoRoot, target, task) {
  const sources = [];
  for (const [relPath, targetDirectory] of LEGACY_MIGRATION_PATHS) {
    const sourcePath = path.join(target, relPath);
    const archivePath = path.join(repoRoot, ".changes", "archive", task, "legacy", relPath);
    assertMigrationPath(repoRoot, sourcePath);
    assertMigrationPath(repoRoot, archivePath);
    const sourceState = migrationFileState(sourcePath);
    const archiveState = migrationFileState(archivePath);
    if (sourceState === "absent" && archiveState === "absent") {
      continue;
    }
    if (
      sourceState === "present" &&
      archiveState === "present" &&
      !fs.readFileSync(sourcePath).equals(fs.readFileSync(archivePath))
    ) {
      throw new Error(`legacy source conflicts with archive: ${relPath}`);
    }
    sources.push({
      path: relPath,
      archive_path: path.join(".changes", "archive", task, "legacy", relPath).split(path.sep).join("/"),
      target_directory: targetDirectory,
      source_state: sourceState,
      archive_state: archiveState
    });
  }
  return sources;
}

function assertMigrationPath(repoRoot, candidatePath) {
  const root = path.resolve(repoRoot);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`migration path escapes state root: ${candidatePath}`);
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new Error(`migration path must not traverse a symlink: ${current}`);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

function migrationFileState(filePath) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return "absent";
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`migration path must be a regular file: ${filePath}`);
  }
  return "present";
}

function buildMigrationOutputs(repoRoot, target, task, legacySources) {
  const outputs = new Map();
  const readExisting = (relPath) => {
    const filePath = path.join(target, relPath);
    if (migrationFileState(filePath) === "absent") {
      return "";
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filePath));
    } catch {
      throw new Error(`migration Markdown must be valid UTF-8: ${filePath}`);
    }
  };
  const writeOutput = (relPath, text, mode) => {
    outputs.set(relPath, { bytes: Buffer.from(text, "utf8"), mode });
  };

  const readme = ensureTaskTagRegistry(
    ensureFrontMatter(
      readExisting("README.md") || "# Change\n",
      "change-index",
      ["workflow", "migration"],
      "Structured change workspace migrated from legacy artifacts."
    )
  );
  writeOutput("README.md", ensureMigrationStatus(readme, task), "transform");

  for (const [relPath, artifact, tags] of [
    ["proposal.md", "proposal", ["proposal", "migration"]],
    ["requirements.md", "requirements", ["requirements", "migration"]],
    ["research.md", "research", ["research", "migration"]],
    ["terminology.md", "terminology", ["terminology", "migration"]],
    ["design.md", "design", ["design", "migration"]],
    ["plan.md", "plan", ["workflow", "migration"]],
    ["execution-map.md", "execution-map", ["execution-map", "migration"]]
  ]) {
    const existing = readExisting(relPath);
    if (existing) {
      writeOutput(relPath, ensureFrontMatter(existing, artifact, tags, `Migrated ${artifact} artifact.`), "transform");
    }
  }

  const specsRoot = path.join(target, "specs");
  assertMigrationDirectory(specsRoot);
  writeOutput(
    "specs/README.md",
    ensureFrontMatter(readExisting("specs/README.md") || "# Specs\n", "specs-index", ["workflow", "migration"], "Structured specification index."),
    "transform"
  );
  for (const specPath of walkFiles(specsRoot, (filePath) => filePath.endsWith(".md"))) {
    const relPath = path.relative(target, specPath).split(path.sep).join("/");
    if (relPath !== "specs/README.md") {
      writeOutput(relPath, ensureStructuredSpec(readExisting(relPath), relPath), "transform");
    }
  }

  for (const directory of ["decisions", "reviews", "tasks"]) {
    assertMigrationDirectory(path.join(target, directory));
  }
  writeOutput(
    "decisions/README.md",
    migrationChildIndex("decisions", [
      ["DR-001-migration-provenance.md", "decision-record", "frozen", "001", "Archived legacy artifact provenance."]
    ]),
    "create"
  );
  writeOutput("decisions/DR-001-migration-provenance.md", migrationProvenance(task, legacySources), "create");
  writeOutput("reviews/README.md", migrationChildIndex("reviews", []), "create");
  writeOutput("tasks/README.md", migrationChildIndex("tasks", []), "create");
  return outputs;
}

function assertMigrationDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return;
  }
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`migration path must be a directory: ${directoryPath}`);
  }
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const child = path.join(directoryPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`migration path must not be a symlink: ${child}`);
    }
    if (entry.isDirectory()) {
      assertMigrationDirectory(child);
    }
  }
}

function applyMigration(repoRoot, task, plan) {
  if (plan.already_migrated) {
    return { ...plan, mode: "applied" };
  }

  const target = changeDir(repoRoot, task);
  const outputs = buildMigrationOutputs(repoRoot, target, task, plan.legacy_sources);
  for (const [relPath, output] of outputs) {
    const destination = path.join(target, relPath);
    const state = migrationFileState(destination);
    if (output.mode === "create" && state === "present" && !fs.readFileSync(destination).equals(output.bytes)) {
      throw new Error(`migration generated file conflicts with existing content: ${relPath}`);
    }
  }

  for (const source of plan.legacy_sources) {
    const sourcePath = path.join(target, source.path);
    const archivePath = path.join(repoRoot, source.archive_path);
    const bytes = source.source_state === "present" ? fs.readFileSync(sourcePath) : fs.readFileSync(archivePath);
    installMissingOrEqual(archivePath, bytes);
  }
  for (const [relPath, output] of outputs) {
    const destination = path.join(target, relPath);
    if (output.mode === "transform") {
      writeAtomic(destination, output.bytes);
    } else {
      installMissingOrEqual(destination, output.bytes);
    }
  }
  for (const source of plan.legacy_sources) {
    if (source.source_state === "absent") {
      continue;
    }
    const sourcePath = path.join(target, source.path);
    const archivePath = path.join(repoRoot, source.archive_path);
    if (!fs.readFileSync(sourcePath).equals(fs.readFileSync(archivePath))) {
      throw new Error(`legacy source changed before removal: ${source.path}`);
    }
    fs.unlinkSync(sourcePath);
  }
  return { ...plan, mode: "applied" };
}

function installMissingOrEqual(filePath, bytes) {
  const state = migrationFileState(filePath);
  if (state === "absent") {
    writeAtomic(filePath, bytes);
    return;
  }
  if (!fs.readFileSync(filePath).equals(bytes)) {
    throw new Error(`migration destination conflicts with existing content: ${filePath}`);
  }
}

function ensureFrontMatter(text, artifact, tags, description) {
  if (/^---\n[\s\S]*?\n---\n/.test(text)) {
    return text;
  }
  return `${frontMatter(artifact, "draft", tags, description)}${text}`;
}

function ensureTaskTagRegistry(text) {
  if (/^## Task Tag Registry\s*$/m.test(text)) {
    return text.endsWith("\n") ? text : `${text}\n`;
  }
  const suffix = text.endsWith("\n") ? "" : "\n";
  return `${text}${suffix}\n## Task Tag Registry\n\n| tag | description |\n|---|---|\n| \`migration-history\` | Archived legacy artifact provenance. |\n`;
}

function ensureMigrationStatus(text, task) {
  const status = [
    "<!-- harness-migration-status:start -->",
    "## Migration Status",
    "",
    "- Workspace mode: `structured`, established by direct legacy file migration.",
    "- Provenance: `decisions/DR-001-migration-provenance.md`.",
    `- Historical legacy evidence: \`.changes/archive/${task}/legacy/\`.`,
    "<!-- harness-migration-status:end -->",
    ""
  ].join("\n");
  const marker = /<!-- harness-migration-status:start -->[\s\S]*?<!-- harness-migration-status:end -->\n?/;
  if (marker.test(text)) {
    return text.replace(marker, status);
  }
  return `${text.endsWith("\n") ? text : `${text}\n`}\n${status}`;
}

function ensureStructuredSpec(text, relPath) {
  const withMetadata = ensureFrontMatter(text, "delta-spec", ["workflow", "migration"], `Migrated legacy specification ${relPath}.`);
  const frontMatterMatch = withMetadata.match(/^---\n[\s\S]*?\n---\n/);
  const metadata = frontMatterMatch?.[0] ?? "";
  const body = withMetadata.slice(metadata.length);
  const prefix = [];
  if (!body.includes("## Purpose")) {
    prefix.push("## Purpose\n\nMigrated legacy specification; refine its contract before implementation.\n");
  }
  if (!body.includes("## Traceability")) {
    prefix.push(`## Traceability\n\n- Migration source: ${relPath}\n`);
  }
  return `${metadata}${prefix.length > 0 ? `${prefix.join("\n")}\n` : ""}${body}`;
}

function migrationChildIndex(directory, rows) {
  const contract = CHANGE_CHILD_DIRECTORIES[directory];
  const title = directory.replace("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const header = `| ${contract.columns.join(" | ")} |`;
  const divider = `|${contract.columns.map(() => "---").join("|")}|`;
  const entries = rows.map((row) => `| ${row.join(" | ")} |`);
  return `${frontMatter(contract.indexArtifact, "draft", defaultTagsForArtifact(contract.indexArtifact), `${title} index.`)}# ${title}\n\n## Responsibility\n\nThis directory indexes ${directory} child documents.\n\n## Child Index\n\n${header}\n${divider}\n${entries.join("\n")}${entries.length > 0 ? "\n" : ""}`;
}

function migrationProvenance(task, legacySources) {
  const rows = legacySources.map(
    (entry) => `| \`${entry.path}\` | \`${entry.archive_path}\` |`
  );
  return `${frontMatter("decision-record", "frozen", ["decision", "migration"], "Archived legacy artifact provenance.")}# Migration Provenance\n\n## Context\n\nThe legacy workspace was converted by archiving its top-level history and creating the structured workspace layout.\n\n## Decision\n\n- Change ID: \`${task}\`\n- Archive root: \`.changes/archive/${task}/legacy/\`\n- Current structured indexes do not reinterpret archived review decisions.\n\n## Archived Legacy Evidence\n\n| Source | Archive Path |\n|---|---|\n${rows.join("\n")}\n\n## Consequences\n\n- Historical references resolve to the same-change archive path.\n- New review work must use the structured review directory and its index.\n`;
}

function writeAtomic(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  const descriptor = fs.openSync(temporary, "w");
  try {
    fs.writeSync(descriptor, bytes);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, filePath);
}

function buildMemoryIndex(repoRoot) {
  const memoryRoot = path.join(repoRoot, ".memory");
  const tags = parseTagRegistry(path.join(memoryRoot, "INDEX.md"), "Memory Tag Registry");
  const entries = fs.existsSync(memoryRoot)
    ? walkFiles(memoryRoot, (filePath) => filePath.endsWith(".md")).map((filePath) => {
        const relPath = path.relative(memoryRoot, filePath).split(path.sep).join("/");
        const meta = parseFrontMatter(filePath) ?? {};
        return {
          path: relPath,
          artifact: meta.artifact,
          status: meta.status,
          tags: meta.tags ?? [],
          last_verified: meta.last_verified,
          source_revision: meta.source_revision,
          description: meta.description ?? ""
        };
      })
    : [];
  return { memory_root: memoryRoot, memory_tags: tags, entries };
}

function buildMemoryRetrofit(repoRoot, dryRun) {
  const memoryRoot = path.join(repoRoot, ".memory");
  const candidates = [];
  if (fs.existsSync(memoryRoot)) {
    for (const filePath of walkFiles(memoryRoot, (entry) => entry.endsWith(".md"))) {
      const relPath = path.relative(memoryRoot, filePath).split(path.sep).join("/");
      if (relPath === "INDEX.md") {
        continue;
      }
      const meta = parseFrontMatter(filePath) ?? {};
      const missingFields = ["artifact", "status", "tags", "last_verified", "source_revision"].filter(
        (field) => !(field in meta)
      );
      if (missingFields.length > 0) {
        candidates.push({ path: relPath, missing_fields: missingFields });
      }
    }
  }
  return {
    mode: dryRun ? "dry-run" : "plan-only",
    date: new Date().toISOString().slice(0, 10),
    candidates,
    writes: []
  };
}

function changeDir(repoRoot, task) {
  return path.join(repoRoot, ".changes", task);
}
