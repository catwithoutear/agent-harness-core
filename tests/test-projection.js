import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyProjectionTransaction,
  buildProjectionPlan,
  runHarnessProject
} from "../lib/project/projector.js";
import { compileProjectionOperations } from "../lib/project/operations.js";
import {
  normalizeProjectionState,
  serializeProjectionState
} from "../lib/project/projection-state.js";
import { loadManifest } from "../lib/manifest/validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function run(test) {
  await test("shared physical targets coalesce compatible consumers deterministically", () => {
    const bindings = [
      projectionBinding({ client: "zcode" }),
      projectionBinding({ client: "codex" })
    ];
    const operations = compileProjectionOperations(bindings);
    assert.equal(operations.length, 1);
    assert.deepEqual(operations[0].consumers, [
      { asset_id: "shared-skill", kind: "skills", client: "codex", scope: "project" },
      { asset_id: "shared-skill", kind: "skills", client: "zcode", scope: "project" }
    ]);
    assert.equal(operations.selectedTargets.has("/tmp/project/.agents/skills/shared-skill"), true);
  });

  await test("incompatible bindings at one physical target fail before materialization", () => {
    assert.throws(
      () => compileProjectionOperations([
        projectionBinding({ client: "codex", source: "/source/one" }),
        projectionBinding({ client: "zcode", source: "/source/two" })
      ]),
      (error) => error.code === "projection-target-collision"
    );
  });

  await test("same target rejects different logical assets even when source is shared", () => {
    assert.throws(
      () => compileProjectionOperations([
        projectionBinding({ asset_id: "asset-one", source: "/source/shared" }),
        projectionBinding({ asset_id: "asset-two", client: "zcode", source: "/source/shared" })
      ]),
      (error) => error.code === "projection-target-collision"
    );
  });

  await test("source-root migration accepts v1 and v2 state, verifies, and refreshes source ownership", () => {
    const sourceB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "entry", "ask-harness");
    for (const stateFormat of ["v1", "v2"]) {
      withTempTarget((target) => {
        const sourceRootA = fs.mkdtempSync(path.join(os.tmpdir(), "harness-source-root-"));
        try {
          const sourceA = path.join(sourceRootA, "ask-harness");
          fs.cpSync(sourceB, sourceA, { recursive: true });
          const initial = capture(() =>
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
              "ask-harness",
              "--json"
            ])
          );
          assert.equal(initial.status, 0, initial.stdout + initial.stderr);

          const statePath = path.join(target, ".harness", "projection-state.json");
          const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
          const operation = state.operations.find((entry) => entry.target.endsWith("/.agents/skills/ask-harness"));
          assert(operation, "initial ask-harness operation missing");
          if (stateFormat === "v1") {
            fs.writeFileSync(statePath, `${JSON.stringify({
              package: state.package,
              version: state.package_version,
              records: [{
                package: state.package,
                version: state.package_version,
                asset_id: "ask-harness",
                content_kind: "skills",
                client: "codex",
                scope: "project",
                source: sourceA,
                target: operation.target,
                mode: "copy",
                source_hash: operation.sources[0].hash,
                target_hash: operation.desired_hash
              }]
            }, null, 2)}\n`, "utf8");
          } else {
            operation.sources[0].path = sourceA;
            fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
          }

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
              "ask-harness",
              "--json"
            ])
          );
          assert.equal(verify.status, 0, `${stateFormat}: ${verify.stdout}${verify.stderr}`);

          const apply = capture(() =>
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
              "skills",
              "--skills",
              "ask-harness",
              "--json"
            ])
          );
          assert.equal(apply.status, 0, `${stateFormat}: ${apply.stdout}${apply.stderr}`);
          const refreshed = JSON.parse(fs.readFileSync(statePath, "utf8"));
          const refreshedOperation = refreshed.operations.find((entry) => entry.target === operation.target);
          assert.equal(refreshedOperation.sources[0].path, sourceB);
          assert.deepEqual(refreshedOperation.consumers, [
            { asset_id: "ask-harness", kind: "skills", client: "codex", scope: "project" },
            { asset_id: "ask-harness", kind: "skills", client: "zcode", scope: "project" }
          ]);
        } finally {
          fs.rmSync(sourceRootA, { recursive: true, force: true });
        }
      });
    }
  });

  await test("different prior asset at one target is a zero-write preflight failure", () => {
    withTempTarget((target) => {
      const initial = capture(() =>
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
          "ask-harness",
          "--json"
        ])
      );
      assert.equal(initial.status, 0, initial.stdout + initial.stderr);
      const statePath = path.join(target, ".harness", "projection-state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      const operation = state.operations.find((entry) => entry.target.endsWith("/.agents/skills/ask-harness"));
      assert(operation, "initial ask-harness operation missing");
      operation.consumers[0].asset_id = "different-asset";
      fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      const beforeState = fs.readFileSync(statePath, "utf8");
      const targetText = fs.readFileSync(path.join(operation.target, "SKILL.md"), "utf8");

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
          "skills",
          "--skills",
          "ask-harness",
          "--json"
        ])
      );
      assert.equal(result.status, 1);
      assert.match(result.stdout, /projection-target-collision/);
      assert.equal(fs.readFileSync(statePath, "utf8"), beforeState);
      assert.equal(fs.readFileSync(path.join(operation.target, "SKILL.md"), "utf8"), targetText);
    });
  });

  await test("v1 projection records normalize to canonical timestamp-free v2 bytes", () => {
    const v1 = {
      records: [{
        package: "@catwithoutear/agent-harness-core",
        version: "1.0.0",
        asset_id: "shared-skill",
        content_kind: "skills",
        client: "codex",
        source: "/source/shared-skill",
        target: "/tmp/project/.agents/skills/shared-skill",
        mode: "copy",
        source_hash: "source-hash",
        target_hash: "target-hash",
        timestamp: "2099-01-01T00:00:00.000Z"
      }]
    };
    const normalized = normalizeProjectionState(v1);
    assert.equal(normalized.schema_version, 2);
    assert.equal(normalized.operations.length, 1);
    assert.deepEqual(normalized.operations[0].consumers, [
      { asset_id: "shared-skill", kind: "skills", client: "codex", scope: "project" }
    ]);
    const first = serializeProjectionState(normalized);
    const second = serializeProjectionState(normalizeProjectionState(JSON.parse(first)));
    assert.equal(first, second);
    assert.doesNotMatch(first, /timestamp/);
    assert.match(first, /"schema_version": 2/);
  });

  await test("Codex and ZCode shared skill projection reports two logical consumers and one operation", () => {
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
          "codex,zcode",
          "--content",
          "skills",
          "--skills",
          "ask-harness",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.summary.logical_total, 2);
      assert.equal(payload.summary.physical_total, 1);
      assert.equal(payload.records.length, 1);
      assert.deepEqual(
        payload.records[0].consumers.map((consumer) => consumer.client),
        ["codex", "zcode"]
      );
      const state = JSON.parse(
        fs.readFileSync(path.join(target, ".harness", "projection-state.json"), "utf8")
      );
      assert.equal(state.schema_version, 2);
      assert.equal(state.operations.length, 1);
      assert.equal(state.operations[0].consumers.length, 2);
    });
  });

  await test("opposite selection orders converge and preserve unselected operations", () => {
    const project = (clients, target) => {
      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          clients,
          "--content",
          "skills",
          "--skills",
          "ask-harness",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
    };
    withTempTarget((codexThenZCode) => {
      withTempTarget((zCodeThenCodex) => {
        project("codex", codexThenZCode);
        project("zcode", codexThenZCode);
        project("zcode", zCodeThenCodex);
        project("codex", zCodeThenCodex);
        const left = JSON.parse(fs.readFileSync(
          path.join(codexThenZCode, ".harness", "projection-state.json"),
          "utf8"
        ));
        const right = JSON.parse(fs.readFileSync(
          path.join(zCodeThenCodex, ".harness", "projection-state.json"),
          "utf8"
        ));
        for (const state of [left, right]) {
          for (const operation of state.operations) {
            operation.id = "operation-id";
            operation.target = "<target>";
          }
        }
        assert.deepEqual(left, right);
      });
    });
  });

  await test("a later narrow selection retains prior unselected operations", () => {
    withTempTarget((target) => {
      const project = (clients, skills) => {
        const result = capture(() =>
          runHarnessProject([
            "--target",
            target,
            "--mode",
            "copy",
            "--conflict",
            "overwrite",
            "--clients",
            clients,
            "--content",
            "skills",
            "--skills",
            skills,
            "--json"
          ])
        );
        assert.equal(result.status, 0, result.stdout + result.stderr);
        return JSON.parse(result.stdout);
      };
      project("codex", "ask-harness,clarify");
      const narrow = project("zcode", "ask-harness");
      assert.equal(narrow.summary.physical_total, 1);
      const state = JSON.parse(
        fs.readFileSync(path.join(target, ".harness", "projection-state.json"), "utf8")
      );
      assert.equal(state.operations.length, 2);
      assert.equal(
        state.operations.some((operation) =>
          operation.consumers.some((consumer) => consumer.asset_id === "clarify")
        ),
        true
      );
    });
  });

  await test("malformed v1 state is a zero-write preflight failure", () => {
    withTempTarget((target) => {
      const statePath = path.join(target, ".harness", "projection-state.json");
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({ records: [{ target: 42 }] }), "utf8");
      const before = fs.readFileSync(statePath, "utf8");
      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--conflict",
          "overwrite",
          "--clients",
          "zcode",
          "--content",
          "skills",
          "--skills",
          "ask-harness",
          "--json"
        ])
      );
      assert.equal(result.status, 1);
      assert.match(result.stdout, /projection-state-migration-invalid/);
      assert.equal(fs.readFileSync(statePath, "utf8"), before);
      assert.equal(fs.existsSync(path.join(target, ".agents")), false);
    });
  });

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

  await test("isolated ZCode projection aligns the orchestrator receipt path with the deployed shared skill", () => {
    withTempTarget((target) => {
      const result = capture(() =>
        runHarnessProject([
          "--target", target,
          "--mode", "copy",
          "--conflict", "overwrite",
          "--clients", "zcode",
          "--content", "skills,subagents",
          "--skills", "memory-context-contract",
          "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);

      const rolePath = path.join(target, ".zcode", "agents", "harness-orchestrator.md");
      const receiptScriptPath = path.join(
        target,
        ".agents",
        "skills",
        "memory-context-contract",
        "scripts",
        "context-retrieval-receipt.mjs"
      );
      assert.equal(fs.existsSync(rolePath), true, "ZCode orchestrator projection missing");
      assert.equal(fs.existsSync(receiptScriptPath), true, "deployed receipt validator missing");
      const role = fs.readFileSync(rolePath, "utf8");
      const roleReceiptPath = role.match(
        /`(\.agents\/skills\/memory-context-contract\/scripts\/context-retrieval-receipt\.mjs)`/u
      )?.[1];
      assert.equal(roleReceiptPath, path.relative(target, receiptScriptPath));
      assert.doesNotMatch(
        role,
        /skills\/knowledge\/memory-context-contract\/scripts\/context-retrieval-receipt\.mjs/u
      );
      assert.equal(fs.existsSync(path.join(target, ".zcode", "skills")), false);
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
      const skillRecord = state.operations.find((operation) =>
        operation.consumers.some((consumer) => consumer.asset_id === "handoff-checkpoint")
      );
      assert(skillRecord, "handoff-checkpoint projection state missing");
      skillRecord.sources[0].hash = "stale-source-hash";
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

  await test("verify restores the unmanaged existing-target warning for generic clients", () => {
    withTempTarget((target) => {
      const rulePath = path.join(target, ".rules", "loop-contract.md");
      fs.mkdirSync(path.dirname(rulePath), { recursive: true });
      fs.writeFileSync(rulePath, "user rule\n", "utf8");
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
          "rules",
          "--json"
        ])
      );
      assert.equal(verify.status, 0, verify.stdout + verify.stderr);
      const payload = JSON.parse(verify.stdout);
      assert(payload.warnings.includes(`${rulePath}: exists but is not recorded in projection state`));
      const record = payload.records.find((entry) => entry.target === rulePath);
      assert(record, "unmanaged target record missing");
      assert.equal(record.status, "unmanaged");
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
      const agentRecord = state.operations.find(
        (operation) => operation.consumers.some(
          (consumer) => consumer.client === "opencode" && consumer.asset_id === "reviewer"
        )
      );
      assert(agentRecord, "reviewer projection state missing");
      const originalSourceHash = agentRecord.sources[0].hash;
      const staleTargetHash = crypto.createHash("sha256").update(fs.readFileSync(agentPath)).digest("hex");
      agentRecord.desired_hash = staleTargetHash;
      fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

      const recorded = JSON.parse(fs.readFileSync(statePath, "utf8")).operations.find(
        (operation) => operation.consumers.some(
          (consumer) => consumer.client === "opencode" && consumer.asset_id === "reviewer"
        )
      );
      assert.equal(recorded.sources[0].hash, originalSourceHash);
      assert.equal(recorded.desired_hash, staleTargetHash);

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
      const ruleRecord = state.operations.find((record) => record.target === rulePath);
      const skillRecord = state.operations.find((record) => record.target === skillPath);
      assert.equal(ruleRecord.mode, "copy");
      assert.equal(skillRecord.mode, "copy");
    });
  });

  await test("ZCode Hook projection commits adapters and managed config, then verifies both", () => {
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
      assert.equal(payload.records.filter((record) => record.status === "projected").length, 6);

      const configPath = path.join(target, ".zcode", "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      assert.equal(config.hooks.enabled, true);
      assert.equal(config.hooks.events.SessionStart.length, 3);
      assert.equal(config.hooks.events.PreToolUse.length, 2);
      for (const event of ["SessionStart", "PreToolUse"]) {
        for (const declaration of config.hooks.events[event]) {
          assert.equal(declaration.hooks[0].type, "process");
          assert.equal(declaration.hooks[0].command, "node");
          assert.match(declaration.hooks[0].args[0], /\.zcode\/harness\/hooks\/.*\.mjs$/);
        }
      }
      for (const intent of [
        "session-bootstrap",
        "active-change-guard",
        "projection-health-check",
        "tool-safety-guard",
        "regulated-structure-guard"
      ]) {
        assert.equal(
          fs.existsSync(path.join(target, ".zcode", "harness", "hooks", `${intent}.mjs`)),
          true,
          `${intent} adapter missing`
        );
      }

      const state = JSON.parse(
        fs.readFileSync(path.join(target, ".harness", "projection-state.json"), "utf8")
      );
      assert.equal(state.operations.length, 6);
      const configOperation = state.operations.find((operation) => operation.strategy === "json-merge");
      assert(configOperation, "ZCode config operation missing");
      assert.equal(configOperation.managed_fragments.length, 5);
      assert.equal(Object.hasOwn(configOperation, "desired_text"), false);
      assert.equal(JSON.stringify(configOperation).includes("mcpServers"), false);

      const dryRun = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--dry-run",
          "--clients",
          "zcode",
          "--content",
          "hooks",
          "--json"
        ])
      );
      assert.equal(dryRun.status, 0, dryRun.stdout + dryRun.stderr);
      assert.equal(JSON.parse(dryRun.stdout).errors.length, 0);

      const verify = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--verify",
          "--clients",
          "zcode",
          "--content",
          "hooks",
          "--json"
        ])
      );
      assert.equal(verify.status, 0, verify.stdout + verify.stderr);
      assert.equal(JSON.parse(verify.stdout).errors.length, 0);
    });
  });

  await test("ZCode Hook merge preserves config mode, unrelated edits, and repeat bytes", () => {
    withTempTarget((target) => {
      const configPath = path.join(target, ".zcode", "config.json");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        `${JSON.stringify({ mcpServers: { preserved: { token: "secret" } } }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o640 }
      );
      const first = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(first.status, 0, first.stdout + first.stderr);
      const mode = fs.statSync(configPath).mode & 0o7777;
      const firstConfig = fs.readFileSync(configPath, "utf8");
      const adapterPath = path.join(
        target,
        ".zcode",
        "harness",
        "hooks",
        "session-bootstrap.mjs"
      );
      fs.chmodSync(adapterPath, 0o711);
      const adapterMode = fs.statSync(adapterPath).mode & 0o7777;
      const statePath = path.join(target, ".harness", "projection-state.json");
      const firstState = fs.readFileSync(statePath, "utf8");

      const unrelated = JSON.parse(firstConfig);
      unrelated.pluginSettings = { preserved: true };
      fs.writeFileSync(configPath, `${JSON.stringify(unrelated, null, 2)}\n`, "utf8");
      const second = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(second.status, 0, second.stdout + second.stderr);
      assert.equal(fs.statSync(configPath).mode & 0o7777, mode);
      assert.equal(fs.statSync(adapterPath).mode & 0o7777, adapterMode);
      const secondConfig = fs.readFileSync(configPath, "utf8");
      const secondState = fs.readFileSync(statePath, "utf8");
      assert.match(secondConfig, /"pluginSettings"/);
      assert.equal(JSON.parse(secondConfig).mcpServers.preserved.token, "secret");
      assert.notEqual(secondState, firstState, "state hash should track the current desired config bytes");

      const third = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(third.status, 0, third.stdout + third.stderr);
      assert.equal(fs.readFileSync(configPath, "utf8"), secondConfig);
      assert.equal(fs.readFileSync(statePath, "utf8"), secondState);
      assert.notEqual(firstConfig, secondConfig, "fixture should exercise unrelated edit preservation");
    });
  });

  await test("invalid ZCode config is a zero-write preflight failure", () => {
    withTempTarget((target) => {
      const configPath = path.join(target, ".zcode", "config.json");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, "{not-json", "utf8");
      const before = fs.readFileSync(configPath, "utf8");
      const result = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(result.status, 1);
      assert.match(result.stdout, /zcode-config-json-invalid/);
      assert.equal(fs.readFileSync(configPath, "utf8"), before);
      assert.equal(fs.existsSync(path.join(target, ".zcode", "harness")), false);
      assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), false);
    });
  });

  await test("invalid ZCode JSON leaves codex records planned and writes nothing", () => {
    withTempTarget((target) => {
      const configPath = path.join(target, ".zcode", "config.json");
      const rulePath = path.join(target, ".rules", "loop-contract.md");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, "{not-json", "utf8");
      const beforeConfig = fs.readFileSync(configPath, "utf8");
      const result = capture(() =>
        runHarnessProject([
          "--target",
          target,
          "--mode",
          "copy",
          "--conflict",
          "overwrite",
          "--clients",
          "codex,zcode",
          "--content",
          "rules,hooks",
          "--json"
        ])
      );
      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      assert.match(payload.errors.join("\n"), /zcode-config-json-invalid/);
      const ruleRecord = payload.records.find((record) => record.asset_id === "loop-contract");
      assert(ruleRecord, "codex rule record missing from preflight result");
      assert.notEqual(ruleRecord.status, "projected");
      assert.equal(fs.existsSync(rulePath), false);
      assert.equal(fs.readFileSync(configPath, "utf8"), beforeConfig);
      assert.equal(fs.existsSync(path.join(target, ".zcode", "harness")), false);
      assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), false);
    });
  });

  await test("configured-disabled ZCode hooks remain disabled with a deterministic warning", () => {
    withTempTarget((target) => {
      const configPath = path.join(target, ".zcode", "config.json");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, `${JSON.stringify({ hooks: { enabled: false } }, null, 2)}\n`, "utf8");
      const result = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(
        payload.warnings.filter((warning) => warning.startsWith("configured-disabled:")),
        [`configured-disabled: ${configPath}`]
      );
      assert.equal(JSON.parse(fs.readFileSync(configPath, "utf8")).hooks.enabled, false);
    });
  });

  await test("managed ZCode drift fails apply and verify without changing adapters or state", () => {
    withTempTarget((target) => {
      const first = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(first.status, 0, first.stdout + first.stderr);
      const configPath = path.join(target, ".zcode", "config.json");
      const adapterPath = path.join(target, ".zcode", "harness", "hooks", "session-bootstrap.mjs");
      const beforeAdapter = fs.readFileSync(adapterPath, "utf8");
      const statePath = path.join(target, ".harness", "projection-state.json");
      const beforeState = fs.readFileSync(statePath, "utf8");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.hooks.events.SessionStart[0].hooks[0].timeoutMs = 4000;
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      const apply = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(apply.status, 1);
      assert.match(apply.stdout, /managed-hook-modified/);
      assert.equal(fs.readFileSync(adapterPath, "utf8"), beforeAdapter);
      assert.equal(fs.readFileSync(statePath, "utf8"), beforeState);

      const verify = capture(() =>
        runHarnessProject([
          "--target", target, "--verify", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(verify.status, 1);
      assert.match(verify.stdout, /managed-hook-modified/);
    });
  });

  await test("state commit failure rolls back all ZCode targets and cleans transaction paths", () => {
    withTempTarget((target) => {
      const { manifest } = loadManifest(packageRoot);
      const options = zcodeProjectionOptions(target);
      const plan = buildProjectionPlan(manifest, options);
      const originalRename = fs.renameSync.bind(fs);
      const failingFs = {
        renameSync(source, destination, ...rest) {
          if (destination.endsWith(path.join(".harness", "projection-state.json")) && source.includes(".harness-tmp-")) {
            const error = new Error("injected state commit failure");
            error.code = "EIO";
            throw error;
          }
          return originalRename(source, destination, ...rest);
        }
      };
      const result = applyProjectionTransaction(plan, options, manifest, failingFs);
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /projection-commit-failed/);
      assert.equal(result.records.some((record) => record.status === "projected"), false);
      assert(result.records.some((record) => ["not-applied", "rolled-back"].includes(record.status)));
      assert.equal(fs.existsSync(path.join(target, ".zcode", "config.json")), false);
      assert.equal(fs.existsSync(path.join(target, ".zcode", "harness", "hooks", "session-bootstrap.mjs")), false);
      assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), false);
      assert.equal(transactionArtifacts(target).length, 0);
    });
  });

  await test("state-committed cleanup failure preserves new ZCode targets and reports residue", () => {
    withTempTarget((target) => {
      const initial = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(initial.status, 0, initial.stdout + initial.stderr);
      const configPath = path.join(target, ".zcode", "config.json");
      const adapterPath = path.join(target, ".zcode", "harness", "hooks", "session-bootstrap.mjs");
      const statePath = path.join(target, ".harness", "projection-state.json");
      const expectedConfig = fs.readFileSync(configPath, "utf8");
      const expectedAdapter = fs.readFileSync(adapterPath, "utf8");
      fs.writeFileSync(adapterPath, "old adapter\n", "utf8");

      const { manifest } = loadManifest(packageRoot);
      const options = { ...zcodeProjectionOptions(target), version: "1.0.1" };
      const plan = buildProjectionPlan(manifest, options);
      const originalRmSync = fs.rmSync.bind(fs);
      let backupRemovals = 0;
      const failingFs = {
        rmSync(targetPath, ...rest) {
          if (targetPath.includes(".harness-backup-")) {
            backupRemovals += 1;
            if (backupRemovals === 2) {
              const error = new Error("injected backup cleanup failure");
              error.code = "EIO";
              throw error;
            }
          }
          return originalRmSync(targetPath, ...rest);
        }
      };
      const result = applyProjectionTransaction(plan, options, manifest, failingFs);
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /projection-cleanup-failed/);
      assert.doesNotMatch(result.errors.join("\n"), /secret|token|mcpServers/i);
      assert.equal(fs.readFileSync(configPath, "utf8"), expectedConfig);
      assert.equal(fs.readFileSync(adapterPath, "utf8"), expectedAdapter);
      assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8")).package_version, "1.0.1");
      assert.equal(fs.existsSync(configPath), true);
      assert.equal(fs.existsSync(adapterPath), true);
      assert.equal(fs.existsSync(statePath), true);
      const residue = transactionArtifacts(target);
      assert(residue.some((entry) => entry.includes(".harness-backup-")), "failed cleanup residue should be visible");
    });
  });

  await test("staging write and cleanup failures report a mode-safe temp residue", () => {
    withTempTarget((target) => {
      const syntheticToken = "synthetic-token";
      const configPath = path.join(target, ".zcode", "config.json");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        `${JSON.stringify({ mcpServers: { preserved: { token: syntheticToken } } }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o640 }
      );
      const initial = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(initial.status, 0, initial.stdout + initial.stderr);
      const beforeConfig = fs.readFileSync(configPath, "utf8");
      const statePath = path.join(target, ".harness", "projection-state.json");
      const beforeState = fs.readFileSync(statePath, "utf8");
      const priorMode = fs.statSync(configPath).mode & 0o7777;
      assert.equal(priorMode, 0o640);

      const originalWriteFileSync = fs.writeFileSync.bind(fs);
      const originalRmSync = fs.rmSync.bind(fs);
      let writeFailureInjected = false;
      let cleanupFailureInjected = false;
      const failingFs = {
        writeFileSync(tempPath, data, ...rest) {
          if (!writeFailureInjected && tempPath.includes(".zcode/.config.json.harness-tmp-")) {
            writeFailureInjected = true;
            originalWriteFileSync(tempPath, `${data}${syntheticToken}`, ...rest);
            const error = new Error("injected staging write failure");
            error.code = "EIO";
            throw error;
          }
          return originalWriteFileSync(tempPath, data, ...rest);
        },
        rmSync(tempPath, ...rest) {
          if (!cleanupFailureInjected && tempPath.includes(".zcode/.config.json.harness-tmp-")) {
            cleanupFailureInjected = true;
            const error = new Error("EACCES: injected staging cleanup failure");
            error.code = "EACCES";
            throw error;
          }
          return originalRmSync(tempPath, ...rest);
        }
      };
      const { manifest } = loadManifest(packageRoot);
      const options = zcodeProjectionOptions(target);
      const plan = buildProjectionPlan(manifest, options);
      const result = applyProjectionTransaction(plan, options, manifest, failingFs);
      assert.equal(result.ok, false);
      const diagnostics = result.errors.join("\n");
      assert.match(diagnostics, /projection-commit-failed/);
      assert.match(diagnostics, /residue=.*\.harness-tmp-/);
      assert.match(diagnostics, /action=cleanup-temp/);
      assert.match(diagnostics, /EACCES/);
      assert.doesNotMatch(diagnostics, /synthetic-token/);
      assert.equal(result.records.some((record) => record.status === "projected"), false);
      assert.equal(fs.readFileSync(configPath, "utf8"), beforeConfig);
      assert.equal(fs.readFileSync(statePath, "utf8"), beforeState);
      const residues = transactionArtifacts(target).filter((entry) => entry.includes(".zcode/.config.json.harness-tmp-"));
      assert.equal(residues.length, 1);
      assert.equal(fs.statSync(residues[0]).mode & 0o7777, priorMode);
    });
  });

  await test("staging failure removes transaction-created empty ZCode directories", () => {
    withTempTarget((target) => {
      const { manifest } = loadManifest(packageRoot);
      const options = zcodeProjectionOptions(target);
      const plan = buildProjectionPlan(manifest, options);
      const originalWriteFileSync = fs.writeFileSync.bind(fs);
      const failingFs = {
        writeFileSync(tempPath, data, ...rest) {
          if (tempPath.includes(".zcode/.config.json.harness-tmp-")) {
            const error = new Error("injected first config staging failure");
            error.code = "EIO";
            throw error;
          }
          return originalWriteFileSync(tempPath, data, ...rest);
        }
      };
      const result = applyProjectionTransaction(plan, options, manifest, failingFs);
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /projection-commit-failed/);
      assert.equal(result.records.some((record) => record.status === "projected"), false);
      assert.equal(fs.existsSync(path.join(target, ".zcode")), false);
      assert.equal(fs.existsSync(path.join(target, ".harness")), false);
    });
  });

  await test("generic conflict backup retains a durable user backup", () => {
    withTempTarget((target) => {
      const rulePath = path.join(target, ".rules", "loop-contract.md");
      fs.mkdirSync(path.dirname(rulePath), { recursive: true });
      fs.writeFileSync(rulePath, "user rule\n", "utf8");
      const result = capture(() =>
        runHarnessProject([
          "--target", target, "--mode", "copy", "--conflict", "backup", "--clients", "codex", "--content", "rules", "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const source = fs.readFileSync(path.join(packageRoot, "rules", "loop-contract.md"), "utf8");
      assert.equal(fs.readFileSync(rulePath, "utf8"), source);
      const backups = fs.readdirSync(path.dirname(rulePath))
        .filter((entry) => entry.startsWith("loop-contract.md.bak."));
      assert.equal(backups.length, 1);
      assert.equal(fs.readFileSync(path.join(path.dirname(rulePath), backups[0]), "utf8"), "user rule\n");
      assert.equal(transactionArtifacts(target).length, 0);
    });
  });

  await test("ZCode adapter conflict backup retains a durable user backup", () => {
    withTempTarget((target) => {
      const adapterPath = path.join(target, ".zcode", "harness", "hooks", "session-bootstrap.mjs");
      fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
      fs.writeFileSync(adapterPath, "user adapter\n", "utf8");
      const result = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "backup", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.notEqual(fs.readFileSync(adapterPath, "utf8"), "user adapter\n");
      const backups = fs.readdirSync(path.dirname(adapterPath))
        .filter((entry) => entry.startsWith("session-bootstrap.mjs.bak."));
      assert.equal(backups.length, 1);
      assert.equal(fs.readFileSync(path.join(path.dirname(adapterPath), backups[0]), "utf8"), "user adapter\n");
      assert.equal(transactionArtifacts(target).length, 0);
    });
  });

  await test("rollback failure returns typed redacted diagnostics and retains old state", () => {
    withTempTarget((target) => {
      const initial = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(initial.status, 0, initial.stdout + initial.stderr);
      const statePath = path.join(target, ".harness", "projection-state.json");
      const beforeState = fs.readFileSync(statePath, "utf8");
      const { manifest } = loadManifest(packageRoot);
      const options = zcodeProjectionOptions(target);
      const plan = buildProjectionPlan(manifest, options);
      const originalRename = fs.renameSync.bind(fs);
      let stateCommitFailure = true;
      let restoreFailure = true;
      const failingFs = {
        renameSync(source, destination, ...rest) {
          if (stateCommitFailure && destination.endsWith(path.join(".harness", "projection-state.json")) && source.includes(".harness-tmp-")) {
            stateCommitFailure = false;
            const error = new Error("injected state commit failure");
            error.code = "EIO";
            throw error;
          }
          if (restoreFailure && source.includes(".harness-backup-") && !destination.endsWith(path.join(".harness", "projection-state.json"))) {
            restoreFailure = false;
            const error = new Error("injected rollback failure");
            error.code = "EACCES";
            throw error;
          }
          return originalRename(source, destination, ...rest);
        }
      };
      const result = applyProjectionTransaction(plan, options, manifest, failingFs);
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /projection-transaction-rollback-failed/);
      assert.doesNotMatch(result.errors.join("\n"), /secret|token|mcpServers/i);
      assert.equal(fs.readFileSync(statePath, "utf8"), beforeState);
      assert.equal(transactionArtifacts(target).filter((entry) => entry.includes(".harness-tmp-")).length, 0);
    });
  });

  await test("missing required rollback backup fails closed and retains the new affected target", () => {
    withTempTarget((target) => {
      const initial = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(initial.status, 0, initial.stdout + initial.stderr);
      const affectedTarget = path.join(target, ".zcode", "harness", "hooks", "session-bootstrap.mjs");
      const expectedNewTarget = fs.readFileSync(affectedTarget, "utf8");
      fs.writeFileSync(affectedTarget, "old adapter\n", "utf8");
      const statePath = path.join(target, ".harness", "projection-state.json");
      const beforeState = fs.readFileSync(statePath, "utf8");
      const { manifest } = loadManifest(packageRoot);
      const options = zcodeProjectionOptions(target);
      const plan = buildProjectionPlan(manifest, options);
      const originalRename = fs.renameSync.bind(fs);
      const originalRmSync = fs.rmSync.bind(fs);
      let stateCommitFailure = true;
      const failingFs = {
        renameSync(source, destination, ...rest) {
          if (
            stateCommitFailure &&
            destination.endsWith(path.join(".harness", "projection-state.json")) &&
            source.includes(".harness-tmp-")
          ) {
            stateCommitFailure = false;
            const backup = fs.readdirSync(path.dirname(affectedTarget))
              .find((entry) => entry.startsWith(".session-bootstrap.mjs.harness-backup-"));
            assert(backup, "affected target rollback backup was not staged");
            originalRmSync(path.join(path.dirname(affectedTarget), backup), { recursive: true, force: true });
            const error = new Error("injected state commit failure");
            error.code = "EIO";
            throw error;
          }
          return originalRename(source, destination, ...rest);
        }
      };
      const result = applyProjectionTransaction(plan, options, manifest, failingFs);
      assert.equal(result.ok, false);
      const diagnostics = result.errors.join("\n");
      assert.match(diagnostics, /projection-transaction-rollback-failed/);
      assert.match(diagnostics, /required rollback backup is missing/);
      assert.equal(fs.readFileSync(affectedTarget, "utf8"), expectedNewTarget);
      assert.equal(fs.readFileSync(statePath, "utf8"), beforeState);
      const affectedRecord = result.records.find((record) => record.target === affectedTarget);
      assert(affectedRecord, "affected adapter record missing");
      assert.equal(affectedRecord.status, "rollback-failed");
      assert.equal(result.records.some((record) => record.status === "projected"), false);
    });
  });

  await test("ZCode global Hook projection uses CLI config and harness adapter paths", () => {
    withTempTarget((target) => {
      const previousHome = process.env.HOME;
      process.env.HOME = target;
      try {
        const result = capture(() =>
          runHarnessProject([
            "--target", target, "--scope", "global", "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
          ])
        );
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(fs.existsSync(path.join(target, ".zcode", "cli", "config.json")), true);
        assert.equal(fs.existsSync(path.join(target, ".zcode", "harness", "hooks", "session-bootstrap.mjs")), true);
        const config = JSON.parse(fs.readFileSync(path.join(target, ".zcode", "cli", "config.json"), "utf8"));
        assert.equal(config.hooks.events.SessionStart.length, 3);
        assert(config.hooks.events.SessionStart[0].hooks[0].args[0].includes(path.join(target, ".zcode", "harness", "hooks")));
      } finally {
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
      }
    });
  });

  await test("ZCode project rejects a symlinked parent before reading or writing external paths", () => {
    withTempTarget((target) => {
      const external = fs.mkdtempSync(path.join(os.tmpdir(), "harness-zcode-external-"));
      try {
        const externalConfig = path.join(external, "config.json");
        const externalHooks = path.join(external, "harness", "hooks");
        fs.mkdirSync(externalHooks, { recursive: true });
        const secretConfig = `${JSON.stringify({ mcpServers: { preserved: { token: "synthetic-token" } } }, null, 2)}\n`;
        const externalAdapter = "external adapter\n";
        fs.writeFileSync(externalConfig, secretConfig, "utf8");
        fs.writeFileSync(path.join(externalHooks, "session-bootstrap.mjs"), externalAdapter, "utf8");
        fs.symlinkSync(external, path.join(target, ".zcode"), "dir");

        const result = capture(() =>
          runHarnessProject([
            "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
          ])
        );
        assert.equal(result.status, 1);
        const payload = JSON.parse(result.stdout);
        assert.match(payload.errors.join("\n"), /projection-target-confinement/);
        assert.doesNotMatch(payload.errors.join("\n"), /synthetic-token/);
        assert.equal(fs.readFileSync(externalConfig, "utf8"), secretConfig);
        assert.equal(fs.readFileSync(path.join(externalHooks, "session-bootstrap.mjs"), "utf8"), externalAdapter);
        assert.equal(fs.lstatSync(path.join(target, ".zcode")).isSymbolicLink(), true);
        assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), false);
      } finally {
        fs.rmSync(external, { recursive: true, force: true });
      }
    });
  });

  await test("ZCode project rejects direct config and adapter symlinks without replacing them", () => {
    for (const kind of ["config", "adapter"]) {
      withTempTarget((target) => {
        const external = fs.mkdtempSync(path.join(os.tmpdir(), "harness-zcode-link-"));
        try {
          const zcodeRoot = path.join(target, ".zcode");
          const configPath = path.join(zcodeRoot, "config.json");
          const adapterPath = path.join(zcodeRoot, "harness", "hooks", "session-bootstrap.mjs");
          fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
          const externalPath = path.join(external, `${kind}.target`);
          const externalText = `${kind} external\n`;
          fs.writeFileSync(externalPath, externalText, "utf8");
          fs.writeFileSync(configPath, "{}\n", "utf8");
          if (kind === "config") {
            fs.rmSync(configPath, { force: true });
            fs.symlinkSync(externalPath, configPath, "file");
          } else {
            fs.symlinkSync(externalPath, adapterPath, "file");
          }

          const result = capture(() =>
            runHarnessProject([
              "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
            ])
          );
          assert.equal(result.status, 1, `${kind}: ${result.stdout}${result.stderr}`);
          const payload = JSON.parse(result.stdout);
          assert.match(payload.errors.join("\n"), /projection-target-confinement/);
          assert.doesNotMatch(payload.errors.join("\n"), /external/);
          assert.equal(fs.readFileSync(externalPath, "utf8"), externalText);
          assert.equal(fs.lstatSync(kind === "config" ? configPath : adapterPath).isSymbolicLink(), true);
          assert.equal(fs.existsSync(path.join(target, ".harness", "projection-state.json")), false);
        } finally {
          fs.rmSync(external, { recursive: true, force: true });
        }
      });
    }
  });

  await test("ZCode project rejects a symlinked state path before target staging", () => {
    for (const kind of ["state-parent", "state-file"]) {
      withTempTarget((target) => {
        const external = fs.mkdtempSync(path.join(os.tmpdir(), "harness-state-link-"));
        try {
          const configPath = path.join(target, ".zcode", "config.json");
          const stateRoot = path.join(target, ".harness");
          const statePath = path.join(stateRoot, "projection-state.json");
          const externalStateRoot = path.join(external, "state");
          const externalState = path.join(externalStateRoot, "projection-state.json");
          fs.mkdirSync(path.dirname(configPath), { recursive: true });
          fs.writeFileSync(configPath, "{}\n", "utf8");
          fs.mkdirSync(externalStateRoot, { recursive: true });
          fs.writeFileSync(externalState, `${JSON.stringify({
            schema_version: 2,
            package: "@catwithoutear/agent-harness-core",
            package_version: "1.0.0",
            operations: []
          }, null, 2)}\n`, "utf8");
          if (kind === "state-parent") {
            fs.symlinkSync(externalStateRoot, stateRoot, "dir");
          } else {
            fs.mkdirSync(stateRoot, { recursive: true });
            fs.symlinkSync(externalState, statePath, "file");
          }
          const beforeState = fs.readFileSync(externalState, "utf8");

          const result = capture(() =>
            runHarnessProject([
              "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
            ])
          );
          assert.equal(result.status, 1, `${kind}: ${result.stdout}${result.stderr}`);
          const payload = JSON.parse(result.stdout);
          assert.match(payload.errors.join("\n"), /projection-target-confinement/);
          assert.equal(fs.readFileSync(externalState, "utf8"), beforeState);
          assert.equal(fs.existsSync(path.join(target, ".zcode", "harness")), false);
          assert.equal(fs.lstatSync(kind === "state-parent" ? stateRoot : statePath).isSymbolicLink(), true);
        } finally {
          fs.rmSync(external, { recursive: true, force: true });
        }
      });
    }
  });

  await test("ZCode Hook rejects a schema-valid foreign config operation before writes", () => {
    withTempTarget((target) => {
      const configPath = path.join(target, ".zcode", "config.json");
      const statePath = path.join(target, ".harness", "projection-state.json");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(configPath, "{}\n", "utf8");
      const foreignState = {
        schema_version: 2,
        package: "@catwithoutear/agent-harness-core",
        package_version: "1.0.0",
        operations: [{
          id: crypto.createHash("sha256").update(`projection-operation\0json-merge\0${configPath}`).digest("hex"),
          target: configPath,
          strategy: "json-merge",
          mode: "json-merge",
          sources: [{ path: configPath, hash: crypto.createHash("sha256").update("foreign-source").digest("hex") }],
          desired_hash: crypto.createHash("sha256").update("foreign-desired").digest("hex"),
          renderer: "foreign-renderer@9",
          consumers: [{ asset_id: "foreign-hook", kind: "hooks", client: "foreign", scope: "project" }],
          managed_fragments: [{
            identity: "foreign-identity",
            event: "SessionStart",
            matcher: null,
            recognition_hash: crypto.createHash("sha256").update("foreign-recognition").digest("hex"),
            prior_hash: null,
            desired_hash: crypto.createHash("sha256").update("foreign-fragment").digest("hex")
          }],
          introduced: { hooks_enabled: false }
        }]
      };
      fs.writeFileSync(statePath, serializeProjectionState(foreignState), "utf8");
      const beforeConfig = fs.readFileSync(configPath, "utf8");
      const beforeState = fs.readFileSync(statePath, "utf8");
      const result = capture(() =>
        runHarnessProject([
          "--target", target, "--conflict", "overwrite", "--clients", "zcode", "--content", "hooks", "--json"
        ])
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.match(payload.errors.join("\n"), /projection-target-collision/);
      assert.doesNotMatch(payload.errors.join("\n"), /foreign-identity|foreign-renderer/);
      assert.equal(fs.readFileSync(configPath, "utf8"), beforeConfig);
      assert.equal(fs.readFileSync(statePath, "utf8"), beforeState);
      assert.equal(fs.existsSync(path.join(target, ".zcode", "harness")), false);
    });
  });
}

function projectionBinding(overrides = {}) {
  return {
    package: "@catwithoutear/agent-harness-core",
    version: "1.0.0",
    asset_id: "shared-skill",
    runtime_name: "shared-skill",
    content_kind: "skills",
    client: "codex",
    scope: "project",
    source: "/source/shared-skill",
    target: "/tmp/project/.agents/skills/shared-skill",
    mode: "copy",
    status: "planned",
    ...overrides
  };
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

function zcodeProjectionOptions(target, scope = "project") {
  return {
    targetRoot: path.resolve(target),
    scope,
    clients: ["zcode"],
    content: ["hooks"],
    mode: "copy",
    conflict: "overwrite",
    version: "1.0.0",
    selectedSkills: null,
    selectedSkillCategories: null,
    includeOptionalSkills: false
  };
}

function transactionArtifacts(target) {
  const result = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.includes(".harness-tmp-") || entry.name.includes(".harness-backup-")) result.push(fullPath);
    }
  };
  walk(target);
  return result;
}
