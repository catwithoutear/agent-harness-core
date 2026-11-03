import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RULESET_NAME,
  classicPayload,
  parseWorkflow,
  protectionEndpoint,
  requiredCheckNames,
  rulesetEndpoint,
  rulesetPayload,
  rulesetsEndpoint,
  runBranchProtection
} from "../lib/branch-protection.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(packageRoot, ".github", "workflows", "verify.yml");
const CHECKS = ["test", "manifest", "projection", "change-schema"];

export async function run(test) {
  await test("workflow defines the required jobs with runnable structure", () => {
    const text = fs.readFileSync(workflowPath, "utf8");
    const workflow = parseWorkflow(text);
    assert.deepEqual(workflow.names, CHECKS);
    assert.deepEqual(requiredCheckNames(text), CHECKS);
    for (const job of workflow.jobs) {
      const body = job.body.join("\n");
      assert.match(body, /^ {4}runs-on:/mu, `${job.name} must declare runs-on`);
      assert.match(body, /^ {4}steps:/mu, `${job.name} must declare steps`);
      assert.match(body, /^ {6}- /mu, `${job.name} must run at least one step`);
    }
    assert.match(text, /^on:\n {2}pull_request:/mu);
    assert.match(text, /^ {2}push:\n {4}branches: \[main\]/mu);
  });

  await test("projection job materializes before verifying", () => {
    const text = fs.readFileSync(workflowPath, "utf8");
    const materialize = text.indexOf("--conflict overwrite");
    const verify = text.indexOf("--verify");
    assert.notEqual(materialize, -1, "projection job must materialize a projection");
    assert.notEqual(verify, -1, "projection job must verify the projection");
    assert.ok(materialize < verify, "materialize must run before verify");
    assert.match(text, /RUNNER_TEMP\/harness-projection/u);
  });

  await test("change job uses the package schema by absolute path", () => {
    const text = fs.readFileSync(workflowPath, "utf8");
    assert.match(
      text,
      /--schema "\$GITHUB_WORKSPACE\/schemas\/change-workspace\.schema\.json"/u
    );
    assert.match(text, /--all-active/u);
  });

  await test("dry-run is the default, calls no gh command, and plans method plus endpoint", () => {
    const result = runModule(["--repo", "owner/name", "--json"], {
      execGh: () => {
        throw new Error("dry-run must not call gh");
      }
    });
    assert.equal(result.code, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.dry_run, true);
    assert.equal(plan.repository, "owner/name");
    assert.equal(plan.branch, "main");
    assert.equal(plan.mode, "classic");
    assert.deepEqual(plan.checks, CHECKS);
    assert.deepEqual(plan.requests.map((request) => request.method), ["GET", "PUT"]);
    assert.equal(plan.requests[0].endpoint, protectionEndpoint("owner/name", "main"));
    assert.equal(plan.requests[1].endpoint, protectionEndpoint("owner/name", "main"));
    assert.deepEqual(plan.requests[1].body, classicPayload(CHECKS));

    const human = runModule(["--repo", "owner/name"]);
    assert.equal(human.code, 0, human.stderr);
    assert.match(human.stdout, /GET repos\/owner\/name\/branches\/main\/protection/u);
    assert.match(human.stdout, /PUT repos\/owner\/name\/branches\/main\/protection/u);
    assert.match(human.stdout, /Required checks: test, manifest, projection, change-schema/u);
  });

  await test("dry-run reads required checks from the workflow in the working tree", () => {
    withTempDir((cwd) => {
      fs.mkdirSync(path.join(cwd, ".github", "workflows"), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, ".github", "workflows", "verify.yml"),
        ["on:", "  pull_request:", "jobs:", "  alpha:", "    runs-on: ubuntu-latest", "  beta:", "    runs-on: ubuntu-latest"].join("\n")
      );
      const result = runModule(["--repo", "owner/name", "--json"], { cwd });
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout).checks, ["alpha", "beta"]);
    });
  });

  await test("ruleset dry-run shows an idempotent update-or-create plan", () => {
    const result = runModule(["--repo", "owner/name", "--mode", "ruleset", "--json"]);
    assert.equal(result.code, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.dry_run, true);
    assert.equal(plan.mode, "ruleset");
    assert.equal(plan.ruleset_name, RULESET_NAME);
    assert.deepEqual(plan.requests.map((request) => request.method), ["GET", "PUT", "POST"]);
    assert.equal(plan.requests[0].endpoint, rulesetsEndpoint("owner/name"));
    assert.equal(plan.requests[1].endpoint, `${rulesetsEndpoint("owner/name")}/{ruleset_id}`);
    assert.equal(plan.requests[2].endpoint, rulesetsEndpoint("owner/name"));
    assert.deepEqual(plan.requests[1].body, rulesetPayload(CHECKS, "main"));
    assert.deepEqual(plan.requests[2].body, rulesetPayload(CHECKS, "main"));
    assert.match(plan.requests[1].when, /exists/u);
    assert.match(plan.requests[2].when, /no ruleset/u);
  });

  await test("payloads encode the required checks exactly", () => {
    assert.deepEqual(classicPayload(CHECKS), {
      required_status_checks: { strict: true, contexts: CHECKS },
      enforce_admins: true,
      required_pull_request_reviews: { required_approving_review_count: 0 },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false
    });

    const ruleset = rulesetPayload(CHECKS, "release/v1");
    assert.equal(ruleset.name, RULESET_NAME);
    assert.equal(ruleset.target, "branch");
    assert.equal(ruleset.enforcement, "active");
    assert.deepEqual(ruleset.conditions.ref_name.include, ["refs/heads/release/v1"]);
    assert.deepEqual(
      ruleset.rules.map((rule) => rule.type),
      ["deletion", "non_fast_forward", "pull_request", "required_status_checks"]
    );
    // GitHub rejects an explicit parameters object for this rule, so the payload
    // must stay bare; the defaults are what the baseline wants.
    const pullRequestRule = ruleset.rules.find((rule) => rule.type === "pull_request");
    assert.deepEqual(pullRequestRule, { type: "pull_request" });
    const checksRule = ruleset.rules.find((rule) => rule.type === "required_status_checks");
    assert.equal(checksRule.parameters.strict_required_status_checks_policy, true);
    assert.deepEqual(
      checksRule.parameters.required_status_checks.map((entry) => entry.context),
      CHECKS
    );
  });

  await test("--check classic passes only when protection matches the payload", () => {
    const gh = fakeGh([
      {
        method: "GET",
        endpoint: protectionEndpoint("owner/name", "main"),
        response: jsonResponse(matchingClassicProtection())
      }
    ]);
    const match = runModule(["--repo", "owner/name", "--check", "--json"], { execGh: gh.exec });
    assert.equal(match.code, 0, match.stderr);
    assert.equal(JSON.parse(match.stdout).ok, true);
    assert.deepEqual(gh.calls, [{ method: "GET", endpoint: protectionEndpoint("owner/name", "main"), input: null }]);

    const driftGh = fakeGh([
      {
        method: "GET",
        endpoint: protectionEndpoint("owner/name", "main"),
        response: jsonResponse({
          required_status_checks: { strict: false, contexts: ["test", "stale-check"] },
          enforce_admins: { enabled: false },
          required_pull_request_reviews: null,
          allow_force_pushes: { enabled: true },
          allow_deletions: { enabled: true }
        })
      }
    ]);
    const drift = runModule(["--repo", "owner/name", "--check", "--json"], { execGh: driftGh.exec });
    assert.equal(drift.code, 1);
    const result = JSON.parse(drift.stdout);
    assert.equal(result.ok, false);
    const codes = result.drift.map((item) => item.code);
    for (const code of [
      "status-check-missing",
      "status-check-extra",
      "status-check-strict",
      "pull-request-reviews-missing",
      "enforce-admins",
      "allow-force-pushes",
      "allow-deletions"
    ]) {
      assert(codes.includes(code), `missing drift code ${code}: ${JSON.stringify(codes)}`);
    }
    const human = runModule(["--repo", "owner/name", "--check"], {
      execGh: fakeGh([
        {
          method: "GET",
          endpoint: protectionEndpoint("owner/name", "main"),
          response: jsonResponse(matchingClassicProtection())
        }
      ]).exec
    });
    assert.equal(human.code, 0, human.stderr);
    assert.match(human.stdout, /Result: match/u);

    const reviewCount = runModule(["--repo", "owner/name", "--check", "--json"], {
      execGh: fakeGh([
        {
          method: "GET",
          endpoint: protectionEndpoint("owner/name", "main"),
          response: jsonResponse({
            ...matchingClassicProtection(),
            required_pull_request_reviews: { required_approving_review_count: 2 }
          })
        }
      ]).exec
    });
    assert.equal(reviewCount.code, 1);
    assert.deepEqual(
      JSON.parse(reviewCount.stdout).drift.map((item) => item.code),
      ["pull-request-review-count"]
    );

    const humanDrift = runModule(["--repo", "owner/name", "--check"], { execGh: driftGh.exec });
    assert.equal(humanDrift.code, 1);
    assert.match(humanDrift.stdout, /Result: drift/u);
    assert.match(humanDrift.stdout, /missing required status check: manifest/u);
    assert.match(humanDrift.stdout, /stale required status check is not a workflow job: stale-check/u);
  });

  await test("--check classic treats an unprotected branch as drift (exit 1)", () => {
    const result = runModule(["--repo", "owner/name", "--check", "--json"], {
      execGh: fakeGh([
        {
          method: "GET",
          endpoint: protectionEndpoint("owner/name", "main"),
          response: notFoundResponse()
        }
      ]).exec
    });
    assert.equal(result.code, 1, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.unprotected, true);
    assert.equal(payload.drift[0].code, "branch-unprotected");
    assert.match(payload.drift[0].message, /not protected/u);
  });

  await test("--check surfaces gh failures as errors (exit 2)", () => {
    const result = runModule(["--repo", "owner/name", "--check"], {
      execGh: () => ({ status: 1, stdout: "", stderr: "gh: authentication required" })
    });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /authentication required/u);
  });

  await test("--check ruleset requires active enforcement, matching refs, strict policy, and exact contexts", () => {
    const matches = runModule(["--repo", "owner/name", "--mode", "ruleset", "--check", "--json"], {
      execGh: fakeGh(rulesetRoutes(matchingRulesetDetail())).exec
    });
    assert.equal(matches.code, 0, matches.stderr);
    assert.equal(JSON.parse(matches.stdout).ok, true);

    const drifted = runModule(["--repo", "owner/name", "--mode", "ruleset", "--check", "--json"], {
      execGh: fakeGh(rulesetRoutes({
        ...matchingRulesetDetail(),
        enforcement: "evaluate",
        conditions: { ref_name: { include: ["refs/heads/release"], exclude: [] } },
        rules: [
          {
            type: "required_status_checks",
            parameters: {
              strict_required_status_checks_policy: false,
              required_status_checks: [{ context: "test" }, { context: "stale-check" }]
            }
          }
        ]
      })).exec
    });
    assert.equal(drifted.code, 1);
    const codes = JSON.parse(drifted.stdout).drift.map((item) => item.code);
    for (const code of [
      "ruleset-enforcement",
      "ruleset-ref-mismatch",
      "ruleset-strict-policy",
      "status-check-missing",
      "status-check-extra"
    ]) {
      assert(codes.includes(code), `missing drift code ${code}: ${JSON.stringify(codes)}`);
    }

    const missing = runModule(["--repo", "owner/name", "--mode", "ruleset", "--check", "--json"], {
      execGh: fakeGh([{ method: "GET", endpoint: rulesetsEndpoint("owner/name"), response: jsonResponse([]) }]).exec
    });
    assert.equal(missing.code, 1);
    assert.equal(JSON.parse(missing.stdout).drift[0].code, "ruleset-missing");
  });

  await test("classic --apply replaces the full settings object after reading current protection", () => {
    const gh = fakeGh([
      { method: "GET", endpoint: protectionEndpoint("owner/name", "main"), response: notFoundResponse() },
      { method: "PUT", endpoint: protectionEndpoint("owner/name", "main"), response: jsonResponse({}) }
    ]);
    const result = runModule(["--repo", "owner/name", "--apply", "--json"], { execGh: gh.exec });
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.replaced_full_settings, true);
    assert.deepEqual(gh.calls.map((call) => call.method), ["GET", "PUT"]);
    assert.deepEqual(gh.calls[1].input, classicPayload(CHECKS));
  });

  await test("classic --apply aborts instead of weakening stronger protection unless --force", () => {
    const stronger = {
      ...matchingClassicProtection(),
      required_status_checks: { strict: true, contexts: [...CHECKS, "legacy-check"] },
      required_pull_request_reviews: { required_approving_review_count: 2 },
      restrictions: { users: [{ login: "owner" }], teams: [], apps: [] },
      required_linear_history: { enabled: true }
    };
    const routes = (withPut) => [
      { method: "GET", endpoint: protectionEndpoint("owner/name", "main"), response: jsonResponse(stronger) },
      ...(withPut
        ? [{ method: "PUT", endpoint: protectionEndpoint("owner/name", "main"), response: jsonResponse({}) }]
        : [])
    ];
    const blocked = fakeGh(routes(false));
    const result = runModule(["--repo", "owner/name", "--apply"], { execGh: blocked.exec });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /would weaken existing protection/u);
    assert.match(result.stderr, /--force/u);
    assert.deepEqual(blocked.calls.map((call) => call.method), ["GET"]);

    const forced = fakeGh(routes(true));
    const forcedResult = runModule(["--repo", "owner/name", "--apply", "--force", "--json"], { execGh: forced.exec });
    assert.equal(forcedResult.code, 0, forcedResult.stderr);
    assert.equal(JSON.parse(forcedResult.stdout).forced, true);
    assert.deepEqual(forced.calls.map((call) => call.method), ["GET", "PUT"]);
  });

  await test("ruleset --apply is idempotent: update by name or create only when missing", () => {
    const update = fakeGh([
      {
        method: "GET",
        endpoint: rulesetsEndpoint("owner/name"),
        response: jsonResponse([{ id: 7, name: RULESET_NAME }])
      },
      {
        method: "PUT",
        endpoint: rulesetEndpoint("owner/name", 7),
        response: jsonResponse({ id: 7, name: RULESET_NAME })
      }
    ]);
    const updated = runModule(["--repo", "owner/name", "--mode", "ruleset", "--apply", "--json"], {
      execGh: update.exec
    });
    assert.equal(updated.code, 0, updated.stderr);
    const updatePayload = JSON.parse(updated.stdout);
    assert.equal(updatePayload.created, false);
    assert.equal(updatePayload.ruleset_id, 7);
    assert.deepEqual(update.calls.map((call) => call.method), ["GET", "PUT"]);
    assert.deepEqual(update.calls[1].input, rulesetPayload(CHECKS, "main"));

    const create = fakeGh([
      { method: "GET", endpoint: rulesetsEndpoint("owner/name"), response: jsonResponse([]) },
      { method: "POST", endpoint: rulesetsEndpoint("owner/name"), response: jsonResponse({ id: 9 }) }
    ]);
    const created = runModule(["--repo", "owner/name", "--mode", "ruleset", "--apply", "--json"], {
      execGh: create.exec
    });
    assert.equal(created.code, 0, created.stderr);
    const createPayload = JSON.parse(created.stdout);
    assert.equal(createPayload.created, true);
    assert.equal(createPayload.ruleset_id, 9);
    assert.deepEqual(create.calls.map((call) => call.method), ["GET", "POST"]);
  });

  await test("repo and branch inputs are validated before any gh call", () => {
    for (const repo of [".", "..", "../owner/name", "owner/../name", "owner/name/extra", "owner\\name", ""]) {
      const result = runModule(["--repo", repo]);
      assert.equal(result.code, 2, `repo ${JSON.stringify(repo)} must be rejected`);
      assert.match(result.stderr, /--repo/u);
    }
    for (const branch of ["bad branch", "-x", "a..b", "", "feat\\x"]) {
      const result = runModule(["--repo", "owner/name", "--branch", branch]);
      assert.equal(result.code, 2, `branch ${JSON.stringify(branch)} must be rejected`);
      assert.match(result.stderr, /--branch/u);
    }
    const slash = runModule(["--repo", "owner/name", "--branch", "release/v1", "--json"]);
    assert.equal(slash.code, 0, slash.stderr);
    assert.equal(
      JSON.parse(slash.stdout).requests[1].endpoint,
      "repos/owner/name/branches/release%2Fv1/protection"
    );
  });

  await test("--repo defaults to the origin remote", () => {
    const resolved = runModule(["--json"], {
      execGit: (args) => {
        if (args[0] === "check-ref-format") {
          return { status: 0, stdout: "", stderr: "" };
        }
        if (args[0] === "remote") {
          return { status: 0, stdout: "git@github.com:acme/widgets.git\n", stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "unexpected git call" };
      }
    });
    assert.equal(resolved.code, 0, resolved.stderr);
    assert.equal(JSON.parse(resolved.stdout).repository, "acme/widgets");

    const missing = runModule(["--json"], {
      execGit: (args) => (args[0] === "check-ref-format"
        ? { status: 0, stdout: "", stderr: "" }
        : { status: 1, stdout: "", stderr: "no such remote" })
    });
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /cannot resolve repository from origin/u);
  });

  await test("argument parsing distinguishes a missing value from an absent option", () => {
    const missing = runCli(["--repo"]);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /--repo requires a value/u);

    const missingBeforeFlag = runCli(["--repo", "--json"]);
    assert.equal(missingBeforeFlag.status, 2);
    assert.match(missingBeforeFlag.stderr, /--repo requires a value/u);

    const missingBranch = runCli(["--repo", "owner/name", "--branch"]);
    assert.equal(missingBranch.status, 2);
    assert.match(missingBranch.stderr, /--branch requires a value/u);

    const unknown = runCli(["--repo", "owner/name", "--nope"]);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /unknown argument/u);

    const conflict = runCli(["--repo", "owner/name", "--apply", "--check"]);
    assert.equal(conflict.status, 2);
    assert.match(conflict.stderr, /either --apply or --check/u);

    const dryRunConflict = runCli(["--repo", "owner/name", "--dry-run", "--apply"]);
    assert.equal(dryRunConflict.status, 2);
    assert.match(dryRunConflict.stderr, /--dry-run/u);

    const badMode = runCli(["--repo", "owner/name", "--mode", "both"]);
    assert.equal(badMode.status, 2);
    assert.match(badMode.stderr, /--mode must be classic or ruleset/u);

    const explicitDryRun = runCli(["--repo", "owner/name", "--dry-run", "--json"]);
    assert.equal(explicitDryRun.status, 0, explicitDryRun.stderr);
    assert.equal(JSON.parse(explicitDryRun.stdout).dry_run, true);

    const help = runCli(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--apply replaces the full classic protection settings object/u);
  });

  await test("a missing workflow is an error, not an empty check list", () => {
    withTempDir((cwd) => {
      const result = runModule(["--repo", "owner/name", "--json"], { cwd });
      assert.equal(result.code, 2);
      assert.match(result.stderr, /cannot read \.github\/workflows\/verify\.yml/u);
    });
    assert.throws(() => requiredCheckNames("name: verify\n"), /jobs block not found/u);
    assert.throws(
      () => requiredCheckNames(["jobs:", "  test:", "    runs-on: x", "  test:", "    runs-on: y"].join("\n")),
      /duplicate job names/u
    );
  });
}

