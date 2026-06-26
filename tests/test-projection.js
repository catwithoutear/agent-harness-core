import assert from "node:assert/strict";
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
      const result = capture(() =>
        runHarnessProject(["--target", target, "--dry-run", "--json", "--scope", "global", "--clients", "codex", "--content", "commands"])
      );
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      const targets = payload.records.map((record) => record.target);
      assert.equal(payload.summary.commands, 6);
      assert.equal(payload.summary.unsupported, 0);
      assert(targets.some((entry) => entry.endsWith(".codex/prompts/harness-workflow.md")));
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
      assert.equal(fs.existsSync(commandPath), true);
      assert.match(fs.readFileSync(commandPath, "utf8"), /Activate `workflow-control`/);

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
      assert.equal(fs.existsSync(path.join(target, ".omp", "commands", "harness-workflow.md")), true);
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
          "codex",
          "--content",
          "rules,skills",
          "--json"
        ])
      );
      assert.equal(project.status, 0, project.stdout + project.stderr);
      assert.equal(fs.existsSync(path.join(target, ".rules", "loop-contract.md")), true);
      assert.equal(fs.existsSync(path.join(target, ".agents", "skills", "ask-harness", "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), true);

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
          "rules,skills",
          "--json"
        ])
      );
      assert.equal(verify.status, 0, verify.stdout + verify.stderr);
      const payload = JSON.parse(verify.stdout);
      assert.equal(payload.action, "verify");
      assert.equal(payload.errors.length, 0);
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
