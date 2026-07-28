import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
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
    return commandMigrate(taskRepoRoot, rootContext, task, args);
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

function commandMigrate(repoRoot, rootContext, task, args) {
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
  let existingTransaction;
  try {
    existingTransaction = readMigrationTransaction(migrationTransactionDir(repoRoot, task));
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    return 1;
  }
  if (apply && existingTransaction?.state === "committed") {
    const expectedPlan = args.values.get("expected-plan-sha256");
    const committedPlan = existingTransaction.plan;
    if (!expectedPlan || !/^[a-f0-9]{64}$/.test(expectedPlan)) {
      process.stderr.write("ERROR: migrate --apply requires --expected-plan-sha256 <sha256>\n");
      return 2;
    }
    if (!committedPlan || committedPlan.plan_sha256 !== expectedPlan) {
      process.stderr.write("ERROR: committed migration does not match the accepted plan digest; no files were written\n");
      return 1;
    }
    try {
      printJson(applyMigrationPlan(repoRoot, task, committedPlan));
      return 0;
    } catch (error) {
      process.stderr.write(`ERROR: ${error.message}\n`);
      return 1;
    }
  }
  if (apply && ["prepared", "applying", "interrupted"].includes(existingTransaction?.state) && existingTransaction.plan) {
    const expectedPlan = args.values.get("expected-plan-sha256");
    if (!expectedPlan || !/^[a-f0-9]{64}$/.test(expectedPlan)) {
      process.stderr.write("ERROR: migrate --apply requires --expected-plan-sha256 <sha256>\n");
      return 2;
    }
    if (existingTransaction.plan.plan_sha256 !== expectedPlan) {
      try {
        abandonInterruptedMigration(repoRoot, task, existingTransaction);
      } catch (error) {
        process.stderr.write(`ERROR: interrupted migration does not match the accepted plan digest and cannot be safely rolled back: ${error.message}\n`);
        return 1;
      }
      process.stderr.write("ERROR: interrupted migration did not match the accepted plan digest; the prior partial workspace was rolled back, rerun --dry-run before applying\n");
      return 1;
    }
    try {
      printJson(applyMigrationPlan(repoRoot, task, existingTransaction.plan));
      return 0;
    } catch (error) {
      process.stderr.write(`ERROR: ${error.message}\n`);
      return 1;
    }
  }
  if (apply && ["prepared", "applying", "interrupted"].includes(existingTransaction?.state)) {
    process.stderr.write("ERROR: interrupted migration lacks a recoverable accepted plan; validation remains fail-closed\n");
    return 1;
  }

  let plan;
  try {
    plan = buildMigrationPlan(repoRoot, task, rootContext.state_root);
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    return 1;
  }
  if (dryRun) {
    printJson(plan);
    return 0;
  }

  const expectedPlan = args.values.get("expected-plan-sha256");
  if (!expectedPlan || !/^[a-f0-9]{64}$/.test(expectedPlan)) {
    process.stderr.write("ERROR: migrate --apply requires --expected-plan-sha256 <sha256>\n");
    return 2;
  }
  if (expectedPlan !== plan.plan_sha256) {
    process.stderr.write("ERROR: migration plan digest does not match the current dry-run plan; no files were written\n");
    return 1;
  }

  try {
    const result = applyMigrationPlan(repoRoot, task, plan);
    printJson(result);
    return 0;
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    return 1;
  }
}


function validateBootstrapConsumedEvidence(repoRoot, registry) {
  const scopeEvidence = validateBootstrapScopeEvidence(repoRoot, registry);
  const event = registry.event;
  if (!validSha256(event.close_evidence_sha256)) {
    throw new Error("consumed bootstrap is missing close evidence digest");
  }
  const reviewText = bootstrapReviewText(repoRoot, event.originating_change_id);
  const snapshot = bootstrapSourceSnapshot(repoRoot, scopeEvidence.manifest.base_commit, scopeEvidence.manifest.source_paths);
  const evidence = validateBootstrapCloseEvidence(
    reviewText,
    event.close_gate_ref.decision_id,
    scopeEvidence.manifest,
    snapshot.sha256,
    event.validation_evidence_sha256,
    scopeEvidence.authority_event_sha256,
    event.executor_id,
    event.reviewer_id
  );
  if (
    event.close_gate_ref.artifact_sha256 !== evidence.review_round_sha256 ||
    event.authority_event_sha256 !== scopeEvidence.authority_event_sha256 ||
    event.implementation_snapshot_sha256 !== snapshot.sha256 ||
    evidence.sha256 !== event.close_evidence_sha256
  ) {
    throw new Error("consumed bootstrap does not bind its close review, source snapshot, and evidence");
  }
}

function validateBootstrapScopeEvidence(repoRoot, registry) {
  const currentEvent = registry.event;
  const event = currentEvent.state === "scoped" ? currentEvent : readBootstrapEvent(registry.directory, 2, "scoped");
  if (!event || !validSha256(event.scope_manifest_sha256)) {
    throw new Error("bootstrap scope evidence is unavailable");
  }
  const reviewText = bootstrapReviewText(repoRoot, event.originating_change_id);
  const claim = readBootstrapEvent(registry.directory, 1, "claimed");
  const authorityRound = frozenReadyReviewRound(reviewText, claim?.authority_ref?.decision_id);
  const claimSpec = jsonBlockAfterHeading(authorityRound.text, "BootstrapClaimSpec");
  const authorityIdentity = reviewRoundIdentity(authorityRound);
  if (
    !claim ||
    claim.authority_ref.artifact_sha256 !== authorityRound.sha256 ||
    claimSpec.expected_authority_decision_id !== claim.authority_ref.decision_id ||
    sha256Text(canonicalJson(claimSpec)) !== claim.claim_spec_digest ||
    claimSpec.bootstrap_id !== claim.bootstrap_id ||
    claimSpec.originating_change_id !== event.originating_change_id ||
    claimSpec.state_root_realpath !== canonicalPath(repoRoot)
  ) {
    throw new Error("claimed bootstrap does not bind its frozen BootstrapClaimSpec");
  }
  const scopeRound = frozenReadyReviewRound(reviewText, event.scope_gate_ref?.decision_id);
  const manifest = jsonBlockAfterHeading(scopeRound.text, "Bootstrap Scope Manifest");
  const predecessor = jsonBlockAfterHeading(scopeRound.text, "Predecessor Source Snapshot");
  const scopeIdentity = reviewRoundIdentity(scopeRound);
  if (
    event.scope_gate_ref.artifact_sha256 !== scopeRound.sha256 ||
    sha256Text(canonicalJson(manifest)) !== event.scope_manifest_sha256 ||
    sha256Text(canonicalJson(predecessor)) !== event.predecessor_snapshot_sha256 ||
    manifest.authority_record_sha256 !== event.authority_event_sha256 ||
    manifest.base_commit !== event.base_commit ||
    manifest.code_root_realpath !== canonicalPath(repoRoot) ||
    manifest.originating_change_id !== event.originating_change_id ||
    manifest.predecessor_snapshot_sha256 !== event.predecessor_snapshot_sha256 ||
    manifest.executor_id !== authorityIdentity.executor_id ||
    manifest.reviewer_id !== authorityIdentity.reviewer_id ||
    manifest.executor_id !== scopeIdentity.executor_id ||
    manifest.reviewer_id !== scopeIdentity.reviewer_id ||
    !Array.isArray(manifest.source_paths) ||
    canonicalJson([...manifest.source_paths].sort()) !== canonicalJson(manifest.source_paths) ||
    new Set(manifest.source_paths).size !== manifest.source_paths.length ||
    !manifest.source_paths.every(safeMigrationPath)
  ) {
    throw new Error("scoped bootstrap does not bind its frozen manifest and predecessor snapshot");
  }
  const actualBase = gitStdout(repoRoot, ["rev-parse", "HEAD"]);
  if (actualBase !== event.base_commit) {
    throw new Error("scoped bootstrap base commit does not match the active code root");
  }
  return { authority_event_sha256: event.authority_event_sha256, manifest, predecessor };
}

