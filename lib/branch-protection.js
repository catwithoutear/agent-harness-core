import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const WORKFLOW_PATH = ".github/workflows/verify.yml";
export const RULESET_NAME = "agent-harness-core integration branch";
export const REQUIRED_APPROVING_REVIEW_COUNT = 0;
export const DEFAULT_BRANCH = "main";

const MODES = new Set(["classic", "ruleset"]);
const REPO_SEGMENT = /^[A-Za-z0-9_.-]+$/u;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/u;

export class BranchProtectionError extends Error {
  constructor(message, { exitCode = 2 } = {}) {
    super(message);
    this.name = "BranchProtectionError";
    this.exitCode = exitCode;
  }
}

export function usage() {
  return [
    "harness-branch-protection [options]",
    "",
    "  --repo <owner/name>     GitHub repository; default: resolved from origin",
    "  --branch <name>         protected branch; default: main",
    "  --mode classic|ruleset  protection mechanism; default: classic",
    "  --dry-run               print the plan without changing remote state (default)",
    "  --apply                 apply protection; needs an authenticated gh with admin rights",
    "  --check                 read current protection and report drift; exit 1 on drift",
    "  --force                 with --apply classic, replace stronger existing protection",
    "  --json                  machine-readable JSON output",
    "  --help                  show this text",
    "",
    `Required status checks are the job names in ${WORKFLOW_PATH}.`,
    "The baseline enforces the same rules for administrators and configures no bypass actors.",
    "--apply replaces the full classic protection settings object.",
    "Ruleset mode updates the existing ruleset by name, or creates it when absent."
  ].join("\n");
}

/**
 * Parse the `jobs:` block of the verification workflow.
 *
 * GitHub Actions runs one check per job, so job names are the required check
 * names. Parsing the small structural slice keeps the workflow as the single
 * source of truth without adding a YAML dependency.
 */
export function parseWorkflow(text, source = WORKFLOW_PATH) {
  const lines = String(text).split("\n");
  const start = lines.findIndex((line) => /^jobs:\s*$/u.test(line));
  if (start === -1) {
    throw new BranchProtectionError(`jobs block not found in ${source}`);
  }
  const jobs = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") {
      continue;
    }
    if (/^\S/u.test(line)) {
      break;
    }
    const match = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/u);
    if (match) {
      current = { name: match[1], body: [] };
      jobs.push(current);
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }
  if (jobs.length === 0) {
    throw new BranchProtectionError(`no jobs found in ${source}`);
  }
  const names = jobs.map((job) => job.name);
  if (new Set(names).size !== names.length) {
    throw new BranchProtectionError(`duplicate job names in ${source}`);
  }
  return { jobs, names };
}

export function requiredCheckNames(text, source = WORKFLOW_PATH) {
  return parseWorkflow(text, source).names;
}

export function readRequiredChecks(cwd = process.cwd()) {
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, WORKFLOW_PATH), "utf8");
  } catch {
    throw new BranchProtectionError(`cannot read ${WORKFLOW_PATH} under ${cwd}`);
  }
  return requiredCheckNames(text, WORKFLOW_PATH);
}

export function validateRepo(repo) {
  if (typeof repo !== "string" || repo.length === 0) {
    throw new BranchProtectionError("--repo requires a value like owner/name");
  }
  const segments = repo.split("/");
  if (segments.length !== 2) {
    throw new BranchProtectionError(`--repo must be owner/name, got ${JSON.stringify(repo)}`);
  }
  for (const segment of segments) {
    if (segment === "." || segment === ".." || !REPO_SEGMENT.test(segment)) {
      throw new BranchProtectionError(
        `--repo must be owner/name without path segments or separators, got ${JSON.stringify(repo)}`
      );
    }
  }
  return repo;
}

export function validateBranch(branch, { execGit = defaultExecGit, cwd = process.cwd() } = {}) {
  if (typeof branch !== "string" || branch.length === 0) {
    throw new BranchProtectionError("--branch requires a value");
  }
  if (
    branch.startsWith("-") ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.includes("..") ||
    branch.includes("\\") ||
    !BRANCH_PATTERN.test(branch)
  ) {
    throw new BranchProtectionError(`--branch is not a valid branch name: ${JSON.stringify(branch)}`);
  }
  const result = execGit(["check-ref-format", "--branch", branch], { cwd });
  if (result.error || result.status !== 0) {
    throw new BranchProtectionError(`--branch is not a valid git branch name: ${JSON.stringify(branch)}`);
  }
  return branch;
}

