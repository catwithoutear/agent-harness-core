import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, printJson } from "../cli/args.js";
import {
  ARTIFACTS,
  CHANGE_CHILD_DIRECTORIES,
  JSON_EVIDENCE_DIRECTORIES,
  globalTagAllowed,
  managedChangeDirectories,
  managedJsonEvidenceDirectories,
  requiredFields,
  statusAllowed
} from "./js-policy.js";
import {
  markdownTableAfterHeading,
  markdownTableLinesAfterHeading,
  parseFrontMatter,
  readText,
  splitTableRow,
  walkFiles
} from "./markdown.js";
import { executionMapSummary, validateExecutionMapWorktrees } from "./execution-map.js";
import { resolveChangeContextFromArgs, writeRootContextError } from "./root-resolution.js";
import {
  PROTOCOL as REVIEW_RUN_PROTOCOL,
  parseJsonStrict,
  validateDispatchContract,
  validateDispatchPreflight,
  validateDiscovery,
  validateLedger,
  validateRequest,
  validateShardPlan,
  verifyRecordDigest
} from "../../skills/review/review-packet-gate/scripts/review-run.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEGACY_TOP_LEVEL_CHANGE_FILES = {
  "review-log.md": "reviews/",
  "timeline.md": "timeline/"
};

export function runChangeValidate(argv) {
  const args = parseArgs(argv);
  const rootContext = resolveChangeContextFromArgs(args, {
    changeId: args.values.get("change"),
    cwd: process.cwd(),
    env: process.env
  });
  if (rootContext.unresolved_reason) {
    writeRootContextError(rootContext);
    return 2;
  }
  const repoRoot = rootContext.state_root;
  const repoSchemaPath = path.join(repoRoot, ".rules", "change-doc-schema.json");
  const schemaPath = args.values.get("schema")
    ? path.resolve(repoRoot, args.values.get("schema"))
    : fs.existsSync(repoSchemaPath)
      ? repoSchemaPath
      : path.join(packageRoot, "schemas", "change-workspace.schema.json");

  if (!fs.existsSync(schemaPath)) {
    process.stderr.write(`ERROR: schema not found: ${schemaPath}\n`);
    return 2;
  }
  const schema = JSON.parse(readText(schemaPath));

  if (args.flags.has("memory")) {
    const report = buildMemoryReport(repoRoot, args.flags.has("strict-memory"));
    if (args.flags.has("json")) {
      printJson(report);
    } else {
      printMemoryText(report, args.flags.has("strict-memory"));
    }
    return report.summary.errors > 0 ? 1 : 0;
  }

  if (args.values.has("change") && args.flags.has("all-active")) {
    process.stderr.write("ERROR: use either --change or --all-active\n");
    return 2;
  }

  const changesDir = path.join(repoRoot, schema.paths.changes_dir);
  const ignoredNames = new Set(schema.paths.ignored_change_dirs ?? ["archive"]);
  let targets = [];
  if (args.values.has("change")) {
    const target = path.join(changesDir, args.values.get("change"));
    if (!fs.existsSync(target)) {
      process.stderr.write(`ERROR: change not found: ${target}\n`);
      return 2;
    }
    targets = [target];
  } else if (args.flags.has("all-active")) {
    targets = fs.existsSync(changesDir)
      ? fs
          .readdirSync(changesDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && !ignoredNames.has(entry.name))
          .map((entry) => path.join(changesDir, entry.name))
          .sort()
      : [];
  } else {
    process.stderr.write("ERROR: one of --change or --all-active is required\n");
    return 2;
  }

  const reportMode = args.flags.has("status") || args.flags.has("inventory") || args.flags.has("suggest-cleanup");
  if (args.flags.has("json") && !reportMode) {
    process.stderr.write("ERROR: --json requires --status, --inventory, or --suggest-cleanup\n");
    return 2;
  }

  if (reportMode) {
    const report = buildStatusReport(repoRoot, targets, schema, {
      strictLayout: args.flags.has("strict-layout"),
      includeInventory:
        args.flags.has("inventory") || args.flags.has("suggest-cleanup") || args.flags.has("strict-layout"),
      includeSuggestions: args.flags.has("suggest-cleanup"),
      worktrees: args.flags.has("worktrees")
    });
    if (args.flags.has("json")) {
      printJson(report);
    } else if (args.flags.has("inventory") || args.flags.has("suggest-cleanup")) {
      printInventoryText(report);
    } else {
      printStatusText(report);
    }
    return report.summary.errors > 0 ? 1 : 0;
  }

  const allErrors = [];
  const allWarns = [];
  for (const target of targets) {
    const { mode, errors, warnings } = validateChange(target, schema, args.flags.has("strict-layout"), {
      worktrees: args.flags.has("worktrees")
    });
    allErrors.push(...errors);
    allWarns.push(...warnings);
    const action = nextAction(errors, warnings);
    process.stdout.write(`INFO: ${path.basename(target)}: mode=${mode} errors=${errors.length} warnings=${warnings.length}\n`);
    process.stdout.write(`NEXT_ACTION: ${path.basename(target)}: ${action}\n`);
    if (action !== "ready") {
      process.stdout.write(`GUIDE: ${path.basename(target)}: ${guidanceFor(action, args.flags.has("strict-layout"))}\n`);
    }
  }
  for (const error of allErrors) {
    process.stdout.write(`ERROR: ${error}\n`);
  }
  for (const warning of allWarns) {
    process.stdout.write(`WARN: ${warning}\n`);
  }
  process.stdout.write(
    `INFO: validated_changes=${targets.length} errors=${allErrors.length} warnings=${allWarns.length}\n`
  );
  const summaryAction = nextAction(allErrors, allWarns);
  process.stdout.write(`NEXT_ACTION: summary: ${summaryAction}\n`);
  if (summaryAction !== "ready") {
    process.stdout.write(`GUIDE: summary: ${guidanceFor(summaryAction, args.flags.has("strict-layout"))}\n`);
  }
  return allErrors.length > 0 ? 1 : 0;
}