function validateBootstrapCloseEvidence(reviewText, decisionId, manifest, snapshotSha, validationSha, authorityEventSha, executorId, reviewerId) {
  const round = frozenReadyReviewRound(reviewText, decisionId);
  const evidence = jsonBlockAfterHeading(round.text, "Bootstrap Close Evidence");
  const identity = reviewRoundIdentity(round);
  if (
    evidence.authority_record_sha256 !== authorityEventSha ||
    evidence.base_commit !== manifest.base_commit ||
    evidence.executor_id !== executorId ||
    evidence.reviewer_id !== reviewerId ||
    identity.executor_id !== executorId ||
    identity.reviewer_id !== reviewerId ||
    executorId !== manifest.executor_id ||
    reviewerId !== manifest.reviewer_id ||
    evidence.scope_manifest_sha256 !== sha256Text(canonicalJson(manifest)) ||
    evidence.implementation_snapshot_sha256 !== snapshotSha ||
    !evidence.validation_evidence ||
    sha256Text(canonicalJson(evidence.validation_evidence)) !== validationSha
  ) {
    throw new Error("frozen Bootstrap Close Evidence does not bind scope, snapshot, and validation evidence");
  }
  return { evidence, review_round_sha256: round.sha256, sha256: sha256Text(canonicalJson(evidence)) };
}

function bootstrapReviewText(repoRoot, task) {
  const active = path.join(changeDir(repoRoot, task), "review-log.md");
  const archived = path.join(repoRoot, ".changes", "archive", task, "legacy", "review-log.md");
  if (fs.existsSync(active)) {
    return readText(active);
  }
  if (fs.existsSync(archived)) {
    return readText(archived);
  }
  throw new Error("bootstrap review evidence is missing from the active or archived workspace");
}

function frozenReadyReviewRound(text, decisionId) {
  return frozenReviewRound(text, decisionId, "READY");
}

