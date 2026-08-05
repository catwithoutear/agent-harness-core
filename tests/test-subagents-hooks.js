import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontMatter } from "../lib/change/markdown.js";
import { runHarnessProject } from "../lib/project/projector.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function run(test) {
  await test("subagent manifest descriptions match role frontmatter", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    for (const agent of manifest.assets.agents) {
      const rolePath = path.join(packageRoot, agent.source);
      assert.equal(fs.existsSync(rolePath), true, `${agent.id} source missing`);
      const meta = parseFrontMatter(rolePath);
      assert.equal(meta.name, agent.runtimeName, `${agent.id} runtime name drifted`);
      assert.equal(meta.description, agent.description, `${agent.id} description drifted`);
    }
  });

  await test("canonical subagent roles retain independently dispatchable contracts", () => {
    const requiredContracts = {
      "code-worker": [
        "## Dispatch Boundary",
        "## Required Inputs",
        "## Source And Evidence Rules",
        "## Working Method",
        "## Stop And Failure Conditions",
        "Do not stage",
        "NEEDS_SCOPE",
        "PLAN_CONFLICT",
        "## Output Packet"
      ],
      "council-synthesizer": [
        "## Dispatch Boundary",
        "## Required Inputs",
        "## Evidence Discipline",
        "## Synthesis Method",
        "## Stop And Escalation Conditions",
        "Read only",
        "NEEDS_INDEPENDENT_EVIDENCE",
        "minority",
        "## Output Packet"
      ],
      "design-alternatives": [
        "## Dispatch Boundary",
        "## Required Inputs",
        "## Repository And Evidence Rules",
        "## Orthogonality Rules",
        "## Working Method",
        "Read only",
        "NO_ORTHOGONAL_SET",
        "Rejected non-options",
        "## Output Packet"
      ],
      "harness-orchestrator": [
        "## Dispatch Boundary",
        "## Input Contract",
        "## Source And Evidence Order",
        "## Coordination Method",
        "## Specialist Routing",
        "## Continuous Convergence",
        "## Gates And Stop Conditions",
        "user or named owner retains",
        "overall objective",
        "without waiting",
        "NEEDS_COUNCIL",
        "## Output Contract"
      ],
      "implementation-planner": [
        "## Dispatch Boundary",
        "## Required Inputs",
        "## Source And Traceability Rules",
        "## Planning Method",
        "## Stop Conditions",
        "Read only and plan only",
        "NEEDS_DESIGN",
        "DESIGN_CONFLICT",
        "## Output Packet"
      ],
      "repo-mapper": [
        "## Dispatch Boundary",
        "## Input Packet",
        "## Source And Evidence Rules",
        "## Mapping Method",
        "## Stop Conditions",
        "Read only",
        "AMBIGUOUS_OWNERSHIP",
        "closest precedents",
        "## Output Packet"
      ],
      reviewer: [
        "## Dispatch Boundary",
        "## Required Inputs",
        "## Source And Evidence Rules",
        "## Review Method",
        "## Stop Conditions",
        "## Coverage Modes",
        "Read only",
        "## Output Packet"
      ],
      "solution-designer": [
        "## Dispatch Boundary",
        "## Required Inputs",
        "## Repository And Evidence Rules",
        "## Design Method",
        "## Stop Conditions",
        "Read only and design only",
        "NEEDS_DIRECTION",
        "DESIGN_NOT_VIABLE",
        "## Output Packet"
      ]
    };

    for (const [roleName, required] of Object.entries(requiredContracts)) {
      const role = fs.readFileSync(path.join(packageRoot, "agents", "roles", `${roleName}.md`), "utf8");
      for (const text of required) {
        assert.match(
          role,
          new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
          `${roleName} missing contract text: ${text}`
        );
      }
    }
  });

  await test("review verifier is read-only and isolated from reviewer findings during inventory", () => {
    const role = fs.readFileSync(path.join(packageRoot, "agents", "roles", "review-verifier.md"), "utf8");
    for (const required of [
      "Read only",
      "inventory",
      "compare",
      "no reviewer ledger",
      "overall_gate",
      "coverage_gate",
      "READY_WITH_NOTES",
      "NOT_READY",
      "RULE_COVERAGE_GAP",
      "EVIDENCE_GAP",
      "TARGET_RECOMPUTE_UNAVAILABLE",
      "PACKET_SEAL_INVALID"
    ]) {
      assert.match(role, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  await test("planning reviewer covers implementation design readiness without edit authority", () => {
    const role = fs.readFileSync(path.join(packageRoot, "agents", "roles", "planning-reviewer.md"), "utf8");
    assert.match(role, /## Review Principles/);
    assert.match(role, /every reviewed code change point, design\s+decision, and implementation approach/);
    assert.match(role, /smallest design/);
    assert.match(role, /Necessity:/);
    assert.match(role, /directly serve the current\s+requirement/);
    assert.match(role, /Reuse:/);
    assert.match(role, /helper, shared module, base class/);
    assert.match(role, /Repository patterns:/);
    assert.match(role, /error handling, logging, resource management/);
    assert.match(role, /Further simplification:/);
    assert.match(role, /reduce branches, state, abstraction layers/);
    assert.match(role, /unnecessary abstractions/);
    assert.match(role, /speculative\s+generality/);
    assert.match(role, /duplicate local\s+mechanisms/);
    assert.match(role, /under-designed/);
    assert.match(role, /proportionate to risk/);
    assert.match(role, /Do not only say "simplify" or\s+"reuse existing code/);
    assert.match(role, /why the current design is\s+necessary/);
    assert.match(role, /## Design Quality Baseline/);
    assert.match(role, /multi-lens-design-review/);
    assert.match(role, /references\/design-principles-baseline\.md/);
    assert.match(role, /Screen every baseline family for applicability/);
    assert.match(role, /BASELINE_UNAVAILABLE/);
    assert.match(role, /do not claim complete design-quality coverage/);
    assert.match(role, /## Authority/);
    assert.match(role, /Read only/);
    assert.match(role, /Do not edit/);
    assert.match(role, /implementation-design/);
    assert.match(role, /source anchors/i);
    assert.match(role, /relative\/path:Symbol/);
    assert.match(role, /phase-appropriate evidence/);
    assert.match(role, /Document integrity/i);
    assert.match(role, /planned validation/i);
    assert.match(role, /scope alignment/i);
    assert.match(role, /consumer completeness/i);
    assert.match(role, /validation gaps/i);
    assert.match(role, /validation-gap/i);
    assert.match(role, /Return `BLOCK`, `APPROVE_WITH_NOTES`, or `APPROVE`/);
  });

  await test("all canonical subagents project with minimal client-native metadata and exact bodies", () => {
    withTempTarget((target) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "codex,claude,opencode,omp",
          "--content",
          "subagents",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.summary.agents, 44);

      const clientTargets = {
        codex: [".codex", "agents"],
        claude: [".claude", "agents"],
        opencode: [".opencode", "agents"],
        omp: [".omp", "agents"]
      };

      for (const agent of manifest.assets.agents) {
        const canonical = fs.readFileSync(path.join(packageRoot, agent.source), "utf8");
        const body = stripRoleFrontMatter(canonical).trimEnd();
        for (const [client, targetParts] of Object.entries(clientTargets)) {
          const extension = client === "codex" ? "toml" : "md";
          const projectedPath = path.join(target, ...targetParts, `${agent.runtimeName}.${extension}`);
          assert.equal(fs.existsSync(projectedPath), true, `${client}/${agent.runtimeName} missing`);
          const projected = fs.readFileSync(projectedPath, "utf8");
          assert.equal(
            projected,
            expectedAgentProjection(client, agent, body),
            `${client}/${agent.runtimeName} projection drifted`
          );
        }
      }
    });
  });

  await test("global subagent targets use each client discovery path", () => {
    withTempTarget((target) => {
      const previousHome = process.env.HOME;
      process.env.HOME = target;
      let result;
      try {
        result = capture(() =>
          runHarnessProject([
            "--target",
            target,
            "--scope",
            "global",
            "--dry-run",
            "--clients",
            "codex,claude,opencode,omp",
            "--content",
            "subagents",
            "--json"
          ])
        );
      } finally {
        if (previousHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = previousHome;
        }
      }

      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.summary.agents, 44);
      const reviewerTargets = new Map(
        payload.records
          .filter((record) => record.asset_id === "reviewer")
          .map((record) => [record.client, record.target])
      );
      assert.equal(reviewerTargets.get("codex"), path.join(target, ".codex", "agents", "reviewer.toml"));
      assert.equal(reviewerTargets.get("claude"), path.join(target, ".claude", "agents", "reviewer.md"));
      assert.equal(
        reviewerTargets.get("opencode"),
        path.join(target, ".config", "opencode", "agents", "reviewer.md")
      );
      assert.equal(reviewerTargets.get("omp"), path.join(target, ".omp", "agent", "agents", "reviewer.md"));
    });
  });

  await test("hook projection renders supported hooks and reports unsupported intents", () => {
    withTempTarget((target) => {
      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "codex,omp",
          "--content",
          "hooks",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert(payload.warnings.some((warning) => warning.includes("client omp does not support hook intent")));
      const hookPath = path.join(target, ".codex", "hooks", "session-bootstrap.json");
      assert.equal(fs.existsSync(hookPath), true);
      const hook = JSON.parse(fs.readFileSync(hookPath, "utf8"));
      assert.equal(hook.intent, "session-bootstrap");
      assert.equal(hook.client, "codex");
      assert.match(hook.body, /git status as candidates only/);
      assert.match(hook.body, /Active change:\s+unresolved/);
      assert.match(hook.body, /state_root/);
      assert.match(hook.body, /code_root/);
      assert.match(hook.body, /harness-change-doc --state-root <state-root> --code-root <code-root> resolve/);
      assert.match(hook.body, /harness-change-validate --state-root <state-root> --change <change>/);
      assert.match(hook.body, /linked worktree/i);
      assert.match(hook.body, /--worktrees/);

      const activeGuardPath = path.join(target, ".codex", "hooks", "active-change-guard.json");
      assert.equal(fs.existsSync(activeGuardPath), true);
      const activeGuard = JSON.parse(fs.readFileSync(activeGuardPath, "utf8"));
      assert.match(activeGuard.body, /Git status is not an activation signal/);
      assert.match(activeGuard.body, /candidate workspaces/);
      assert.match(activeGuard.body, /state_root/);
      assert.match(activeGuard.body, /code_root/);
      assert.match(activeGuard.body, /execution-map/);
      assert.match(activeGuard.body, /Worktree.*local execution coordinate/);
      assert.doesNotMatch(activeGuard.body, /branch-local-state.*(?:supported|implemented)/i);
    });
  });
}

function withTempTarget(fn) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "harness-subagents-hooks-"));
  try {
    fn(target);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function stripRoleFrontMatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function expectedAgentProjection(client, agent, body) {
  if (client === "codex") {
    return [
      `name = ${JSON.stringify(agent.runtimeName)}`,
      `description = ${JSON.stringify(agent.description)}`,
      "developer_instructions = '''",
      body,
      "'''",
      ""
    ].join("\n");
  }
  const frontMatter = [
    "---",
    `name: ${agent.runtimeName}`,
    `description: ${JSON.stringify(agent.description)}`,
    ...(client === "opencode" ? ["mode: subagent"] : []),
    "---",
    ""
  ].join("\n");
  return `${frontMatter}${body}\n`;
}

function capture(fn) {
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  try {
    return { status: fn(), stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}
