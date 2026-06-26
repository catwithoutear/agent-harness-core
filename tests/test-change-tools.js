import assert from "node:assert/strict";
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