function frozenReviewRound(text, decisionId, decision) {
  if (!validReviewDecisionId(decisionId)) {
    throw new Error("bootstrap review decision ID is invalid");
  }
  const normalized = normalizeLf(text);
  const headings = [...normalized.matchAll(/^## Review Round .+$/gm)];
  const expectedHeading = `## Review Round ${decisionId}`;
  const selected = headings.filter((heading) => heading[0] === expectedHeading);
  if (selected.length !== 1) {
    throw new Error(`frozen ${decision} review round must have one exact heading: ${decisionId}`);
  }
  const header = selected[0];
  const next = headings.find((candidate) => candidate.index > header.index);
  const round = canonicalFrozenReviewRoundText(normalized.slice(header.index, next?.index ?? normalized.length));
  if (
    countExactLine(round, `Decision ID: ${decisionId}`) !== 1 ||
    countExactLine(round, `Decision: ${decision}`) !== 1 ||
    countExactLine(round, "Frozen: yes") !== 1
  ) {
    throw new Error(`frozen ${decision} review round has malformed decision fields: ${decisionId}`);
  }
  if (!hasReviewedInputDigestTable(round)) {
    throw new Error(`frozen ${decision} review round is missing a reviewed-input digest table: ${decisionId}`);
  }
  for (const heading of ["### Findings", "### Blocking", "### Re-review Result", "### Freeze Decision"]) {
    if (countExactLine(round, heading) !== 1) {
      throw new Error(`frozen ${decision} review round is missing required disposition heading: ${heading}`);
    }
  }
  if (!/^(?:- )?Blocking Open:\s*[0-9]+\s*$/m.test(round)) {
    throw new Error(`frozen ${decision} review round is missing Blocking Open: ${decisionId}`);
  }
  return { sha256: sha256Text(round), text: round };
}

function canonicalFrozenReviewRoundText(round) {
  return `${round.replace(/(?:\n[ \t]*)+$/, "")}\n`;
}

function reviewRoundIdentity(round) {
  const executorId = exactRoundField(round.text, "Executor ID");
  const reviewerId = exactRoundField(round.text, "Reviewer ID");
  if (!validIdentifier(executorId) || !validIdentifier(reviewerId) || executorId === reviewerId) {
    throw new Error("frozen review round has missing or non-distinct executor/reviewer identity");
  }
  return { executor_id: executorId, reviewer_id: reviewerId };
}

function exactRoundField(text, name) {
  const matches = [...text.matchAll(new RegExp(`^${escapeRegExp(name)}:\\s*([^\\s]+)\\s*$`, "gm"))];
  return matches.length === 1 ? matches[0][1] : null;
}

function countExactLine(text, line) {
  return [...text.matchAll(new RegExp(`^${escapeRegExp(line)}$`, "gm"))].length;
}

function hasReviewedInputDigestTable(text) {
  const start = text.search(/^Reviewed Inputs:\s*$/m);
  if (start < 0) {
    return false;
  }
  const remainder = text.slice(start).split("\n");
  const end = remainder.findIndex((line, index) => index > 0 && /^(?:### |## )/.test(line));
  const rows = remainder.slice(1, end < 0 ? remainder.length : end).filter((line) => line.startsWith("|"));
  if (rows.length < 3) {
    return false;
  }
  const header = markdownTableCells(rows[0]);
  const divider = markdownTableCells(rows[1]);
  return (
    canonicalJson(header) === canonicalJson(["Path", "SHA-256", "Purpose"]) &&
    Array.isArray(divider) &&
    divider.length === 3 &&
    divider.every((cell) => /^:?-{3,}:?$/.test(cell)) &&
    rows.slice(2).every((row) => {
      const cells = markdownTableCells(row);
      return Array.isArray(cells) && cells.length === 3 && validReviewedInputPath(cells[0]) && validReviewedInputDigest(cells[1]) && cells[2].length > 0;
    })
  );
}

function markdownTableCells(row) {
  const trimmed = row.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function markdownCodeValue(value) {
  const trimmed = value.trim();
  const match = /^`([^`]+)`$/.exec(trimmed);
  return match ? match[1] : trimmed;
}

function validReviewedInputPath(value) {
  const inputPath = markdownCodeValue(value);
  return (
    inputPath.length > 0 &&
    !inputPath.includes("\\") &&
    !inputPath.startsWith("/") &&
    !inputPath.split("/").some((part) => !part || part === "." || part === "..")
  );
}

function validReviewedInputDigest(value) {
  return /^[a-f0-9]{64}$/.test(markdownCodeValue(value));
}

function normalizeLf(text) {
  return text.replace(/\r\n?/g, "\n");
}

function jsonBlockAfterHeading(text, heading) {
  const headingPattern = escapeRegExp(heading);
  const match = text.match(new RegExp(`^### ${headingPattern}\\s*\\n\\s*\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``, "m"));
  if (!match) {
    throw new Error(`canonical JSON block is missing: ${heading}`);
  }
  let value;
  try {
    value = JSON.parse(match[1]);
  } catch {
    throw new Error(`canonical JSON block is unreadable: ${heading}`);
  }
  if (match[1] !== canonicalJson(value)) {
    throw new Error(`canonical JSON block is not canonical: ${heading}`);
  }
  return value;
}

function bootstrapSourceSnapshot(repoRoot, baseCommit, allowedPaths) {
  const changed = new Set(gitStdout(repoRoot, ["diff", "--name-only", "--no-renames", baseCommit]).split("\n").filter(Boolean));
  for (const filePath of gitStdout(repoRoot, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) {
    if (!isGeneratedRuntimePath(filePath)) {
      changed.add(filePath);
    }
  }
  const allowed = new Set(allowedPaths);
  const entries = [...changed]
    .sort()
    .map((relPath) => {
      if (!allowed.has(relPath)) {
        throw new Error(`source-owned diff is outside the scoped manifest: ${relPath}`);
      }
      const absolute = path.join(repoRoot, relPath);
      if (!fs.existsSync(absolute)) {
        return { mode: null, path: relPath, presence: "absent", sha256: null };
      }
      return { mode: gitFileMode(repoRoot, relPath), path: relPath, presence: "present", sha256: sha256File(absolute) };
    });
  return { entries, sha256: sha256Text(canonicalJson(entries)) };
}

function isGeneratedRuntimePath(relPath) {
  return relPath === ".changes" || /^(?:\.changes|\.agents|\.codex|\.harness|node_modules)\//.test(relPath);
}

function gitFileMode(repoRoot, relPath) {
  const indexed = gitStdout(repoRoot, ["ls-files", "-s", "--", relPath]);
  const mode = indexed.split(/\s+/, 1)[0];
  if (/^100[0-7]{3}$/.test(mode)) {
    return mode;
  }
  return fs.statSync(path.join(repoRoot, relPath)).mode & 0o111 ? "100755" : "100644";
}

function gitStdout(repoRoot, args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout.trim();
}

function readBootstrapRegistries(repoRoot) {
  const root = path.join(repoRoot, ".changes", ".control");
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && validBootstrapId(entry.name))
    .map((entry) => readBootstrapRegistry(repoRoot, entry.name));
}

function readBootstrapRegistry(repoRoot, bootstrapId) {
  const directory = path.join(repoRoot, ".changes", ".control", bootstrapId);
  const authorityId = bootstrapAuthorityId(bootstrapId);
  const currentPath = path.join(directory, "current.json");
  const errors = [];
  let current = null;
  let event = null;
  if (!fs.existsSync(currentPath)) {
    return { bootstrap_id: authorityId, registry_id: bootstrapId, directory, current, event, errors: ["current.json is missing"] };
  }
  try {
    current = JSON.parse(readText(currentPath));
  } catch {
    return { bootstrap_id: authorityId, registry_id: bootstrapId, directory, current, event, errors: ["current.json is unreadable"] };
  }
  if (
    !current ||
    !validBootstrapEventPath(current.event) ||
    !validSha256(current.event_sha256) ||
    !Number.isInteger(current.generation) ||
    !validBootstrapState(current.state)
  ) {
    return { bootstrap_id: authorityId, registry_id: bootstrapId, directory, current, event, errors: ["current.json is malformed"] };
  }
  const eventPath = path.join(directory, current.event);
  if (!fs.existsSync(eventPath) || !matchesBootstrapEventDigest(eventPath, current.event_sha256)) {
    return { bootstrap_id: authorityId, registry_id: bootstrapId, directory, current, event, errors: ["current event is missing or digest-mismatched"] };
  }
  try {
    const raw = readText(eventPath);
    event = JSON.parse(raw);
    if (!isCanonicalJsonText(raw, event)) {
      errors.push("current event is not canonical JSON");
    }
  } catch {
    return { bootstrap_id: authorityId, registry_id: bootstrapId, directory, current, event, errors: ["current event is unreadable"] };
  }
  if (
    event.bootstrap_id !== authorityId ||
    event.generation !== current.generation ||
    event.state !== current.state ||
    event.state_root_realpath !== canonicalPath(repoRoot) ||
    !validChangeId(event.originating_change_id)
  ) {
    errors.push("current event does not bind bootstrap identity, generation, state root, and originating change");
    return { bootstrap_id: authorityId, registry_id: bootstrapId, directory, current, event, errors };
  }
  if (event.state === "claimed") {
    if (event.generation !== 1 || !validSha256(event.claim_spec_digest) || !validIdentifier(event.owner) || !validGateRef(event.authority_ref, event.originating_change_id)) {
      errors.push("claimed event is malformed");
    }
  } else {
    const claim = readBootstrapEvent(directory, 1, "claimed");
    if (!claim || claim.bootstrap_id !== authorityId || claim.originating_change_id !== event.originating_change_id || claim.state_root_realpath !== event.state_root_realpath) {
      errors.push("bootstrap lifecycle is missing a matching claimed event");
    }
    if (event.state === "scoped") {
      if (
        event.generation !== 2 ||
        !validSha256(event.authority_event_sha256) ||
        !validSha256(event.scope_manifest_sha256) ||
        !validSha256(event.predecessor_snapshot_sha256 ?? event.source_inventory_sha256) ||
        !validGitObjectId(event.base_commit) ||
        typeof event.rollback_boundary !== "string" ||
        !validGateRef(event.scope_gate_ref, event.originating_change_id) ||
        !claim ||
        !matchesBootstrapEventDigest(path.join(directory, "events", "000001-claimed.json"), event.authority_event_sha256)
      ) {
        errors.push("scoped event is malformed or not bound to its claim");
      }
    } else {
      const scoped = readBootstrapEvent(directory, 2, "scoped");
      const scopePath = path.join(directory, "events", "000002-scoped.json");
      const priorScopeHash = event.scope_event_sha256 ?? event.prior_event_sha256;
      if (!scoped || event.generation !== 3 || !matchesBootstrapEventDigest(scopePath, priorScopeHash)) {
        errors.push("terminal event is not bound to the scoped event");
      }
      if (event.state === "consumed") {
        if (
        !validGateRef(event.close_gate_ref, event.originating_change_id) ||
        !validSha256(event.authority_event_sha256) ||
        !validSha256(event.implementation_snapshot_sha256) ||
        !validSha256(event.validation_evidence_sha256) ||
        !validSha256(event.close_evidence_sha256) ||
        !validIdentifier(event.executor_id) ||
          !validIdentifier(event.reviewer_id) ||
          event.executor_id === event.reviewer_id
        ) {
          errors.push("consumed event is malformed");
        }
      } else if (typeof event.reason !== "string" || !event.reason) {
        errors.push("revoked event is missing its terminal reason");
      } else if (Object.hasOwn(event, "revoke_gate_ref")) {
        if (!validGateRef(event.revoke_gate_ref, event.originating_change_id, "NOT_READY")) {
          errors.push("revoked event has malformed revocation evidence");
        }
      } else if (!isLegacyBootstrapRevocation(bootstrapId, event)) {
        errors.push("revoked event is missing revocation evidence");
      }
    }
  }
  return { bootstrap_id: authorityId, registry_id: bootstrapId, directory, current, event, errors };
}

function readBootstrapEvent(directory, generation, state) {
  const eventPath = path.join(directory, "events", `${String(generation).padStart(6, "0")}-${state}.json`);
  if (!fs.existsSync(eventPath)) {
    return null;
  }
  try {
    return JSON.parse(readText(eventPath));
  } catch {
    return null;
  }
}


function validBootstrapId(value) {
  return typeof value === "string" && /^migration-bootstrap-v[0-9]+$/.test(value);
}

function bootstrapAuthorityId(registryId) {
  return registryId.replace(/^migration-bootstrap-/, "migration-apply-bootstrap-");
}

function isLegacyBootstrapRevocation(registryId, event) {
  return (
    registryId === "migration-bootstrap-v1" &&
    event.state === "revoked" &&
    !Object.hasOwn(event, "scope_event_sha256") &&
    validSha256(event.prior_event_sha256) &&
    typeof event.replacement_bootstrap_id === "string" &&
    /^migration-apply-bootstrap-v[0-9]+$/.test(event.replacement_bootstrap_id)
  );
}

function bootstrapRegistryId(value) {
  if (validBootstrapId(value)) {
    return value;
  }
  if (typeof value === "string" && /^migration-apply-bootstrap-v[0-9]+$/.test(value)) {
    return value.replace(/^migration-apply-bootstrap-/, "migration-bootstrap-");
  }
  return null;
}

function validBootstrapEventPath(value) {
  return typeof value === "string" && /^events\/\d{6}-(?:claimed|scoped|consumed|revoked)\.json$/.test(value);
}

function validBootstrapState(value) {
  return ["claimed", "scoped", "consumed", "revoked"].includes(value);
}

function validChangeId(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validIdentifier(value) {
  return validChangeId(value);
}

function validReviewDecisionId(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*-r[0-9]{2}$/.test(value);
}

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validGitObjectId(value) {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
}

function validGateRef(value, changeId, decision = "READY") {
  return (
    value &&
    typeof value === "object" &&
    value.change_id === changeId &&
    value.artifact_path === "review-log.md" &&
    value.decision === decision &&
    validIdentifier(value.decision_id) &&
    validSha256(value.artifact_sha256)
  );
}

function hasFrozenReadyReviewRound(text, decisionId) {
  const headers = [...text.matchAll(/^## Review Round\b[^\n]*$/gm)];
  return headers.some((header, index) => {
    const round = text.slice(header.index, headers[index + 1]?.index ?? text.length);
    return (
      new RegExp(`^Decision ID:\\s*${escapeRegExp(decisionId)}\\s*$`, "m").test(round) &&
      /^Decision:\s*READY\s*$/m.test(round) &&
      /^Frozen:\s*yes\s*$/m.test(round)
    );
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMigrationPlan(repoRoot, task, stateRoot) {
  const target = changeDir(repoRoot, task);
  const legacySources = migrationLegacySources(target, task);
  if (legacySources.length === 0) {
    throw new Error("migration requires at least one top-level legacy review-log.md, timeline.md, or tasks.md");
  }
  if (!fs.existsSync(path.join(target, "proposal.md"))) {
    throw new Error("migration currently requires a legacy proposal workspace with proposal.md");
  }

  const outputs = buildMigrationOutputs(target, task, legacySources);
  const sourceInventory = migrationSourceInventory(target);
  const base = {
    version: 1,
    mode: "dry-run",
    change_id: task,
    state_root: canonicalPath(stateRoot),
    source_inventory: sourceInventory,
    legacy_sources: legacySources,
    destination_manifest: destinationManifest(outputs),
    proposals: legacySources.map((entry) => ({
      source: entry.path,
      archive_path: entry.archive_path,
      target_directory: entry.target_directory,
      exact_bytes_preserved: true,
      apply_supported: true
    })),
    diagnostics: [
      "apply creates only the structured skeleton and immutable migration provenance; it does not invent review rounds, task slices, or implementation-design content"
    ]
  };
  return { ...base, plan_sha256: sha256Text(canonicalJson(base)) };
}

function migrationLegacySources(target, task) {
  const sources = [];
  for (const [relPath, targetDirectory] of [
    ["review-log.md", "reviews"],
    ["timeline.md", "timeline"],
    ["tasks.md", "tasks"]
  ]) {
    const sourcePath = path.join(target, relPath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const bytes = fs.readFileSync(sourcePath);
    const source = {
      path: relPath,
      sha256: sha256Buffer(bytes),
      archive_path: path.join(".changes", "archive", task, "legacy", relPath).split(path.sep).join("/"),
      target_directory: targetDirectory
    };
    if (relPath === "review-log.md") {
      source.frozen_review_rounds = extractFrozenReviewRounds(bytes.toString("utf8"));
    }
    sources.push(source);
  }
  return sources;
}

function migrationSourceInventory(target) {
  return walkFiles(target)
    .map((filePath) => {
      const relPath = path.relative(target, filePath).split(path.sep).join("/");
      return { path: relPath, sha256: sha256Buffer(fs.readFileSync(filePath)) };
    })
    .sort((left, right) => compareText(left.path, right.path));
}

function buildMigrationOutputs(target, task, legacySources) {
  const outputs = new Map();
  const readExisting = (relPath) => {
    const filePath = path.join(target, relPath);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  };
  const writeTextOutput = (relPath, text) => outputs.set(relPath, Buffer.from(text, "utf8"));

  const readme = ensureTaskTagRegistry(
    ensureFrontMatter(
      readExisting("README.md") || "# Change\n",
      "change-index",
      ["workflow", "migration"],
      "Structured change workspace migrated from legacy artifacts."
    )
  );
  writeTextOutput("README.md", ensureMigrationStatus(readme, task));

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
      writeTextOutput(relPath, ensureFrontMatter(existing, artifact, tags, `Migrated ${artifact} artifact.`));
    }
  }

  writeTextOutput(
    "specs/README.md",
    ensureFrontMatter(readExisting("specs/README.md") || "# Specs\n", "specs-index", ["workflow", "migration"], "Structured specification index.")
  );
  for (const specPath of walkFiles(path.join(target, "specs"), (filePath) => filePath.endsWith(".md"))) {
    const relPath = path.relative(target, specPath).split(path.sep).join("/");
    if (relPath === "specs/README.md") {
      continue;
    }
    writeTextOutput(relPath, ensureStructuredSpec(readExisting(relPath), relPath));
  }

  const provenancePath = "decisions/DR-001-migration-provenance.md";
  writeTextOutput("decisions/README.md", migrationChildIndex("decisions", [
    ["DR-001-migration-provenance.md", "decision-record", "frozen", "001", "Archived legacy artifact provenance."]
  ]));
  writeTextOutput(provenancePath, migrationProvenance(task, legacySources));
  writeTextOutput("reviews/README.md", migrationChildIndex("reviews", []));
  writeTextOutput("tasks/README.md", migrationChildIndex("tasks", []));
  return outputs;
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
    "- Workspace mode: `structured`, established by the controlled migration transaction.",
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
    (entry) => `| \`${entry.path}\` | \`${entry.archive_path}\` | \`${entry.sha256}\` |`
  );
  const frozenRows = legacySources.flatMap((entry) =>
    (entry.frozen_review_rounds ?? []).map(
      (round) => `| \`${entry.path}\` | \`${round.decision_id}\` | \`${round.sha256}\` |`
    )
  );
  return `${frontMatter("decision-record", "frozen", ["decision", "migration"], "Archived legacy artifact provenance.")}# Migration Provenance\n\n## Context\n\nThe legacy workspace was converted through the controlled migration command. Historical review, timeline, and task material remains authoritative only through the exact archived bytes below.\n\n## Decision\n\n- Change ID: \`${task}\`\n- Archive root: \`.changes/archive/${task}/legacy/\`\n- Current structured indexes do not reinterpret archived review decisions.\n\n## Archived Legacy Evidence\n\n| Source | Archive Path | SHA-256 |\n|---|---|---|\n${rows.join("\n")}\n\n## Archived Frozen Review Rounds\n\n| Source | Decision ID | SHA-256 |\n|---|---|---|\n${frozenRows.join("\n")}\n\n## Alternatives Considered\n\n- Reconstructing legacy review rounds as new structured review documents was rejected because it could change historical meaning.\n\n## Consequences\n\n- Historical references resolve to the same-change archive path and recorded digest.\n- New review work must use the structured review directory and its index.\n`;
}

function extractFrozenReviewRounds(text) {
  const normalized = normalizeLf(text);
  const headers = [...normalized.matchAll(/^## Review Round\b[^\n]*$/gm)];
  const seen = new Set();
  const rounds = [];
  for (let index = 0; index < headers.length; index += 1) {
    const start = headers[index].index;
    const end = headers[index + 1]?.index ?? normalized.length;
    const roundText = canonicalFrozenReviewRoundText(normalized.slice(start, end));
    if (!/^Frozen:\s*yes\s*$/m.test(roundText)) {
      continue;
    }
    const decision = roundText.match(/^Decision ID:\s*(\S[^\n]*?)\s*$/m)?.[1]?.trim();
    if (!decision || seen.has(decision)) {
      throw new Error(`frozen review round requires a unique Decision ID: ${headers[index][0]}`);
    }
    seen.add(decision);
    rounds.push({ decision_id: decision, sha256: sha256Text(roundText) });
  }
  return rounds;
}

function destinationManifest(outputs) {
  return [...outputs.entries()]
    .map(([relPath, bytes]) => ({ path: relPath, sha256: sha256Buffer(bytes) }))
    .sort((left, right) => compareText(left.path, right.path));
}

function applyMigrationPlan(repoRoot, task, plan) {
  assertMigrationPlan(repoRoot, task, plan);
  const transactionDir = migrationTransactionDir(repoRoot, task);
  const current = readMigrationTransaction(transactionDir);
  if (current?.state === "committed") {
    if (current.plan_sha256 !== plan.plan_sha256) {
      throw new Error("committed migration has a different plan digest; rerun --dry-run only after resolving the archived transaction");
    }
    verifyCommittedMigration(repoRoot, task, current);
    return { ...plan, mode: "applied", transaction_state: "committed", idempotent: true };
  }
  if (current && !["prepared", "applying", "interrupted", "rolled-back"].includes(current.state)) {
    throw new Error(`migration transaction has invalid state: ${current.state}`);
  }
  const lock = acquireMigrationLock(transactionDir);
  let transaction = current ?? null;
  try {
    if (current?.state !== "rolled-back" && current?.plan_sha256 && current.plan_sha256 !== plan.plan_sha256) {
      transaction = rollbackInterruptedMigration(repoRoot, task, current);
      throw new Error("interrupted migration plan digest differs from the accepted plan; the prior partial workspace was rolled back, rerun --dry-run before applying");
    }
    const target = changeDir(repoRoot, task);
    const outputs = buildMigrationOutputs(target, task, plan.legacy_sources);
    const sourceInventory = migrationSourceInventory(target);
    if (canonicalJson(destinationManifest(outputs)) !== canonicalJson(plan.destination_manifest)) {
      throw new Error("migration destination manifest changed after dry-run; no files were written");
    }
    if (
      canonicalJson(sourceInventory) !== canonicalJson(plan.source_inventory) &&
      !migrationResumeAllowed(repoRoot, task, target, plan)
    ) {
      if (current && ["prepared", "applying", "interrupted"].includes(current.state)) {
        transaction = rollbackInterruptedMigration(repoRoot, task, current);
        throw new Error("migration source inventory changed after dry-run; the prior partial workspace was rolled back, rerun --dry-run before applying");
      }
      throw new Error("migration source inventory changed after dry-run; no files were written");
    }
    const stagedRoot = path.join(transactionDir, "staging", plan.plan_sha256);
    const resuming = current && ["prepared", "applying", "interrupted"].includes(current.state);
    if (!resuming) {
      fs.rmSync(stagedRoot, { recursive: true, force: true });
    }
    stageMigration(stagedRoot, outputs, target, repoRoot, task, plan.legacy_sources, plan.source_inventory, !resuming);

    transaction = {
      version: 1,
      change_id: task,
      state_root: plan.state_root,
      state: "prepared",
      plan_sha256: plan.plan_sha256,
      source_inventory: plan.source_inventory,
      legacy_sources: plan.legacy_sources,
      destination_manifest: plan.destination_manifest,
      provenance_path: "decisions/DR-001-migration-provenance.md",
      plan
    };
    writeMigrationTransaction(transactionDir, transaction);
    transaction = { ...transaction, state: "applying" };
    writeMigrationTransaction(transactionDir, transaction);

    installMigration(stagedRoot, target, repoRoot, task, plan, outputs);
    transaction = { ...transaction, state: "committed" };
    writeMigrationTransaction(transactionDir, transaction);
    fs.rmSync(stagedRoot, { recursive: true, force: true });
    return { ...plan, mode: "applied", transaction_state: "committed", idempotent: false };
  } catch (error) {
    if (transaction && transaction.state !== "rolled-back") {
      writeMigrationTransaction(transactionDir, { ...transaction, state: "interrupted", error: error.message });
    }
    throw error;
  } finally {
    releaseMigrationLock(lock);
  }
}

function assertMigrationPlan(repoRoot, task, plan) {
  if (!plan || typeof plan !== "object" || plan.change_id !== task || plan.state_root !== canonicalPath(repoRoot)) {
    throw new Error("migration plan does not bind the selected change and canonical state root");
  }
  const { plan_sha256: planHash, ...unsignedPlan } = plan;
  if (!/^[a-f0-9]{64}$/.test(planHash ?? "") || sha256Text(canonicalJson(unsignedPlan)) !== planHash) {
    throw new Error("migration plan digest is malformed or does not bind its contents");
  }
  if (!Array.isArray(plan.source_inventory) || !Array.isArray(plan.destination_manifest) || !Array.isArray(plan.legacy_sources)) {
    throw new Error("migration plan is missing required inventory, destination, or legacy source entries");
  }
  assertUniquePlanPaths(plan.source_inventory, "source inventory");
  assertUniquePlanPaths(plan.destination_manifest, "destination manifest");
  const expectedLegacy = new Map([
    ["review-log.md", "reviews"],
    ["timeline.md", "timeline"],
    ["tasks.md", "tasks"]
  ]);
  for (const source of plan.legacy_sources) {
    if (
      !source ||
      typeof source !== "object" ||
      !expectedLegacy.has(source.path) ||
      source.target_directory !== expectedLegacy.get(source.path) ||
      source.archive_path !== `.changes/archive/${task}/legacy/${source.path}` ||
      !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")
    ) {
      throw new Error("migration plan has an invalid legacy source entry");
    }
    if (source.path === "review-log.md") {
      assertFrozenReviewRounds(source.frozen_review_rounds);
    } else if (Object.hasOwn(source, "frozen_review_rounds")) {
      throw new Error("migration plan has unexpected frozen review round evidence");
    }
  }
}

function assertFrozenReviewRounds(rounds) {
  if (!Array.isArray(rounds)) {
    throw new Error("migration plan is missing frozen review round evidence");
  }
  const seen = new Set();
  for (const round of rounds) {
    if (
      !round ||
      typeof round !== "object" ||
      typeof round.decision_id !== "string" ||
      !round.decision_id ||
      !/^[a-f0-9]{64}$/.test(round.sha256 ?? "") ||
      seen.has(round.decision_id)
    ) {
      throw new Error("migration plan has invalid frozen review round evidence");
    }
    seen.add(round.decision_id);
  }
}

function assertUniquePlanPaths(entries, label) {
  const paths = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !safeMigrationPath(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "") || paths.has(entry.path)) {
      throw new Error(`migration plan has an invalid ${label} entry`);
    }
    paths.add(entry.path);
  }
}

function safeMigrationPath(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("\\") && !path.isAbsolute(value) && !value.split("/").some((part) => !part || part === "." || part === "..");
}

function migrationTransactionDir(repoRoot, task) {
  return path.join(repoRoot, ".changes", ".control", "migrations", task);
}

function readMigrationTransaction(transactionDir) {
  const filePath = path.join(transactionDir, "current.json");
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`migration transaction is unreadable: ${filePath}`);
  }
}

function writeMigrationTransaction(transactionDir, transaction) {
  writeAtomic(path.join(transactionDir, "current.json"), `${JSON.stringify(canonicalValue(transaction), null, 2)}\n`, true);
}

function acquireMigrationLock(transactionDir) {
  fs.mkdirSync(transactionDir, { recursive: true });
  const lockPath = path.join(transactionDir, "migration.lock");
  const recoveryPath = `${lockPath}.recovery`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const recovery = readMigrationLock(recoveryPath);
    if (recovery) {
      const status = staleMigrationLock(recovery) ? "unrecovered after its owner exited" : "already in progress";
      throw new Error(`migration stale-lock recovery is ${status}: ${recoveryPath}`);
    }
    const token = randomBytes(16).toString("hex");
    try {
      const fd = fs.openSync(lockPath, "wx", 0o600);
      fs.writeSync(fd, migrationLockText(process.pid, token));
      fs.fsyncSync(fd);
      const lock = { path: lockPath, fd, pid: process.pid, token };
      if (!fs.existsSync(recoveryPath)) {
        return lock;
      }
      releaseMigrationLock(lock);
      continue;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      const observed = readMigrationLock(lockPath);
      if (!observed || !staleMigrationLock(observed)) {
        throw new Error(`migration transaction is already locked: ${lockPath}`);
      }
      if (!reclaimStaleMigrationLock(lockPath, recoveryPath, observed)) {
        continue;
      }
    }
  }
  throw new Error(`migration transaction lock changed during stale-lock recovery: ${lockPath}`);
}

function migrationLockText(pid, token) {
  return `${pid} ${token}\n`;
}

function readMigrationLock(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    const match = /^(\d+) ([a-f0-9]{32})\n$/.exec(raw);
    return match ? { pid: Number.parseInt(match[1], 10), raw, token: match[2] } : null;
  } catch {
    return null;
  }
}

function staleMigrationLock(lock) {
  if (!lock || !Number.isInteger(lock.pid) || lock.pid <= 0) {
    return false;
  }
  try {
    process.kill(lock.pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
}

function reclaimStaleMigrationLock(lockPath, recoveryPath, observed) {
  let recoveryFd;
  const recoveryToken = randomBytes(16).toString("hex");
  try {
    recoveryFd = fs.openSync(recoveryPath, "wx", 0o600);
    fs.writeSync(recoveryFd, migrationLockText(process.pid, recoveryToken));
    fs.fsyncSync(recoveryFd);
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }
    throw error;
  }
  try {
    // A guard keeps claimants out while the stale lock is being removed.
    const current = readMigrationLock(lockPath);
    if (!sameMigrationLock(current, observed) || !staleMigrationLock(current)) {
      return false;
    }
    fs.unlinkSync(lockPath);
    return true;
  } finally {
    fs.closeSync(recoveryFd);
    const currentRecovery = readMigrationLock(recoveryPath);
    if (sameMigrationLock(currentRecovery, { pid: process.pid, token: recoveryToken })) {
      fs.unlinkSync(recoveryPath);
    }
  }
}

function sameMigrationLock(left, right) {
  return Boolean(left && right && left.pid === right.pid && left.token === right.token);
}

function releaseMigrationLock(lock) {
  if (!lock) {
    return;
  }
  fs.closeSync(lock.fd);
  if (sameMigrationLock(readMigrationLock(lock.path), lock)) {
    fs.unlinkSync(lock.path);
  }
}

function migrationResumeAllowed(repoRoot, task, target, plan) {
  const sourceHashes = new Map(plan.source_inventory.map((entry) => [entry.path, entry.sha256]));
  const destinationHashes = new Map(plan.destination_manifest.map((entry) => [entry.path, entry.sha256]));
  const legacyPaths = new Set(plan.legacy_sources.map((entry) => entry.path));
  for (const [relPath, sourceHash] of sourceHashes) {
    const sourcePath = path.join(target, relPath);
    if (fs.existsSync(sourcePath)) {
      const actual = sha256Buffer(fs.readFileSync(sourcePath));
      if (actual === sourceHash || actual === destinationHashes.get(relPath)) {
        continue;
      }
      return false;
    }
    if (!legacyPaths.has(relPath)) {
      return false;
    }
    const source = plan.legacy_sources.find((entry) => entry.path === relPath);
    const archivePath = path.join(repoRoot, source.archive_path);
    if (!fs.existsSync(archivePath) || sha256Buffer(fs.readFileSync(archivePath)) !== source.sha256) {
      return false;
    }
  }
  for (const [relPath, destinationHash] of destinationHashes) {
    const destinationPath = path.join(target, relPath);
    if (!fs.existsSync(destinationPath)) {
      continue;
    }
    const actual = sha256Buffer(fs.readFileSync(destinationPath));
    if (actual !== destinationHash && actual !== sourceHashes.get(relPath)) {
      return false;
    }
  }
  return true;
}

function stageMigration(stagedRoot, outputs, target, repoRoot, task, legacySources, sourceInventory, snapshotSources) {
  if (snapshotSources) {
    for (const source of sourceInventory) {
      const sourcePath = path.join(target, source.path);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`migration source is missing before staging: ${source.path}`);
      }
      const bytes = fs.readFileSync(sourcePath);
      if (sha256Buffer(bytes) !== source.sha256) {
        throw new Error(`migration source changed before staging: ${source.path}`);
      }
      writeAtomic(path.join(stagedRoot, "source", source.path), bytes);
    }
  }
  for (const [relPath, bytes] of outputs) {
    writeAtomic(path.join(stagedRoot, "workspace", relPath), bytes);
  }
  for (const source of legacySources) {
    const sourcePath = path.join(target, source.path);
    const archivePath = path.join(repoRoot, ".changes", "archive", task, "legacy", source.path);
    const bytes = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath) : fs.existsSync(archivePath) ? fs.readFileSync(archivePath) : null;
    if (!bytes || sha256Buffer(bytes) !== source.sha256) {
      throw new Error(`legacy source is missing or changed before staging: ${source.path}`);
    }
    writeAtomic(path.join(stagedRoot, "archive", source.path), bytes);
  }
}

function rollbackInterruptedMigration(repoRoot, task, transaction) {
  const plan = transaction?.plan;
  assertMigrationPlan(repoRoot, task, plan);
  const target = changeDir(repoRoot, task);
  const stagedRoot = path.join(migrationTransactionDir(repoRoot, task), "staging", plan.plan_sha256);
  const sourceHashes = new Map(plan.source_inventory.map((entry) => [entry.path, entry.sha256]));
  const destinationHashes = new Map(plan.destination_manifest.map((entry) => [entry.path, entry.sha256]));
  const legacyPaths = new Set(plan.legacy_sources.map((entry) => entry.path));
  const snapshots = new Map();

  for (const source of plan.source_inventory) {
    const snapshotPath = path.join(stagedRoot, "source", source.path);
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`cannot safely roll back interrupted migration: source snapshot is missing for ${source.path}`);
    }
    const bytes = fs.readFileSync(snapshotPath);
    if (sha256Buffer(bytes) !== source.sha256) {
      throw new Error(`cannot safely roll back interrupted migration: source snapshot digest mismatches for ${source.path}`);
    }
    snapshots.set(source.path, bytes);
  }

  for (const [relPath, sourceHash] of sourceHashes) {
    const currentPath = path.join(target, relPath);
    if (!fs.existsSync(currentPath)) {
      if (!legacyPaths.has(relPath)) {
        throw new Error(`cannot safely roll back interrupted migration: source file is missing ${relPath}`);
      }
      continue;
    }
    const actual = sha256Buffer(fs.readFileSync(currentPath));
    if (actual !== sourceHash && actual !== destinationHashes.get(relPath)) {
      throw new Error(`cannot safely roll back interrupted migration: changed file ${relPath}`);
    }
  }
  for (const [relPath, destinationHash] of destinationHashes) {
    if (sourceHashes.has(relPath)) {
      continue;
    }
    const currentPath = path.join(target, relPath);
    if (fs.existsSync(currentPath) && sha256Buffer(fs.readFileSync(currentPath)) !== destinationHash) {
      throw new Error(`cannot safely roll back interrupted migration: changed generated file ${relPath}`);
    }
  }

  for (const [relPath, bytes] of snapshots) {
    writeAtomic(path.join(target, relPath), bytes);
  }
  for (const [relPath] of destinationHashes) {
    if (!sourceHashes.has(relPath)) {
      fs.rmSync(path.join(target, relPath), { force: true });
    }
  }
  const rolledBack = {
    ...transaction,
    state: "rolled-back",
    rollback_reason: "accepted migration plan or source inventory no longer matched the interrupted transaction"
  };
  writeMigrationTransaction(migrationTransactionDir(repoRoot, task), rolledBack);
  return rolledBack;
}

