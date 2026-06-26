import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runChangeDoc } from "../lib/change/doc-tool.js";
import { runChangeValidate } from "../lib/change/validator.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function run(test) {
  await test("policy output uses harness command names", () => {
    const result = capture(() => runChangeDoc(["--repo-root", packageRoot, "policy", "--json"]));
    assert.equal(result.status, 0, result.stderr);
    const policy = JSON.parse(result.stdout);
    assert.equal(policy.commands.policy, "harness-change-doc policy --json");
    assert.equal(policy.commands.add_implementation_design, "harness-change-doc add-implementation-design");
    assert.doesNotMatch(result.stdout, /dbackup-change-/i);
    assert.doesNotMatch(result.stdout, /quick-project/i);
  });

  await test("validator accepts a valid legacy proposal", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const result = capture(() => runChangeValidate(["--repo-root", repo, "--change", "feature-one"]));
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /mode=legacy_proposal errors=0 warnings=1/);
      assert.match(result.stdout, /validated_changes=1 errors=0 warnings=1/);
    });
  });

  await test("validator prefers repository schema when present", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      writeRepoSchema(repo, (schema) => {
        schema.change_id.pattern = "^local-[a-z0-9-]+$";
      });
      const result = capture(() => runChangeValidate(["--repo-root", repo, "--change", "feature-one"]));
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /invalid change id/);
    });
  });

  await test("doc tool creates terminology artifact", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const result = capture(() => runChangeDoc([
        "--repo-root",
        repo,
        "add-terminology",
        "structured-one",
        "--tags",
        "terminology",
        "--description",
        "Task terminology."
      ]));
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const terminology = path.join(repo, ".changes", "structured-one", "terminology.md");
      assert.equal(fs.existsSync(terminology), true);
      assert.match(fs.readFileSync(terminology, "utf8"), /artifact: terminology/);
    });
  });

  await test("doc tool creates implementation design topology pack", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const result = capture(() => runChangeDoc([
        "--repo-root",
        repo,
        "add-implementation-design",
        "structured-one",
        "--description",
        "Implementation topology pack."
      ]));
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const change = path.join(repo, ".changes", "structured-one");
      const implementationDesign = path.join(change, "implementation-design");
      for (const expected of [
        "README.md",
        "01-problem.md",
        "02-code-topology.md",
        "03-class-design.md",
        "04-runtime-flow.md",
        "05-error-model.md",
        "06-implementation-plan.md",
        "07-constraints.md"
      ]) {
        assert.equal(fs.existsSync(path.join(implementationDesign, expected)), true, `${expected} missing`);
      }

      const index = fs.readFileSync(path.join(implementationDesign, "README.md"), "utf8");
      assert.match(index, /artifact: implementation-design-index/);
      assert.match(index, /Subsystem/);
      assert.match(index, /Module/);
      assert.match(index, /Detailed Design Index/);
      assert.match(index, /stable indexing/);

      const topology = fs.readFileSync(path.join(implementationDesign, "02-code-topology.md"), "utf8");
      assert.match(topology, /## Subsystem Topology/);
      assert.match(topology, /## Module Topology/);

      const classDesign = fs.readFileSync(path.join(implementationDesign, "03-class-design.md"), "utf8");
      assert.match(classDesign, /## N\/A Usage/);
      assert.match(classDesign, /N\/A - <reason>/);

      const plan = fs.readFileSync(path.join(implementationDesign, "06-implementation-plan.md"), "utf8");
      assert.match(plan, /Design-to-Code Traceability/);
      assert.match(plan, /Coding Guardrails/);

      const validate = capture(() => runChangeValidate(["--repo-root", repo, "--change", "structured-one"]));
      assert.equal(validate.status, 0, validate.stdout + validate.stderr);
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=0/);
    });
  });

  await test("doc tool refuses implementation design pack for legacy workspace", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const result = capture(() => runChangeDoc([
        "--repo-root",
        repo,
        "add-implementation-design",
        "feature-one"
      ]));
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /requires a structured change workspace/);
      assert.equal(fs.existsSync(path.join(repo, ".changes", "feature-one", "implementation-design")), false);

      const validate = capture(() => runChangeValidate(["--repo-root", repo, "--change", "feature-one"]));
      assert.equal(validate.status, 0, validate.stdout + validate.stderr);
      assert.match(validate.stdout, /mode=legacy_proposal errors=0 warnings=1/);
    });
  });

  await test("doc tool preserves custom implementation design files without force", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const implementationDesign = path.join(repo, ".changes", "structured-one", "implementation-design");
      fs.mkdirSync(implementationDesign, { recursive: true });
      const customReadme = path.join(implementationDesign, "README.md");
      const customDetail = path.join(implementationDesign, "custom-area.md");
      fs.writeFileSync(
        customReadme,
        frontMatter("implementation-design-index", "design, implementation") + "# Custom Implementation Design\n"
      );
      fs.writeFileSync(
        customDetail,
        frontMatter("implementation-design-detail", "design, implementation") + "# Custom Area\n"
      );

      const result = capture(() => runChangeDoc([
        "--repo-root",
        repo,
        "add-implementation-design",
        "structured-one"
      ]));
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /SKIP existing: .*README\.md/);
      assert.match(fs.readFileSync(customReadme, "utf8"), /# Custom Implementation Design/);
      assert.match(fs.readFileSync(customDetail, "utf8"), /# Custom Area/);
      assert.equal(fs.existsSync(path.join(implementationDesign, "01-problem.md")), true);

      const validate = capture(() => runChangeValidate(["--repo-root", repo, "--change", "structured-one"]));
      assert.equal(validate.status, 0, validate.stdout + validate.stderr);
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=0/);
    });
  });

  await test("python doc tool mirrors implementation design behavior", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const structured = runPythonChangeDoc([
        "--repo-root",
        repo,
        "add-implementation-design",
        "structured-one",
        "--description",
        "Python topology pack."
      ]);
      assert.equal(structured.status, 0, structured.stdout + structured.stderr);
      const implementationDesign = path.join(repo, ".changes", "structured-one", "implementation-design");
      assert.equal(fs.existsSync(path.join(implementationDesign, "README.md")), true);
      assert.match(fs.readFileSync(path.join(implementationDesign, "03-class-design.md"), "utf8"), /N\/A - <reason>/);

      const customReadme = path.join(implementationDesign, "README.md");
      fs.writeFileSync(
        customReadme,
        frontMatter("implementation-design-index", "design, implementation") + "# Python Custom Design\n"
      );
      const preserve = runPythonChangeDoc([
        "--repo-root",
        repo,
        "add-implementation-design",
        "structured-one"
      ]);
      assert.equal(preserve.status, 0, preserve.stdout + preserve.stderr);
      assert.match(preserve.stdout, /SKIP existing: .*README\.md/);
      assert.match(fs.readFileSync(customReadme, "utf8"), /# Python Custom Design/);
    });

    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const legacy = runPythonChangeDoc([
        "--repo-root",
        repo,
        "add-implementation-design",
        "feature-one"
      ]);
      assert.equal(legacy.status, 1, legacy.stdout + legacy.stderr);
      assert.match(legacy.stderr, /requires a structured change workspace/);
      assert.equal(fs.existsSync(path.join(repo, ".changes", "feature-one", "implementation-design")), false);
    });
  });

  await test("doc tool creates task slices with planning contract fields", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const result = capture(() => runChangeDoc([
        "--repo-root",
        repo,
        "add-task-slice",
        "structured-one",
        "--slug",
        "api-timeout"
      ]));
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const slice = fs.readFileSync(path.join(repo, ".changes", "structured-one", "tasks", "slice-001-api-timeout.md"), "utf8");
      assertTaskSliceFields(slice);
    });

    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-two");
      const result = runPythonChangeDoc([
        "--repo-root",
        repo,
        "add-task-slice",
        "structured-two",
        "--slug",
        "api-timeout"
      ]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const slice = fs.readFileSync(path.join(repo, ".changes", "structured-two", "tasks", "slice-001-api-timeout.md"), "utf8");
      assertTaskSliceFields(slice);
    });
  });

  await test("validator treats v2 legacy review and timeline files as migration input", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const change = path.join(repo, ".changes", "structured-one");
      fs.writeFileSync(
        path.join(change, "terminology.md"),
        frontMatter("terminology", "terminology") + "# Terminology\n"
      );
      fs.writeFileSync(path.join(change, "review-log.md"), "legacy review notes\n");
      fs.writeFileSync(path.join(change, "timeline.md"), "legacy timeline notes\n");

      const result = capture(() => runChangeValidate(["--repo-root", repo, "--change", "structured-one"]));

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /mode=structured_proposal errors=0 warnings=2/);
      assert.match(result.stdout, /review-log\.md: legacy top-level artifact/);
      assert.match(result.stdout, /timeline\.md: legacy top-level artifact/);
      assert.doesNotMatch(result.stdout, /unexpected change workspace file/);

      const strict = capture(() => runChangeValidate([
        "--repo-root",
        repo,
        "--change",
        "structured-one",
        "--strict-layout"
      ]));

      assert.equal(strict.status, 1, strict.stdout + strict.stderr);
      assert.match(strict.stdout, /mode=structured_proposal errors=2 warnings=0/);
      assert.match(strict.stdout, /legacy top-level artifact/);
    });
  });
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

