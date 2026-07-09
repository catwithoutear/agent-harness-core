import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontMatter } from "../lib/change/markdown.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function collectFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

export async function run(test) {
  await test("manifest skill sources have minimal frontmatter", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    for (const skill of manifest.assets.skills) {
      const skillFile = path.join(packageRoot, skill.source, "SKILL.md");
      assert.equal(fs.existsSync(skillFile), true, `${skill.id} missing SKILL.md`);
      const meta = parseFrontMatter(skillFile);
      assert.deepEqual(Object.keys(meta).sort(), ["description", "name"]);
      assert.equal(meta.name, skill.runtimeName);
      assert.equal(meta.description, skill.description);
    }
  });

  await test("skill descriptions are trigger-focused", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    for (const skill of manifest.assets.skills) {
      assert.match(skill.description, /^Use when /, `${skill.id} description should start with Use when`);
      assert(skill.description.length <= 240, `${skill.id} description is too long`);
    }
  });

  await test("review packet gate uses shared gate vocabulary", () => {
    const text = fs.readFileSync(path.join(packageRoot, "skills", "review", "review-packet-gate", "SKILL.md"), "utf8");
    assert.match(text, /\bREADY\b/);
    assert.match(text, /\bREADY_WITH_NOTES\b/);
    assert.match(text, /\bNOT_READY\b/);
    assert.match(text, /\bNEEDS_USER_DECISION\b/);
    assert.match(text, /\bNEEDS_COUNCIL\b/);
    assert.match(text, /scope-alignment evidence/);
    assert.match(text, /consumer completeness findings/);
    assert.match(text, /validation-gap findings/);
    assert.doesNotMatch(text, /\bBLOCK\b/);
    assert.doesNotMatch(text, /\bAPPROVE\b/);
  });

  await test("change workspace skill documents tool entrypoints", () => {
    const text = fs.readFileSync(path.join(packageRoot, "skills", "change", "change-workspace-operator", "SKILL.md"), "utf8");
    for (const required of [
      "--repo-root",
      "--state-root",
      "--code-root",
      "harness-change-doc",
      "harness-change-validate",
      "resolve",
      "execution-map",
      "assign-slice",
      "--worktrees",
      "--inventory",
      "--suggest-cleanup",
      "--strict-layout",
      "add-terminology",
      "add-implementation-design",
      "add-review",
      "low-frequency",
      "migration input",
      "README.md",
      "locate",
      "read",
      "confirmed, disputed, and unverifiable",
      "scoping confidence"
    ]) {
      assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  await test("worktree workflow assets document shared-state execution map contract", () => {
    const workflow = fs.readFileSync(path.join(packageRoot, "commands", "harness", "workflow.md"), "utf8");
    const handoff = fs.readFileSync(path.join(packageRoot, "commands", "harness", "handoff.md"), "utf8");
    const workspace = fs.readFileSync(path.join(packageRoot, "skills", "change", "change-workspace-operator", "SKILL.md"), "utf8");
    const planner = fs.readFileSync(path.join(packageRoot, "skills", "change", "change-planner", "SKILL.md"), "utf8");
    const checkpoint = fs.readFileSync(path.join(packageRoot, "skills", "operations", "handoff-checkpoint", "SKILL.md"), "utf8");

    for (const [name, text] of [
      ["workflow", workflow],
      ["handoff", handoff],
      ["change-workspace-operator", workspace],
      ["change-planner", planner],
      ["handoff-checkpoint", checkpoint]
    ]) {
      for (const required of ["state_root", "code_root", "execution-map", "Worktree", "Last Evidence"]) {
        assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${name} missing ${required}`);
      }
      assert.doesNotMatch(text, /branch-local-state.*(?:supported|implemented)/i, `${name} presents branch-local-state as supported`);
    }

    for (const required of [
      "harness-change-doc --state-root <state-root> --code-root <code-root> resolve",
      "harness-change-doc --state-root <state-root> execution-map <change> --json",
      "harness-change-doc --state-root <state-root> assign-slice <change>",
      "harness-change-validate --state-root <state-root> --change <change> --worktrees",
      "stacked-branch-workflow"
    ]) {
      assert.match(workspace, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    assert.match(workflow, /Resolve `state_root`, `code_root`, and `active_change`/);
    assert.match(handoff, /local execution coordinate/);
    assert.match(planner, /dependency-ordered/);
    assert.match(checkpoint, /stale Worktree path/);
  });

  await test("change planner turns design artifacts into regulated task slices", () => {
    const text = fs.readFileSync(path.join(packageRoot, "skills", "change", "change-planner", "SKILL.md"), "utf8");
    for (const required of [
      ".changes",
      "change-workspace-operator",
      "architecture-scout",
      "diagnose",
      "prototype-spike",
      "verification-first",
      "harness-change-doc",
      "harness-change-validate",
      "requirements.md",
      "proposal.md",
      "design.md",
      "implementation-design",
      "subsystem",
      "module",
      "file/class mapping",
      "tasks.md",
      "tasks/README.md",
      "READY",
      "READY_WITH_NOTES",
      "NOT_READY",
      "NEEDS_USER_DECISION"
    ]) {
      assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(text, /DBackup/i);
    assert.doesNotMatch(text, /Redmine/i);

    const manifestJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const byId = Object.fromEntries(manifestJson.assets.skills.map((skill) => [skill.id, skill]));
    assert(byId["change-planner"].triggers.includes("design to tasks"));
    assert(byId["change-planner"].requires.includes("active change workspace"));
    assert(byId["change-planner"].negativeTriggers.includes("unresolved design"));
  });

  await test("change evidence skills integrate with the control loop", () => {
    const expectedSkills = [
      "architecture-scout",
      "diagnose",
      "prototype-spike",
      "verification-first"
    ];
    const workflowControl = fs.readFileSync(path.join(packageRoot, "skills", "workflow", "workflow-control", "SKILL.md"), "utf8");
    const manifestJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const byId = Object.fromEntries(manifestJson.assets.skills.map((skill) => [skill.id, skill]));

    for (const skill of expectedSkills) {
      assert.match(workflowControl, new RegExp(skill));
      assert.equal(byId[skill].category, "change");
      assert.equal(byId[skill].audience, "model");
    }

    const architectureScout = fs.readFileSync(path.join(packageRoot, "skills", "change", "architecture-scout", "SKILL.md"), "utf8");
    assert.match(architectureScout, /source-backed research/);
    assert.match(architectureScout, /change-planner/);
    assert.match(architectureScout, /## Approach Handoff/);
    assert.match(architectureScout, /status quo path/);
    assert.match(architectureScout, /source-backed alternatives/);
    assert.match(architectureScout, /external research needs only when/);

    const diagnose = fs.readFileSync(path.join(packageRoot, "skills", "change", "diagnose", "SKILL.md"), "utf8");
    assert.match(diagnose, /Hypothesis Table/);
    assert.match(diagnose, /root cause/);
    assert.match(diagnose, /change-planner/);

    const prototypeSpike = fs.readFileSync(path.join(packageRoot, "skills", "change", "prototype-spike", "SKILL.md"), "utf8");
    assert.match(prototypeSpike, /proposal draft/);
    assert.match(prototypeSpike, /design draft/);
    assert.match(prototypeSpike, /design revision and freeze/);
    assert.match(prototypeSpike, /change-planner task slicing/);

    const verificationFirst = fs.readFileSync(path.join(packageRoot, "skills", "change", "verification-first", "SKILL.md"), "utf8");
    for (const status of ["verified", "not run", "blocked", "partial"]) {
      assert.match(verificationFirst, new RegExp(status));
    }
    for (const fidelity of ["exact", "equivalent", "approximate", "remote-only"]) {
      assert.match(verificationFirst, new RegExp(fidelity));
    }
    assert.match(verificationFirst, /Validation Fidelity/);
    assert.match(verificationFirst, /Do not claim an `approximate` check proves the broader gate/);
    assert.match(verificationFirst, /review-packet-gate/);
  });

  await test("core skills include behavior-calibrating examples", () => {
    const expected = [
      ["entry", "ask-harness", "## Example Routes"],
      ["workflow", "workflow-control", "## Fast Path Examples"],
      ["workflow", "stacked-branch-workflow", "## Output Templates"],
      ["workflow", "workflow-packaging-auditor", "## Candidate Qualification Rules"],
      ["workflow", "grill-me", "## Example Question"],
      ["workflow", "grill-with-docs", "## Decision Record"],
      ["workflow", "simplify", "## Example Pass"],
      ["change", "change-workspace-operator", "## Example Flows"],
      ["change", "change-planner", "## Example Task Slice"],
      ["change", "architecture-scout", "## Example Scout"],
      ["change", "diagnose", "## Example Diagnosis"],
      ["change", "prototype-spike", "## Example Spike Loop"],
      ["change", "verification-first", "## Example Validation Record"],
      ["knowledge", "memory-context-contract", "## Examples"],
      ["knowledge", "design-doc-refiner", "## Mini Example"],
      ["knowledge", "design-code-explainer", "## Example Mapping"],
      ["knowledge", "technical-doc-refinement", "## Example Edit"],
      ["review", "review-packet-gate", "## Minimal Example"],
      ["review", "grill-diff", "## Example Chunk"],
      ["review", "skill-judge", "## Example Finding"],
      ["review", "multi-lens-design-review", "## Example Gate"],
      ["review", "multi-lens-review", "## Example Synthesis"],
      ["review", "skill-authoring-governance", "## Example Edits"],
      ["review", "subagent-projection-review", "## Example Finding"],
      ["review", "subagent-judge", "## Anti-Patterns"],
      ["operations", "handoff-checkpoint", "## Good vs Bad"],
      ["operations", "skill-cleaner", "## Analyzer Notes"]
    ];
    for (const [category, skill, heading] of expected) {
      const text = fs.readFileSync(path.join(packageRoot, "skills", category, skill, "SKILL.md"), "utf8");
      assert.match(text, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${skill} missing ${heading}`);
    }
  });

  await test("design code explainer template does not ship sample evidence", () => {
    const template = fs.readFileSync(
      path.join(packageRoot, "skills", "knowledge", "design-code-explainer", "assets", "report-template.html"),
      "utf8"
    );
    for (const forbidden of [
      "替换为",
      "src/import",
      "RetryPolicy",
      "retry.test",
      "ImportPlanner",
      "path/to/",
      "sample/",
      "example/"
    ]) {
      assert.doesNotMatch(template, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(template, /\{\{REPORT_TITLE\}\}/);
    assert.match(template, /\{\{TRACEABILITY_TABLE\}\}/);
  });

  await test("design doc refiner preserves review-only boundary", () => {
    const text = fs.readFileSync(
      path.join(packageRoot, "skills", "knowledge", "design-doc-refiner", "SKILL.md"),
      "utf8"
    );
    assert.match(text, /review-only/);
    assert.match(text, /do not rewrite the document/i);
    assert.match(text, /multi-lens-design-review/);
    assert.match(text, /## Scope Packet/);
    assert.match(text, /confirmed source facts/);
    assert.match(text, /disputed claims/);
    assert.match(text, /unverifiable claims/);
    assert.match(text, /## Approach Selection/);
    assert.match(text, /status quo and reusable repository patterns/);
    assert.match(text, /1-3 viable alternatives/);
  });

  await test("skill-only distribution docs distinguish full harness install", () => {
    const readme = fs.readFileSync(path.join(packageRoot, "README.md"), "utf8");
    const normalized = readme.replace(/\s+/g, " ");
    assert.match(normalized, /complete harness install/);
    assert.match(normalized, /Skill-only installers/);
    assert.match(normalized, /does not install rules, tools, templates, subagents, hooks, or project memory/);
  });

  await test("newly migrated generic skills avoid project-bound tokens", () => {
    const migrated = [
      ["workflow", "stacked-branch-workflow"],
      ["workflow", "workflow-packaging-auditor"],
      ["workflow", "grill-me"],
      ["workflow", "grill-with-docs"],
      ["workflow", "simplify"],
      ["change", "change-planner"],
      ["change", "architecture-scout"],
      ["change", "diagnose"],
      ["change", "prototype-spike"],
      ["change", "verification-first"],
      ["knowledge", "technical-doc-refinement"],
      ["review", "grill-diff"],
      ["review", "skill-judge"],
      ["review", "subagent-judge"],
      ["operations", "skill-cleaner"]
    ];
    const forbidden = [
      "DBackup",
      "dbackup",
      "Redmine",
      "build-dbackup",
      "quick-project",
      "dbackup-change",
      ".skills/skill-cleaner"
    ];
    for (const [category, skill] of migrated) {
      const dir = path.join(packageRoot, "skills", category, skill);
      const files = collectFiles(dir)
        .filter((file) => !file.includes(`${path.sep}__pycache__${path.sep}`));
      for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        for (const token of forbidden) {
          assert.doesNotMatch(
            text,
            new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
            `${path.relative(packageRoot, file)} contains ${token}`
          );
        }
      }
    }
  });

  await test("second-tier migrations preserve requested boundaries", () => {
    const manifest = fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8");
    assert.doesNotMatch(manifest, /"humanizer"/);

    const grillMe = fs.readFileSync(path.join(packageRoot, "skills", "workflow", "grill-me", "SKILL.md"), "utf8");
    assert.match(grillMe, /ask one question at a time/i);

    const grillWithDocs = fs.readFileSync(path.join(packageRoot, "skills", "workflow", "grill-with-docs", "SKILL.md"), "utf8");
    assert.match(grillWithDocs, /repository-owned artifact/);
    assert.match(grillWithDocs, /Planning Artifact Challenge Pass/);
    assert.match(grillWithDocs, /draft, proposal, plan, design, detailed\s+design/);
    assert.match(grillWithDocs, /multi-lens-design-review/);
    assert.match(grillWithDocs, /architecture-scout/);
    assert.match(grillWithDocs, /design-doc-refiner/);
    assert.match(grillWithDocs, /Extract explicit and implicit assumptions/);
    assert.match(grillWithDocs, /Verify factual claims against artifacts or source/);
    assert.match(grillWithDocs, /Run a pre-mortem/);
    assert.match(grillWithDocs, /Do not create a new task structure, generate a design, or declare a formal\s+freeze\/readiness gate/);
    assert.doesNotMatch(grillWithDocs, /CONTEXT\.md/);
    assert.doesNotMatch(grillWithDocs, /\bADR\b/);

    const simplify = fs.readFileSync(path.join(packageRoot, "skills", "workflow", "simplify", "SKILL.md"), "utf8");
    assert.match(simplify, /after modifying code/i);
    assert.match(simplify, /code-simplifier/);
    assert.match(simplify, /review-only/);
    assert.match(simplify, /externally authored/);

    const codeSimplifier = fs.readFileSync(path.join(packageRoot, "agents", "roles", "code-simplifier.md"), "utf8");
    assert.match(codeSimplifier, /Round 1/);
    assert.match(codeSimplifier, /Unit Inventory/);
    assert.match(codeSimplifier, /behavior-preserving simplification changes/);

    const workflowControl = fs.readFileSync(path.join(packageRoot, "skills", "workflow", "workflow-control", "SKILL.md"), "utf8");
    assert.match(workflowControl, /simplify pass/);
    assert.match(workflowControl, /non-trivial code edits/);

    const technicalDoc = fs.readFileSync(path.join(packageRoot, "skills", "knowledge", "technical-doc-refinement", "SKILL.md"), "utf8");
    assert.match(technicalDoc, /anti-AI writing pass/);
    assert.match(technicalDoc, /writing-patterns\.md/);
    assert.match(technicalDoc, /PR\/MR descriptions/);
    assert.match(technicalDoc, /release notes/);
    assert.match(technicalDoc, /external `humanizer`/);

    const skillJudge = fs.readFileSync(path.join(packageRoot, "skills", "review", "skill-judge", "SKILL.md"), "utf8");
    assert.match(skillJudge, /90-100/);
    assert.match(skillJudge, /READY_WITH_NOTES/);
    assert.match(skillJudge, /NEEDS_REDESIGN/);

    const manifestJson = JSON.parse(manifest);
    const byId = Object.fromEntries(manifestJson.assets.skills.map((skill) => [skill.id, skill]));
    assert(byId["technical-doc-refinement"].triggers.includes("PR description"));
    assert(byId["technical-doc-refinement"].triggers.includes("release notes"));
    assert(byId["grill-with-docs"].triggers.includes("challenge draft"));
    assert(byId["grill-with-docs"].triggers.includes("challenge proposal"));
    assert(byId["grill-with-docs"].triggers.includes("challenge design"));
    assert(byId["grill-with-docs"].triggers.includes("challenge detailed design"));
    assert(byId["grill-with-docs"].triggers.includes("challenge plan"));
    assert(byId["grill-with-docs"].triggers.includes("poke holes in planning artifact"));
    assert(byId["grill-with-docs"].triggers.includes("devil's advocate planning artifact"));
    assert(byId["grill-with-docs"].triggers.includes("challenge selected approach before implementation"));
    assert(byId.simplify.negativeTriggers.includes("review-only request"));
    assert(byId.simplify.negativeTriggers.includes("externally authored diff without edit permission"));
  });

  await test("simplification review resolves task scope before inspecting code", () => {
    const simplify = fs.readFileSync(path.join(packageRoot, "skills", "workflow", "simplify", "SKILL.md"), "utf8");
    for (const required of [
      "Scope Packet",
      "git diff --cached",
      "git log <base>..HEAD",
      "git diff <base>..HEAD",
      "merge-base",
      "MR target",
      "upstream tracking branch",
      "repository default branch",
      "candidate bases",
      "included commits",
      "edit_authorized",
      "requested_mode=apply",
      "requested_mode=opportunities",
      "behavior_invariants",
      "validation_target",
      "Pass the Scope Packet to `code-simplifier`",
      "active `.changes/<task>/`",
      "quick",
      "standard",
      "deep",
      "Use a deep pass only when",
      "user explicitly asks",
      "unit-by-unit cleanup",
      "simplification/refactor task",
      "authorized slice is itself de-redundancy",
      "effective logic diff lines <= 40",
      "changed units <= 3",
      "Do not treat an empty current diff as an empty review"
    ]) {
      assert.match(simplify, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const codeSimplifier = fs.readFileSync(path.join(packageRoot, "agents", "roles", "code-simplifier.md"), "utf8");
    for (const required of [
      "Scope Packet",
      "edit_authorized=true",
      "requested_mode",
      "requested_mode=apply",
      "requested_mode=opportunities",
      "behavior_invariants",
      "validation_target",
      "NEEDS_AUTHORIZATION",
      "NEEDS_DECISION",
      "NO_SAFE_SIMPLIFICATION",
      "VALIDATION_FAILED",
      "opportunities-only",
      "Do not stage, commit, push, publish",
      "external systems",
      "active `.changes/<task>/`",
      "Unit Inventory",
      "every class, function, method, and key block",
      "trivial units",
      "essential",
      "optional",
      "redundant",
      "keep",
      "simplify",
      "replace",
      "remove",
      "coverage complete",
      "EvidenceRef is",
      "reviewer",
      "grill-diff"
    ]) {
      assert.match(codeSimplifier, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const grillDiff = fs.readFileSync(path.join(packageRoot, "skills", "review", "grill-diff", "SKILL.md"), "utf8");
    for (const required of [
      "Scope Packet",
      "user explicitly asks",
      "review each hunk or change",
      "step through",
      "current uncommitted diff",
      "task commit range",
      "already submitted commits",
      "Read-only by default",
      "Do not edit, stage, commit, push",
      "ordinary PR/MR review",
      "findings-first review",
      "review packet",
      "gate review",
      "broad risk-ordered review",
      "necessity",
      "Do not rely on `git diff` alone"
    ]) {
      assert.match(grillDiff, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const manifestJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const byId = Object.fromEntries(manifestJson.assets.skills.map((skill) => [skill.id, skill]));
    assert(byId.simplify.triggers.includes("deep simplification"));
    assert(byId.simplify.requires.includes("task scope packet"));
    assert(byId["grill-diff"].requires.includes("task scope packet"));
    assert(byId["grill-diff"].triggers.includes("step through task commit range"));
    assert(!byId["grill-diff"].triggers.includes("review task commit range"));
    assert(byId["grill-diff"].negativeTriggers.includes("ordinary PR/MR review"));
    assert(byId["grill-diff"].negativeTriggers.includes("findings-first review"));
    assert(byId["grill-diff"].negativeTriggers.includes("review packet or gate review"));
    assert(byId["grill-diff"].negativeTriggers.includes("broad risk-ordered review"));
  });
}
