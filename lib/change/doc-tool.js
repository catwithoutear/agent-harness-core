import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, printJson } from "../cli/args.js";
import {
  CHANGE_CHILD_DIRECTORIES,
  ARTIFACTS,
  directoryIndexFields,
  projectionPolicy
} from "./js-policy.js";
import {
  frontMatter,
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
    printJson(buildMigrationPlan(taskRepoRoot, task, args.flags.has("dry-run")));
    return 0;
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
  appendChildIndex(path.join(reviewsDir, "README.md"), "reviews", filename, "review-round", status, roundId, description);
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
  writeText(
    filePath,
    frontMatter(options.artifact, status, tags, description) +
      `# ${options.title}\n\n${options.sections.join("\n\n")}\n`
  );
  appendChildIndex(
    path.join(directoryPath, "README.md"),
    directory,
    path.basename(filePath),
    options.artifact,
    status,
    options.order(filePath),
    description
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
  let text = readText(indexPath);
  if (text.includes(row)) {
    return;
  }
  if (!text.includes("## Child Index")) {
    text = `${text.trimEnd()}\n\n## Child Index\n\n| ${columns.join(" | ")} |\n|${columns.map(() => "---").join("|")}|\n`;
  }
  writeText(indexPath, `${text.trimEnd()}\n${row}\n`);
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

function buildMigrationPlan(repoRoot, task, dryRun) {
  const target = changeDir(repoRoot, task);
  const proposals = [];
  for (const [source, targetDirectory] of [
    ["review-log.md", "reviews"],
    ["timeline.md", "timeline"],
    ["tasks.md", "tasks"]
  ]) {
    if (fs.existsSync(path.join(target, source))) {
      proposals.push({
        source,
        target_directory: targetDirectory,
        requires_agent_read: true,
        apply_supported: false
      });
    }
  }
  return {
    change_id: task,
    mode: dryRun ? "dry-run" : "plan-only",
    sources: proposals.map((entry) => entry.source),
    proposals,
    diagnostics: [
      "automatic splitting is intentionally conservative; read source artifacts before applying migration"
    ]
  };
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