function abandonInterruptedMigration(repoRoot, task, transaction) {
  const lock = acquireMigrationLock(migrationTransactionDir(repoRoot, task));
  try {
    return rollbackInterruptedMigration(repoRoot, task, transaction);
  } finally {
    releaseMigrationLock(lock);
  }
}

function installMigration(stagedRoot, target, repoRoot, task, plan, outputs) {
  const sourceHashes = new Map(plan.source_inventory.map((entry) => [entry.path, entry.sha256]));
  for (const [relPath, bytes] of outputs) {
    const stagedBytes = fs.readFileSync(path.join(stagedRoot, "workspace", relPath));
    installExpectedFile(path.join(target, relPath), stagedBytes, sourceHashes.get(relPath));
  }
  for (const source of plan.legacy_sources) {
    const stagedBytes = fs.readFileSync(path.join(stagedRoot, "archive", source.path));
    const archivePath = path.join(repoRoot, ".changes", "archive", task, "legacy", source.path);
    installExpectedFile(archivePath, stagedBytes, undefined);
  }
  for (const source of plan.legacy_sources) {
    const sourcePath = path.join(target, source.path);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    if (sha256Buffer(fs.readFileSync(sourcePath)) !== source.sha256) {
      throw new Error(`legacy source changed before removal: ${source.path}`);
    }
    fs.unlinkSync(sourcePath);
  }
}