function validateChange(changeDir, schema, strictLayout, options = {}) {
  const errors = [];
  const warnings = [];
  const mode = detectMode(changeDir);
  const v2 = isV2Workspace(changeDir);

  validateChangeId(changeDir, schema, errors);
  if (mode === "plan_only") {
    validatePlan(changeDir, schema, errors);
    if (fs.existsSync(path.join(changeDir, "tasks.md"))) {
      validateTasks(changeDir, schema, errors);
    }
    if (!v2) {
      validateReviewLog(changeDir, schema, errors);
    }
  } else {
    validateProposal(changeDir, schema, errors);
    validateTasks(changeDir, schema, errors);
    if (mode === "structured_proposal") {
      validateStructuredFiles(changeDir, schema, errors, warnings);
    }
    validateSpecs(changeDir, schema, errors, warnings, mode);
    validateDesign(changeDir, schema, warnings);
    if (!v2) {
      validateReviewLog(changeDir, schema, errors);
    }
  }

  validateV2Workspace(changeDir, errors, warnings);
  validateReviewRunEvidence(changeDir, errors);
  validateLegacyTopLevelArtifacts(changeDir, errors, warnings, strictLayout);
  validateLayout(changeDir, schema, mode, errors, warnings, strictLayout);
  if (options.worktrees) {
    const worktreeReport = validateExecutionMapWorktrees(changeDir);
    errors.push(...worktreeReport.errors);
    warnings.push(...worktreeReport.warnings);
  }
  return { mode, errors, warnings };
}

function validateLegacyTopLevelArtifacts(changeDir, errors, warnings, strictLayout) {
  if (!isV2Workspace(changeDir)) {
    return;
  }

  for (const [relPath, targetDirectory] of Object.entries(LEGACY_TOP_LEVEL_CHANGE_FILES)) {
    const legacyFile = path.join(changeDir, relPath);
    if (!fs.existsSync(legacyFile)) {
      continue;
    }
    appendLayoutIssue(
      errors,
      warnings,
      strictLayout,
      `${legacyFile}: legacy top-level artifact; read it as migration input only, move current state into ${targetDirectory} with the document tool, and do not treat it as canonical v2 state`
    );
  }
}

function detectMode(changeDir) {
  const hasPlan = fs.existsSync(path.join(changeDir, "plan.md"));
  const hasProposal = fs.existsSync(path.join(changeDir, "proposal.md"));
  const hasSpecs = fs.existsSync(path.join(changeDir, "specs"));
  const hasTaskRegistry =
    fs.existsSync(path.join(changeDir, "README.md")) &&
    markdownTableAfterHeading(readText(path.join(changeDir, "README.md")), "Task Tag Registry").length > 0;
  const structuredMarkers = [
    path.join(changeDir, "specs", "README.md"),
    path.join(changeDir, "implementation-design", "README.md")
  ];
  if (hasTaskRegistry && structuredMarkers.some((entry) => fs.existsSync(entry))) {
    return "structured_proposal";
  }
  if (hasPlan && !hasProposal && !hasSpecs) {
    return "plan_only";
  }
  return "legacy_proposal";
}


function validateChangeId(changeDir, schema, errors) {
  const pattern = new RegExp(schema.change_id.pattern);
  if (!pattern.test(path.basename(changeDir))) {
    errors.push(`${changeDir}: invalid change id`);
  }
}

function validateProposal(changeDir, schema, errors) {
  const proposal = path.join(changeDir, "proposal.md");
  if (!fs.existsSync(proposal)) {
    errors.push(`${proposal}: missing required file`);
    return;
  }
  validateHeadings(proposal, schema.proposal.required_headings, errors);
}

function validatePlan(changeDir, schema, errors) {
  const plan = path.join(changeDir, "plan.md");
  if (!fs.existsSync(plan)) {
    errors.push(`${plan}: missing required file`);
    return;
  }
  validateHeadings(plan, schema.plan?.required_headings ?? [], errors);
}

function validateTasks(changeDir, schema, errors) {
  const tasks = path.join(changeDir, "tasks.md");
  const tasksIndex = path.join(changeDir, "tasks", "README.md");
  if (!fs.existsSync(tasks)) {
    if (fs.existsSync(tasksIndex)) {
      return;
    }
    errors.push(`${tasks}: missing required file; provide tasks.md or tasks/README.md`);
    return;
  }
  const text = readText(tasks);
  validateHeadings(tasks, schema.tasks.required_headings, errors);
  const checkboxRe = new RegExp(schema.tasks.checkbox_pattern);
  let sawCheckbox = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("- [")) {
      sawCheckbox = true;
      if (!checkboxRe.test(line)) {
        errors.push(`${tasks}: invalid checkbox line: ${line}`);
      }
    }
  }
  if (schema.tasks.require_checkbox_items && !sawCheckbox) {
    errors.push(`${tasks}: no checkbox items found`);
  }
}

function validateSpecs(changeDir, schema, errors, warnings, mode) {
  const specRoot = path.join(changeDir, "specs");
  if (!fs.existsSync(specRoot)) {
    warnings.push(`${changeDir}: no specs/ directory`);
    return;
  }
  const ignored = new Set(schema.delta_spec.ignored_files ?? ["README.md", "capability-template.md"]);
  const moduleWarning = schema.delta_spec.module_name_warning_pattern
    ? new RegExp(schema.delta_spec.module_name_warning_pattern)
    : null;
  for (const filePath of walkFiles(specRoot, (entry) => entry.endsWith(".md"))) {
    if (ignored.has(path.basename(filePath))) {
      continue;
    }
    if (mode === "structured_proposal" && moduleWarning?.test(path.basename(filePath))) {
      warnings.push(`${filePath}: spec filename appears module-based`);
    }
    validateDeltaSpecFile(filePath, schema, errors, mode === "structured_proposal");
  }
}