function runModule(args, { cwd = packageRoot, execGh = refuseGh(), execGit } = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = runBranchProtection(args, { cwd, execGh, execGit, stdout, stderr });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

function runCli(args) {
  return spawnSync("node", ["bin/harness-branch-protection.js", ...args], {
    cwd: packageRoot,
    encoding: "utf8"
  });
}

function captureStream() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    text() {
      return chunks.join("");
    }
  };
}

function refuseGh() {
  return () => {
    throw new Error("gh must not be called");
  };
}

function jsonResponse(value) {
  return { status: 0, stdout: `${JSON.stringify(value)}\n`, stderr: "" };
}

function notFoundResponse() {
  return { status: 1, stdout: "", stderr: 'gh: Branch not protected (HTTP 404)\n' };
}

function ghCallTarget(args) {
  if (args[0] !== "api") {
    return { method: "OTHER", endpoint: args.join(" ") };
  }
  if (args[1] === "--method") {
    return { method: args[2], endpoint: args[3] };
  }
  return { method: "GET", endpoint: args[1] };
}

function fakeGh(routes) {
  const calls = [];
  const exec = (args, options = {}) => {
    const { method, endpoint } = ghCallTarget(args);
    calls.push({ method, endpoint, input: options.input ?? null });
    const route = routes.find((item) => item.method === method && item.endpoint === endpoint);
    if (!route) {
      return { status: 1, stdout: "", stderr: `gh: no fake route for ${method} ${endpoint}` };
    }
    return route.response;
  };
  return { calls, exec };
}

function matchingClassicProtection(checks = CHECKS) {
  return {
    required_status_checks: { strict: true, contexts: [...checks] },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: { required_approving_review_count: 0 },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false }
  };
}

function matchingRulesetDetail(checks = CHECKS, branch = "main") {
  return {
    id: 7,
    name: RULESET_NAME,
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "pull_request", parameters: {} },
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

function rulesetRoutes(detail) {
  return [
    {
      method: "GET",
      endpoint: rulesetsEndpoint("owner/name"),
      response: jsonResponse([{ id: detail.id, name: detail.name }])
    },
    {
      method: "GET",
      endpoint: rulesetEndpoint("owner/name", detail.id),
      response: jsonResponse(detail)
    }
  ];
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-workflow-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