function installExpectedFile(filePath, bytes, sourceHash) {
  if (!fs.existsSync(filePath)) {
    writeAtomic(filePath, bytes);
    return;
  }
  const existing = fs.readFileSync(filePath);
  if (sha256Buffer(existing) === sha256Buffer(bytes)) {
    return;
  }
  if (sourceHash && sha256Buffer(existing) === sourceHash) {
    writeAtomic(filePath, bytes);
    return;
  }
  throw new Error(`refusing to overwrite changed migration destination: ${filePath}`);
}

function verifyCommittedMigration(repoRoot, task, transaction) {
  if (
    transaction.change_id !== task ||
    transaction.state !== "committed" ||
    transaction.state_root !== canonicalPath(repoRoot) ||
    transaction.plan_sha256 !== transaction.plan?.plan_sha256
  ) {
    throw new Error("committed migration transaction does not match the selected change");
  }
  assertMigrationPlan(repoRoot, task, transaction.plan);
  if (
    canonicalJson(transaction.source_inventory) !== canonicalJson(transaction.plan.source_inventory) ||
    canonicalJson(transaction.destination_manifest) !== canonicalJson(transaction.plan.destination_manifest) ||
    canonicalJson(transaction.legacy_sources) !== canonicalJson(transaction.plan.legacy_sources) ||
    transaction.provenance_path !== "decisions/DR-001-migration-provenance.md"
  ) {
    throw new Error("committed migration fields do not match the accepted plan");
  }
  const destinations = new Map();
  for (const destination of transaction.plan.destination_manifest) {
    if (!destination || !safeMigrationPath(destination.path) || !/^[a-f0-9]{64}$/.test(destination.sha256 ?? "")) {
      throw new Error("committed migration destination manifest is invalid");
    }
    destinations.set(destination.path, destination.sha256);
  }
  for (const required of ["README.md", "specs/README.md", "decisions/README.md", "reviews/README.md", "tasks/README.md"]) {
    if (!fs.existsSync(path.join(changeDir(repoRoot, task), required))) {
      throw new Error(`committed migration structured artifact is missing: ${required}`);
    }
  }
  const provenancePath = transaction.provenance_path;
  const provenanceHash = destinations.get(provenancePath);
  const provenance = path.join(changeDir(repoRoot, task), provenancePath);
  if (!provenanceHash || !fs.existsSync(provenance) || sha256Buffer(fs.readFileSync(provenance)) !== provenanceHash) {
    throw new Error("committed migration provenance is missing or changed");
  }
  for (const source of transaction.plan.legacy_sources) {
    const archivePath = path.join(repoRoot, source.archive_path);
    if (!fs.existsSync(archivePath) || sha256Buffer(fs.readFileSync(archivePath)) !== source.sha256) {
      throw new Error(`committed migration archive is missing or changed: ${source.archive_path}`);
    }
    verifyArchivedFrozenReviewRounds(source, fs.readFileSync(archivePath, "utf8"));
  }
}