function validateDeltaSpecFile(filePath, schema, errors, requireContractHeadings) {
  const text = readText(filePath);
  const lines = text.split("\n");
  if (requireContractHeadings) {
    validateHeadings(filePath, schema.delta_spec.required_headings ?? [], errors);
  }
  const allowedSections = new Set(schema.delta_spec.allowed_sections);
  const requirementRe = new RegExp(schema.delta_spec.requirement_heading_pattern);
  const scenarioRe = new RegExp(schema.delta_spec.scenario_heading_pattern);
  let currentRequirement = null;
  let scenarioCount = 0;
  for (const line of lines) {
    if (line.startsWith("## ") && line.includes("Requirements") && !allowedSections.has(line)) {
      errors.push(`${filePath}: invalid section heading ${line}`);
    }
    if (requirementRe.test(line)) {
      if (currentRequirement !== null && scenarioCount === 0) {
        errors.push(`${filePath}: requirement without scenario: ${currentRequirement}`);
      }
      currentRequirement = line;
      scenarioCount = 0;
      continue;
    }
    if (scenarioRe.test(line)) {
      scenarioCount += 1;
    }
  }
  if (currentRequirement !== null && scenarioCount === 0) {
    errors.push(`${filePath}: requirement without scenario: ${currentRequirement}`);
  }
}

function validateDesign(changeDir, schema, warnings) {
  const design = path.join(changeDir, "design.md");
  if (!fs.existsSync(design) && schema.validation?.warn_on_missing_design) {
    warnings.push(`${design}: optional file missing`);
    return;
  }
  if (fs.existsSync(design)) {
    for (const heading of schema.design?.required_headings_when_present ?? []) {
      if (!readText(design).includes(heading)) {
        warnings.push(`${design}: missing heading ${heading}`);
      }
    }
  }
}

function validateStructuredFiles(changeDir, schema, errors, warnings) {
  const structured = schema.structured_proposal ?? {};
  for (const relPath of structured.required_files ?? []) {
    if (!fs.existsSync(path.join(changeDir, relPath))) {
      errors.push(`${path.join(changeDir, relPath)}: missing required file`);
    }
  }
  for (const relPath of structured.warning_files ?? []) {
    if (!fs.existsSync(path.join(changeDir, relPath))) {
      warnings.push(`${path.join(changeDir, relPath)}: optional file missing`);
    }
  }
  for (const [directory, requiredFiles] of Object.entries(structured.required_if_directory_exists ?? {})) {
    if (!fs.existsSync(path.join(changeDir, directory))) {
      continue;
    }
    for (const relPath of requiredFiles) {
      if (!fs.existsSync(path.join(changeDir, relPath))) {
        errors.push(`${path.join(changeDir, relPath)}: missing required file`);
      }
    }
  }
}

function validateReviewLog(changeDir, schema, errors) {
  const reviewLog = path.join(changeDir, "review-log.md");
  if (!fs.existsSync(reviewLog)) {
    return;
  }
  const text = readText(reviewLog);
  validateHeadings(reviewLog, schema.review_log?.required_headings ?? [], errors);
  if (!schema.review_log?.frozen_requires_blocking_open_zero) {
    return;
  }
  for (const round of splitReviewRounds(text)) {
    const roundText = round.join("\n");
    if (roundText.includes("Frozen: yes") && !roundText.includes("Blocking Open: 0")) {
      errors.push(`${reviewLog}: ${round[0] ?? "<unknown round>"}: Frozen: yes requires Blocking Open: 0`);
    }
  }
}

function splitReviewRounds(text) {
  const rounds = [];
  let current = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("## ") && line.includes("Round")) {
      if (current.length > 0) {
        rounds.push(current);
      }
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    rounds.push(current);
  }
  return rounds;
}

function validateV2Workspace(changeDir, errors, warnings) {
  if (!isV2Workspace(changeDir)) {
    return;
  }
  const allowedLocalTags = validateTaskTagRegistry(changeDir, errors);
  validateV2RegulatedDocuments(changeDir, allowedLocalTags, errors);
  for (const directory of Object.keys(CHANGE_CHILD_DIRECTORIES).sort()) {
    validateV2ChildDirectory(changeDir, directory, allowedLocalTags, errors);
  }
  if (allowedLocalTags.size === 0) {
    warnings.push(`${path.join(changeDir, "README.md")}: no local tags declared`);
  }
}

function isV2Workspace(changeDir) {
  const readme = path.join(changeDir, "README.md");
  if (fs.existsSync(readme) && markdownTableAfterHeading(readText(readme), "Task Tag Registry").length > 0) {
    return true;
  }
  return [...managedChangeDirectories()].some((directory) => fs.existsSync(path.join(changeDir, directory)));
}

function validateTaskTagRegistry(changeDir, errors) {
  const readme = path.join(changeDir, "README.md");
  const registry = fs.existsSync(readme) ? markdownTableAfterHeading(readText(readme), "Task Tag Registry") : [];
  if (registry.length === 0) {
    errors.push(`${readme}: missing Task Tag Registry`);
    return new Set();
  }
  const seen = new Set();
  for (const row of registry) {
    const tag = row.tag ?? "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) {
      errors.push(`${readme}: invalid task tag ${tag}`);
    }
    if (globalTagAllowed(tag)) {
      errors.push(`${readme}: task tag duplicates global tag ${tag}`);
    }
    if (seen.has(tag)) {
      errors.push(`${readme}: duplicate task tag ${tag}`);
    }
    if (!row.description) {
      errors.push(`${readme}: task tag ${tag} missing description`);
    }
    seen.add(tag);
  }
  return seen;
}

