import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, printJson } from "../cli/args.js";
import {
  ARTIFACTS,
  CHANGE_CHILD_DIRECTORIES,
  globalTagAllowed,
  managedChangeDirectories,
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
  const migration = readMigrationTransaction(changeDir, errors);
  const mode = detectMode(changeDir, migration);
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
  validateMigrationTransaction(changeDir, migration, errors);
  validateBootstrapControls(changeDir, errors, warnings);
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

function detectMode(changeDir, migration = null) {
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
  if (hasTaskRegistry && structuredMarkers.some((entry) => fs.existsSync(entry)) && (!migration || migration.state === "committed")) {
    return "structured_proposal";
  }
  if (hasPlan && !hasProposal && !hasSpecs) {
    return "plan_only";
  }
  return "legacy_proposal";
}

function readMigrationTransaction(changeDir, errors) {
  const transactionPath = migrationTransactionPath(changeDir);
  if (!fs.existsSync(transactionPath)) {
    return null;
  }
  try {
    return JSON.parse(readText(transactionPath));
  } catch {
    errors.push(`${transactionPath}: migration transaction is unreadable`);
    return { state: "invalid" };
  }
}

function validateMigrationTransaction(changeDir, transaction, errors) {
  if (!transaction) {
    return;
  }
  const changeId = path.basename(changeDir);
  const stateRoot = canonicalPath(path.resolve(changeDir, "..", ".."));
  if (transaction.change_id !== changeId) {
    errors.push(`${migrationTransactionPath(changeDir)}: transaction change_id does not match workspace`);
  }
  if (transaction.state_root !== stateRoot) {
    errors.push(`${migrationTransactionPath(changeDir)}: transaction state_root does not match resolved state root`);
  }
  if (!new Set(["prepared", "applying", "committed", "interrupted", "rolled-back"]).has(transaction.state)) {
    errors.push(`${migrationTransactionPath(changeDir)}: invalid migration transaction state ${transaction.state ?? "<missing>"}`);
    return;
  }
  if (transaction.state !== "committed") {
    errors.push(`${migrationTransactionPath(changeDir)}: migration transaction is ${transaction.state}; validation fails closed until a migration commits`);
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(transaction.plan_sha256 ?? "")) {
    errors.push(`${migrationTransactionPath(changeDir)}: committed migration is missing plan_sha256`);
  }
  const plan = validateCommittedMigrationPlan(changeDir, transaction, errors);
  const destinations = new Map();
  if (!Array.isArray(transaction.destination_manifest) || transaction.destination_manifest.length === 0) {
    errors.push(`${migrationTransactionPath(changeDir)}: committed migration is missing destination_manifest`);
  } else {
    for (const destination of transaction.destination_manifest) {
      if (
        !destination ||
        typeof destination !== "object" ||
        !validRelativePath(destination.path) ||
        !/^[a-f0-9]{64}$/.test(destination.sha256 ?? "")
      ) {
        errors.push(`${migrationTransactionPath(changeDir)}: invalid committed destination entry`);
        continue;
      }
      destinations.set(destination.path, destination.sha256);
    }
  }
  for (const required of ["README.md", "specs/README.md", "decisions/README.md", "reviews/README.md", "tasks/README.md"]) {
    if (!fs.existsSync(path.join(changeDir, required))) {
      errors.push(`${path.join(changeDir, required)}: committed migration structured artifact is missing`);
    }
  }
  const stateRootArchive = path.join(stateRoot, ".changes", "archive", changeId, "legacy");
  for (const source of plan?.legacy_sources ?? []) {
    const archivePath = path.join(stateRootArchive, source.path);
    if (!fs.existsSync(archivePath) || sha256File(archivePath) !== source.sha256) {
      errors.push(`${archivePath}: committed migration archive is missing or digest-mismatched`);
      continue;
    }
    validateArchivedFrozenReviewRounds(archivePath, source, errors);
  }
  const provenancePath = transaction.provenance_path ?? "decisions/DR-001-migration-provenance.md";
  const provenanceHash = destinations.get(provenancePath);
  const provenance = path.join(changeDir, provenancePath);
  if (
    provenancePath !== "decisions/DR-001-migration-provenance.md" ||
    !provenanceHash ||
    !fs.existsSync(provenance) ||
    sha256File(provenance) !== provenanceHash
  ) {
    errors.push(`${migrationTransactionPath(changeDir)}: committed migration provenance is missing or outside the owned decision path`);
  } else if (plan && !provenanceIncludesArchivedEvidence(readText(provenance), plan.legacy_sources)) {
    errors.push(`${provenance}: committed migration provenance does not bind archived legacy evidence`);
  }
}

function validateCommittedMigrationPlan(changeDir, transaction, errors) {
  const transactionPath = migrationTransactionPath(changeDir);
  const changeId = path.basename(changeDir);
  const stateRoot = canonicalPath(path.resolve(changeDir, "..", ".."));
  const plan = transaction.plan;
  if (!plan || typeof plan !== "object") {
    errors.push(`${transactionPath}: committed migration is missing accepted plan`);
    return null;
  }
  const { plan_sha256: planHash, ...unsignedPlan } = plan;
  if (
    plan.change_id !== changeId ||
    plan.state_root !== stateRoot ||
    !/^[a-f0-9]{64}$/.test(planHash ?? "") ||
    sha256Text(canonicalJson(unsignedPlan)) !== planHash ||
    transaction.plan_sha256 !== planHash
  ) {
    errors.push(`${transactionPath}: committed migration plan does not bind the selected change and state root`);
    return null;
  }
  if (
    !Array.isArray(plan.source_inventory) ||
    !Array.isArray(plan.destination_manifest) ||
    !Array.isArray(plan.legacy_sources) ||
    canonicalJson(transaction.source_inventory) !== canonicalJson(plan.source_inventory) ||
    canonicalJson(transaction.destination_manifest) !== canonicalJson(plan.destination_manifest) ||
    canonicalJson(transaction.legacy_sources) !== canonicalJson(plan.legacy_sources)
  ) {
    errors.push(`${transactionPath}: committed migration fields do not match the accepted plan`);
    return null;
  }
  if (
    !validateMigrationPlanPaths(plan.source_inventory, "source inventory", transactionPath, errors) ||
    !validateMigrationPlanPaths(plan.destination_manifest, "destination manifest", transactionPath, errors)
  ) {
    return null;
  }
  const expectedLegacy = new Map([
    ["review-log.md", "reviews"],
    ["timeline.md", "timeline"],
    ["tasks.md", "tasks"]
  ]);
  const sourceHashes = new Map(plan.source_inventory.map((entry) => [entry.path, entry.sha256]));
  const seenLegacy = new Set();
  for (const source of plan.legacy_sources) {
    if (
      !source ||
      typeof source !== "object" ||
      !expectedLegacy.has(source.path) ||
      seenLegacy.has(source.path) ||
      source.target_directory !== expectedLegacy.get(source.path) ||
      source.archive_path !== `.changes/archive/${changeId}/legacy/${source.path}` ||
      sourceHashes.get(source.path) !== source.sha256
    ) {
      errors.push(`${transactionPath}: invalid committed archived legacy source entry`);
      return null;
    }
    if (source.path === "review-log.md") {
      if (!validateFrozenReviewRounds(source.frozen_review_rounds, transactionPath, errors)) {
        return null;
      }
    } else if (Object.hasOwn(source, "frozen_review_rounds")) {
      errors.push(`${transactionPath}: unexpected frozen review round evidence`);
      return null;
    }
    seenLegacy.add(source.path);
  }
  return plan;
}

function validateMigrationPlanPaths(entries, label, transactionPath, errors) {
  const seen = new Set();
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !validRelativePath(entry.path) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "") ||
      seen.has(entry.path)
    ) {
      errors.push(`${transactionPath}: invalid committed ${label} entry`);
      return false;
    }
    seen.add(entry.path);
  }
  return true;
}