export function apiPath(...segments) {
  return segments.map((segment) => encodeURIComponent(String(segment))).join("/");
}

function repoPath(repo) {
  const [owner, name] = repo.split("/");
  return apiPath("repos", owner, name);
}

export function protectionEndpoint(repo, branch) {
  return `${repoPath(repo)}/branches/${encodeURIComponent(branch)}/protection`;
}

export function rulesetsEndpoint(repo) {
  return `${repoPath(repo)}/rulesets`;
}

export function rulesetEndpoint(repo, rulesetId) {
  return `${rulesetsEndpoint(repo)}/${encodeURIComponent(String(rulesetId))}`;
}

export function classicPayload(checks) {
  return {
    required_status_checks: { strict: true, contexts: [...checks] },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: REQUIRED_APPROVING_REVIEW_COUNT
    },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false
  };
}

export function rulesetPayload(checks, branch = DEFAULT_BRANCH) {
  return {
    name: RULESET_NAME,
    target: "branch",
    enforcement: "active",
    conditions: {
      ref_name: { include: [`refs/heads/${branch}`], exclude: [] }
    },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: REQUIRED_APPROVING_REVIEW_COUNT,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_reviews: false,
          require_last_push_approval: false,
          required_review_thread_resolution: false
        }
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: checks.map((context) => ({ context }))
        }
      }
    ]
  };
}

export function buildPlan(options, checks) {
  if (options.mode === "classic") {
    const endpoint = protectionEndpoint(options.repo, options.branch);
    return {
      action: "apply-classic-protection",
      repository: options.repo,
      branch: options.branch,
      mode: "classic",
      checks,
      dry_run: true,
      requests: [
        {
          method: "GET",
          endpoint,
          purpose: "read the current protection so --apply never weakens it silently"
        },
        {
          method: "PUT",
          endpoint,
          purpose: "replace the full protection settings object",
          body: classicPayload(checks)
        }
      ]
    };
  }
  const endpoint = rulesetsEndpoint(options.repo);
  const payload = rulesetPayload(checks, options.branch);
  return {
    action: "apply-ruleset",
    repository: options.repo,
    branch: options.branch,
    mode: "ruleset",
    ruleset_name: RULESET_NAME,
    checks,
    dry_run: true,
    requests: [
      {
        method: "GET",
        endpoint,
        purpose: "look up the ruleset by name so a repeated --apply updates it"
      },
      {
        method: "PUT",
        endpoint: `${endpoint}/{ruleset_id}`,
        purpose: "update the existing ruleset",
        when: `a ruleset named "${RULESET_NAME}" exists`,
        body: payload
      },
      {
        method: "POST",
        endpoint,
        purpose: "create the ruleset",
        when: `no ruleset named "${RULESET_NAME}" exists`,
        body: payload
      }
    ]
  };
}

function statusCheckContexts(protection) {
  const contexts = protection?.required_status_checks?.contexts;
  return Array.isArray(contexts) ? contexts : [];
}

function compareStatusChecks(checks, actual) {
  return {
    missing: checks.filter((name) => !actual.includes(name)),
    extra: actual.filter((name) => !checks.includes(name))
  };
}

/**
 * Drift between the live classic protection and the applied baseline.
 *
 * Every field the payload sets is compared exactly. Stale required contexts are
 * drift because they block every pull request. A stronger setting that `--apply`
 * refuses to erase without `--force` also shows as drift: the owner either
 * accepts the drift or replaces it explicitly.
 */