function validateV2RegulatedDocuments(changeDir, allowedLocalTags, errors) {
  for (const filePath of walkFiles(changeDir, (entry) => entry.endsWith(".md"))) {
    const relPath = path.relative(changeDir, filePath).split(path.sep).join("/");
    const firstPart = relPath.split("/", 1)[0];
    if (managedChangeDirectories().has(firstPart)) {
      continue;
    }
    const expected = expectedChangeArtifact(relPath);
    if (expected) {
      validateFrontMatter(filePath, expected, allowedLocalTags, errors);
    }
  }
}

function validateReviewRunEvidence(changeDir, errors) {
  const reviewRunsRoot = path.join(changeDir, "review-runs");
  if (!fs.existsSync(reviewRunsRoot)) return;
  const policy = JSON_EVIDENCE_DIRECTORIES["review-runs"];
  for (const entry of fs.readdirSync(reviewRunsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !policy.runIdRegex.test(entry.name)) {
      errors.push(`${reviewRunsRoot}: invalid review run directory ${entry.name}`);
      continue;
    }
    validateReviewRunRoot(path.join(reviewRunsRoot, entry.name), errors);
  }
}

function validateReviewRunRoot(runRoot, errors) {
  const runId = path.basename(runRoot);
  const allowedTopLevel = new Set([
    "request.json",
    "routing-decision.json",
    "dispatch-preflight.json",
    "discovery.json",
    "shard-plan.json",
    "aggregate-report.json",
    "gate-result.json"
  ]);
  for (const entry of fs.readdirSync(runRoot, { withFileTypes: true })) {
    if (entry.isFile() && allowedTopLevel.has(entry.name)) continue;
    if (entry.isDirectory() && ["attempts", "control"].includes(entry.name)) continue;
    errors.push(`${runRoot}: unexpected review-run entry ${entry.name}`);
  }
  const read = (relativePath) => {
    const filePath = path.join(runRoot, relativePath);
    if (!fs.existsSync(filePath)) return null;
    try {
      return parseJsonStrict(readText(filePath), filePath);
    } catch (error) {
      errors.push(`${filePath}: ${error.code ?? "INVALID_JSON"}: ${error.message}`);
      return null;
    }
  };
  const request = read("request.json");
  const validateEnvelope = (filePath, record) => {
    if (!record) return;
    if (record.format !== REVIEW_RUN_PROTOCOL || record.format_version !== 1) errors.push(`${filePath}: unsupported record format`);
    if (record.protocol !== REVIEW_RUN_PROTOCOL) errors.push(`${filePath}: unsupported protocol`);
    if (record.run_id !== runId) errors.push(`${filePath}: run_id does not match directory`);
    if (typeof record.record_digest !== "string" || typeof record.canonical_digest !== "string") errors.push(`${filePath}: missing self digest`);
    else {
      try {
        if (!verifyRecordDigest(record)) errors.push(`${filePath}: record_digest mismatch`);
      } catch (error) {
        errors.push(`${filePath}: ${error.code ?? "NON_PORTABLE_RECORD"}: ${error.message}`);
      }
    }
  };
  validateEnvelope(`${runRoot}/request.json`, request);
  let normalizedRequest = null;
  if (request) {
    try {
      normalizedRequest = validateRequest(request);
      if (normalizedRequest.run_id !== runId) errors.push(`${runRoot}/request.json: run_id does not match directory`);
    } catch (error) {
      errors.push(`${runRoot}/request.json: ${error.code ?? "INVALID_REVIEW_REQUEST"}: ${error.message}`);
    }
  }
  const records = ["routing-decision", "dispatch-preflight", "discovery", "shard-plan", "aggregate-report", "gate-result"]
    .map((name) => [name, read(`${name}.json`)]);
  for (const [name, record] of records) {
    validateEnvelope(`${runRoot}/${name}.json`, record);
  }
  const discovery = records.find(([name]) => name === "discovery")?.[1] ?? null;
  const plan = records.find(([name]) => name === "shard-plan")?.[1] ?? null;
  const routing = records.find(([name]) => name === "routing-decision")?.[1] ?? null;
  const preflight = records.find(([name]) => name === "dispatch-preflight")?.[1] ?? null;
  if (normalizedRequest && routing?.selected_mode === "deep") {
    if (!preflight) errors.push(`${runRoot}/dispatch-preflight.json: missing deep dispatch preflight`);
    else {
      try {
        validateDispatchPreflight(preflight, normalizedRequest, routing);
      } catch (error) {
        errors.push(`${runRoot}/dispatch-preflight.json: ${error.code ?? "PROVIDER_RUNTIME_GAP"}: ${error.message}`);
      }
    }
  }
  if (normalizedRequest && discovery) {
    try {
      validateDiscovery(discovery, normalizedRequest.dispatch_contract, normalizedRequest.execution_policy);
    } catch (error) {
      errors.push(`${runRoot}/discovery.json: ${error.code ?? "INVALID_DISCOVERY"}: ${error.message}`);
    }
  }
  if (discovery && plan) {
    try {
      validateShardPlan(plan, discovery);
    } catch (error) {
      errors.push(`${runRoot}/shard-plan.json: ${error.code ?? "INVALID_SHARD_PLAN"}: ${error.message}`);
    }
  }
  const attemptsRoot = path.join(runRoot, "attempts");
  if (fs.existsSync(attemptsRoot)) {
    for (const entry of fs.readdirSync(attemptsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        errors.push(`${attemptsRoot}: invalid attempt entry ${entry.name}`);
        continue;
      }
      const ledger = read(path.join("attempts", entry.name));
      if (ledger && discovery) {
        try {
          validateLedger(ledger, discovery, plan);
        } catch (error) {
          errors.push(`${attemptsRoot}/${entry.name}: ${error.code ?? "INVALID_LEDGER"}: ${error.message}`);
        }
      }
    }
  }
  const controlRoot = path.join(runRoot, "control");
  if (fs.existsSync(controlRoot)) {
    const current = read(path.join("control", "current.json"));
    if (current) {
      validateEnvelope(`${controlRoot}/current.json`, current);
      if (current.record_type !== "control-revision") errors.push(`${controlRoot}/current.json: invalid control record_type`);
      if (current.run_id !== runId) errors.push(`${controlRoot}/current.json: run_id does not match directory`);
    }
    const revisionsRoot = path.join(controlRoot, "revisions");
    if (fs.existsSync(revisionsRoot)) {
      for (const entry of fs.readdirSync(revisionsRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !/^\d{6}\.json$/u.test(entry.name)) errors.push(`${revisionsRoot}: invalid revision entry ${entry.name}`);
        else validateEnvelope(`${revisionsRoot}/${entry.name}`, read(path.join("control", "revisions", entry.name)));
      }
    }
  }
}