function validateFrozenReviewRounds(rounds, transactionPath, errors) {
  if (!Array.isArray(rounds)) {
    errors.push(`${transactionPath}: committed migration is missing frozen review round evidence`);
    return false;
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
      errors.push(`${transactionPath}: invalid committed frozen review round evidence`);
      return false;
    }
    seen.add(round.decision_id);
  }
  return true;
}

function validateArchivedFrozenReviewRounds(archivePath, source, errors) {
  if (source.path !== "review-log.md") {
    return;
  }
  let actual;
  try {
    actual = extractFrozenReviewRounds(readText(archivePath));
  } catch (error) {
    errors.push(`${archivePath}: ${error.message}`);
    return;
  }
  if (canonicalJson(actual) !== canonicalJson(source.frozen_review_rounds)) {
    errors.push(`${archivePath}: frozen review round evidence is missing or digest-mismatched`);
  }
}

function extractFrozenReviewRounds(text) {
  const normalized = normalizeLf(text);
  const headers = [...normalized.matchAll(/^## Review Round\b[^\n]*$/gm)];
  const seen = new Set();
  const rounds = [];
  for (let index = 0; index < headers.length; index += 1) {
    const roundText = canonicalFrozenReviewRoundText(
      normalized.slice(headers[index].index, headers[index + 1]?.index ?? normalized.length)
    );
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

function provenanceIncludesArchivedEvidence(text, legacySources) {
  return legacySources.every((source) =>
    text.includes(`| \`${source.path}\` | \`${source.archive_path}\` | \`${source.sha256}\` |`) &&
    (source.frozen_review_rounds ?? []).every((round) =>
      text.includes(`| \`${source.path}\` | \`${round.decision_id}\` | \`${round.sha256}\` |`)
    )
  );
}

function migrationTransactionPath(changeDir) {
  return path.join(changeDir, "..", ".control", "migrations", path.basename(changeDir), "current.json");
}

function validateBootstrapControls(changeDir, errors, warnings) {
  const repoRoot = canonicalPath(path.resolve(changeDir, "..", ".."));
  const registries = readBootstrapRegistries(repoRoot);
  const active = registries.filter((registry) => registry.errors.length === 0 && registry.event?.state !== "revoked");
  if (active.length > 1) {
    errors.push(`${path.join(repoRoot, ".changes", ".control")}: state root has multiple active bootstrap authorities`);
  }
  for (const registry of registries) {
    const currentPath = path.join(registry.directory, "current.json");
    for (const error of registry.errors) {
      errors.push(`${currentPath}: bootstrap control ${error}`);
    }
    if (registry.errors.length === 0 && ["scoped", "consumed", "revoked"].includes(registry.event.state)) {
      try {
        if (["scoped", "consumed"].includes(registry.event.state)) {
          validateBootstrapScopeEvidence(repoRoot, registry);
        }
        if (registry.event.state === "consumed") {
          validateBootstrapConsumedEvidence(repoRoot, registry);
        }
        if (registry.event.state === "revoked") {
          validateBootstrapRevocationEvidence(repoRoot, registry);
        }
      } catch (error) {
        errors.push(`${currentPath}: bootstrap evidence ${error.message}`);
      }
    }
    if (
      registry.errors.length === 0 &&
      registry.event.originating_change_id === path.basename(changeDir) &&
      ["claimed", "scoped"].includes(registry.event.state)
    ) {
      warnings.push(`${currentPath}: nonterminal historical bootstrap control debt (${registry.event.state}); it does not authorize or block migration apply`);
    }
  }
}

function readBootstrapRegistries(repoRoot) {
  const controlRoot = path.join(repoRoot, ".changes", ".control");
  if (!fs.existsSync(controlRoot)) {
    return [];
  }
  return fs
    .readdirSync(controlRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && validBootstrapRegistryId(entry.name))
    .map((entry) => readBootstrapRegistry(repoRoot, entry.name));
}

function readBootstrapRegistry(repoRoot, registryId) {
  const directory = path.join(repoRoot, ".changes", ".control", registryId);
  const authorityId = bootstrapAuthorityId(registryId);
  const currentPath = path.join(directory, "current.json");
  const result = { directory, registry_id: registryId, current: null, event: null, errors: [] };
  if (!fs.existsSync(currentPath)) {
    result.errors.push("current.json is missing");
    return result;
  }
  try {
    result.current = JSON.parse(readText(currentPath));
  } catch {
    result.errors.push("current.json is unreadable");
    return result;
  }
  const current = result.current;
  if (
    !current ||
    !validBootstrapEventPath(current.event) ||
    !validSha256(current.event_sha256) ||
    !Number.isInteger(current.generation) ||
    !validBootstrapState(current.state)
  ) {
    result.errors.push("current.json is malformed");
    return result;
  }
  const eventPath = path.join(directory, current.event);
  if (!fs.existsSync(eventPath) || !matchesBootstrapEventDigest(eventPath, current.event_sha256)) {
    result.errors.push("current event is missing or digest-mismatched");
    return result;
  }
  try {
    const raw = readText(eventPath);
    result.event = JSON.parse(raw);
    if (!isCanonicalJsonText(raw, result.event)) {
      result.errors.push("current event is not canonical JSON");
    }
  } catch {
    result.errors.push("current event is unreadable");
    return result;
  }
  const event = result.event;
  if (
    event.bootstrap_id !== authorityId ||
    event.generation !== current.generation ||
    event.state !== current.state ||
    event.state_root_realpath !== repoRoot ||
    !validChangeId(event.originating_change_id)
  ) {
    result.errors.push("current event does not bind bootstrap identity, generation, state root, and originating change");
    return result;
  }
  if (event.state === "claimed") {
    if (event.generation !== 1 || !validSha256(event.claim_spec_digest) || !validIdentifier(event.owner) || !validGateRef(event.authority_ref, event.originating_change_id)) {
      result.errors.push("claimed event is malformed");
    }
    return result;
  }
  const claim = readBootstrapEvent(directory, 1, "claimed");
  if (!claim || claim.bootstrap_id !== authorityId || claim.originating_change_id !== event.originating_change_id || claim.state_root_realpath !== event.state_root_realpath) {
    result.errors.push("bootstrap lifecycle is missing a matching claimed event");
  }
  if (event.state === "scoped") {
    const claimPath = path.join(directory, "events", "000001-claimed.json");
    if (
      event.generation !== 2 ||
      !validSha256(event.authority_event_sha256) ||
      !validSha256(event.scope_manifest_sha256) ||
      !validSha256(event.predecessor_snapshot_sha256 ?? event.source_inventory_sha256) ||
      !validGitObjectId(event.base_commit) ||
      typeof event.rollback_boundary !== "string" ||
      !validGateRef(event.scope_gate_ref, event.originating_change_id) ||
      !claim ||
      !matchesBootstrapEventDigest(claimPath, event.authority_event_sha256)
    ) {
      result.errors.push("scoped event is malformed or not bound to its claim");
    }
    return result;
  }
  const scoped = readBootstrapEvent(directory, 2, "scoped");
  const scopedPath = path.join(directory, "events", "000002-scoped.json");
  const priorScopeHash = event.scope_event_sha256 ?? event.prior_event_sha256;
  if (!scoped || event.generation !== 3 || !matchesBootstrapEventDigest(scopedPath, priorScopeHash)) {
    result.errors.push("terminal event is not bound to the scoped event");
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
      result.errors.push("consumed event is malformed");
    }
  } else if (typeof event.reason !== "string" || !event.reason) {
    result.errors.push("revoked event is missing its terminal reason");
    } else if (Object.hasOwn(event, "revoke_gate_ref")) {
      if (!validGateRef(event.revoke_gate_ref, event.originating_change_id, "NOT_READY")) {
        result.errors.push("revoked event has malformed revocation evidence");
      }
    } else if (!isLegacyBootstrapRevocation(registryId, event)) {
      result.errors.push("revoked event is missing revocation evidence");
  }
  return result;
}

function validateBootstrapConsumedEvidence(repoRoot, registry) {
  const scopeEvidence = validateBootstrapScopeEvidence(repoRoot, registry);
  const event = registry.event;
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

function validateBootstrapRevocationEvidence(repoRoot, registry) {
  const event = registry.event;
  if (!Object.hasOwn(event, "revoke_gate_ref")) {
    if (isLegacyBootstrapRevocation(registry.registry_id, event)) {
      return;
    }
    throw new Error("revoked bootstrap is missing its frozen revoke review");
  }
  const reviewText = bootstrapReviewText(repoRoot, event.originating_change_id);
  const round = frozenReviewRound(reviewText, event.revoke_gate_ref.decision_id, "NOT_READY");
  if (event.revoke_gate_ref.artifact_sha256 !== round.sha256) {
    throw new Error("revoked bootstrap does not bind its revoke review");
  }
}

function validateBootstrapScopeEvidence(repoRoot, registry) {
  const currentEvent = registry.event;
  const event = currentEvent.state === "scoped" ? currentEvent : readBootstrapEvent(registry.directory, 2, "scoped");
  if (!event || !validSha256(event.scope_manifest_sha256)) {
    throw new Error("bootstrap scope evidence is unavailable");
  }
  const claim = readBootstrapEvent(registry.directory, 1, "claimed");
  const reviewText = bootstrapReviewText(repoRoot, event.originating_change_id);
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
    claimSpec.state_root_realpath !== repoRoot
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
    manifest.code_root_realpath !== repoRoot ||
    manifest.originating_change_id !== event.originating_change_id ||
    manifest.predecessor_snapshot_sha256 !== event.predecessor_snapshot_sha256 ||
    manifest.executor_id !== authorityIdentity.executor_id ||
    manifest.reviewer_id !== authorityIdentity.reviewer_id ||
    manifest.executor_id !== scopeIdentity.executor_id ||
    manifest.reviewer_id !== scopeIdentity.reviewer_id ||
    !Array.isArray(manifest.source_paths) ||
    canonicalJson([...manifest.source_paths].sort()) !== canonicalJson(manifest.source_paths) ||
    new Set(manifest.source_paths).size !== manifest.source_paths.length ||
    !manifest.source_paths.every(validRelativePath)
  ) {
    throw new Error("scoped bootstrap does not bind its frozen manifest and predecessor snapshot");
  }
  if (gitStdout(repoRoot, ["rev-parse", "HEAD"]) !== event.base_commit) {
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

function bootstrapReviewText(repoRoot, changeId) {
  const active = path.join(repoRoot, ".changes", changeId, "review-log.md");
  const archived = path.join(repoRoot, ".changes", "archive", changeId, "legacy", "review-log.md");
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
  const match = text.match(new RegExp(`^### ${escapeRegExp(heading)}\\s*\\n\\s*\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``, "m"));
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
  for (const relPath of gitStdout(repoRoot, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) {
    if (!isGeneratedRuntimePath(relPath)) {
      changed.add(relPath);
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function validBootstrapRegistryId(value) {
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

function validRelativePath(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("\\") && !path.isAbsolute(value) && !value.split("/").some((part) => !part || part === "." || part === "..");
}

function canonicalPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
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
    return value.map((item) => canonicalValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
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