export function classifyClassicProtection(protection, checks) {
  const drift = [];
  const statusChecks = protection?.required_status_checks;
  const actual = statusCheckContexts(protection);
  const { missing, extra } = compareStatusChecks(checks, actual);

  for (const name of missing) {
    drift.push({ code: "status-check-missing", message: `missing required status check: ${name}` });
  }
  for (const name of extra) {
    drift.push({
      code: "status-check-extra",
      message: `stale required status check is not a workflow job: ${name}`
    });
  }
  if (statusChecks?.strict !== true) {
    drift.push({
      code: "status-check-strict",
      message: "required_status_checks.strict must be true"
    });
  }
  const reviews = protection?.required_pull_request_reviews;
  if (!reviews || typeof reviews !== "object") {
    drift.push({
      code: "pull-request-reviews-missing",
      message: "required_pull_request_reviews must be configured so pull requests are required"
    });
  } else if (reviews.required_approving_review_count !== REQUIRED_APPROVING_REVIEW_COUNT) {
    drift.push({
      code: "pull-request-review-count",
      message: "required_pull_request_reviews.required_approving_review_count must be "
        + `${REQUIRED_APPROVING_REVIEW_COUNT} (found ${JSON.stringify(reviews.required_approving_review_count ?? null)})`
    });
  }
  if (protection?.enforce_admins?.enabled !== true) {
    drift.push({ code: "enforce-admins", message: "enforce_admins must be true" });
  }
  if (protection?.allow_force_pushes?.enabled !== false) {
    drift.push({ code: "allow-force-pushes", message: "allow_force_pushes must be false" });
  }
  if (protection?.allow_deletions?.enabled !== false) {
    drift.push({ code: "allow-deletions", message: "allow_deletions must be false" });
  }

  return {
    ok: drift.length === 0,
    drift,
    missing,
    extra,
    observed: {
      required_status_checks: {
        strict: statusChecks?.strict === true,
        contexts: actual
      },
      required_pull_request_reviews: reviews && typeof reviews === "object"
        ? { required_approving_review_count: reviews.required_approving_review_count ?? null }
        : null,
      enforce_admins: protection?.enforce_admins?.enabled === true,
      allow_force_pushes: protection?.allow_force_pushes?.enabled === true,
      allow_deletions: protection?.allow_deletions?.enabled === true
    }
  };
}

export function classifyRuleset(detail, checks, branch) {
  const drift = [];
  const expectedRef = `refs/heads/${branch}`;
  const include = Array.isArray(detail?.conditions?.ref_name?.include)
    ? detail.conditions.ref_name.include
    : [];
  if (detail?.enforcement !== "active") {
    drift.push({
      code: "ruleset-enforcement",
      message: `ruleset enforcement must be "active" (found ${JSON.stringify(detail?.enforcement ?? null)})`
    });
  }
  if (!include.includes(expectedRef)) {
    drift.push({
      code: "ruleset-ref-mismatch",
      message: `ruleset ref_name.include must contain ${expectedRef} (found ${JSON.stringify(include)})`
    });
  }
  const rule = (detail?.rules ?? []).find((item) => item?.type === "required_status_checks");
  if (!rule) {
    drift.push({
      code: "ruleset-status-rule-missing",
      message: "ruleset is missing the required_status_checks rule"
    });
  }
  const strict = rule?.parameters?.strict_required_status_checks_policy === true;
  if (!strict) {
    drift.push({
      code: "ruleset-strict-policy",
      message: "required_status_checks.strict_required_status_checks_policy must be true"
    });
  }
  const actual = (rule?.parameters?.required_status_checks ?? [])
    .map((entry) => entry?.context)
    .filter((context) => typeof context === "string");
  const { missing, extra } = compareStatusChecks(checks, actual);
  for (const name of missing) {
    drift.push({ code: "status-check-missing", message: `missing required status check: ${name}` });
  }
  for (const name of extra) {
    drift.push({
      code: "status-check-extra",
      message: `stale required status check is not a workflow job: ${name}`
    });
  }
  return {
    ok: drift.length === 0,
    drift,
    missing,
    extra,
    observed: {
      enforcement: detail?.enforcement ?? null,
      ref_name_include: include,
      strict_required_status_checks_policy: strict,
      contexts: actual
    }
  };
}

/**
 * Settings that a full classic PUT would erase and that are stronger than the
 * payload. `--apply` aborts on these unless `--force` is passed.
 */
