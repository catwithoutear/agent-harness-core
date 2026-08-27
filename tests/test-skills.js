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

  await test("design review uses one actionable project-agnostic principles baseline", () => {
    const skill = fs.readFileSync(
      path.join(packageRoot, "skills", "review", "multi-lens-design-review", "SKILL.md"),
      "utf8"
    );
    const baseline = fs.readFileSync(
      path.join(
        packageRoot,
        "skills",
        "review",
        "multi-lens-design-review",
        "references",
        "design-principles-baseline.md"
      ),
      "utf8"
    );
    const implementationDesign = fs.readFileSync(
      path.join(packageRoot, "templates", "changes", "implementation-design", "README.md"),
      "utf8"
    );

    for (const required of [
      "references/design-principles-baseline.md",
      "single canonical baseline",
      "applicability screen",
      "reasoned `N/A`",
      "design_quality"
    ]) {
      assert.match(skill, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const principleHeadings = [...baseline.matchAll(/^### ((?:CQ|AQ)-\d+) .+$/gm)];
    assert.equal(principleHeadings.length, 23, "baseline principle inventory changed unexpectedly");
    for (let index = 0; index < principleHeadings.length; index += 1) {
      const start = principleHeadings[index].index;
      const end = principleHeadings[index + 1]?.index ?? baseline.indexOf("## Cross-Principle Interpretation");
      const section = baseline.slice(start, end);
      for (const field of ["**Intent:**", "**Ask:**", "**Evidence:**", "**Warning signs and tradeoffs:**"]) {
        assert.match(section, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${principleHeadings[index][1]} missing ${field}`);
      }
    }

    for (const required of [
      "high cohesion inside the boundary and low coupling",
      "Information Hiding, Contracts, And Invariants",
      "Dependency Direction And Abstraction Fitness",
      "Composition, Substitutability, And Extension",
      "Ownership, Lifetime, And Resource Safety",
      "RAII",
      "std::unique_ptr",
      "Explicit State, Data Shape, And Local Reasoning",
      "Explicit Errors And Failure Semantics",
      "KISS and YAGNI",
      "DRY applies to knowledge",
      "SOLID",
      "diagnostic vocabulary for responsibilities",
      "Capability-Centered Boundaries",
      "Controller, Service, Manager, Util",
      "Data Ownership, Integrity, And Evolution",
      "transaction boundary, idempotency identity",
      "compensation, reconciliation",
      "Failure Design, Recovery, And Degraded Modes",
      "Fault Isolation, Backpressure, And Resource Governance",
      "threads, tasks, memory, queues, connections",
      "Observability, Diagnosability, And Operability",
      "Quantified Performance And Capacity Budgets",
      "throughput, latency, concurrency, memory, storage",
      "Compatibility, Migration, And Progressive Evolution",
      "canary/gray criteria",
      "Testability And Verification Seams",
      "Security, Privacy, And Trust Boundaries",
      "Configuration, Deployment, And Environmental Independence",
      "Policy versus mechanism",
      "Local reasoning"
    ]) {
      assert.match(baseline, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `baseline missing ${required}`);
    }

    for (const forbidden of ["DBackup", "Redmine", "CNware", "/home/"]) {
      assert.doesNotMatch(baseline, new RegExp(forbidden, "i"));
    }

    assert.match(implementationDesign, /canonical code and\s+architecture design-principles baseline/);
    assert.match(implementationDesign, /report only material findings and reasoned `N\/A` results/);
  });

  await test("ask harness resolves source and deployed runtime evidence", () => {
    const text = fs.readFileSync(path.join(packageRoot, "skills", "entry", "ask-harness", "SKILL.md"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const askHarness = manifest.assets.skills.find((skill) => skill.id === "ask-harness");

    for (const required of [
      "## Evidence Resolution",
      "`.harness/core/harness.manifest.json`",
      "`.harness/projection-state.json`",
      "`.harness/*-overlay/`",
      "`@catwithoutear/agent-harness-core`",
      "does not prove that its target still exists or matches",
      "`--verify`",
      "Do not report that the repository has no manifest",
      "Only call the result best-effort",
      "no manifest candidate exists that passes Core identity validation"
    ]) {
      assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `ask-harness missing ${required}`);
    }

    assert.match(text, /`harness\.manifest\.json`[\s\S]*`\.harness\/core\/harness\.manifest\.json`[\s\S]*`\.harness\/projection-state\.json`/);
    assert.doesNotMatch(text, /DBackup/i);
    assert(askHarness.requires.includes("harness.manifest.json or .harness/core/harness.manifest.json when available"));
    assert(askHarness.requires.includes(".harness/projection-state.json when checking installed assets"));
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

  await test("review packet gate documents the sole structured review-run protocol", () => {
    const text = fs.readFileSync(path.join(packageRoot, "skills", "review", "review-packet-gate", "SKILL.md"), "utf8");
    for (const required of [
      "## Review-Run Protocol",
      "protocol=review-run",
      "dispatch contract",
      "### Target Identity",
      "review-target",
      "### Isolated Dispatches",
      "### Relation Ledger",
      "canonical JSON",
      "init-review-run",
      "RULE_SOURCE_GAP",
      "RULE_COVERAGE_GAP",
      "EVIDENCE_GAP",
      "coverage_gate",
      "review_gate",
      "implementation_verification_gate",
      "independent_review_gate",
      "style_gate",
      "overall_gate",
      "phase-a-packet",
      "coordinator_source_assessment",
      "review-target-digest.mjs",
      "fail closed"
    ]) {
      assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `review packet gate missing ${required}`);
    }
    assert.doesNotMatch(text, /review-run-v2|\bV1\b|\bV2\b|Expected Coverage Packet|PacketDigest/);
  });

  await test("workflow assets route one review-run protocol and separate gates", () => {
    const workflow = fs.readFileSync(path.join(packageRoot, "skills", "workflow", "workflow-control", "SKILL.md"), "utf8");
    const review = fs.readFileSync(path.join(packageRoot, "commands", "harness", "review.md"), "utf8");
    const command = fs.readFileSync(path.join(packageRoot, "commands", "harness", "workflow.md"), "utf8");
    for (const text of [workflow, review, command]) {
      for (const required of ["protocol=review-run", "quick", "standard", "deep", "coverage_gate", "review_gate", "independent_review_gate", "style_gate", "implementation_verification_gate", "overall_gate"]) {
        assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }
    assert.match(review, /review-verifier/);
    for (const text of [workflow, review, command]) {
      assert.match(text, /Phase A/);
      assert.match(text, /machine-built|machine transitions|machine barriers|separate machine/);
    }
    for (const text of [workflow, review, command]) {
      assert.doesNotMatch(text, /review-run-v2|\bV1\b|\bV2\b|Expected Coverage Packet|PACKET_SEAL/);
    }
  });

  await test("workflow convergence requires workflow plus overall-completion intent", () => {
    const workflowControl = fs.readFileSync(
      path.join(packageRoot, "skills", "workflow", "workflow-control", "SKILL.md"),
      "utf8"
    );
    const loopRule = fs.readFileSync(path.join(packageRoot, "rules", "loop-contract.md"), "utf8");
    const workflowCommand = fs.readFileSync(
      path.join(packageRoot, "commands", "harness", "workflow.md"),
      "utf8"
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const workflowAsset = manifest.assets.skills.find((skill) => skill.id === "workflow-control");

    assert(workflowAsset, "workflow-control manifest entry missing");
    for (const trigger of [
      "workflow with convergence intent",
      "workflow with continue-until-complete intent",
      "workflow with overall-acceptance intent"
    ]) {
      assert(workflowAsset.triggers.includes(trigger), `workflow-control trigger missing ${trigger}`);
    }
    for (const standalone of ["continue until complete", "按照 workflow 推动收敛"]) {
      assert.equal(
        workflowAsset.triggers.includes(standalone),
        false,
        `workflow-control manifest should not depend on standalone fixed trigger ${standalone}`
      );
    }

    for (const [name, text] of [
      ["workflow-control", workflowControl],
      ["loop contract", loopRule],
      ["workflow command", workflowCommand]
    ]) {
      const normalized = text.replace(/\s+/g, " ");
      for (const required of [
        "workflow-use signal",
        "overall-completion signal",
        "fixed phrase",
        "overall objective",
        "acceptance criteria",
        "without asking the user",
        "READY_WITH_NOTES",
        "NEEDS_USER_DECISION",
        "handoff",
        "context-compaction"
      ]) {
        assert.match(
          normalized,
          new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
          `${name} missing convergence contract: ${required}`
        );
      }
    }

    for (const example of [
      "按照 workflow 收敛",
      "使用 workflow 持续推进直到完成",
      "走 workflow，把剩余问题全部闭环",
      "follow the workflow until the overall goal is complete",
      "use the workflow and continue until all acceptance criteria pass"
    ]) {
      assert.match(
        workflowControl,
        new RegExp(example.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `workflow-control missing positive convergence example: ${example}`
      );
    }
    assert.match(
      workflowControl,
      /`use the workflow to inspect the current state` \| Ordinary workflow; no overall-completion signal\./
    );
    assert.match(
      workflowControl,
      /`continue until complete` \| Do not activate this contract; no workflow-use signal\./
    );

    assert.match(workflowControl, /`NOT_READY`[\s\S]*not terminal/i);
    assert.match(workflowCommand, /If it\s+is incomplete[\s\S]*re-enter the\s+appropriate phase/i);
    assert.match(loopRule, /Finish only when every applicable acceptance criterion passes/i);
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

  await test("workflow guidance preserves canonical design stage order", () => {
    const workflowControl = fs.readFileSync(path.join(packageRoot, "skills", "workflow", "workflow-control", "SKILL.md"), "utf8");
    const planner = fs.readFileSync(path.join(packageRoot, "skills", "change", "change-planner", "SKILL.md"), "utf8");
    const refiner = fs.readFileSync(path.join(packageRoot, "skills", "knowledge", "design-doc-refiner", "SKILL.md"), "utf8");
    const refinerContract = fs.readFileSync(
      path.join(packageRoot, "skills", "knowledge", "design-doc-refiner", "references", "output-contract.md"),
      "utf8"
    );
    const technicalDoc = fs.readFileSync(path.join(packageRoot, "skills", "knowledge", "technical-doc-refinement", "SKILL.md"), "utf8");
    const workspace = fs.readFileSync(path.join(packageRoot, "skills", "change", "change-workspace-operator", "SKILL.md"), "utf8");
    const workflowCommand = fs.readFileSync(path.join(packageRoot, "commands", "harness", "workflow.md"), "utf8");
    const planCommand = fs.readFileSync(path.join(packageRoot, "commands", "harness", "plan.md"), "utf8");
    const loopRule = fs.readFileSync(path.join(packageRoot, "rules", "loop-contract.md"), "utf8");

    for (const [name, text] of [
      ["workflow-control", workflowControl],
      ["change-planner", planner],
      ["change-workspace-operator", workspace],
      ["workflow command", workflowCommand],
      ["plan command", planCommand],
      ["loop contract", loopRule]
    ]) {
      assert.match(
        text,
        /solution-design review[\s\S]*implementation-design[\s\S]*task set/i,
        `${name} does not preserve solution-design review -> implementation-design -> task-set order`
      );
      assert.match(text, /return to\s+solution\s+design/i, `${name} does not return changed solutions to design`);
    }

    assert.match(workflowControl, /Fast path:[\s\S]*Compact path:[\s\S]*Design path:/);
    assert.match(workflowControl, /does not\s+change behavior, interfaces, lifecycle, dependencies, migration, or failure\s+contracts/);
    assert.match(workflowControl, /Review that lightweight plan when the risk warrants it/);
    assert.match(planner, /File\s+presence is not readiness evidence/);
    assert.match(
      planner,
      /Use `plan-only` for compact work[\s\S]*does not require a separate solution-design\s+artifact or review/
    );
    assert.match(
      planner,
      /Use `plan-only` for compact work[\s\S]*lightweight plan records\s+validation and rollback/
    );
    assert.match(
      planCommand,
      /compact `plan-only`[\s\S]*A separate solution-design artifact and review are unnecessary/
    );
    for (const text of [planner, planCommand]) {
      assert.match(
        text,
        /plan-only[\s\S]*Do not\s+create formal task slices or require a\s+task-set review/i
      );
      assert.match(text, /plan-only[\s\S]*risk warrants review/i);
    }

    for (const text of [refiner, refinerContract, technicalDoc]) {
      assert.match(text, /validation intent/i);
      assert.match(text, /change-planner/);
    }
    assert.match(refiner, /Stop at solution design, ambiguities, and validation intent/);
    assert.doesNotMatch(refiner, /concrete implementation statements/);
    assert.doesNotMatch(refiner, /missing implementation contracts/);
    assert.doesNotMatch(refiner, /implementation design readiness/);
    assert.doesNotMatch(refinerContract, /Implementation Task Breakdown/);
    assert.doesNotMatch(refinerContract, /## Implementation Tasks/);

    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const refinerAsset = manifest.assets.skills.find((skill) => skill.id === "design-doc-refiner");
    const refinerMeta = parseFrontMatter(
      path.join(packageRoot, "skills", "knowledge", "design-doc-refiner", "SKILL.md")
    );
    assert.equal(refinerAsset.description, refinerMeta.description);
    assert(!refinerAsset.triggers.includes("task slices"));
    assert(!refinerAsset.triggers.includes("implementation-ready design"));
    assert(refinerAsset.triggers.includes("solution design refinement"));
  });

  await test("template and user guidance preserve lightweight workflow paths", () => {
    const template = fs.readFileSync(
      path.join(packageRoot, "templates", "changes", "implementation-design", "README.md"),
      "utf8"
    );
    const readme = fs.readFileSync(path.join(packageRoot, "README.md"), "utf8");
    const readmeCn = fs.readFileSync(path.join(packageRoot, "README_CN.md"), "utf8");
    const normalizedTemplate = template.replace(/\s+/g, " ");
    const normalizedReadme = readme.replace(/\s+/g, " ");
    const normalizedReadmeCn = readmeCn.replace(/\s+/g, " ");
    const workflowSection = normalizedReadme.match(
      /## Change Workspace Design Packs (.*?) A legacy proposal workspace/
    )?.[1];
    const workflowSectionCn = normalizedReadmeCn.match(
      /## Change Workspace Design Packs (.*?) legacy proposal workspace/
    )?.[1];
    assert(workflowSection, "missing English workflow guidance section");
    assert(workflowSectionCn, "missing Chinese workflow guidance section");

    for (const required of [
      "settled, reviewed solution design",
      "return to solution design",
      "Review the populated pack before deriving task slices",
      "structural validation do not replace that review"
    ]) {
      assert.match(normalizedTemplate, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(template, /gate[_ -]reference/i);
    assert.doesNotMatch(template, /required.*digest/i);

    for (const required of [
      "Fast path:",
      "Compact path:",
      "Design path:",
      "Solution design decides behavior and boundaries",
      "File presence or structural validation is not approval",
      "Review the populated pack before deriving task slices"
    ]) {
      assert.match(normalizedReadme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(
      workflowSection,
      /Fast path:.*changes no behavior, interface, lifecycle, dependency, migration, or failure contract/
    );
    assert.match(
      workflowSection,
      /Compact path:.*settled solution.*no implementation-design trigger.*Review that plan when its risk warrants review/
    );
    assert.match(
      workflowSection,
      /Design path:.*review the solution design.*assess the implementation-design trigger.*review the populated pack.*create and review task slices/
    );
    for (const required of [
      "快速路径",
      "紧凑路径",
      "设计路径",
      "Solution design 决定行为和边界",
      "文件存在或结构校验通过都不等于获得批准",
      "完成 pack 后先审阅，再推导 task slices"
    ]) {
      assert.match(normalizedReadmeCn, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(
      workflowSectionCn,
      /快速路径.*不改变行为、接口、生命周期、依赖关系、迁移或失败契约/
    );
    assert.match(
      workflowSectionCn,
      /紧凑路径.*方案已经明确.*不触发 implementation-design.*风险需要时再审阅/
    );
    assert.match(
      workflowSectionCn,
      /设计路径.*审阅 solution design.*判断是否触发 implementation-design.*完成并审阅 pack.*创建和审阅 task slices/
    );

    for (const text of [normalizedTemplate, workflowSection, workflowSectionCn]) {
      assert.doesNotMatch(text, /gate[_ -]reference|artifact_sha256|decision_id|PacketDigest/i);
    }
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
      ["workflow", "clarify"],
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

  await test("clarify preserves intent and only blocks on material ambiguity", () => {
    const text = fs.readFileSync(
      path.join(packageRoot, "skills", "workflow", "clarify", "SKILL.md"),
      "utf8"
    );
    const examples = fs.readFileSync(
      path.join(packageRoot, "skills", "workflow", "clarify", "references", "examples.md"),
      "utf8"
    );
    assert.match(text, /原意优先/);
    assert.match(text, /关键歧义才提问/);
    assert.match(text, /不制造执行权限/);
    assert.match(text, /双向语义审计/);
    assert.match(examples, /自动调用：清晰指令直接执行/);
    assert.match(text, /references\/examples\.md/);
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