function validateV2ChildDirectory(changeDir, directory, allowedLocalTags, errors) {
  const directoryPath = path.join(changeDir, directory);
  if (!fs.existsSync(directoryPath)) {
    return;
  }
  const contract = CHANGE_CHILD_DIRECTORIES[directory];
  const indexPath = path.join(directoryPath, "README.md");
  if (!fs.existsSync(indexPath)) {
    errors.push(`${indexPath}: missing required file`);
    return;
  }
  validateFrontMatter(indexPath, contract.indexArtifact, allowedLocalTags, errors);
  const rows = validateChildIndexTable(indexPath, directory, errors);
  const indexed = new Map(rows.filter((row) => row.path).map((row) => [row.path, row]));
  const childFiles = fs
    .readdirSync(directoryPath)
    .filter((name) => name.endsWith(".md") && name !== "README.md" && !name.endsWith("-template.md"));
  for (const row of rows) {
    if (!row.path) {
      errors.push(`${indexPath}: Child Index row missing path`);
      continue;
    }
    if (!fs.existsSync(path.join(directoryPath, row.path))) {
      errors.push(`${indexPath}: Child Index references missing file ${row.path}`);
    }
  }
  for (const child of childFiles) {
    if (!indexed.has(child)) {
      errors.push(`${path.join(directoryPath, child)}: missing Child Index entry`);
    }
    if (!contract.filenameRegex.test(child)) {
      errors.push(`${path.join(directoryPath, child)}: filename does not match ${contract.pattern}`);
    }
    const metadata = validateFrontMatter(path.join(directoryPath, child), contract.childArtifact, allowedLocalTags, errors);
    if (indexed.has(child)) {
      validateChildIndexRow(indexPath, directory, child, indexed.get(child), metadata, errors);
    }
  }
}

function validateChildIndexTable(indexPath, directory, errors) {
  const tableLines = fs.existsSync(indexPath) ? markdownTableLinesAfterHeading(readText(indexPath), "Child Index") : [];
  const required = new Set(CHANGE_CHILD_DIRECTORIES[directory].columns);
  if (tableLines.length === 0) {
    errors.push(`${indexPath}: missing Child Index table`);
    return [];
  }
  const columns = new Set(splitTableRow(tableLines[0]));
  for (const column of required) {
    if (!columns.has(column)) {
      errors.push(`${indexPath}: Child Index missing columns ${[...required].filter((item) => !columns.has(item)).join(", ")}`);
      break;
    }
  }
  return parseTable(tableLines);
}

function validateChildIndexRow(indexPath, directory, filename, row, metadata, errors) {
  if (row.artifact && metadata.artifact && row.artifact !== metadata.artifact) {
    errors.push(`${indexPath}: ${filename}: index artifact ${row.artifact} does not match child artifact ${metadata.artifact}`);
  }
  if (row.status && metadata.status && row.status !== metadata.status) {
    errors.push(`${indexPath}: ${filename}: index status ${row.status} does not match child status ${metadata.status}`);
  }
  if (row.description && metadata.description && row.description !== metadata.description) {
    errors.push(`${indexPath}: ${filename}: index description does not match child description`);
  }
  const keyColumn = directory === "timeline" ? "date_key" : "order";
  const expected = expectedChildKey(directory, filename);
  if (expected && row[keyColumn] && row[keyColumn] !== expected) {
    errors.push(`${indexPath}: ${filename}: index ${keyColumn} ${row[keyColumn]} does not match filename key ${expected}`);
  }
}

function validateFrontMatter(filePath, expectedArtifact, allowedLocalTags, errors) {
  const metadata = parseFrontMatter(filePath);
  if (!metadata) {
    errors.push(`${filePath}: missing YAML front matter`);
    return {};
  }
  const artifactName = metadata.artifact;
  if (expectedArtifact && artifactName !== expectedArtifact) {
    errors.push(`${filePath}: expected artifact ${expectedArtifact}, got ${artifactName}`);
  } else if (!ARTIFACTS[artifactName]) {
    errors.push(`${filePath}: unknown artifact ${artifactName}`);
  }
  if (ARTIFACTS[artifactName]) {
    for (const field of requiredFields(artifactName)) {
      if (!(field in metadata)) {
        errors.push(`${filePath}: front matter missing required field ${field}`);
      }
    }
  }
  if (artifactName && metadata.status && !statusAllowed(artifactName, metadata.status)) {
    errors.push(`${filePath}: status ${metadata.status} is not allowed for artifact ${artifactName}`);
  }
  validateTags(filePath, metadata.tags, allowedLocalTags, errors);
  return metadata;
}