export function classicWeakeningReasons(protection, checks) {
  if (!protection || typeof protection !== "object") {
    return [];
  }
  const reasons = [];
  const reviews = protection.required_pull_request_reviews;
  if (reviews && typeof reviews === "object") {
    const count = reviews.required_approving_review_count ?? 0;
    if (count > REQUIRED_APPROVING_REVIEW_COUNT) {
      reasons.push(
        `required approvals (${count}) exceed the payload value (${REQUIRED_APPROVING_REVIEW_COUNT})`
      );
    }
    for (const [key, label] of [
      ["dismiss_stale_reviews", "dismiss stale reviews on push"],
      ["require_code_owner_reviews", "require code owner review"],
      ["require_last_push_approval", "require approval of the last push"]
    ]) {
      if (reviews[key] === true) {
        reasons.push(label);
      }
    }
    const dismissal = reviews.dismissal_restrictions;
    if (dismissal && typeof dismissal === "object" && hasEntries(dismissal)) {
      reasons.push("approval dismissal restrictions");
    }
  }
  if (protection.restrictions && typeof protection.restrictions === "object") {
    reasons.push("push restrictions (users, teams, or apps)");
  }
  for (const [key, label] of [
    ["required_linear_history", "required linear history"],
    ["required_signatures", "required commit signatures"],
    ["block_creations", "blocked branch creations"],
    ["required_conversation_resolution", "required conversation resolution"],
    ["lock_branch", "locked branch"],
    ["allow_fork_syncing", "fork syncing"]
  ]) {
    if (protection[key]?.enabled === true) {
      reasons.push(label);
    }
  }
  const extra = statusCheckContexts(protection).filter((name) => !checks.includes(name));
  if (extra.length > 0) {
    reasons.push(`status checks that are not workflow jobs would be dropped: ${extra.join(", ")}`);
  }
  return reasons;
}

function hasEntries(value) {
  return Object.values(value).some((entry) => Array.isArray(entry) ? entry.length > 0 : Boolean(entry));
}

function parseJson(text, context) {
  try {
    return JSON.parse(text);
  } catch {
    throw new BranchProtectionError(`cannot parse gh JSON for ${context}`);
  }
}

function ghFailure(args, result) {
  return new BranchProtectionError(
    `gh ${args.join(" ")} failed: ${String(result.stderr ?? "").trim() || `exit ${result.status}`}`
  );
}

function isNotFound(result) {
  return /HTTP 404|Not Found/iu.test(`${result.stderr ?? ""}\n${result.stdout ?? ""}`);
}

/**
 * Read a JSON payload from one `gh api` GET.
 *
 * `allowNotFound` distinguishes the expected "branch is not protected" 404 from
 * operational failures.
 */
function readJson(execGh, args, { allowNotFound = false } = {}) {
  const result = execGh(args);
  if (result.error) {
    throw new BranchProtectionError(`gh ${args.join(" ")} failed: ${result.error.message}`);
  }
  if (result.status === 0) {
    return { found: true, data: parseJson(result.stdout, args.join(" ")) };
  }
  if (allowNotFound && isNotFound(result)) {
    return { found: false, data: null };
  }
  throw ghFailure(args, result);
}

