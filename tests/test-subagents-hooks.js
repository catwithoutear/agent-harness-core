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
        "## Review-Run Evidence",
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
      "receives no",
      "reviewer ledger",
      "overall_gate",
      "coverage_gate",
      "READY_WITH_NOTES",
      "NOT_READY",
      "RULE_COVERAGE_GAP",
      "EVIDENCE_GAP",
      "TARGET_RECOMPUTE_UNAVAILABLE",
      "protocol=review-run",
      "discovery_origin=target-derived"
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
    assert.match(role, /`over_engineering` as an independent review lens/);
    assert.match(role, /workflow-control\/references\/minimal-implementation\.md/);
    assert.match(role, /Do not copy the ladder into this role/);
    assert.match(role, /canonical ladder owns\s+the order for choosing a concrete mechanism/);
    assert.match(role, /does not approve correctness, safety, completeness/);
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

  await test("ZCode subagents use project and global Markdown targets without permission overrides", () => {
    withTempTarget((target) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
      const project = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "zcode",
          "--content",
          "subagents",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);
      const projectPayload = JSON.parse(project.stdout);
      assert.equal(projectPayload.summary.agents, manifest.assets.agents.length);
      assert.equal(projectPayload.records.every((record) => record.client === "zcode"), true);

      for (const agent of manifest.assets.agents) {
        const canonical = fs.readFileSync(path.join(packageRoot, agent.source), "utf8");
        const body = stripRoleFrontMatter(canonical).trimEnd();
        const projectPath = path.join(target, ".zcode", "agents", `${agent.runtimeName}.md`);
        assert.equal(fs.existsSync(projectPath), true, `${agent.id} project profile missing`);
        assert.equal(
          fs.readFileSync(projectPath, "utf8"),
          expectedZCodeAgentProjection(agent, body),
          `${agent.id} project profile drifted`
        );
        assert.doesNotMatch(fs.readFileSync(projectPath, "utf8"), /permissionMode/i);
      }
      assert.equal(fs.existsSync(path.join(target, ".zcode", "skills")), false);

      const globalTarget = path.join(target, "global-home");
      fs.mkdirSync(globalTarget, { recursive: true });
      const previousHome = process.env.HOME;
      process.env.HOME = globalTarget;
      let global;
      try {
        global = capture(() =>
          runHarnessProject([
            "--target",
            globalTarget,
            "--scope",
            "global",
            "--mode",
            "copy",
            "--conflict",
            "overwrite",
            "--clients",
            "zcode",
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
      assert.equal(global.status, 0, global.stdout + global.stderr);
      const globalPayload = JSON.parse(global.stdout);
      assert.equal(globalPayload.summary.agents, manifest.assets.agents.length);
      const reviewerPath = path.join(globalTarget, ".zcode", "agents", "reviewer.md");
      assert.equal(fs.existsSync(reviewerPath), true);
      assert.equal(
        fs.readFileSync(reviewerPath, "utf8"),
        expectedZCodeAgentProjection(
          manifest.assets.agents.find((agent) => agent.id === "reviewer"),
          stripRoleFrontMatter(
            fs.readFileSync(
              path.join(packageRoot, manifest.assets.agents.find((agent) => agent.id === "reviewer").source),
              "utf8"
            )
          ).trimEnd()
        )
      );
    });
  });

  await test("ZCode subagent overwrite preserves existing model and reasoning metadata", () => {
    withTempTarget((target) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
      const reviewer = manifest.assets.agents.find((agent) => agent.id === "reviewer");
      const reviewerPath = path.join(target, ".zcode", "agents", "reviewer.md");
      fs.mkdirSync(path.dirname(reviewerPath), { recursive: true });
      fs.writeFileSync(reviewerPath, [
        "---",
        "name: stale-reviewer",
        "description: \"stale description\"",
        "model: \"custom:preserve-me\"",
        "reasoningEffort: \"high\"",
        "model_reasoning_effort: \"xhigh\"",
        "permissionMode: \"write\"",
        "---",
        "",
        "stale body",
        ""
      ].join("\n"), "utf8");

      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "zcode",
          "--content",
          "subagents",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const projected = fs.readFileSync(reviewerPath, "utf8");
      assert.match(projected, /^name: reviewer$/m);
      assert.match(projected, new RegExp(`^description: ${escapeRegExp(JSON.stringify(reviewer.description))}$`, "m"));
      assert.match(projected, /^model: \"custom:preserve-me\"$/m);
      assert.match(projected, /^reasoningEffort: \"high\"$/m);
      assert.match(projected, /^model_reasoning_effort: \"xhigh\"$/m);
      assert.doesNotMatch(projected, /permissionMode|stale body/);
      assert.match(projected, /Review implemented changes for defects and regressions/);
    });
  });

  await test("ZCode user-owned model metadata may change after global deployment", () => {
    withTempTarget((target) => {
      const reviewerPath = path.join(target, ".zcode", "agents", "reviewer.md");
      fs.mkdirSync(path.dirname(reviewerPath), { recursive: true });
      fs.writeFileSync(reviewerPath, [
        "---",
        "name: reviewer",
        "description: \"stale\"",
        "model: \"custom:initial\"",
        "thinking: \"high\"",
        "---",
        "",
        "stale body",
        ""
      ].join("\n"), "utf8");

      const previousHome = process.env.HOME;
      process.env.HOME = target;
      try {
        const apply = capture(() =>
          runHarnessProject([
            "--target", target,
            "--scope", "global",
            "--conflict", "overwrite",
            "--clients", "zcode",
            "--content", "subagents",
            "--json"
          ])
        );
        assert.equal(apply.status, 0, apply.stdout + apply.stderr);

        const changed = fs.readFileSync(reviewerPath, "utf8")
          .replace('model: "custom:initial"', 'model: "custom:user-selected"')
          .replace('thinking: "high"', 'thinking: "max"');
        fs.writeFileSync(reviewerPath, changed, "utf8");

        const verify = capture(() =>
          runHarnessProject([
            "--target", target,
            "--scope", "global",
            "--verify",
            "--clients", "zcode",
            "--content", "subagents",
            "--json"
          ])
        );
        assert.equal(verify.status, 0, verify.stdout + verify.stderr);

        const reapply = capture(() =>
          runHarnessProject([
            "--target", target,
            "--scope", "global",
            "--clients", "zcode",
            "--content", "subagents",
            "--json"
          ])
        );
        assert.equal(reapply.status, 0, reapply.stdout + reapply.stderr);
        const projected = fs.readFileSync(reviewerPath, "utf8");
        assert.match(projected, /^model: "custom:user-selected"$/m);
        assert.match(projected, /^thinking: "max"$/m);
      } finally {
        if (previousHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = previousHome;
        }
      }
    });
  });

  await test("ZCode subagent overwrite fails closed on malformed existing frontmatter", () => {
    withTempTarget((target) => {
      const reviewerPath = path.join(target, ".zcode", "agents", "reviewer.md");
      fs.mkdirSync(path.dirname(reviewerPath), { recursive: true });
      const malformed = "---\nname: reviewer\nmodel: keep\nmissing closing delimiter\n";
      fs.writeFileSync(reviewerPath, malformed, "utf8");

      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--conflict",
          "overwrite",
          "--clients",
          "zcode",
          "--content",
          "subagents",
          "--json"
        ])
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /invalid existing ZCode agent frontmatter/);
      assert.equal(fs.readFileSync(reviewerPath, "utf8"), malformed);
      assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), false);
    });
  });

  await test("ZCode subagent dry-run fails closed on malformed existing frontmatter", () => {
    withTempTarget((target) => {
      const reviewerPath = path.join(target, ".zcode", "agents", "reviewer.md");
      fs.mkdirSync(path.dirname(reviewerPath), { recursive: true });
      fs.writeFileSync(reviewerPath, "---\nname: reviewer\nmodel: keep\nmissing closing delimiter\n", "utf8");

      for (const content of ["subagents", "subagents,hooks"]) {
        const result = capture(() =>
          runHarnessProject([
            "--target", target,
            "--dry-run",
            "--clients", "zcode",
            "--content", content,
            "--json"
          ])
        );
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /invalid existing ZCode agent frontmatter/);
        assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), false);
      }
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

  await test("ZCode Hook selection projects native adapters and managed config", () => {
    withTempTarget((target) => {
      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--clients",
          "zcode",
          "--content",
          "hooks",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.summary.hooks, 5);
      assert.equal(payload.summary.physical_total, 6);
      assert.equal(payload.warnings.some((warning) => warning.includes("client zcode does not support hook intent")), false);
      assert.equal(fs.existsSync(path.join(target, ".zcode", "config.json")), true);
      assert.equal(fs.existsSync(path.join(target, ".zcode", "harness", "hooks", "session-bootstrap.mjs")), true);
      const config = JSON.parse(fs.readFileSync(path.join(target, ".zcode", "config.json"), "utf8"));
      assert.equal(config.hooks.enabled, true);
      assert.equal(config.hooks.events.SessionStart.length, 3);
      assert.equal(config.hooks.events.PreToolUse.length, 2);
      assert.equal(fs.existsSync(path.join(target, ".zcode", "harness", "hooks", "pre-compact-handoff.mjs")), false);
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

function expectedZCodeAgentProjection(agent, body) {
  const frontMatter = [
    "---",
    `name: ${agent.runtimeName}`,
    `description: ${JSON.stringify(agent.description)}`,
    "---",
    ""
  ].join("\n");
  return `${frontMatter}${body}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