function validateTags(filePath, tags, allowedLocalTags, errors) {
  if (!Array.isArray(tags) || tags.length === 0) {
    errors.push(`${filePath}: front matter tags must be a non-empty list`);
    return;
  }
  for (const tag of tags) {
    if (!globalTagAllowed(tag) && !allowedLocalTags.has(tag)) {
      errors.push(`${filePath}: unknown tag ${tag}`);
    }
  }
}

function expectedChangeArtifact(relPath) {
  for (const [artifactName, artifactPolicy] of Object.entries(ARTIFACTS)) {
    const naming = artifactPolicy.naming;
    if (!naming || naming.startsWith(".memory/")) {
      continue;
    }
    if (naming === relPath) {
      return artifactName;
    }
  }
  if (relPath.startsWith("specs/") && relPath.endsWith(".md") && relPath !== "specs/README.md") {
    return "delta-spec";
  }
  if (
    relPath.startsWith("implementation-design/") &&
    relPath.endsWith(".md") &&
    relPath !== "implementation-design/README.md" &&
    !relPath.slice("implementation-design/".length).includes("/")
  ) {
    return "implementation-design-detail";
  }
  return null;
}

function validateLayout(changeDir, schema, mode, errors, warnings, strictLayout) {
  const inventory = inventoryChange(changeDir, schema, mode, true);
  for (const entry of inventory.unexpected_files) {
    appendLayoutIssue(
      errors,
      warnings,
      strictLayout,
      `${path.join(changeDir, entry.path)}: unexpected change workspace file: ${entry.reason}; read this file before deciding whether to consolidate it into an owning artifact, move it under an allowed directory, add an explicit schema allowlist, or remove it`
    );
  }
  validateLayoutLimits(changeDir, schema, mode, errors, warnings, strictLayout);
}

function inventoryChange(changeDir, schema, mode, includeSuggestions = false) {
  const expectedFiles = [];
  const unexpectedFiles = [];
  for (const filePath of walkFiles(changeDir)) {
    const relPath = path.relative(changeDir, filePath).split(path.sep).join("/");
    const [status, reason] = layoutFileStatus(schema, mode, relPath);
    const entry = { path: relPath, status, reason };
    if (status === "expected") {
      expectedFiles.push(entry);
    } else {
      entry.severity = "error";
      if (includeSuggestions) {
        entry.suggested_destination = suggestedDestination(schema, relPath);
      }
      unexpectedFiles.push(entry);
    }
  }
  return { expected_files: expectedFiles, unexpected_files: unexpectedFiles };
}

function layoutFileStatus(schema, mode, relPath) {
  const layout = schema.layout ?? {};
  const allowedFiles = new Set(layout.allowed_files_by_mode?.[mode] ?? []);
  const allowedDirectories = new Set(layout.allowed_directories_by_mode?.[mode] ?? []);
  if (mode === "structured_proposal" && Object.hasOwn(LEGACY_TOP_LEVEL_CHANGE_FILES, relPath)) {
    return ["expected", "legacy top-level migration input; validator warning owns migration"];
  }
  if (allowedFiles.has(relPath)) {
    return ["expected", "allowed file for mode"];
  }
  const directory = relPath.split("/", 1)[0];
  if (managedJsonEvidenceDirectories().has(directory)) {
    if (globMatch(relPath, "review-runs/**/*.json")) {
      return ["expected", "allowed review-run JSON evidence record"];
    }
    return ["expected", "allowed review-run JSON evidence directory entry"];
  }
  if (managedChangeDirectories().has(directory)) {
    if (relPath === `${directory}/README.md` || globMatch(relPath, `${directory}/*.md`)) {
      return ["expected", "allowed v2 managed directory file"];
    }
    return ["unexpected", "file is under a v2 managed directory but does not match allowed patterns"];
  }
  if (allowedDirectories.has(directory)) {
    if ((layout.allowed_patterns ?? []).some((pattern) => globMatch(relPath, pattern))) {
      return ["expected", "allowed file under allowed directory"];
    }
    return ["unexpected", "file is under an allowed directory but does not match allowed patterns"];
  }
  if (relPath.includes("/")) {
    return ["unexpected", "file is under an unexpected directory for mode"];
  }
  return ["unexpected", "top-level file is not part of the change artifact contract"];
}

function validateLayoutLimits(changeDir, schema, mode, errors, warnings, strictLayout) {
  const layout = schema.layout ?? {};
  const files = walkFiles(changeDir);
  const maxFiles = layout.max_files_by_mode?.[mode];
  if (maxFiles !== undefined && files.length > maxFiles) {
    appendLayoutIssue(errors, warnings, strictLayout, `${changeDir}: too many change workspace files: ${files.length} > ${maxFiles} for ${mode}`);
  }
  const topLevelCount = files.filter((filePath) => path.dirname(filePath) === changeDir).length;
  const maxTopLevel = layout.max_top_level_files_by_mode?.[mode];
  if (maxTopLevel !== undefined && topLevelCount > maxTopLevel) {
    appendLayoutIssue(errors, warnings, strictLayout, `${changeDir}: too many top-level change workspace files: ${topLevelCount} > ${maxTopLevel} for ${mode}`);
  }
  for (const [relDir, maxDirFiles] of Object.entries(layout.max_files_by_directory ?? {})) {
    const directory = path.join(changeDir, relDir);
    if (!fs.existsSync(directory)) {
      continue;
    }
    const count = walkFiles(directory).length;
    if (count > maxDirFiles) {
      appendLayoutIssue(errors, warnings, strictLayout, `${directory}: too many files: ${count} > ${maxDirFiles}`);
    }
  }
}