function verifyArchivedFrozenReviewRounds(source, text) {
  if (source.path !== "review-log.md") {
    return;
  }
  if (canonicalJson(extractFrozenReviewRounds(text)) !== canonicalJson(source.frozen_review_rounds)) {
    throw new Error("committed migration frozen review round evidence is missing or changed");
  }
}

function writeAtomic(filePath, bytes, sync = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  const descriptor = fs.openSync(temporary, "w");
  try {
    fs.writeSync(descriptor, bytes);
    if (sync) {
      fs.fsyncSync(descriptor);
    }
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, filePath);
}

function canonicalPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(value, "utf8"));
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function sha256CanonicalJsonFile(filePath) {
  const raw = readText(filePath);
  const value = JSON.parse(raw);
  if (!isCanonicalJsonText(raw, value)) {
    throw new Error(`bootstrap control event is not canonical JSON: ${filePath}`);
  }
  return sha256Text(canonicalJson(value));
}

function matchesBootstrapEventDigest(filePath, expected) {
  if (!validSha256(expected)) {
    return false;
  }
  try {
    return expected === sha256File(filePath) || expected === sha256CanonicalJsonFile(filePath);
  } catch {
    return false;
  }
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function isCanonicalJsonText(raw, value) {
  const canonical = canonicalJson(value);
  return raw === canonical || raw === `${canonical}\n`;
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, canonicalValue(child)])
    );
  }
  return value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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
