import fs from "node:fs";
import path from "node:path";
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

export function runChangeDoc(argv) {
  const args = parseArgs(argv);
  const repoRoot = path.resolve(args.values.get("repo-root") ?? ".");
  const command = args.positionals[0];

  if (!command || args.flags.has("help")) {
    process.stdout.write("harness-change-doc <command> [options]\n");
    return 0;
  }

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

  const task = args.positionals[1];
  if (!task) {
    process.stderr.write(`ERROR: ${command} requires a change id\n`);
    return 2;
  }
  const target = changeDir(repoRoot, task);
  if (!fs.existsSync(target)) {
    process.stderr.write(`ERROR: change not found: ${target}\n`);
    return 2;
  }

  if (command === "index") {
    printJson(buildIndex(repoRoot, task));
    return 0;
  }
  if (command === "list") {
    return commandList(repoRoot, task, args.flags.has("json"));
  }
  if (command === "locate") {
    return commandLocate(repoRoot, task, args);
  }
  if (command === "read") {
    return commandRead(repoRoot, task, args);
  }
  if (command === "add-terminology") {
    return commandAddTerminology(target, args);
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
      sections: ["## Objective", "## Scope", "## Steps", "- [ ] ", "## Validation", "- [ ] "]
    });
  }
  if (command === "migrate") {
    printJson(buildMigrationPlan(repoRoot, task, args.flags.has("dry-run")));
    return 0;
  }

  process.stderr.write(`ERROR: unknown command: ${command}\n`);
  return 2;
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