function buildStatusReport(repoRoot, targets, schema, options = {}) {
  const changes = [];
  const allErrors = [];
  const allWarnings = [];
  for (const target of targets) {
    const { mode, errors, warnings } = validateChange(target, schema, options.strictLayout ?? false, {
      worktrees: options.worktrees ?? false
    });
    const artifacts = statusArtifacts(target, schema, mode);
    const missingRequired = artifacts
      .filter((artifact) => artifact.required && artifact.status === "missing")
      .map((artifact) => artifact.path);
    const changeReport = {
      change_id: path.basename(target),
      path: target,
      mode,
      artifacts,
      missing_required: missingRequired,
      errors,
      warnings,
      next_action: nextAction(errors, warnings)
    };
    if (options.includeInventory) {
      Object.assign(changeReport, inventoryChange(target, schema, mode, options.includeSuggestions ?? false));
    }
    changeReport.execution_map = executionMapSummary(target, options.worktrees ?? false);
    changes.push(changeReport);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }
  return {
    repo_root: repoRoot,
    summary: {
      validated_changes: targets.length,
      errors: allErrors.length,
      warnings: allWarnings.length
    },
    changes
  };
}

function statusArtifacts(changeDir, schema, mode) {
  const required = [];
  const optional = [];
  const v2 = isV2Workspace(changeDir);
  if (mode === "plan_only") {
    required.push("plan.md");
    optional.push("research.md", "tasks.md");
    if (v2) {
      optional.push("tasks/", "decisions/", "reviews/", "timeline/");
    } else {
      optional.push("review-log.md", "timeline.md");
    }
  } else {
    required.push("proposal.md");
    if (fs.existsSync(path.join(changeDir, "tasks", "README.md"))) {
      required.push("tasks/");
      optional.push("tasks.md");
    } else {
      required.push("tasks.md");
    }
    optional.push("design.md", "requirements.md");
    if (v2) {
      optional.push("decisions/", "reviews/", "timeline/");
    } else {
      optional.push("review-log.md", "timeline.md");
    }
  }
  if (mode === "structured_proposal") {
    required.push(...(schema.structured_proposal?.required_files ?? []));
    for (const relPath of schema.structured_proposal?.warning_files ?? []) {
      if (!required.includes(relPath)) {
        optional.push(relPath);
      }
    }
    for (const [directory, requiredFiles] of Object.entries(schema.structured_proposal?.required_if_directory_exists ?? {})) {
      if (fs.existsSync(path.join(changeDir, directory))) {
        required.push(...requiredFiles);
      }
    }
  }
  if (fs.existsSync(path.join(changeDir, "specs")) && !optional.includes("specs/")) {
    optional.push("specs/");
  }
  if (fs.existsSync(path.join(changeDir, "implementation-design")) && !optional.includes("implementation-design/")) {
    optional.push("implementation-design/");
  }
  if (fs.existsSync(path.join(changeDir, "execution-map.md")) && !optional.includes("execution-map.md")) {
    optional.push("execution-map.md");
  }
  const seen = new Set();
  return [
    ...required.map((relPath) => statusArtifact(changeDir, relPath, true, seen)),
    ...optional.map((relPath) => statusArtifact(changeDir, relPath, false, seen))
  ].filter(Boolean);
}

function statusArtifact(changeDir, relPath, required, seen) {
  if (seen.has(relPath)) {
    return null;
  }
  seen.add(relPath);
  return {
    path: relPath,
    required,
    status: fs.existsSync(path.join(changeDir, relPath)) ? "present" : "missing"
  };
}