function requireSuccess(execGh, args, options, action) {
  const result = execGh(args, options);
  if (result.error) {
    throw new BranchProtectionError(`gh ${action} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw ghFailure(args, result);
  }
  const text = String(result.stdout ?? "").trim();
  return text ? parseJson(text, action) : null;
}

function readProtection(execGh, repo, branch) {
  return readJson(execGh, ["api", protectionEndpoint(repo, branch)], { allowNotFound: true });
}

export function unprotectedClassicResult(options, checks) {
  return {
    ok: false,
    mode: "classic",
    repository: options.repo,
    branch: options.branch,
    checks,
    unprotected: true,
    observed: null,
    missing: [...checks],
    extra: [],
    drift: [
      {
        code: "branch-unprotected",
        message: `branch ${options.branch} is not protected (HTTP 404)`
      }
    ]
  };
}

export function checkClassic(options, checks, { execGh }) {
  const protection = readProtection(execGh, options.repo, options.branch);
  if (!protection.found) {
    return unprotectedClassicResult(options, checks);
  }
  const classification = classifyClassicProtection(protection.data, checks);
  return {
    ok: classification.ok,
    mode: "classic",
    repository: options.repo,
    branch: options.branch,
    checks,
    unprotected: false,
    drift: classification.drift,
    missing: classification.missing,
    extra: classification.extra,
    observed: classification.observed
  };
}

export function checkRuleset(options, checks, { execGh }) {
  const endpoint = rulesetsEndpoint(options.repo);
  const list = readJson(execGh, ["api", endpoint]).data;
  const summary = (Array.isArray(list) ? list : []).find((item) => item?.name === RULESET_NAME);
  if (!summary) {
    return {
      ok: false,
      mode: "ruleset",
      repository: options.repo,
      branch: options.branch,
      ruleset_name: RULESET_NAME,
      checks,
      drift: [
        {
          code: "ruleset-missing",
          message: `ruleset "${RULESET_NAME}" is not configured for ${options.repo}`
        }
      ],
      missing: [...checks],
      extra: [],
      observed: null
    };
  }
  const detail = readJson(execGh, ["api", rulesetEndpoint(options.repo, summary.id)]).data;
  const classification = classifyRuleset(detail, checks, options.branch);
  return {
    ok: classification.ok,
    mode: "ruleset",
    repository: options.repo,
    branch: options.branch,
    ruleset_name: RULESET_NAME,
    ruleset_id: summary.id,
    checks,
    drift: classification.drift,
    missing: classification.missing,
    extra: classification.extra,
    observed: classification.observed
  };
}

export function applyClassic(options, checks, { execGh }) {
  const existing = readProtection(execGh, options.repo, options.branch);
  if (existing.found) {
    const reasons = classicWeakeningReasons(existing.data, checks);
    if (reasons.length > 0 && options.force !== true) {
      throw new BranchProtectionError(
        [
          `--apply would weaken existing protection on ${options.repo}@${options.branch}:`,
          ...reasons.map((reason) => `  - ${reason}`),
          "--apply replaces the full protection settings object; pass --force to replace these settings anyway."
        ].join("\n")
      );
    }
  }
  const endpoint = protectionEndpoint(options.repo, options.branch);
  requireSuccess(
    execGh,
    ["api", "--method", "PUT", endpoint, "--input", "-"],
    { input: classicPayload(checks) },
    `PUT ${endpoint}`
  );
  return {
    ok: true,
    action: "applied",
    mode: "classic",
    repository: options.repo,
    branch: options.branch,
    checks,
    replaced_full_settings: true,
    forced: options.force === true && existing.found
  };
}

export function applyRuleset(options, checks, { execGh }) {
  const endpoint = rulesetsEndpoint(options.repo);
  const list = readJson(execGh, ["api", endpoint]).data;
  const matches = (Array.isArray(list) ? list : []).filter((item) => item?.name === RULESET_NAME);
  if (matches.length > 1) {
    throw new BranchProtectionError(
      `found ${matches.length} rulesets named "${RULESET_NAME}"; remove the duplicates before applying`
    );
  }
  const payload = rulesetPayload(checks, options.branch);
  if (matches.length === 1) {
    const rulesetId = matches[0].id;
    const response = requireSuccess(
      execGh,
      ["api", "--method", "PUT", rulesetEndpoint(options.repo, rulesetId), "--input", "-"],
      { input: payload },
      `PUT ${rulesetEndpoint(options.repo, rulesetId)}`
    );
    return {
      ok: true,
      action: "applied",
      mode: "ruleset",
      repository: options.repo,
      branch: options.branch,
      ruleset_name: RULESET_NAME,
      ruleset_id: response?.id ?? rulesetId,
      created: false,
      checks
    };
  }
  const response = requireSuccess(
    execGh,
    ["api", "--method", "POST", endpoint, "--input", "-"],
    { input: payload },
    `POST ${endpoint}`
  );
  return {
    ok: true,
    action: "applied",
    mode: "ruleset",
    repository: options.repo,
    branch: options.branch,
    ruleset_name: RULESET_NAME,
    ruleset_id: response?.id ?? null,
    created: true,
    checks
  };
}

export function resolveRepoFromOrigin({ execGit = defaultExecGit, cwd = process.cwd() } = {}) {
  const result = execGit(["remote", "get-url", "origin"], { cwd });
  if (result.error || result.status !== 0) {
    throw new BranchProtectionError("cannot resolve repository from origin; pass --repo owner/name");
  }
  const match = String(result.stdout ?? "").trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/u);
  if (!match) {
    throw new BranchProtectionError("cannot resolve a GitHub repository from origin; pass --repo owner/name");
  }
  return validateRepo(`${match[1]}/${match[2]}`);
}

export function parseArgs(argv) {
  const options = {
    repo: null,
    branch: DEFAULT_BRANCH,
    mode: "classic",
    apply: false,
    check: false,
    dryRun: false,
    force: false,
    json: false,
    help: false
  };
  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new BranchProtectionError(`${flag} requires a value`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo") {
      options.repo = validateRepo(takeValue(index, "--repo"));
      index += 1;
    } else if (arg === "--branch") {
      options.branch = takeValue(index, "--branch");
      index += 1;
    } else if (arg === "--mode") {
      options.mode = takeValue(index, "--mode");
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("-")) {
      throw new BranchProtectionError(`unknown argument: ${arg}`);
    } else {
      throw new BranchProtectionError(`unexpected argument: ${arg}`);
    }
  }
  if (!MODES.has(options.mode)) {
    throw new BranchProtectionError("--mode must be classic or ruleset");
  }
  if (options.apply && options.check) {
    throw new BranchProtectionError("use either --apply or --check");
  }
  if (options.dryRun && (options.apply || options.check)) {
    throw new BranchProtectionError("--dry-run states the default; do not combine it with --apply or --check");
  }
  if (options.force && !options.apply) {
    throw new BranchProtectionError("--force only applies to --apply");
  }
  return options;
}

export function formatPlan(plan) {
  const lines = [
    `Repository: ${plan.repository}`,
    `Branch: ${plan.branch} (${plan.mode} protection)`,
    `Required checks: ${plan.checks.join(", ")}`,
    "Dry run: no remote state changes",
    "",
    "Requests:"
  ];
  plan.requests.forEach((request, index) => {
    const condition = request.when ? ` [${request.when}]` : "";
    lines.push(`${index + 1}. ${request.method} ${request.endpoint} - ${request.purpose}${condition}`);
  });
  return lines.join("\n");
}

export function formatCheckResult(result) {
  const lines = [
    `Protection check: ${result.repository}@${result.branch} (${result.mode})`
  ];
  if (result.ok) {
    lines.push("Result: match");
    lines.push(`Required checks: ${result.checks.join(", ")}`);
    return lines.join("\n");
  }
  lines.push("Result: drift");
  for (const item of result.drift) {
    lines.push(`- ${item.message}`);
  }
  return lines.join("\n");
}

export function formatApplyResult(result) {
  if (result.mode === "ruleset") {
    return [
      `Applied ruleset "${result.ruleset_name}" to ${result.repository}@${result.branch}`,
      `Operation: ${result.created ? "created" : `updated ruleset ${result.ruleset_id}`}`,
      `Required checks: ${result.checks.join(", ")}`
    ].join("\n");
  }
  return [
    `Applied classic protection to ${result.repository}@${result.branch}`,
    "The full protection settings object was replaced.",
    `Required checks: ${result.checks.join(", ")}`
  ].join("\n");
}

export function runBranchProtection(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const execGh = io.execGh ?? defaultExecGh;
  const execGit = io.execGit ?? defaultExecGit;
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const write = (stream, text) => stream.write(text.endsWith("\n") ? text : `${text}\n`);

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    write(stderr, `ERROR: ${error.message}`);
    return 2;
  }
  if (options.help) {
    write(stdout, usage());
    return 0;
  }
  try {
    validateBranch(options.branch, { execGit, cwd });
    if (!options.repo) {
      options.repo = resolveRepoFromOrigin({ execGit, cwd });
    }
    const checks = readRequiredChecks(cwd);
    if (options.check) {
      const result = options.mode === "classic"
        ? checkClassic(options, checks, { execGh })
        : checkRuleset(options, checks, { execGh });
      write(stdout, options.json ? JSON.stringify(result, null, 2) : formatCheckResult(result));
      return result.ok ? 0 : 1;
    }
    if (options.apply) {
      const result = options.mode === "classic"
        ? applyClassic(options, checks, { execGh })
        : applyRuleset(options, checks, { execGh });
      write(stdout, options.json ? JSON.stringify(result, null, 2) : formatApplyResult(result));
      return 0;
    }
    const plan = buildPlan(options, checks);
    write(stdout, options.json ? JSON.stringify(plan, null, 2) : formatPlan(plan));
    return 0;
  } catch (error) {
    write(stderr, `ERROR: ${error.message}`);
    return typeof error.exitCode === "number" ? error.exitCode : 2;
  }
}

export function defaultExecGh(args, { input } = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    input: input === undefined ? undefined : JSON.stringify(input),
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) {
    return { error: result.error };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function defaultExecGit(args, { cwd = process.cwd() } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) {
    return { error: result.error };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