function runPythonChangeDoc(args) {
  return spawnSync("python3", [path.join(packageRoot, "lib", "change", "harness_change_doc.py"), ...args], {
    cwd: packageRoot,
    encoding: "utf8"
  });
}

function assertTaskSliceFields(text) {
  for (const expected of [
    "## Objective",
    "## Scope",
    "- Source design:",
    "- Goal:",
    "- Non-goals:",
    "- Scope:",
    "- Subsystem:",
    "- Module:",
    "- Changed surfaces:",
    "- Prerequisites:",
    "## Steps",
    "## Validation",
    "## Review",
    "- Review packet:",
    "- Review owner:",
    "## Rollback",
    "## Open Decisions"
  ]) {
    assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

function withTempRepo(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "harness-change-tools-"));
  try {
    fn(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function writeLegacyProposal(repo, changeId) {
  const change = path.join(repo, ".changes", changeId);
  fs.mkdirSync(path.join(change, "specs"), { recursive: true });
  fs.writeFileSync(
    path.join(change, "proposal.md"),
    [
      "## Why",
      "Need a change.",
      "## What Changes",
      "- Adds behavior.",
      "## Impact",
      "- Docs only.",
      "## Validation",
      "- Run validator.",
      "## Rollback",
      "- Revert.",
      ""
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(change, "tasks.md"),
    [
      "## 1. Implementation",
      "- [x] Add docs",
      "## 2. Validation",
      "- [ ] Run checks",
      ""
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(change, "specs", "feature.md"),
    [
      "## ADDED Requirements",
      "### Requirement: Validates changes",
      "#### Scenario: Valid change",
      "Given a complete change workspace",
      "When the validator runs",
      "Then it succeeds",
      ""
    ].join("\n")
  );
}

function writeStructuredProposal(repo, changeId) {
  writeLegacyProposal(repo, changeId);
  const change = path.join(repo, ".changes", changeId);
  fs.writeFileSync(
    path.join(change, "README.md"),
    [
      "---",
      "artifact: change-index",
      "status: draft",
      "tags: [workflow, local-tag]",
      'description: "Task index."',
      "---",
      "",
      "# Structured Change",
      "",
      "## Task Tag Registry",
      "",
      "| tag | description |",
      "|---|---|",
      "| `local-tag` | Local tag for tests. |",
      ""
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(change, "proposal.md"),
    frontMatter("proposal", "proposal") +
      [
        "## Why",
        "Need a change.",
        "## What Changes",
        "- Adds behavior.",
        "## Impact",
        "- Docs only.",
        "## Validation",
        "- Run validator.",
        "## Rollback",
        "- Revert.",
        ""
      ].join("\n")
  );
  fs.writeFileSync(
    path.join(change, "tasks.md"),
    frontMatter("tasks", "implementation") +
      [
        "## 1. Implementation",
        "- [x] Add docs",
        "## 2. Validation",
        "- [ ] Run checks",
        ""
      ].join("\n")
  );
  fs.writeFileSync(
    path.join(change, "requirements.md"),
    frontMatter("requirements", "requirements") + "## Goal\nClarify intent.\n"
  );
  fs.writeFileSync(
    path.join(change, "design.md"),
    frontMatter("design", "design") + "## Context\n\n## Detailed Design Index\n\n| Area | Document |\n|---|---|\n"
  );
  fs.writeFileSync(
    path.join(change, "specs", "README.md"),
    frontMatter("specs-index", "workflow") + "# Specs\n"
  );
  fs.writeFileSync(
    path.join(change, "specs", "feature.md"),
    frontMatter("delta-spec", "workflow") +
      [
        "## Purpose",
        "Validate structured proposal behavior.",
        "## Traceability",
        "- Requirement source: requirements.md",
        "## ADDED Requirements",
        "### Requirement: Validates structured changes",
        "#### Scenario: Valid structured change",
        "Given a structured change workspace",
        "When the validator runs",
        "Then it succeeds",
        ""
      ].join("\n")
  );
}

function writeRepoSchema(repo, mutate) {
  const schema = JSON.parse(fs.readFileSync(path.join(packageRoot, "schemas", "change-workspace.schema.json"), "utf8"));
  mutate(schema);
  fs.mkdirSync(path.join(repo, ".rules"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".rules", "change-doc-schema.json"), `${JSON.stringify(schema, null, 2)}\n`);
}

function frontMatter(artifact, tags) {
  return [
    "---",
    `artifact: ${artifact}`,
    "status: draft",
    `tags: [${tags}]`,
    'description: "Test artifact."',
    "---",
    ""
  ].join("\n");
}