function buildMemoryReport(repoRoot, strictMemory) {
  const memoryRoot = path.join(repoRoot, ".memory");
  const indexPath = path.join(memoryRoot, "INDEX.md");
  const errors = [];
  const warnings = [];
  const entries = [];
  if (!fs.existsSync(indexPath)) {
    errors.push(`${indexPath}: missing required file`);
    return {
      repo_root: repoRoot,
      memory_root: memoryRoot,
      summary: { errors: errors.length, warnings: warnings.length },
      errors,
      warnings,
      entries,
      next_action: nextAction(errors, warnings)
    };
  }
  const registry = markdownTableAfterHeading(readText(indexPath), "Memory Tag Registry");
  const indexText = readText(indexPath);
  const v2Mode = registry.length > 0;
  const allowedTags = new Set(registry.map((row) => stripBackticks(row.tag ?? "")).filter(Boolean));
  if (registry.length === 0) {
    const message = `${indexPath}: missing Memory Tag Registry`;
    if (strictMemory) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }
  for (const filePath of walkFiles(memoryRoot, (entry) => entry.endsWith(".md"))) {
    const relPath = path.relative(memoryRoot, filePath).split(path.sep).join("/");
    if (relPath === "INDEX.md") {
      continue;
    }
    const meta = parseFrontMatter(filePath) ?? {};
    const metadataMissing = requiredMemoryFieldsMissing(meta);
    if (metadataMissing.length > 0) {
      const message = `${filePath}: missing memory metadata fields: ${metadataMissing.join(", ")}`;
      if (strictMemory) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
    if (v2Mode && !indexText.includes(`\`${relPath}\``) && !indexText.includes(relPath)) {
      errors.push(`${indexPath}: missing memory index entry for ${relPath}`);
    }
    for (const tag of splitTags(meta.tags)) {
      if (v2Mode && !allowedTags.has(tag)) {
        errors.push(`${filePath}: unknown memory tag ${tag}`);
      }
    }
    entries.push({ path: relPath, artifact: meta.artifact, status: meta.status });
  }
  return {
    repo_root: repoRoot,
    memory_root: memoryRoot,
    summary: { errors: errors.length, warnings: warnings.length },
    errors,
    warnings,
    entries,
    next_action: nextAction(errors, warnings)
  };
}

function requiredMemoryFieldsMissing(meta) {
  return ["artifact", "status", "tags", "last_verified", "source_revision", "description"].filter(
    (field) => !meta[field]
  );
}

function splitTags(value) {
  if (!value) {
    return [];
  }
  const text = String(value).trim();
  const inner = text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
  return inner
    .split(",")
    .map((tag) => stripBackticks(tag.trim().replace(/^["']|["']$/g, "")))
    .filter(Boolean);
}

function stripBackticks(value) {
  return String(value).trim().replace(/^`|`$/g, "");
}

function printStatusText(report) {
  for (const change of report.changes) {
    process.stdout.write(
      `STATUS: ${change.change_id}: mode=${change.mode} next_action=${change.next_action} errors=${change.errors.length} warnings=${change.warnings.length}\n`
    );
    for (const relPath of change.missing_required) {
      process.stdout.write(`MISSING: ${change.change_id}: ${relPath}\n`);
    }
  }
  process.stdout.write(
    `STATUS: validated_changes=${report.summary.validated_changes} errors=${report.summary.errors} warnings=${report.summary.warnings}\n`
  );
}

function printInventoryText(report) {
  for (const change of report.changes) {
    process.stdout.write(
      `INVENTORY: ${change.change_id}: expected=${change.expected_files?.length ?? 0} unexpected=${change.unexpected_files?.length ?? 0}\n`
    );
    for (const entry of change.unexpected_files ?? []) {
      process.stdout.write(`UNEXPECTED: ${change.change_id}: ${entry.path}: ${entry.reason}\n`);
      if (entry.suggested_destination?.destination) {
        process.stdout.write(
          `SUGGEST: ${change.change_id}: ${entry.path} -> ${entry.suggested_destination.destination}: ${entry.suggested_destination.reason} (basis=${entry.suggested_destination.basis})\n`
        );
      }
    }
  }
}

function printMemoryText(report, strictMemory) {
  process.stdout.write(
    `MEMORY: errors=${report.summary.errors} warnings=${report.summary.warnings} next_action=${report.next_action}\n`
  );
  if (report.next_action !== "ready") {
    process.stdout.write(`GUIDE: memory: ${memoryGuidanceFor(report.next_action, strictMemory)}\n`);
  }
  for (const error of report.errors) {
    process.stdout.write(`ERROR: ${error}\n`);
  }
  for (const warning of report.warnings) {
    process.stdout.write(`WARN: ${warning}\n`);
  }
}

function validateHeadings(filePath, headings, errors) {
  const text = readText(filePath);
  for (const heading of headings) {
    if (!text.includes(heading)) {
      errors.push(`${filePath}: missing heading ${heading}`);
    }
  }
}

function parseTable(lines) {
  if (lines.length < 2) {
    return [];
  }
  const headers = splitTableRow(lines[0]);
  return lines.slice(2).map((line) => {
    const cells = splitTableRow(line);
    while (cells.length < headers.length) {
      cells.push("");
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

function expectedChildKey(directory, filename) {
  if (directory === "decisions") {
    return filename.match(/^DR-(\d{3})-/)?.[1] ?? null;
  }
  if (directory === "reviews") {
    return filename.match(/-(r\d{2})\.md$/)?.[1] ?? null;
  }
  if (directory === "tasks") {
    return filename.match(/^slice-(\d{3})-/)?.[1] ?? null;
  }
  if (directory === "timeline") {
    return filename.match(/^(\d{4}-\d{2}-\d{2}-\d{3})-/)?.[1] ?? null;
  }
  return null;
}

function globMatch(value, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "__DOUBLE_STAR__")
    .replaceAll("*", "[^/]*")
    .replaceAll("__DOUBLE_STAR__", ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function suggestedDestination(schema, relPath) {
  const basename = path.basename(relPath);
  for (const rule of schema.layout?.suggested_destinations ?? []) {
    if (globMatch(relPath, rule.pattern) || globMatch(basename, rule.pattern)) {
      return {
        destination: rule.destination ?? "research.md",
        reason: "candidate destination based only on path or filename; read the file before deciding",
        basis: "path_or_filename_only",
        matched_pattern: rule.pattern,
        rule_reason: rule.reason ?? "review and consolidate this file"
      };
    }
  }
  return {
    destination: null,
    reason: "no content-aware destination can be inferred; read the file and choose the owning artifact",
    basis: "none",
    matched_pattern: null,
    rule_reason: "no filename rule matched"
  };
}

function appendLayoutIssue(errors, warnings, strictLayout, message) {
  if (strictLayout) {
    errors.push(message);
  } else {
    warnings.push(message);
  }
}

function nextAction(errors, warnings) {
  if (errors.length > 0) {
    return "fix_errors";
  }
  if (warnings.length > 0) {
    return "review_warnings";
  }
  return "ready";
}

function guidanceFor(action, strictLayout) {
  if (action === "fix_errors") {
    return "fix errors before freezing, committing, or handing off this change workspace";
  }
  if (action === "review_warnings") {
    if (strictLayout) {
      return "strict layout is enabled; resolve warnings that remain after fixing errors";
    }
    return "warnings require review before freeze; inspect unexpected files before choosing consolidation, allowlist, move, or removal; rerun with --strict-layout to enforce failure";
  }
  return "no validator action required";
}

function memoryGuidanceFor(action, strictMemory) {
  if (action === "fix_errors") {
    return "fix memory errors before promoting, freezing, or handing off durable knowledge";
  }
  if (action === "review_warnings") {
    if (strictMemory) {
      return "strict memory is enabled; resolve warnings that remain after fixing errors";
    }
    return "warnings require review before memory promotion; verify source facts and metadata; rerun with --strict-memory to enforce failure";
  }
  return "no memory validator action required";
}
