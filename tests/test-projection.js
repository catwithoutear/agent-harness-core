import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runHarnessProject } from "../lib/project/projector.js";

export async function run(test) {
  await test("dry-run reports flat skill and client agent targets", () => {
    withTempTarget((target) => {
      const result = capture(() =>
        runHarnessProject(["--target", target, "--dry-run", "--json", "--clients", "codex", "--content", "skills,subagents"])
      );
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      const targets = payload.records.map((record) => record.target);
      assert(targets.some((entry) => entry.endsWith(".agents/skills/ask-harness")));
      assert(targets.some((entry) => entry.endsWith(".codex/agents/harness-orchestrator.toml")));
      assert(!targets.some((entry) => entry.includes("skills/entry/")));
    });
  });

  await test("dry-run reports slash command targets", () => {
    withTempTarget((target) => {
      const result = capture(() =>
        runHarnessProject(["--target", target, "--dry-run", "--json", "--clients", "claude,omp", "--content", "commands"])
      );
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      const targets = payload.records.map((record) => record.target);
      assert.equal(payload.summary.commands, 12);
      assert(targets.some((entry) => entry.endsWith(".claude/commands/harness/workflow.md")));
      assert(targets.some((entry) => entry.endsWith(".claude/commands/harness/route.md")));
      assert(targets.some((entry) => entry.endsWith(".omp/commands/harness-workflow.md")));
      assert(targets.some((entry) => entry.endsWith(".omp/commands/harness-route.md")));
    });
  });

  await test("dry-run reports unsupported command projection per client scope", () => {
    withTempTarget((target) => {
      const result = capture(() =>
        runHarnessProject(["--target", target, "--dry-run", "--json", "--clients", "codex,opencode", "--content", "commands"])
      );
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.summary.commands, 12);
      assert.equal(payload.summary.unsupported, 12);
      assert(payload.warnings.includes("client codex does not support project command projection"));
      assert(payload.warnings.includes("client opencode does not support project command projection"));
      assert(payload.records.every((record) => record.status === "unsupported"));
    });
  });

  await test("dry-run reports Codex global prompts target", () => {
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
            "--mode",
            "copy",
            "--conflict",
            "overwrite",
            "--json",
            "--clients",
            "codex",
            "--content",
            "commands"
          ])
        );
      } finally {
        if (previousHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = previousHome;
        }
      }
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.summary.commands, 6);
      assert.equal(payload.summary.unsupported, 0);
      const workflowRecord = payload.records.find((record) => record.asset_id === "harness-workflow");
      assert(workflowRecord?.target.endsWith(".codex/prompts/harness-workflow.md"));
      assert.equal(workflowRecord.status, "projected");
      const workflowSource = fs.readFileSync(workflowRecord.target, "utf8");
      assert.match(
        workflowSource,
        /solution-design review[\s\S]*implementation-design[\s\S]*task set/i
      );
      assert(payload.warnings.includes("client codex global command projection uses a deprecated client feature"));
    });
  });

  await test("copy projection writes slash commands", () => {
    withTempTarget((target) => {
      const project = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "claude",
          "--content",
          "commands",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);
      const commandPath = path.join(target, ".claude", "commands", "harness", "workflow.md");
      const planPath = path.join(target, ".claude", "commands", "harness", "plan.md");
      assert.equal(fs.existsSync(commandPath), true);
      const commandText = fs.readFileSync(commandPath, "utf8");
      const planText = fs.readFileSync(planPath, "utf8");
      assert.match(commandText, /Activate `workflow-control`/);
      assert.match(
        commandText,
        /combines both a workflow-use signal\s+and an overall-completion signal/i
      );
      assert.match(
        commandText,
        /solution-design review[\s\S]*implementation-design[\s\S]*task set/i
      );
      assert.match(
        planText,
        /solution-design[\s\S]*implementation-design[\s\S]*task set/i
      );

      const ompProject = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "omp",
          "--content",
          "commands",
          "--json"
        ])
      );
      assert.equal(ompProject.status, 0, ompProject.stdout + ompProject.stderr);
      const ompWorkflowPath = path.join(target, ".omp", "commands", "harness-workflow.md");
      const ompPlanPath = path.join(target, ".omp", "commands", "harness-plan.md");
      assert.equal(fs.existsSync(ompWorkflowPath), true);
      assert.match(
        fs.readFileSync(ompWorkflowPath, "utf8"),
        /solution-design review[\s\S]*implementation-design[\s\S]*task set/i
      );
      assert.match(
        fs.readFileSync(ompPlanPath, "utf8"),
        /solution-design[\s\S]*implementation-design[\s\S]*task set/i
      );
    });
  });

  await test("copy projection writes state and verifies", () => {
    withTempTarget((target) => {
      const project = capture(() =>
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
          "rules,skills,templates",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);
      assert.equal(fs.existsSync(path.join(target, ".rules", "loop-contract.md")), true);
      assert.equal(fs.existsSync(path.join(target, ".agents", "skills", "ask-harness", "SKILL.md")), true);
      const workflowSkill = fs.readFileSync(
        path.join(target, ".agents", "skills", "workflow-control", "SKILL.md"),
        "utf8"
      );
      const plannerSkill = fs.readFileSync(
        path.join(target, ".agents", "skills", "change-planner", "SKILL.md"),
        "utf8"
      );
      const refinerSkill = fs.readFileSync(
        path.join(target, ".agents", "skills", "design-doc-refiner", "SKILL.md"),
        "utf8"
      );
      const loopRule = fs.readFileSync(path.join(target, ".rules", "loop-contract.md"), "utf8");
      const designTemplate = fs.readFileSync(
        path.join(target, ".changes", "templates", "implementation-design", "README.md"),
        "utf8"
      );
      for (const text of [workflowSkill, plannerSkill, loopRule]) {
        assert.match(text, /solution-design review[\s\S]*implementation-design[\s\S]*task set/i);
      }
      assert.match(workflowSkill, /## Continuous Convergence/);
      assert.match(loopRule, /## Continuous Convergence/);
      assert.match(refinerSkill, /Stop at solution design, ambiguities, and validation intent/);
      assert.match(designTemplate, /Review the populated pack before deriving task slices/);
      for (const clientRoot of [".agents", ".claude", ".opencode", ".omp"]) {
        const root = path.join(target, clientRoot, "skills");
        const designBaselinePath = path.join(
          root,
          "multi-lens-design-review",
          "references",
          "design-principles-baseline.md"
        );
        const projectedWorkflow = fs.readFileSync(
          path.join(root, "workflow-control", "SKILL.md"),
          "utf8"
        );
        const projectedPlanner = fs.readFileSync(
          path.join(root, "change-planner", "SKILL.md"),
          "utf8"
        );
        const projectedRefiner = fs.readFileSync(
          path.join(root, "design-doc-refiner", "SKILL.md"),
          "utf8"
        );
        assert.match(
          projectedWorkflow,
          /solution-design review[\s\S]*implementation-design[\s\S]*task set/i
        );
        assert.match(projectedPlanner, /Use `plan-only` for compact work/);
        assert.match(projectedWorkflow, /Interpret the combination semantically/);
        assert.match(projectedWorkflow, /`按照 workflow 收敛` \| Activate continuous convergence\./);
        assert.match(
          projectedWorkflow,
          /`continue until complete` \| Do not activate this contract; no workflow-use signal\./
        );
        assert.match(projectedWorkflow, /without asking the user\s+to send\s+another "continue" message/i);
        assert.match(projectedRefiner, /Stop at solution design, ambiguities, and validation intent/);
        assert.equal(fs.existsSync(designBaselinePath), true, `${clientRoot} design baseline missing`);
        assert.match(fs.readFileSync(designBaselinePath, "utf8"), /## Architecture Design Principles/);
      }
      assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), true);

      const verify = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--verify",
          "--mode",
          "copy",
          "--clients",
          "codex,claude,opencode,omp",
          "--content",
          "rules,skills,templates",
          "--json"
        ])
      );
      assert.equal(verify.status, 0, verify.stdout + verify.stderr);
      const payload = JSON.parse(verify.stdout);
      assert.equal(payload.action, "verify");
      assert.equal(payload.errors.length, 0);
    });
  });

  await test("copy projection verify fails when recorded source hash is stale", () => {
    withTempTarget((target) => {
      const project = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "codex",
          "--content",
          "skills",
          "--skills",
          "handoff-checkpoint",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);

      const statePath = path.join(target, ".harness", "projection-state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      const skillRecord = state.records.find((record) => record.asset_id === "handoff-checkpoint");
      assert(skillRecord, "handoff-checkpoint projection state missing");
      skillRecord.source_hash = "stale-source-hash";
      fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

      const verify = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--verify",
          "--mode",
          "copy",
          "--clients",
          "codex",
          "--content",
          "skills",
          "--skills",
          "handoff-checkpoint",
          "--json"
        ])
      );
      assert.equal(verify.status, 1, verify.stdout + verify.stderr);
      const payload = JSON.parse(verify.stdout);
      assert(payload.errors.some((error) => error.includes("source hash mismatch")));
    });
  });

  await test("render projection verify rejects output from an obsolete renderer", () => {
    withTempTarget((target) => {
      const project = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "opencode",
          "--content",
          "subagents",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);

      const agentPath = path.join(target, ".opencode", "agents", "reviewer.md");
      const statePath = path.join(target, ".harness", "projection-state.json");
      const current = fs.readFileSync(agentPath, "utf8");
      const stale = current.replace("mode: subagent\n", "");
      assert.notEqual(stale, current, "fixture must remove current OpenCode discovery metadata");
      fs.writeFileSync(agentPath, stale, "utf8");

      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      const agentRecord = state.records.find(
        (record) => record.client === "opencode" && record.asset_id === "reviewer"
      );
      assert(agentRecord, "reviewer projection state missing");
      const originalSourceHash = agentRecord.source_hash;
      const staleTargetHash = crypto.createHash("sha256").update(fs.readFileSync(agentPath)).digest("hex");
      agentRecord.target_hash = staleTargetHash;
      fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

      const recorded = JSON.parse(fs.readFileSync(statePath, "utf8")).records.find(
        (record) => record.client === "opencode" && record.asset_id === "reviewer"
      );
      assert.equal(recorded.source_hash, originalSourceHash);
      assert.equal(recorded.target_hash, staleTargetHash);

      const verify = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--verify",
          "--mode",
          "copy",
          "--clients",
          "opencode",
          "--content",
          "subagents",
          "--json"
        ])
      );
      assert.equal(verify.status, 1, verify.stdout + verify.stderr);
      const payload = JSON.parse(verify.stdout);
      const reviewer = payload.records.find(
        (record) => record.client === "opencode" && record.asset_id === "reviewer"
      );
      assert.equal(reviewer?.status, "mismatch");
      assert(
        payload.errors.some((error) => error.includes("does not match current renderer")),
        payload.errors.join("\n")
      );
    });
  });

  await test("third-party skills are opt-in", () => {
    withTempTarget((target) => {
      const defaultRun = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--dry-run",
          "--json",
          "--clients",
          "codex",
          "--content",
          "skills"
        ])
      );
      assert.equal(defaultRun.status, 0, defaultRun.stderr);
      const defaultPayload = JSON.parse(defaultRun.stdout);
      assert.equal(defaultPayload.summary.skills, 28);
      assert(!defaultPayload.records.some((record) => record.asset_id === "glab"));
      assert(!defaultPayload.records.some((record) => record.source.includes("skills/third-party")));

      const categoryRun = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--dry-run",
          "--json",
          "--clients",
          "codex",
          "--content",
          "skills",
          "--skill-categories",
          "third-party"
        ])
      );
      assert.equal(categoryRun.status, 0, categoryRun.stderr);
      const categoryPayload = JSON.parse(categoryRun.stdout);
      assert.equal(categoryPayload.summary.skills, 23);
      assert(categoryPayload.records.every((record) => record.source.includes("skills/third-party")));
      assert(categoryPayload.records.some((record) => record.asset_id === "environment-profile-vault"));
      assert(categoryPayload.records.some((record) => record.asset_id === "pve-vm-operations"));

      const selectedRun = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--dry-run",
          "--json",
          "--clients",
          "codex",
          "--content",
          "skills",
          "--skills",
          "environment-profile-vault,glab,redmine"
        ])
      );
      assert.equal(selectedRun.status, 0, selectedRun.stderr);
      const selectedPayload = JSON.parse(selectedRun.stdout);
      assert.deepEqual(selectedPayload.records.map((record) => record.asset_id).sort(), [
        "environment-profile-vault",
        "glab",
        "redmine"
      ]);

      const project = capture(() =>
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
          "skills",
          "--skills",
          "environment-profile-vault,pve-vm-operations",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);
      const skillDirectory = path.join(target, ".agents", "skills", "environment-profile-vault");
      assert.equal(fs.existsSync(path.join(skillDirectory, "SKILL.md")), true);
      assert.equal(
        fs.existsSync(path.join(skillDirectory, "scripts", "environment-profile-vault.py")),
        true
      );
      const pveSkillDirectory = path.join(target, ".agents", "skills", "pve-vm-operations");
      assert.equal(fs.existsSync(path.join(pveSkillDirectory, "SKILL.md")), true);
      assert.equal(
        fs.existsSync(path.join(pveSkillDirectory, "scripts", "pve_vm.py")),
        true
      );
      for (const clientSkillRoot of [
        [".agents", "skills"],
        [".claude", "skills"],
        [".opencode", "skills"],
        [".omp", "skills"]
      ]) {
        const projectedPveSkill = path.join(
          target,
          ...clientSkillRoot,
          "pve-vm-operations"
        );
        assert.equal(fs.existsSync(path.join(projectedPveSkill, "SKILL.md")), true);
        assert.equal(
          fs.existsSync(path.join(projectedPveSkill, "scripts", "pve_vm.py")),
          true
        );
        assert.equal(
          fs.existsSync(path.join(projectedPveSkill, "scripts", "__pycache__")),
          false
        );
      }
    });
  });

  await test("projected simplification assets preserve scope and coverage contracts", () => {
    withTempTarget((target) => {
      const project = capture(() =>
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
          "skills,subagents",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);

      const simplifyPath = path.join(target, ".agents", "skills", "simplify", "SKILL.md");
      const minimalImplementationPath = path.join(
        target,
        ".agents",
        "skills",
        "workflow-control",
        "references",
        "minimal-implementation.md"
      );
      const minimalityEvaluationPath = path.join(
        target,
        ".agents",
        "skills",
        "workflow-control",
        "references",
        "minimality-behavior-evaluation.md"
      );
      const grillDiffPath = path.join(target, ".agents", "skills", "grill-diff", "SKILL.md");
      const simplifierAgentPath = path.join(target, ".codex", "agents", "code-simplifier.toml");
      assert.equal(fs.existsSync(simplifyPath), true);
      assert.equal(fs.existsSync(minimalImplementationPath), true);
      assert.equal(fs.existsSync(minimalityEvaluationPath), true);
      assert.equal(fs.existsSync(grillDiffPath), true);
      assert.equal(fs.existsSync(simplifierAgentPath), true);

      const simplify = fs.readFileSync(simplifyPath, "utf8");
      assert.match(simplify, /Scope Packet/);
      assert.match(simplify, /merge-base/);
      assert.match(simplify, /git log <base>\.\.HEAD/);
      assert.match(simplify, /edit_authorized/);
      assert.match(simplify, /requested_mode=apply/);
      assert.match(simplify, /requested_mode=opportunities/);
      assert.match(simplify, /Pass the Scope Packet to `code-simplifier`/);
      assert.match(simplify, /Do not treat an empty current diff as an empty review/);
      assert.match(simplify, /references\/minimal-implementation\.md/);

      const minimalImplementation = fs.readFileSync(minimalImplementationPath, "utf8");
      assert.match(minimalImplementation, /Ordered Decision Ladder/);
      assert.match(minimalImplementation, /Native platform capability/);
      assert.match(minimalImplementation, /Root Cause And Shared Ownership/);
      assert.match(minimalImplementation, /Safety Floor/);

      const minimalityEvaluation = fs.readFileSync(minimalityEvaluationPath, "utf8");
      assert.match(minimalityEvaluation, /Fair A\/B Contract/);
      assert.match(minimalityEvaluation, /fresh isolated workspace/);
      assert.match(minimalityEvaluation, /Instrument Self-Check/);
      assert.match(minimalityEvaluation, /LIVE_AB_NOT_RUN/);

      const grillDiff = fs.readFileSync(grillDiffPath, "utf8");
      assert.match(grillDiff, /Read-only by default/);
      assert.match(grillDiff, /ordinary PR\/MR review/);
      assert.match(grillDiff, /step through/);

      const simplifierAgent = fs.readFileSync(simplifierAgentPath, "utf8");
      assert.match(simplifierAgent, /developer_instructions/);
      assert.match(simplifierAgent, /edit_authorized=true/);
      assert.match(simplifierAgent, /requested_mode=opportunities/);
      assert.match(simplifierAgent, /NEEDS_AUTHORIZATION/);
      assert.match(simplifierAgent, /Unit Inventory/);
      assert.match(simplifierAgent, /every class, function, method, and key block/);
      assert.match(simplifierAgent, /coverage complete/);
      assert.match(simplifierAgent, /references\/minimal-implementation\.md/);
      assert.match(simplifierAgent, /authoritative shared owner/);

      for (const projected of [
        path.join(target, ".claude", "agents", "code-simplifier.md"),
        path.join(target, ".opencode", "agents", "code-simplifier.md"),
        path.join(target, ".omp", "agents", "code-simplifier.md")
      ]) {
        assert.equal(fs.existsSync(projected), true, `${projected} missing`);
        const text = fs.readFileSync(projected, "utf8");
        assert.match(text, /edit_authorized=true/);
        assert.match(text, /NEEDS_AUTHORIZATION/);
        assert.match(text, /EvidenceRef is/);
      }
    });
  });

  await test("projection includes change workspace templates", () => {
    withTempTarget((target) => {
      const dryRun = capture(() =>
        runHarnessProject(["--target", target, "--dry-run", "--json", "--clients", "codex", "--content", "templates"])
      );
      assert.equal(dryRun.status, 0, dryRun.stderr);
      const dryRunPayload = JSON.parse(dryRun.stdout);
      const targets = dryRunPayload.records.map((record) => record.target);
      assert.equal(dryRunPayload.summary.templates, 9);
      assert(targets.some((entry) => entry.endsWith(".changes/templates/README.md")));
      assert(targets.some((entry) => entry.endsWith(".changes/templates/implementation-design/README.md")));
      assert(targets.some((entry) => entry.endsWith(".changes/templates/implementation-design/07-constraints.md")));
      assert(!targets.some((entry) => entry.endsWith(".memory/INDEX.md")));
      for (const record of dryRunPayload.records) {
        if (record.content_kind === "templates" && record.asset_id.startsWith("change-")) {
          assert(
            record.target.includes(`${path.sep}.changes${path.sep}templates${path.sep}`),
            `${record.asset_id} target should stay under .changes/templates/: ${record.target}`
          );
        }
      }

      const project = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "codex",
          "--content",
          "templates",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);
      assert.equal(fs.existsSync(path.join(target, ".changes", "templates", "README.md")), true);
      assert.equal(fs.existsSync(path.join(target, ".changes", "change-workspace-readme", "README.md")), false);
      const templatePath = path.join(target, ".changes", "templates", "implementation-design", "README.md");
      assert.equal(fs.existsSync(templatePath), true);
      const templateText = fs.readFileSync(templatePath, "utf8");
      assert.match(templateText, /Subsystem/);
      assert.match(templateText, /Minimum Use \/ N\/A Rule/);
      assert.match(templateText, /settled, reviewed solution design/);
      assert.match(templateText, /latest pack review is ready/);

      const verify = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--verify",
          "--mode",
          "copy",
          "--clients",
          "codex",
          "--content",
          "templates",
          "--json"
        ])
      );
      assert.equal(verify.status, 0, verify.stdout + verify.stderr);
      const verifyPayload = JSON.parse(verify.stdout);
      assert.equal(verifyPayload.errors.length, 0);
    });
  });

  await test("default projection materializes files instead of symlinking", () => {
    withTempTarget((target) => {
      const project = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--conflict",
          "overwrite",
          "--clients",
          "codex",
          "--content",
          "rules,skills",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);
      const rulePath = path.join(target, ".rules", "loop-contract.md");
      const skillPath = path.join(target, ".agents", "skills", "ask-harness");
      assert.equal(fs.lstatSync(rulePath).isSymbolicLink(), false);
      assert.equal(fs.lstatSync(skillPath).isSymbolicLink(), false);

      const state = JSON.parse(fs.readFileSync(path.join(target, ".harness", "projection-state.json"), "utf8"));
      const ruleRecord = state.records.find((record) => record.target === rulePath);
      const skillRecord = state.records.find((record) => record.target === skillPath);
      assert.equal(ruleRecord.mode, "copy");
      assert.equal(skillRecord.mode, "copy");
    });
  });
}

function withTempTarget(fn) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "harness-project-"));
  try {
    fn(target);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
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
