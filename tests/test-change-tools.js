import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runChangeDoc } from "../lib/change/doc-tool.js";
import { resolveChangeContext } from "../lib/change/root-resolution.js";
import { runChangeValidate } from "../lib/change/validator.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function run(test) {
  await test("policy output uses harness command names", () => {
    const result = capture(() => runChangeDoc(["--repo-root", packageRoot, "policy", "--json"]));
    assert.equal(result.status, 0, result.stderr);
    const policy = JSON.parse(result.stdout);
    assert.equal(policy.commands.policy, "harness-change-doc policy --json");
    assert.equal(policy.commands.resolve, "harness-change-doc resolve --json");
    assert.equal(policy.commands.execution_map, "harness-change-doc execution-map <change> --json");
    assert.equal(policy.commands.assign_slice, "harness-change-doc assign-slice <change> --slice <slice>");
    assert.equal(policy.commands.add_implementation_design, "harness-change-doc add-implementation-design");
    assert.equal(policy.commands.migrate, "harness-change-doc migrate <change> --dry-run | --apply --expected-plan-sha256 <sha256>");
    assert.equal(Object.hasOwn(policy.commands, "bootstrap_close"), false);
    assert.equal(Object.hasOwn(policy.commands, "bootstrap_revoke"), false);
    assert.doesNotMatch(result.stdout, /dbackup-change-/i);
    assert.doesNotMatch(result.stdout, /quick-project/i);

    const pyResult = runPythonChangeDoc(["--repo-root", packageRoot, "policy", "--json"]);
    assert.equal(pyResult.status, 0, pyResult.stdout + pyResult.stderr);
    const pyPolicy = JSON.parse(pyResult.stdout);
    assert.equal(pyPolicy.commands.policy, "harness-change-doc policy --json");
    assert.equal(pyPolicy.commands.resolve, "harness-change-doc resolve --json");
    assert.equal(pyPolicy.commands.execution_map, "harness-change-doc execution-map <change> --json");
    assert.equal(pyPolicy.commands.assign_slice, "harness-change-doc assign-slice <change> --slice <slice>");
    assert.equal(pyPolicy.commands.migrate, "harness-change-doc migrate <change> --dry-run | --apply --expected-plan-sha256 <sha256>");
    assert.equal(Object.hasOwn(pyPolicy.commands, "bootstrap_close"), false);
    assert.equal(Object.hasOwn(pyPolicy.commands, "bootstrap_revoke"), false);
  });

  await test("bootstrap lifecycle mutation commands are not exposed", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      for (const command of ["bootstrap-close", "bootstrap-revoke"]) {
        const jsResult = capture(() => runChangeDoc(["--state-root", repo, command, "feature-one"]));
        assert.equal(jsResult.status, 2, jsResult.stdout + jsResult.stderr);
        assert.match(jsResult.stderr, new RegExp(`unknown command: ${command}`));

        const pyResult = runPythonChangeDoc(["--state-root", repo, command, "feature-one"]);
        assert.equal(pyResult.status, 2, pyResult.stdout + pyResult.stderr);
        assert.match(pyResult.stderr, /invalid choice/);
      }
    });
  });

  await test("policy registers execution map artifact", () => {
    const jsResult = capture(() => runChangeDoc(["--repo-root", packageRoot, "policy", "--json"]));
    assert.equal(jsResult.status, 0, jsResult.stderr);
    const jsPolicy = JSON.parse(jsResult.stdout);
    assert.equal(jsPolicy.artifacts["execution-map"].naming, "execution-map.md");
    assert.deepEqual(jsPolicy.artifacts["execution-map"].allowed_statuses, [
      "draft",
      "reviewed",
      "frozen",
      "superseded"
    ]);
    assert.ok(jsPolicy.global_tags.includes("execution-map"));

    const pyResult = runPythonChangeDoc(["--repo-root", packageRoot, "policy", "--json"]);
    assert.equal(pyResult.status, 0, pyResult.stdout + pyResult.stderr);
    const pyPolicy = JSON.parse(pyResult.stdout);
    assert.equal(pyPolicy.artifacts["execution-map"].naming, "execution-map.md");
    assert.ok(pyPolicy.global_tags.includes("execution-map"));
  });

  await test("root resolver handles explicit state roots, conflicts, environment, and cwd inference", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const changeDir = path.join(repo, ".changes", "structured-one");
      fs.mkdirSync(path.join(changeDir, "tasks"), { recursive: true });

      const explicit = resolveChangeContext({
        stateRoot: repo,
        codeRoot: repo,
        changeId: "structured-one",
        cwd: "/",
        env: {}
      });
      assert.equal(explicit.state_root, path.resolve(repo));
      assert.equal(explicit.code_root, path.resolve(repo));
      assert.equal(explicit.source, "state-root");
      assert.equal(explicit.unresolved_reason, null);

      const legacy = resolveChangeContext({
        repoRoot: repo,
        changeId: "structured-one",
        cwd: "/",
        env: {}
      });
      assert.equal(legacy.state_root, path.resolve(repo));
      assert.equal(legacy.source, "repo-root");

      withTempRepo((otherRepo) => {
        const conflict = resolveChangeContext({
          stateRoot: repo,
          repoRoot: otherRepo,
          changeId: "structured-one",
          cwd: "/",
          env: {}
        });
        assert.equal(conflict.state_root, null);
        assert.equal(conflict.unresolved_reason, "conflicting-explicit-roots");
        assert.deepEqual(conflict.candidates.map((candidate) => candidate.source), ["state-root", "repo-root"]);
      });

      const envContext = resolveChangeContext({
        changeId: "structured-one",
        cwd: "/",
        env: { HARNESS_CHANGE_STATE_ROOT: repo }
      });
      assert.equal(envContext.state_root, path.resolve(repo));
      assert.equal(envContext.source, "environment");

      const cwdContext = resolveChangeContext({
        cwd: path.join(changeDir, "tasks"),
        env: {}
      });
      assert.equal(cwdContext.state_root, path.resolve(repo));
      assert.equal(cwdContext.change_id, "structured-one");
      assert.equal(cwdContext.source, "cwd-change");
    });
  });

  await test("JS change tools use state-root flags and environment fallback", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");

      const terminology = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "add-terminology",
        "structured-one",
        "--tags",
        "terminology",
        "--description",
        "State root terminology."
      ]));
      assert.equal(terminology.status, 0, terminology.stdout + terminology.stderr);
      assert.equal(fs.existsSync(path.join(repo, ".changes", "structured-one", "terminology.md")), true);

      const validate = withEnv({ HARNESS_CHANGE_STATE_ROOT: repo }, () =>
        capture(() => runChangeValidate(["--change", "structured-one"]))
      );
      assert.equal(validate.status, 0, validate.stdout + validate.stderr);
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=0/);
    });
  });

  await test("root resolver blocks duplicate linked-worktree state before write", () => {
    withGitWorktrees(({ main, linked }) => {
      writeStructuredProposal(main, "structured-one");
      writeStructuredProposal(linked, "structured-one");

      const result = capture(() => runChangeDoc([
        "--code-root",
        linked,
        "add-terminology",
        "structured-one",
        "--tags",
        "terminology"
      ]));

      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stderr, /ambiguous state root/);
      assert.equal(fs.existsSync(path.join(main, ".changes", "structured-one", "terminology.md")), false);
      assert.equal(fs.existsSync(path.join(linked, ".changes", "structured-one", "terminology.md")), false);
    });
  });

  await test("root resolver requires explicit state root for other-worktree candidates", () => {
    withGitWorktrees(({ main, linked }) => {
      writeStructuredProposal(main, "structured-one");

      const context = resolveChangeContext({
        codeRoot: linked,
        changeId: "structured-one",
        cwd: linked,
        env: {}
      });

      assert.equal(context.state_root, null);
      assert.equal(context.unresolved_reason, "other-worktree-state-root");
      assert.ok(context.candidates.some((candidate) => candidate.state_root === path.resolve(main)));
      assert.equal(fs.existsSync(path.join(linked, ".changes", "structured-one")), false);
    });
  });

  await test("doc tool resolve reports the shared root context", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");

      const result = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "resolve",
        "--change",
        "structured-one",
        "--json"
      ]));

      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.state_root, path.resolve(repo));
      assert.equal(payload.change_id, "structured-one");
      assert.equal(payload.unresolved_reason, null);
    });
  });

  await test("execution-map json is read-only when the map is absent", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const mapPath = path.join(repo, ".changes", "structured-one", "execution-map.md");

      const result = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "execution-map",
        "structured-one",
        "--json"
      ]));

      assert.equal(result.status, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.exists, false);
      assert.deepEqual(payload.assignments, []);
      assert.equal(payload.root_context.state_root, path.resolve(repo));
      assert.equal(fs.existsSync(mapPath), false);
    });
  });

  await test("assign-slice creates planned rows without branch or worktree", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      addTaskSlice(repo, "structured-one", "api-timeout");

      const result = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-001-api-timeout.md",
        "--status",
        "planned",
        "--topology",
        "standalone",
        "--owner",
        "agent-a"
      ]));

      assert.equal(result.status, 0, result.stdout + result.stderr);
      const mapText = fs.readFileSync(path.join(repo, ".changes", "structured-one", "execution-map.md"), "utf8");
      assert.match(mapText, /artifact: execution-map/);
      assert.match(mapText, /\| tasks\/slice-001-api-timeout\.md \| standalone \| planned \|  \|  \|  \|  \| agent-a \|  \|/);

      const json = capture(() => runChangeDoc(["--state-root", repo, "execution-map", "structured-one", "--json"]));
      assert.equal(json.status, 0, json.stdout + json.stderr);
      const payload = JSON.parse(json.stdout);
      assert.equal(payload.exists, true);
      assert.equal(payload.assignments[0].slice, "tasks/slice-001-api-timeout.md");
      assert.equal(payload.assignments[0].status, "planned");
    });
  });

  await test("assign-slice rejects non-planned rows without branch and worktree before writing", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      addTaskSlice(repo, "structured-one", "api-timeout");
      const mapPath = path.join(repo, ".changes", "structured-one", "execution-map.md");

      const result = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-001-api-timeout.md",
        "--status",
        "active",
        "--topology",
        "standalone"
      ]));

      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stderr, /requires --branch and --worktree/);
      assert.equal(fs.existsSync(mapPath), false);
    });
  });

  await test("assign-slice normalizes worktree paths and is idempotent", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      addTaskSlice(repo, "structured-one", "api-timeout");
      addTaskSlice(repo, "structured-one", "storage-timeout");
      const worktree = path.join(repo, "worktrees", "slice-one");
      fs.mkdirSync(worktree, { recursive: true });
      const slicePath = path.join(repo, ".changes", "structured-one", "tasks", "slice-001-api-timeout.md");
      const sliceBefore = fs.readFileSync(slicePath, "utf8");
      const args = [
        "--state-root",
        repo,
        "--code-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "tasks/slice-001-api-timeout.md",
        "--status",
        "claimed",
        "--topology",
        "standalone",
        "--branch",
        "feature/api-timeout",
        "--worktree",
        "worktrees/slice-one",
        "--owner",
        "agent-a"
      ];

      const first = capture(() => runChangeDoc(args));
      assert.equal(first.status, 0, first.stdout + first.stderr);
      const mapPath = path.join(repo, ".changes", "structured-one", "execution-map.md");
      const afterFirst = fs.readFileSync(mapPath, "utf8");
      assert.match(afterFirst, new RegExp(escapeRegExp(path.resolve(worktree))));

      const plannedSecond = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-002-storage-timeout.md",
        "--status",
        "planned",
        "--topology",
        "standalone"
      ]));
      assert.equal(plannedSecond.status, 0, plannedSecond.stdout + plannedSecond.stderr);
      const withUnrelatedRow = fs.readFileSync(mapPath, "utf8");
      assert.ok(withUnrelatedRow.indexOf("slice-001-api-timeout.md") < withUnrelatedRow.indexOf("slice-002-storage-timeout.md"));

      const second = capture(() => runChangeDoc(args));
      assert.equal(second.status, 0, second.stdout + second.stderr);
      assert.equal(fs.readFileSync(mapPath, "utf8"), withUnrelatedRow);
      assert.equal(fs.readFileSync(slicePath, "utf8"), sliceBefore);
    });
  });

  await test("assign-slice rejects duplicate active worktree paths and invalid evidence refs", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      addTaskSlice(repo, "structured-one", "api-timeout");
      addTaskSlice(repo, "structured-one", "storage-timeout");
      const worktree = path.join(repo, "worktrees", "shared");
      fs.mkdirSync(worktree, { recursive: true });

      const first = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-001-api-timeout.md",
        "--status",
        "active",
        "--topology",
        "standalone",
        "--branch",
        "feature/api-timeout",
        "--worktree",
        worktree
      ]));
      assert.equal(first.status, 0, first.stdout + first.stderr);

      const duplicate = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-002-storage-timeout.md",
        "--status",
        "active",
        "--topology",
        "standalone",
        "--branch",
        "feature/storage-timeout",
        "--worktree",
        worktree
      ]));
      assert.equal(duplicate.status, 2, duplicate.stdout + duplicate.stderr);
      assert.match(duplicate.stderr, /duplicate active worktree/);

      const badEvidence = capture(() => runChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-001-api-timeout.md",
        "--status",
        "ready",
        "--topology",
        "standalone",
        "--branch",
        "feature/api-timeout",
        "--worktree",
        worktree,
        "--last-evidence",
        "../outside.md"
      ]));
      assert.equal(badEvidence.status, 2, badEvidence.stdout + badEvidence.stderr);
      assert.match(badEvidence.stderr, /invalid --last-evidence/);
    });
  });

  await test("validator worktree mode reports map shape, slice, evidence, topology, dependency, and cycle errors", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      for (const slug of [
        "api-timeout",
        "storage-timeout",
        "network-timeout",
        "ui-timeout",
        "auth-timeout",
        "cycle-a",
        "cycle-b",
        "blank-evidence",
        "missing-evidence",
        "nonmarkdown-evidence"
      ]) {
        addTaskSlice(repo, "structured-one", slug);
      }
      fs.writeFileSync(path.join(repo, ".changes", "structured-one", "evidence.txt"), "plain text evidence\n");
      writeExecutionMap(repo, "structured-one", [
        { slice: "tasks/slice-001-api-timeout.md", topology: "parallel", status: "planned", depends_on: "tasks/slice-002-storage-timeout.md" },
        {
          slice: "tasks/slice-002-storage-timeout.md",
          topology: "stacked",
          status: "ready",
          branch: "feature/storage",
          worktree: path.join(repo, "missing-storage"),
          depends_on: "tasks/slice-003-network-timeout.md",
          last_evidence: "tasks/slice-002-storage-timeout.md#validation"
        },
        { slice: "tasks/slice-003-network-timeout.md", topology: "standalone", status: "active", depends_on: "tasks/slice-001-api-timeout.md" },
        { slice: "tasks/slice-004-ui-timeout.md", topology: "standalone", status: "blocked", last_evidence: "../outside.md" },
        { slice: "tasks/slice-005-auth-timeout.md", topology: "standalone", status: "ready", branch: "feature/auth", worktree: path.join(repo, "missing-auth"), last_evidence: "tasks/slice-005-auth-timeout.md#missing-heading" },
        { slice: "tasks/slice-999-missing.md", topology: "standalone", status: "planned" },
        { slice: "tasks/slice-006-cycle-a.md", topology: "stacked", status: "planned", depends_on: "tasks/slice-007-cycle-b.md" },
        { slice: "tasks/slice-007-cycle-b.md", topology: "stacked", status: "planned", depends_on: "tasks/slice-006-cycle-a.md" },
        { slice: "tasks/slice-008-blank-evidence.md", topology: "standalone", status: "blocked", branch: "feature/blank", worktree: path.join(repo, "missing-blank") },
        { slice: "tasks/slice-009-missing-evidence.md", topology: "standalone", status: "ready", branch: "feature/missing-evidence", worktree: path.join(repo, "missing-evidence"), last_evidence: "missing-evidence.md" },
        { slice: "tasks/slice-010-nonmarkdown-evidence.md", topology: "standalone", status: "blocked", branch: "feature/nonmarkdown-evidence", worktree: path.join(repo, "missing-nonmarkdown"), last_evidence: "evidence.txt#anchor" }
      ]);

      const result = capture(() => runChangeValidate([
        "--state-root",
        repo,
        "--change",
        "structured-one",
        "--worktrees"
      ]));

      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /parallel row .* must not depend on/);
      assert.match(result.stdout, /ready stacked row .* dependency .* status active/);
      assert.match(result.stdout, /standalone row .* must not depend on/);
      assert.match(result.stdout, /invalid Last Evidence.*\.\.\/outside\.md/);
      assert.match(result.stdout, /blank Last Evidence/);
      assert.match(result.stdout, /missing Last Evidence path.*missing-evidence\.md/);
      assert.match(result.stdout, /fragment on non-Markdown file/);
      assert.match(result.stdout, /missing Markdown heading.*missing-heading/);
      assert.match(result.stdout, /referenced slice missing/);
      assert.match(result.stdout, /dependency cycle/);
    });
  });

  await test("validator worktree mode accepts valid rows and reports status json summary", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      for (const slug of ["api-timeout", "storage-timeout", "network-timeout"]) {
        addTaskSlice(repo, "structured-one", slug);
      }
      const wt1 = path.join(repo, "wt-api");
      const wt2 = path.join(repo, "wt-storage");
      const wt3 = path.join(repo, "wt-network");
      initGitRepo(wt1);
      initGitRepo(wt2);
      initGitRepo(wt3);
      writeExecutionMap(repo, "structured-one", [
        {
          slice: "tasks/slice-001-api-timeout.md",
          topology: "standalone",
          status: "ready",
          branch: "feature/api",
          worktree: wt1,
          last_evidence: "tasks/slice-001-api-timeout.md#validation"
        },
        {
          slice: "tasks/slice-002-storage-timeout.md",
          topology: "stacked",
          status: "ready",
          branch: "feature/storage",
          worktree: wt2,
          depends_on: "tasks/slice-001-api-timeout.md",
          last_evidence: "tasks/slice-002-storage-timeout.md"
        },
        {
          slice: "tasks/slice-003-network-timeout.md",
          topology: "standalone",
          status: "active",
          branch: "feature/network",
          worktree: wt3
        }
      ]);

      const result = capture(() => runChangeValidate([
        "--state-root",
        repo,
        "--change",
        "structured-one",
        "--worktrees",
        "--status",
        "--json"
      ]));

      assert.equal(result.status, 0, result.stdout + result.stderr);
      const report = JSON.parse(result.stdout);
      assert.deepEqual(report.changes[0].execution_map, {
        exists: true,
        assignment_count: 3,
        active_assignment_count: 1,
        worktrees_checked: true
      });
    });
  });

  await test("validator worktree mode applies worktree liveness and duplicate-state severities", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      for (const slug of ["claimed-missing", "active-missing", "claimed-nongit", "ready-nongit", "active-duplicate", "merged-duplicate"]) {
        addTaskSlice(repo, "structured-one", slug);
      }
      const claimedNongit = path.join(repo, "claimed-nongit");
      const readyNongit = path.join(repo, "ready-nongit");
      const activeDuplicate = path.join(repo, "active-duplicate");
      const mergedDuplicate = path.join(repo, "merged-duplicate");
      fs.mkdirSync(claimedNongit, { recursive: true });
      fs.mkdirSync(readyNongit, { recursive: true });
      initGitRepo(activeDuplicate);
      initGitRepo(mergedDuplicate);
      fs.mkdirSync(path.join(activeDuplicate, ".changes", "structured-one"), { recursive: true });
      fs.mkdirSync(path.join(mergedDuplicate, ".changes", "structured-one"), { recursive: true });
      writeExecutionMap(repo, "structured-one", [
        { slice: "tasks/slice-001-claimed-missing.md", topology: "standalone", status: "claimed", branch: "feature/claimed", worktree: path.join(repo, "missing-claimed") },
        { slice: "tasks/slice-002-active-missing.md", topology: "standalone", status: "active", branch: "feature/active", worktree: path.join(repo, "missing-active") },
        { slice: "tasks/slice-003-claimed-nongit.md", topology: "standalone", status: "claimed", branch: "feature/claimed-nongit", worktree: claimedNongit },
        { slice: "tasks/slice-004-ready-nongit.md", topology: "standalone", status: "ready", branch: "feature/ready-nongit", worktree: readyNongit, last_evidence: "tasks/slice-004-ready-nongit.md#validation" },
        { slice: "tasks/slice-005-active-duplicate.md", topology: "standalone", status: "active", branch: "feature/active-duplicate", worktree: activeDuplicate },
        { slice: "tasks/slice-006-merged-duplicate.md", topology: "standalone", status: "merged", branch: "feature/merged-duplicate", worktree: mergedDuplicate, last_evidence: "tasks/slice-006-merged-duplicate.md#validation" }
      ]);

      const result = capture(() => runChangeValidate([
        "--state-root",
        repo,
        "--change",
        "structured-one",
        "--worktrees"
      ]));

      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /WARN: .*claimed.*missing worktree path/);
      assert.match(result.stdout, /ERROR: .*active.*missing worktree path/);
      assert.match(result.stdout, /WARN: .*claimed.*non-git worktree path/);
      assert.match(result.stdout, /ERROR: .*ready.*non-git worktree path/);
      assert.match(result.stdout, /ERROR: .*duplicate local change state/);
      assert.match(result.stdout, /WARN: .*merged.*duplicate local change state/);
    });
  });

  await test("validator worktree mode rejects malformed execution-map columns", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const change = path.join(repo, ".changes", "structured-one");
      fs.writeFileSync(
        path.join(change, "execution-map.md"),
        frontMatter("execution-map", "execution-map") +
          ["# Execution Map", "", "| Slice | Status |", "|---|---|", "| tasks/slice-001-api-timeout.md | planned |", ""].join("\n")
      );

      const result = capture(() => runChangeValidate([
        "--state-root",
        repo,
        "--change",
        "structured-one",
        "--worktrees"
      ]));

      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /execution-map\.md: missing required columns/);
    });
  });

  await test("python root flags mirror JS conflict, resolve, and environment fallback", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");

      const resolve = runPythonChangeDoc([
        "--state-root",
        repo,
        "resolve",
        "--change",
        "structured-one",
        "--json"
      ]);
      assert.equal(resolve.status, 0, resolve.stdout + resolve.stderr);
      const payload = JSON.parse(resolve.stdout);
      assert.equal(payload.state_root, path.resolve(repo));
      assert.equal(payload.change_id, "structured-one");

      withTempRepo((otherRepo) => {
        const conflict = runPythonChangeDoc([
          "--state-root",
          repo,
          "--repo-root",
          otherRepo,
          "resolve",
          "--change",
          "structured-one",
          "--json"
        ]);
        assert.equal(conflict.status, 2, conflict.stdout + conflict.stderr);
        assert.match(conflict.stderr, /conflicting state roots/);
        assert.equal(conflict.stdout, "");

        const conflictPolicy = runPythonChangeDoc([
          "--state-root",
          repo,
          "--repo-root",
          otherRepo,
          "policy",
          "--json"
        ]);
        assert.equal(conflictPolicy.status, 2, conflictPolicy.stdout + conflictPolicy.stderr);
        assert.match(conflictPolicy.stderr, /conflicting state roots/);
        assert.equal(conflictPolicy.stdout, "");
      });

      withGitWorktrees(({ linked }) => {
        const linkedResolve = runPythonChangeDoc([
          "--code-root",
          linked,
          "resolve",
          "--json"
        ]);
        assert.equal(linkedResolve.status, 0, linkedResolve.stdout + linkedResolve.stderr);
        assert.equal(linkedResolve.stderr, "");
        assert.equal(JSON.parse(linkedResolve.stdout).unresolved_reason, "linked-worktree-unresolved");
      });

      const validate = runPythonChangeValidate(["--change", "structured-one"], {
        HARNESS_CHANGE_STATE_ROOT: repo
      });
      assert.equal(validate.status, 0, validate.stdout + validate.stderr);
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=0/);
    });
  });

  await test("python doc tool mirrors execution-map commands", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      addTaskSlice(repo, "structured-one", "api-timeout");
      const mapPath = path.join(repo, ".changes", "structured-one", "execution-map.md");

      const absent = runPythonChangeDoc([
        "--state-root",
        repo,
        "execution-map",
        "structured-one",
        "--json"
      ]);
      assert.equal(absent.status, 0, absent.stdout + absent.stderr);
      assert.equal(JSON.parse(absent.stdout).exists, false);
      assert.equal(fs.existsSync(mapPath), false);

      const planned = runPythonChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-001-api-timeout.md",
        "--status",
        "planned",
        "--topology",
        "standalone",
        "--owner",
        "python-agent"
      ]);
      assert.equal(planned.status, 0, planned.stdout + planned.stderr);
      const afterPlanned = fs.readFileSync(mapPath, "utf8");
      assert.match(afterPlanned, /python-agent/);

      const repeated = runPythonChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-001-api-timeout.md",
        "--status",
        "planned",
        "--topology",
        "standalone",
        "--owner",
        "python-agent"
      ]);
      assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
      assert.equal(fs.readFileSync(mapPath, "utf8"), afterPlanned);

      const invalid = runPythonChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-001-api-timeout.md",
        "--status",
        "active",
        "--topology",
        "standalone"
      ]);
      assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
      assert.match(invalid.stderr, /requires --branch and --worktree/);
    });
  });

  await test("python validator mirrors repo-local schema, status output, and worktrees", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      writeRepoSchema(repo, (schema) => {
        schema.change_id.pattern = "^local-[a-z0-9-]+$";
      });
      const invalid = runPythonChangeValidate(["--repo-root", repo, "--change", "feature-one"]);
      assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
      assert.match(invalid.stdout, /invalid change id/);
    });

    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      addTaskSlice(repo, "structured-one", "api-timeout");
      const worktree = path.join(repo, "missing-worktree");
      writeExecutionMap(repo, "structured-one", [
        {
          slice: "tasks/slice-001-api-timeout.md",
          topology: "standalone",
          status: "active",
          branch: "feature/api",
          worktree
        }
      ]);

      const worktrees = runPythonChangeValidate([
        "--state-root",
        repo,
        "--change",
        "structured-one",
        "--worktrees"
      ]);
      assert.equal(worktrees.status, 1, worktrees.stdout + worktrees.stderr);
      assert.match(worktrees.stdout, /missing worktree path/);

      const planned = runPythonChangeDoc([
        "--state-root",
        repo,
        "assign-slice",
        "structured-one",
        "--slice",
        "slice-001-api-timeout.md",
        "--status",
        "planned",
        "--topology",
        "standalone"
      ]);
      assert.equal(planned.status, 0, planned.stdout + planned.stderr);

      const status = runPythonChangeValidate([
        "--state-root",
        repo,
        "--change",
        "structured-one",
        "--worktrees",
        "--status",
        "--json"
      ]);
      assert.equal(status.status, 0, status.stdout + status.stderr);
      assert.deepEqual(JSON.parse(status.stdout).changes[0].execution_map, {
        exists: true,
        assignment_count: 1,
        active_assignment_count: 0,
        worktrees_checked: true
      });
    });
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
      assert.match(index, /Readiness Trace/);
      assert.match(index, /relative\/path:Symbol/);
      assert.match(index, /phase-appropriate evidence/);

      const problem = fs.readFileSync(path.join(implementationDesign, "01-problem.md"), "utf8");
      assert.match(problem, /Rejected Alternatives/);
      assert.match(problem, /\| Source \| Anchor \| Decision or fact \| Used by \|/);

      const topology = fs.readFileSync(path.join(implementationDesign, "02-code-topology.md"), "utf8");
      assert.match(topology, /## Subsystem Topology/);
      assert.match(topology, /## Module Topology/);
      assert.match(topology, /## Source Anchors/);
      assert.match(topology, /relative\/path:Symbol/);

      const classDesign = fs.readFileSync(path.join(implementationDesign, "03-class-design.md"), "utf8");
      assert.match(classDesign, /## N\/A Usage/);
      assert.match(classDesign, /N\/A - <reason>/);
      assert.match(classDesign, /Source anchor/);
      assert.match(classDesign, /Rejected Alternatives/);

      const runtime = fs.readFileSync(path.join(implementationDesign, "04-runtime-flow.md"), "utf8");
      assert.match(runtime, /## Traceability/);

      const errorModel = fs.readFileSync(path.join(implementationDesign, "05-error-model.md"), "utf8");
      assert.match(errorModel, /Verification plan \/ evidence/);

      const plan = fs.readFileSync(path.join(implementationDesign, "06-implementation-plan.md"), "utf8");
      assert.match(plan, /Design-to-Code Traceability/);
      assert.match(plan, /Source anchor/);
      assert.match(plan, /Verification plan \/ evidence/);
      assert.match(plan, /Coding Guardrails/);
      assert.match(plan, /planned checks separately/);

      const constraints = fs.readFileSync(path.join(implementationDesign, "07-constraints.md"), "utf8");
      assert.match(constraints, /Requirement\/source fact to implementation-step trace is complete/);
      assert.match(constraints, /Document integrity/);

      const validate = capture(() => runChangeValidate(["--repo-root", repo, "--change", "structured-one"]));
      assert.equal(validate.status, 0, validate.stdout + validate.stderr);
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=0/);
    });
  });

  await test("validator requires complete implementation design pack when directory exists", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const implementationDesign = path.join(repo, ".changes", "structured-one", "implementation-design");
      fs.mkdirSync(implementationDesign, { recursive: true });
      fs.writeFileSync(
        path.join(implementationDesign, "README.md"),
        frontMatter("implementation-design-index", "design, implementation") + "# Implementation Design\n"
      );

      const incomplete = capture(() => runChangeValidate(["--repo-root", repo, "--change", "structured-one"]));
      assert.equal(incomplete.status, 1, incomplete.stdout + incomplete.stderr);
      assert.match(incomplete.stdout, /implementation-design\/01-problem\.md.*missing required file/);
      assert.match(incomplete.stdout, /implementation-design\/07-constraints\.md.*missing required file/);

      const addPack = capture(() => runChangeDoc(["--repo-root", repo, "add-implementation-design", "structured-one"]));
      assert.equal(addPack.status, 0, addPack.stdout + addPack.stderr);
      const complete = capture(() => runChangeValidate(["--repo-root", repo, "--change", "structured-one"]));
      assert.equal(complete.status, 0, complete.stdout + complete.stderr);
      assert.match(complete.stdout, /mode=structured_proposal errors=0 warnings=0/);
    });
  });

  await test("validator accepts execution map as structured workspace artifact", () => {
    withTempRepo((repo) => {
      writeStructuredProposal(repo, "structured-one");
      const change = path.join(repo, ".changes", "structured-one");
      fs.writeFileSync(
        path.join(change, "execution-map.md"),
        frontMatter("execution-map", "execution-map") +
          [
            "# Execution Map",
            "",
            "| Slice | Topology | Status | Branch | Worktree | Base | Depends On | Owner | Last Evidence |",
            "|---|---|---|---|---|---|---|---|---|",
            ""
          ].join("\n")
      );

      const strict = capture(() => runChangeValidate([
        "--repo-root",
        repo,
        "--change",
        "structured-one",
        "--strict-layout"
      ]));
      assert.equal(strict.status, 0, strict.stdout + strict.stderr);
      assert.match(strict.stdout, /mode=structured_proposal errors=0 warnings=0/);

      const status = capture(() => runChangeValidate([
        "--repo-root",
        repo,
        "--change",
        "structured-one",
        "--status",
        "--json"
      ]));
      assert.equal(status.status, 0, status.stdout + status.stderr);
      const report = JSON.parse(status.stdout);
      const artifact = report.changes[0].artifacts.find((entry) => entry.path === "execution-map.md");
      assert.deepEqual(artifact, {
        path: "execution-map.md",
        required: false,
        status: "present"
      });

      const inventory = capture(() => runChangeValidate([
        "--repo-root",
        repo,
        "--change",
        "structured-one",
        "--inventory",
        "--json"
      ]));
      assert.equal(inventory.status, 0, inventory.stdout + inventory.stderr);
      const inventoryReport = JSON.parse(inventory.stdout);
      assert.ok(inventoryReport.changes[0].expected_files.some((entry) => entry.path === "execution-map.md"));
      assert.equal(inventoryReport.changes[0].unexpected_files.length, 0);
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

  await test("controlled migration preserves legacy bytes, commits a structured skeleton, and mirrors Python", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const change = path.join(repo, ".changes", "feature-one");
      fs.writeFileSync(path.join(change, "review-log.md"), "legacy review bytes\n");
      const legacyTasks = fs.readFileSync(path.join(change, "tasks.md"));
      const legacyReview = fs.readFileSync(path.join(change, "review-log.md"));

      const jsDry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const pyDry = runPythonChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
      assert.equal(jsDry.status, 0, jsDry.stdout + jsDry.stderr);
      assert.equal(pyDry.status, 0, pyDry.stdout + pyDry.stderr);
      const jsPlan = JSON.parse(jsDry.stdout);
      assert.deepEqual(JSON.parse(pyDry.stdout), jsPlan);
      assert.match(jsPlan.plan_sha256, /^[a-f0-9]{64}$/);
      assert.equal(fs.existsSync(path.join(change, "README.md")), false);

      const mismatch = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          "0".repeat(64)
        ])
      );
      assert.equal(mismatch.status, 1, mismatch.stdout + mismatch.stderr);
      assert.match(mismatch.stderr, /plan digest does not match/);
      assert.equal(fs.existsSync(path.join(change, "README.md")), false);

      const applied = runPythonChangeDoc([
        "--state-root",
        repo,
        "migrate",
        "feature-one",
        "--apply",
        "--expected-plan-sha256",
        jsPlan.plan_sha256
      ]);
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      assert.equal(JSON.parse(applied.stdout).idempotent, false);
      assert.deepEqual(fs.readFileSync(path.join(repo, ".changes", "archive", "feature-one", "legacy", "tasks.md")), legacyTasks);
      assert.deepEqual(fs.readFileSync(path.join(repo, ".changes", "archive", "feature-one", "legacy", "review-log.md")), legacyReview);
      assert.equal(fs.existsSync(path.join(change, "tasks.md")), false);
      assert.equal(fs.existsSync(path.join(change, "review-log.md")), false);
      assert.equal(fs.existsSync(path.join(change, "specs", "README.md")), true);
      assert.equal(fs.existsSync(path.join(change, "decisions", "DR-001-migration-provenance.md")), true);
      assert.equal(JSON.parse(fs.readFileSync(path.join(repo, ".changes", ".control", "migrations", "feature-one", "current.json"), "utf8")).state, "committed");
      assert.match(fs.readFileSync(path.join(change, "README.md"), "utf8"), /harness-migration-status:start/);

      // Ordinary workspace documents remain editable after the immutable migration boundary commits.
      fs.appendFileSync(path.join(change, "README.md"), "\n## Follow-up\n\nStructured work continues after migration.\n");

      const nodeRepeat = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          jsPlan.plan_sha256
        ])
      );
      assert.equal(nodeRepeat.status, 0, nodeRepeat.stdout + nodeRepeat.stderr);
      assert.equal(JSON.parse(nodeRepeat.stdout).idempotent, true);

      const jsValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pyValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(jsValidate.status, 0, jsValidate.stdout + jsValidate.stderr);
      assert.equal(pyValidate.status, 0, pyValidate.stdout + pyValidate.stderr);
      assert.doesNotMatch(jsValidate.stdout, /migration transaction is/);
      assert.doesNotMatch(pyValidate.stdout, /migration transaction is/);
      assert.doesNotMatch(jsValidate.stdout, /committed migration destination is missing or digest-mismatched/);
      assert.doesNotMatch(pyValidate.stdout, /committed migration destination is missing or digest-mismatched/);

      const active = capture(() => runChangeValidate(["--state-root", repo, "--all-active"]));
      assert.equal(active.status, 0, active.stdout + active.stderr);
      assert.match(active.stdout, /validated_changes=1 errors=0/);
    });
  });

  await test("controlled migration preserves and validates each frozen legacy review round", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const change = path.join(repo, ".changes", "feature-one");
      const reviewLog = [
        "# Review Log",
        "",
        "## Review Round design-r01",
        "",
        "Decision ID: design-r01",
        "",
        "Decision: READY",
        "",
        "Frozen: yes",
        "",
        "Blocking Open: 0",
        "",
        "## Review Round design-r02",
        "",
        "Decision ID: design-r02",
        "",
        "Decision: READY",
        "",
        "Frozen: yes",
        "",
        "Blocking Open: 0",
        ""
      ].join("\n");
      fs.writeFileSync(path.join(change, "review-log.md"), reviewLog);

      const jsDry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const pyDry = runPythonChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
      assert.equal(jsDry.status, 0, jsDry.stdout + jsDry.stderr);
      assert.equal(pyDry.status, 0, pyDry.stdout + pyDry.stderr);
      const plan = JSON.parse(jsDry.stdout);
      assert.deepEqual(JSON.parse(pyDry.stdout), plan);
      const reviewSource = plan.legacy_sources.find((source) => source.path === "review-log.md");
      assert.deepEqual(reviewSource.frozen_review_rounds.map((round) => round.decision_id), ["design-r01", "design-r02"]);

      const applied = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          plan.plan_sha256
        ])
      );
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      const transaction = JSON.parse(fs.readFileSync(path.join(repo, ".changes", ".control", "migrations", "feature-one", "current.json"), "utf8"));
      assert.deepEqual(transaction.legacy_sources.find((source) => source.path === "review-log.md").frozen_review_rounds, reviewSource.frozen_review_rounds);
      const provenance = fs.readFileSync(path.join(change, "decisions", "DR-001-migration-provenance.md"), "utf8");
      assert.match(provenance, /Archived Frozen Review Rounds/);
      assert.match(provenance, /design-r01/);
      assert.match(provenance, /design-r02/);

      const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(nodeValidate.status, 0, nodeValidate.stdout + nodeValidate.stderr);
      assert.equal(pythonValidate.status, 0, pythonValidate.stdout + pythonValidate.stderr);
    });
  });

  await test("controlled migration keeps frozen round digests stable across blank round separators", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const first = bootstrapReviewRound({
        decisionId: "legacy-boundary-r01",
        executorId: "bootstrap-executor",
        reviewerId: "bootstrap-reviewer"
      });
      const second = bootstrapReviewRound({
        decisionId: "legacy-boundary-r02",
        executorId: "bootstrap-executor",
        reviewerId: "bootstrap-reviewer"
      });
      fs.writeFileSync(path.join(repo, ".changes", "feature-one", "review-log.md"), `${first}\n${second}`);

      const nodeDry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const pythonDry = runPythonChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
      assert.equal(nodeDry.status, 0, nodeDry.stdout + nodeDry.stderr);
      assert.equal(pythonDry.status, 0, pythonDry.stdout + pythonDry.stderr);
      const nodeRounds = JSON.parse(nodeDry.stdout).legacy_sources.find((source) => source.path === "review-log.md").frozen_review_rounds;
      const pythonRounds = JSON.parse(pythonDry.stdout).legacy_sources.find((source) => source.path === "review-log.md").frozen_review_rounds;
      const expected = [
        { decision_id: "legacy-boundary-r01", sha256: sha256Text(canonicalReviewRoundText(first)) },
        { decision_id: "legacy-boundary-r02", sha256: sha256Text(canonicalReviewRoundText(second)) }
      ];
      assert.deepEqual(nodeRounds, expected);
      assert.deepEqual(pythonRounds, expected);

      const applied = runPythonChangeDoc([
        "--state-root",
        repo,
        "migrate",
        "feature-one",
        "--apply",
        "--expected-plan-sha256",
        JSON.parse(nodeDry.stdout).plan_sha256
      ]);
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(nodeValidate.status, 0, nodeValidate.stdout + nodeValidate.stderr);
      assert.equal(pythonValidate.status, 0, pythonValidate.stdout + pythonValidate.stderr);
    });
  });

  await test("validators reject a committed migration whose accepted plan no longer binds its transaction", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const dry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const plan = JSON.parse(dry.stdout);
      const applied = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          plan.plan_sha256
        ])
      );
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      const transactionPath = path.join(repo, ".changes", ".control", "migrations", "feature-one", "current.json");
      const transaction = JSON.parse(fs.readFileSync(transactionPath, "utf8"));
      transaction.destination_manifest[0].sha256 = "0".repeat(64);
      fs.writeFileSync(transactionPath, JSON.stringify(transaction));

      const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(nodeValidate.status, 1, nodeValidate.stdout + nodeValidate.stderr);
      assert.equal(pythonValidate.status, 1, pythonValidate.stdout + pythonValidate.stderr);
      assert.match(nodeValidate.stdout, /committed migration fields do not match the accepted plan/);
      assert.match(pythonValidate.stdout, /committed migration fields do not match the accepted plan/);
    });
  });

  await test("repeat apply rejects a committed transaction whose mutable fields no longer bind its plan", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const dry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const plan = JSON.parse(dry.stdout);
      const applied = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          plan.plan_sha256
        ])
      );
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      const transactionPath = path.join(repo, ".changes", ".control", "migrations", "feature-one", "current.json");
      const transaction = JSON.parse(fs.readFileSync(transactionPath, "utf8"));
      transaction.legacy_sources = [];
      fs.writeFileSync(transactionPath, JSON.stringify(transaction));

      const jsRepeat = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          plan.plan_sha256
        ])
      );
      const pyRepeat = runPythonChangeDoc([
        "--state-root",
        repo,
        "migrate",
        "feature-one",
        "--apply",
        "--expected-plan-sha256",
        plan.plan_sha256
      ]);
      assert.equal(jsRepeat.status, 1, jsRepeat.stdout + jsRepeat.stderr);
      assert.equal(pyRepeat.status, 1, pyRepeat.stdout + pyRepeat.stderr);
      assert.match(jsRepeat.stderr, /fields do not match the accepted plan/);
      assert.match(pyRepeat.stderr, /fields do not match the accepted plan/);
    });
  });

  await test("controlled migration fails closed for an interrupted transaction and resumes only with the accepted plan", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const dry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      assert.equal(dry.status, 0, dry.stdout + dry.stderr);
      const plan = JSON.parse(dry.stdout);
      const transaction = path.join(repo, ".changes", ".control", "migrations", "feature-one");
      fs.mkdirSync(transaction, { recursive: true });
      fs.writeFileSync(
        path.join(transaction, "current.json"),
        JSON.stringify({
          version: 1,
          change_id: "feature-one",
          state_root: repo,
          state: "interrupted",
          plan_sha256: plan.plan_sha256,
          plan
        })
      );

      const incompleteJs = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const incompletePy = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(incompleteJs.status, 1, incompleteJs.stdout + incompleteJs.stderr);
      assert.equal(incompletePy.status, 1, incompletePy.stdout + incompletePy.stderr);
      assert.match(incompleteJs.stdout, /migration transaction is interrupted/);
      assert.match(incompletePy.stdout, /migration transaction is interrupted/);

      const resumed = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          plan.plan_sha256
        ])
      );
      assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
      assert.equal(JSON.parse(resumed.stdout).idempotent, false);
    });
  });

  await test("migration rejects a symlinked state-root before plan acceptance", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const alias = `${repo}-alias`;
      fs.symlinkSync(repo, alias, "dir");
      try {
        const jsDry = capture(() => runChangeDoc(["--state-root", alias, "migrate", "feature-one", "--dry-run"]));
        const pyDry = runPythonChangeDoc(["--state-root", alias, "migrate", "feature-one", "--dry-run"]);
        assert.equal(jsDry.status, 2, jsDry.stdout + jsDry.stderr);
        assert.equal(pyDry.status, 2, pyDry.stdout + pyDry.stderr);
        assert.match(jsDry.stderr, /state root alias/);
        assert.match(pyDry.stderr, /state root alias/);
        assert.equal(fs.existsSync(path.join(repo, ".changes", ".control", "migrations", "feature-one")), false);
      } finally {
        fs.unlinkSync(alias);
      }
    });
  });

  await test("migration rejects a linked worktree as the explicit state-root", () => {
    withGitWorktrees(({ linked }) => {
      writeLegacyProposal(linked, "feature-one");
      const jsDry = capture(() => runChangeDoc(["--state-root", linked, "migrate", "feature-one", "--dry-run"]));
      const pyDry = runPythonChangeDoc(["--state-root", linked, "migrate", "feature-one", "--dry-run"]);
      assert.equal(jsDry.status, 2, jsDry.stdout + jsDry.stderr);
      assert.equal(pyDry.status, 2, pyDry.stdout + pyDry.stderr);
      assert.match(jsDry.stderr, /linked worktree/);
      assert.match(pyDry.stderr, /linked worktree/);
      assert.equal(fs.existsSync(path.join(linked, ".changes", ".control", "migrations", "feature-one")), false);
    });
  });


  await test("migration apply ignores historical bootstrap lifecycle state in both command mirrors", () => {
    const clients = [
      { name: "Node", run: (args) => capture(() => runChangeDoc(args)) },
      { name: "Python", run: (args) => runPythonChangeDoc(args) }
    ];
    const cases = [
      { registryId: "migration-bootstrap-v1", state: "scoped" },
      { registryId: "migration-bootstrap-v2", state: "scoped" },
      { registryId: "migration-bootstrap-v1", state: "consumed" },
      { registryId: "migration-bootstrap-v2", state: "consumed" },
      { registryId: "migration-bootstrap-v1", state: "revoked-v1" },
      { registryId: "migration-bootstrap-v2", state: "revoked-v2" }
    ];
    for (const client of clients) {
      for (const testCase of cases) {
        withTempRepo((repo) => {
          initBootstrapGitRepo(repo);
          writeLegacyProposal(repo, "feature-one");
          writeLegacyProposal(repo, "feature-two");
          const bootstrap = writeScopedBootstrap(repo, "feature-one", testCase.registryId);
          if (testCase.state === "consumed") {
            writeConsumedBootstrap(repo, "feature-one", testCase.registryId, bootstrap);
          } else if (testCase.state === "revoked-v1") {
            writeForgedRevokedBootstrap(repo, "feature-one", testCase.registryId, { scoped: false });
          } else if (testCase.state === "revoked-v2") {
            writeReviewedRevokedBootstrap(repo, "feature-one", testCase.registryId);
          }

          const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
          const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
          assert.equal(nodeValidate.status, 0, nodeValidate.stdout + nodeValidate.stderr);
          assert.equal(pythonValidate.status, 0, pythonValidate.stdout + pythonValidate.stderr);
          if (testCase.state === "scoped") {
            assert.match(nodeValidate.stdout, /nonterminal historical bootstrap control debt \(scoped\); it does not authorize or block migration apply/);
            assert.match(pythonValidate.stdout, /nonterminal historical bootstrap control debt \(scoped\); it does not authorize or block migration apply/);
          }

          const dry = client.run(["--state-root", repo, "migrate", "feature-two", "--dry-run"]);
          assert.equal(dry.status, 0, client.name + " " + testCase.state + ": " + dry.stdout + dry.stderr);
          const applied = client.run([
            "--state-root",
            repo,
            "migrate",
            "feature-two",
            "--apply",
            "--expected-plan-sha256",
            JSON.parse(dry.stdout).plan_sha256
          ]);
          assert.equal(applied.status, 0, client.name + " " + testCase.state + ": " + applied.stdout + applied.stderr);
        });
      }
    }
  });

  await test("validators reject a scoped bootstrap whose frozen claim spec is not canonical", () => {
    withTempRepo((repo) => {
      initBootstrapGitRepo(repo);
      writeLegacyProposal(repo, "feature-one");
      const bootstrap = writeScopedBootstrap(repo, "feature-one", "migration-bootstrap-v9");
      const reviewPath = path.join(repo, ".changes", "feature-one", "review-log.md");
      const review = fs.readFileSync(reviewPath, "utf8");
      const nonCanonicalClaim = JSON.stringify(bootstrap.claim_spec);
      assert.notEqual(nonCanonicalClaim, canonicalJson(bootstrap.claim_spec));
      fs.writeFileSync(reviewPath, review.replace(canonicalJson(bootstrap.claim_spec), nonCanonicalClaim));

      const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(nodeValidate.status, 1, nodeValidate.stdout + nodeValidate.stderr);
      assert.equal(pythonValidate.status, 1, pythonValidate.stdout + pythonValidate.stderr);
      assert.match(nodeValidate.stdout, /canonical JSON block is not canonical: BootstrapClaimSpec/);
      assert.match(pythonValidate.stdout, /canonical JSON block is not canonical: BootstrapClaimSpec/);
    });
  });

  await test("bootstrap gate references bind one exact frozen review round without invalidating earlier rounds", () => {
    const cases = [
      {
        name: "unrelated append",
        mutate: (repo) => writeFrozenNotReadyReview(repo, "feature-one", "unrelated-review-r01"),
        status: 0
      },
      {
        name: "duplicate decision",
        mutate: (repo) => {
          const reviewPath = path.join(repo, ".changes", "feature-one", "review-log.md");
          fs.appendFileSync(reviewPath, reviewRoundText(fs.readFileSync(reviewPath, "utf8"), "bootstrap-scope-r01"));
        },
        status: 1,
        pattern: /one exact heading/
      },
      {
        name: "vague heading",
        mutate: (repo) => {
          const reviewPath = path.join(repo, ".changes", "feature-one", "review-log.md");
          fs.writeFileSync(
            reviewPath,
            fs.readFileSync(reviewPath, "utf8").replace("## Review Round bootstrap-scope-r01", "## Review Round bootstrap-scope-r01 evidence")
          );
        },
        status: 1,
        pattern: /one exact heading/
      },
      {
        name: "bare review marker remains within the selected round",
        mutate: (repo) => {
          const reviewPath = path.join(repo, ".changes", "feature-one", "review-log.md");
          const review = fs.readFileSync(reviewPath, "utf8");
          const scope = reviewRoundText(review, "bootstrap-scope-r01");
          fs.writeFileSync(
            reviewPath,
            review.replace(scope, scope.replace("### Freeze Decision", "## Review Round\n\n### Freeze Decision"))
          );
          refreshScopedBootstrapReviewDigest(repo, "feature-one", "migration-bootstrap-v9");
        },
        status: 0
      },
      {
        name: "missing disposition",
        mutate: (repo) => {
          const reviewPath = path.join(repo, ".changes", "feature-one", "review-log.md");
          const review = fs.readFileSync(reviewPath, "utf8");
          const scope = reviewRoundText(review, "bootstrap-scope-r01").replace("### Freeze Decision", "### Missing Freeze Decision");
          fs.writeFileSync(reviewPath, review.replace(reviewRoundText(review, "bootstrap-scope-r01"), scope));
        },
        status: 1,
        pattern: /required disposition heading/
      },
      {
        name: "malformed reviewed input table",
        mutate: (repo) => {
          const reviewPath = path.join(repo, ".changes", "feature-one", "review-log.md");
          const review = fs.readFileSync(reviewPath, "utf8");
          const scope = reviewRoundText(review, "bootstrap-scope-r01");
          const malformed = scope.replace(
            `| Path | SHA-256 | Purpose |\n|---|---|---|\n| \`fixture\` | \`${"a".repeat(64)}\` | Controlled test evidence. |`,
            `| Input |\n|---|\n| \`${"a".repeat(64)}\` |`
          );
          fs.writeFileSync(reviewPath, review.replace(scope, malformed));
          refreshScopedBootstrapReviewDigest(repo, "feature-one", "migration-bootstrap-v9");
        },
        status: 1,
        pattern: /reviewed-input digest table/
      },
      {
        name: "altered frozen scope",
        mutate: (repo) => {
          const reviewPath = path.join(repo, ".changes", "feature-one", "review-log.md");
          fs.writeFileSync(reviewPath, fs.readFileSync(reviewPath, "utf8").replace('"behavioral_purposes":["test"]', '"behavioral_purposes":["test-altered"]'));
        },
        status: 1,
        pattern: /frozen manifest|canonical JSON/
      }
    ];
    for (const testCase of cases) {
      withTempRepo((repo) => {
        initBootstrapGitRepo(repo);
        writeLegacyProposal(repo, "feature-one");
        writeScopedBootstrap(repo, "feature-one", "migration-bootstrap-v9");
        testCase.mutate(repo);
        const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
        const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
        assert.equal(nodeValidate.status, testCase.status, `${testCase.name}: ${nodeValidate.stdout}${nodeValidate.stderr}`);
        assert.equal(pythonValidate.status, testCase.status, `${testCase.name}: ${pythonValidate.stdout}${pythonValidate.stderr}`);
        if (testCase.pattern) {
          assert.match(nodeValidate.stdout, testCase.pattern, testCase.name);
          assert.match(pythonValidate.stdout, testCase.pattern, testCase.name);
        }
      });
    }
  });


  await test("migration apply ignores invalid historical bootstrap evidence while validators diagnose it", () => {
    const clients = [
      { name: "Node", run: (args) => capture(() => runChangeDoc(args)) },
      { name: "Python", run: (args) => runPythonChangeDoc(args) }
    ];
    for (const client of clients) {
      withTempRepo((repo) => {
        initBootstrapGitRepo(repo);
        writeLegacyProposal(repo, "feature-one");
        for (const registryId of ["migration-bootstrap-v1", "migration-bootstrap-v2"]) {
          writeScopedBootstrap(repo, "feature-one", registryId);
          writeForgedConsumedBootstrap(repo, "feature-one", registryId);
        }

        const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
        const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
        assert.equal(nodeValidate.status, 1, nodeValidate.stdout + nodeValidate.stderr);
        assert.equal(pythonValidate.status, 1, pythonValidate.stdout + pythonValidate.stderr);
        assert.match(nodeValidate.stdout, /Bootstrap Close Evidence|does not bind/);
        assert.match(pythonValidate.stdout, /Bootstrap Close Evidence|does not bind/);

        const dry = client.run(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
        assert.equal(dry.status, 0, client.name + ": " + dry.stdout + dry.stderr);
        const applied = client.run([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          JSON.parse(dry.stdout).plan_sha256
        ]);
        assert.equal(applied.status, 0, client.name + ": " + applied.stdout + applied.stderr);
      });
    }
  });


  await test("validators require revoke evidence for new records but retain the historical v1 terminal shape", () => {
    withTempRepo((repo) => {
      initBootstrapGitRepo(repo);
      writeLegacyProposal(repo, "feature-one");
      writeScopedBootstrap(repo, "feature-one", "migration-bootstrap-v9");
      writeForgedRevokedBootstrap(repo, "feature-one", "migration-bootstrap-v9", { scoped: true });

      const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(nodeValidate.status, 1, nodeValidate.stdout + nodeValidate.stderr);
      assert.equal(pythonValidate.status, 1, pythonValidate.stdout + pythonValidate.stderr);
      assert.match(nodeValidate.stdout, /revocation evidence/);
      assert.match(pythonValidate.stdout, /revocation evidence/);
    });

    withTempRepo((repo) => {
      initBootstrapGitRepo(repo);
      writeLegacyProposal(repo, "feature-one");
      writeScopedBootstrap(repo, "feature-one", "migration-bootstrap-v1");
      writeForgedRevokedBootstrap(repo, "feature-one", "migration-bootstrap-v1", { scoped: false });

      const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(nodeValidate.status, 0, nodeValidate.stdout + nodeValidate.stderr);
      assert.equal(pythonValidate.status, 0, pythonValidate.stdout + pythonValidate.stderr);
    });
  });


  await test("controlled migration keeps an incomplete transaction without its accepted plan fail-closed", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const transaction = path.join(repo, ".changes", ".control", "migrations", "feature-one");
      fs.mkdirSync(transaction, { recursive: true });
      fs.writeFileSync(
        path.join(transaction, "current.json"),
        JSON.stringify({
          version: 1,
          change_id: "feature-one",
          state_root: repo,
          state: "interrupted",
          plan_sha256: "0".repeat(64)
        })
      );

      const result = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          "0".repeat(64)
        ])
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /lacks a recoverable accepted plan/);
      assert.equal(fs.existsSync(path.join(repo, ".changes", "feature-one", "README.md")), false);
    });
  });

  await test("controlled migration resumes a partial install from the stored accepted plan", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const change = path.join(repo, ".changes", "feature-one");
      fs.writeFileSync(path.join(change, "review-log.md"), "legacy review bytes\n");
      const dry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      assert.equal(dry.status, 0, dry.stdout + dry.stderr);
      const plan = JSON.parse(dry.stdout);

      withTempRepo((donor) => {
        writeLegacyProposal(donor, "feature-one");
        const donorChange = path.join(donor, ".changes", "feature-one");
        fs.writeFileSync(path.join(donorChange, "review-log.md"), "legacy review bytes\n");
        const donorDry = capture(() => runChangeDoc(["--state-root", donor, "migrate", "feature-one", "--dry-run"]));
        const donorPlan = JSON.parse(donorDry.stdout);
        const donorApply = capture(() =>
          runChangeDoc([
            "--state-root",
            donor,
            "migrate",
            "feature-one",
            "--apply",
            "--expected-plan-sha256",
            donorPlan.plan_sha256
          ])
        );
        assert.equal(donorApply.status, 0, donorApply.stdout + donorApply.stderr);
        fs.copyFileSync(path.join(donorChange, "README.md"), path.join(change, "README.md"));
      });

      const transaction = path.join(repo, ".changes", ".control", "migrations", "feature-one");
      fs.mkdirSync(transaction, { recursive: true });
      fs.writeFileSync(
        path.join(transaction, "current.json"),
        JSON.stringify({
          version: 1,
          change_id: "feature-one",
          state_root: repo,
          state: "interrupted",
          plan_sha256: plan.plan_sha256,
          plan
        })
      );

      const resumed = runPythonChangeDoc([
        "--state-root",
        repo,
        "migrate",
        "feature-one",
        "--apply",
        "--expected-plan-sha256",
        plan.plan_sha256
      ]);
      assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
      assert.equal(JSON.parse(resumed.stdout).idempotent, false);
      assert.equal(JSON.parse(fs.readFileSync(path.join(transaction, "current.json"), "utf8")).state, "committed");
    });
  });

  await test("controlled migration reclaims a stale owner lock", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const dry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const plan = JSON.parse(dry.stdout);
      const transaction = path.join(repo, ".changes", ".control", "migrations", "feature-one");
      fs.mkdirSync(transaction, { recursive: true });
      fs.writeFileSync(path.join(transaction, "migration.lock"), `99999999 ${"f".repeat(32)}\n`);

      const applied = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          plan.plan_sha256
        ])
      );
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      assert.equal(fs.existsSync(path.join(transaction, "migration.lock")), false);
    });
  });

  await test("controlled migration normalizes frozen legacy review-round digests without rewriting CRLF archive bytes", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const review = bootstrapReviewRound({
        decisionId: "legacy-review-r01",
        executorId: "bootstrap-executor",
        reviewerId: "bootstrap-reviewer"
      });
      const reviewPath = path.join(repo, ".changes", "feature-one", "review-log.md");
      const crlfReview = review.replace(/\n/g, "\r\n");
      fs.writeFileSync(reviewPath, crlfReview);

      const nodeDry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const pythonDry = runPythonChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
      assert.equal(nodeDry.status, 0, nodeDry.stdout + nodeDry.stderr);
      assert.equal(pythonDry.status, 0, pythonDry.stdout + pythonDry.stderr);
      const nodePlan = JSON.parse(nodeDry.stdout);
      const pythonPlan = JSON.parse(pythonDry.stdout);
      const nodeRounds = nodePlan.legacy_sources.find((source) => source.path === "review-log.md").frozen_review_rounds;
      const pythonRounds = pythonPlan.legacy_sources.find((source) => source.path === "review-log.md").frozen_review_rounds;
      assert.deepEqual(nodeRounds, pythonRounds);
      assert.deepEqual(nodeRounds, [{ decision_id: "legacy-review-r01", sha256: sha256Text(canonicalReviewRoundText(review)) }]);

      const applied = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          nodePlan.plan_sha256
        ])
      );
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      assert.deepEqual(
        fs.readFileSync(path.join(repo, ".changes", "archive", "feature-one", "legacy", "review-log.md")),
        Buffer.from(crlfReview, "utf8")
      );

      const nodeValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pythonValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(nodeValidate.status, 0, nodeValidate.stdout + nodeValidate.stderr);
      assert.equal(pythonValidate.status, 0, pythonValidate.stdout + pythonValidate.stderr);
    });
  });

  await test("controlled migration fails closed when a stale-lock recovery guard is left behind", () => {
    const clients = [
      { name: "Node", run: (args) => capture(() => runChangeDoc(args)) },
      { name: "Python", run: (args) => runPythonChangeDoc(args) }
    ];
    for (const client of clients) {
      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const dry = client.run(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
        const transaction = path.join(repo, ".changes", ".control", "migrations", "feature-one");
        fs.mkdirSync(transaction, { recursive: true });
        fs.writeFileSync(path.join(transaction, "migration.lock"), `99999998 ${"e".repeat(32)}\n`);
        fs.writeFileSync(path.join(transaction, "migration.lock.recovery"), `99999999 ${"d".repeat(32)}\n`);
        const applied = client.run([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          JSON.parse(dry.stdout).plan_sha256
        ]);
        assert.equal(applied.status, 1, `${client.name}: ${applied.stdout}${applied.stderr}`);
        assert.match(applied.stderr, /stale-lock recovery is unrecovered/);
        assert.equal(fs.readFileSync(path.join(transaction, "migration.lock"), "utf8"), `99999998 ${"e".repeat(32)}\n`);
      });
    }
  });

  await test("abandoned interrupted migration restores its staged source snapshot before a fresh plan", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const change = path.join(repo, ".changes", "feature-one");
      const dry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      assert.equal(dry.status, 0, dry.stdout + dry.stderr);
      const plan = JSON.parse(dry.stdout);
      const transaction = path.join(repo, ".changes", ".control", "migrations", "feature-one");
      const staging = path.join(transaction, "staging", plan.plan_sha256, "source");
      for (const source of plan.source_inventory) {
        const sourcePath = path.join(change, source.path);
        const snapshotPath = path.join(staging, source.path);
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.copyFileSync(sourcePath, snapshotPath);
      }
      fs.mkdirSync(transaction, { recursive: true });
      fs.writeFileSync(
        path.join(transaction, "current.json"),
        JSON.stringify({
          version: 1,
          change_id: "feature-one",
          state_root: repo,
          state: "interrupted",
          plan_sha256: plan.plan_sha256,
          source_inventory: plan.source_inventory,
          legacy_sources: plan.legacy_sources,
          destination_manifest: plan.destination_manifest,
          provenance_path: "decisions/DR-001-migration-provenance.md",
          plan
        })
      );

      const abandoned = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          "0".repeat(64)
        ])
      );
      assert.equal(abandoned.status, 1, abandoned.stdout + abandoned.stderr);
      assert.match(abandoned.stderr, /prior partial workspace was rolled back/);
      assert.equal(JSON.parse(fs.readFileSync(path.join(transaction, "current.json"), "utf8")).state, "rolled-back");
      assert.equal(fs.existsSync(path.join(change, "tasks.md")), true);
      assert.equal(fs.existsSync(path.join(change, "specs", "README.md")), false);

      const applied = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          plan.plan_sha256
        ])
      );
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      assert.equal(JSON.parse(applied.stdout).transaction_state, "committed");
    });
  });

  await test("interrupted migration never restores a non-legacy source removed after the accepted plan", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const change = path.join(repo, ".changes", "feature-one");
      const dry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      assert.equal(dry.status, 0, dry.stdout + dry.stderr);
      const plan = JSON.parse(dry.stdout);
      const transaction = path.join(repo, ".changes", ".control", "migrations", "feature-one");
      const staging = path.join(transaction, "staging", plan.plan_sha256, "source");
      for (const source of plan.source_inventory) {
        const sourcePath = path.join(change, source.path);
        const snapshotPath = path.join(staging, source.path);
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.copyFileSync(sourcePath, snapshotPath);
      }
      fs.writeFileSync(
        path.join(transaction, "current.json"),
        JSON.stringify({
          version: 1,
          change_id: "feature-one",
          state_root: repo,
          state: "interrupted",
          plan_sha256: plan.plan_sha256,
          source_inventory: plan.source_inventory,
          legacy_sources: plan.legacy_sources,
          destination_manifest: plan.destination_manifest,
          provenance_path: "decisions/DR-001-migration-provenance.md",
          plan
        })
      );
      fs.unlinkSync(path.join(change, "proposal.md"));

      const result = capture(() =>
        runChangeDoc([
          "--state-root",
          repo,
          "migrate",
          "feature-one",
          "--apply",
          "--expected-plan-sha256",
          "0".repeat(64)
        ])
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /cannot safely roll back.*source file is missing proposal\.md/);
      assert.equal(fs.existsSync(path.join(change, "proposal.md")), false);
      assert.equal(JSON.parse(fs.readFileSync(path.join(transaction, "current.json"), "utf8")).state, "interrupted");
    });
  });

  await test("Python rolls back a recoverable interrupted migration from the staged source snapshot", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const change = path.join(repo, ".changes", "feature-one");
      const dry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const plan = JSON.parse(dry.stdout);
      const transaction = path.join(repo, ".changes", ".control", "migrations", "feature-one");
      const staging = path.join(transaction, "staging", plan.plan_sha256, "source");
      for (const source of plan.source_inventory) {
        const sourcePath = path.join(change, source.path);
        const snapshotPath = path.join(staging, source.path);
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.copyFileSync(sourcePath, snapshotPath);
      }
      fs.writeFileSync(
        path.join(transaction, "current.json"),
        JSON.stringify({
          version: 1,
          change_id: "feature-one",
          state_root: repo,
          state: "interrupted",
          plan_sha256: plan.plan_sha256,
          source_inventory: plan.source_inventory,
          legacy_sources: plan.legacy_sources,
          destination_manifest: plan.destination_manifest,
          provenance_path: "decisions/DR-001-migration-provenance.md",
          plan
        })
      );

      const abandoned = runPythonChangeDoc([
        "--state-root",
        repo,
        "migrate",
        "feature-one",
        "--apply",
        "--expected-plan-sha256",
        "0".repeat(64)
      ]);
      assert.equal(abandoned.status, 1, abandoned.stdout + abandoned.stderr);
      assert.match(abandoned.stderr, /prior partial workspace was rolled back/);
      assert.equal(JSON.parse(fs.readFileSync(path.join(transaction, "current.json"), "utf8")).state, "rolled-back");
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

function runPythonChangeDoc(args, env = {}) {
  return spawnSync("python3", [path.join(packageRoot, "lib", "change", "harness_change_doc.py"), ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

function runPythonChangeValidate(args, env = {}) {
  return spawnSync("python3", [path.join(packageRoot, "lib", "change", "harness_change_validate.py"), ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, ...env }
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

function withGitWorktrees(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-change-worktrees-"));
  const main = path.join(root, "main");
  const linked = path.join(root, "linked");
  try {
    fs.mkdirSync(main, { recursive: true });
    git(["init", "-q"], main);
    git(["config", "user.email", "tests@example.invalid"], main);
    git(["config", "user.name", "Harness Tests"], main);
    git(["commit", "--allow-empty", "-q", "-m", "initial"], main);
    git(["worktree", "add", "-q", "-b", "linked-branch", linked], main);
    fn({ main, linked });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
}

function withEnv(values, fn) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = value;
    }
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function addTaskSlice(repo, changeId, slug) {
  const result = capture(() => runChangeDoc([
    "--state-root",
    repo,
    "add-task-slice",
    changeId,
    "--slug",
    slug
  ]));
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

function writeExecutionMap(repo, changeId, rows) {
  const change = path.join(repo, ".changes", changeId);
  const columns = ["Slice", "Topology", "Status", "Branch", "Worktree", "Base", "Depends On", "Owner", "Last Evidence"];
  const keys = ["slice", "topology", "status", "branch", "worktree", "base", "depends_on", "owner", "last_evidence"];
  fs.writeFileSync(
    path.join(change, "execution-map.md"),
    frontMatter("execution-map", "execution-map") +
      [
        "# Execution Map",
        "",
        `| ${columns.join(" | ")} |`,
        `|${columns.map(() => "---").join("|")}|`,
        ...rows.map((row) => `| ${keys.map((key) => row[key] ?? "").join(" | ")} |`),
        ""
      ].join("\n")
  );
}

function initGitRepo(repo) {
  fs.mkdirSync(repo, { recursive: true });
  git(["init", "-q"], repo);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeScopedBootstrap(repo, changeId, registryId) {
  const control = path.join(repo, ".changes", ".control", registryId);
  const authorityId = registryId.replace(/^migration-bootstrap-/, "migration-apply-bootstrap-");
  const root = path.resolve(repo);
  const baseCommit = git(["rev-parse", "HEAD"], repo).stdout.trim();
  const executorId = "bootstrap-executor";
  const reviewerId = "bootstrap-reviewer";
  const predecessor = [];
  const predecessorHash = sha256Text(canonicalJson(predecessor));
  const claimSpec = {
    bootstrap_id: authorityId,
    expected_authority_decision_id: "bootstrap-authority-r01",
    exclusive_create: true,
    originating_change_id: changeId,
    state_root_realpath: root
  };
  const authority = {
    artifact_path: "review-log.md",
    artifact_sha256: null,
    change_id: changeId,
    decision: "READY",
    decision_id: "bootstrap-authority-r01"
  };
  const authorityRound = bootstrapReviewRound({
    body: ["### BootstrapClaimSpec", "", "```json", canonicalJson(claimSpec), "```"],
    decisionId: "bootstrap-authority-r01",
    executorId,
    reviewerId
  });
  authority.artifact_sha256 = sha256Text(canonicalReviewRoundText(authorityRound));
  const claimed = {
    authority_ref: authority,
    bootstrap_id: authorityId,
    claim_spec_digest: sha256Text(canonicalJson(claimSpec)),
    generation: 1,
    originating_change_id: changeId,
    owner: executorId,
    state: "claimed",
    state_root_realpath: root
  };
  const claimHash = sha256Text(canonicalJson(claimed));
  const manifest = {
    authority_record_sha256: claimHash,
    base_commit: baseCommit,
    behavioral_purposes: ["test"],
    code_root_realpath: root,
    executor_id: executorId,
    originating_change_id: changeId,
    predecessor_snapshot_sha256: predecessorHash,
    reviewer_id: reviewerId,
    rollback_boundary: "test-boundary",
    source_paths: ["README.md"],
    validation_ids: ["test"]
  };
  const manifestHash = sha256Text(canonicalJson(manifest));
  const snapshotHash = sha256Text(canonicalJson([]));
  const validationEvidence = { commands: ["test"] };
  const validationHash = sha256Text(canonicalJson(validationEvidence));
  const scopeRound = bootstrapReviewRound({
    body: [
      "### Bootstrap Scope Manifest",
      "",
      "```json",
      canonicalJson(manifest),
      "```",
      "",
      "### Predecessor Source Snapshot",
      "",
      "```json",
      canonicalJson(predecessor),
      "```"
    ],
    decisionId: "bootstrap-scope-r01",
    executorId,
    reviewerId
  });
  const closeEvidence = {
    authority_record_sha256: claimHash,
    base_commit: baseCommit,
    executor_id: executorId,
    implementation_snapshot_sha256: snapshotHash,
    reviewer_id: reviewerId,
    scope_manifest_sha256: manifestHash,
    validation_evidence: validationEvidence
  };
  const closeRound = bootstrapReviewRound({
    body: ["### Bootstrap Close Evidence", "", "```json", canonicalJson(closeEvidence), "```"],
    decisionId: "bootstrap-close-r01",
    executorId,
    reviewerId
  });
  const review = [authorityRound, scopeRound, closeRound].join("");
  const reviewPath = path.join(repo, ".changes", changeId, "review-log.md");
  fs.writeFileSync(reviewPath, review);
  const scoped = {
    authority_event_sha256: claimHash,
    base_commit: baseCommit,
    bootstrap_id: authorityId,
    generation: 2,
    originating_change_id: changeId,
    predecessor_snapshot_sha256: predecessorHash,
    rollback_boundary: "test-boundary",
    scope_gate_ref: {
      artifact_path: "review-log.md",
      artifact_sha256: sha256Text(canonicalReviewRoundText(scopeRound)),
      change_id: changeId,
      decision: "READY",
      decision_id: "bootstrap-scope-r01"
    },
    scope_manifest_sha256: manifestHash,
    state: "scoped",
    state_root_realpath: root
  };
  const scopeHash = sha256Text(canonicalJson(scoped));
  writeCanonicalJson(path.join(control, "events", "000001-claimed.json"), claimed);
  writeCanonicalJson(path.join(control, "events", "000002-scoped.json"), scoped);
  writeCanonicalJson(path.join(control, "current.json"), {
    event: "events/000002-scoped.json",
    event_sha256: scopeHash,
    generation: 2,
    state: "scoped"
  });
  return {
    authority_event_sha256: claimHash,
    claim_spec: claimSpec,
    close_evidence_sha256: sha256Text(canonicalJson(closeEvidence)),
    review_sha256: sha256Text(canonicalReviewRoundText(closeRound)),
    scope_event_sha256: scopeHash,
    snapshot_sha256: snapshotHash,
    validation_evidence_sha256: validationHash
  };
}

function bootstrapReviewRound({ body = [], decision = "READY", decisionId, executorId, reviewerId }) {
  return [
    `## Review Round ${decisionId}`,
    "",
    `Decision ID: ${decisionId}`,
    "",
    `Decision: ${decision}`,
    "",
    "Frozen: yes",
    "",
    `Executor ID: ${executorId}`,
    "",
    `Reviewer ID: ${reviewerId}`,
    "",
    "Reviewed Inputs:",
    "",
    "| Path | SHA-256 | Purpose |",
    "|---|---|---|",
    `| \`fixture\` | \`${"a".repeat(64)}\` | Controlled test evidence. |`,
    "",
    ...body,
    "",
    "### Findings",
    "",
    "- Fixture evidence is internally consistent.",
    "",
    "### Blocking",
    "",
    "Blocking Open: 0",
    "",
    "### Re-review Result",
    "",
    `- ${decision}: fixture round is frozen for the requested transition.`,
    "",
    "### Freeze Decision",
    "",
    `- ${decisionId} is frozen ${decision}.`,
    "",
    "### Status",
    "",
    "### Should Fix",
    "",
    "### Fix Applied",
    "",
    "### Deferred With Reason",
    "",
    ""
  ].join("\n");
}

function reviewRoundText(text, decisionId) {
  const heading = `## Review Round ${decisionId}`;
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing fixture review round: ${decisionId}`);
  const next = text.indexOf("## Review Round ", start + heading.length);
  return canonicalReviewRoundText(text.slice(start, next < 0 ? text.length : next));
}

function canonicalReviewRoundText(text) {
  return `${text.replace(/(?:\n[ \t]*)+$/, "")}\n`;
}

function initBootstrapGitRepo(repo) {
  initGitRepo(repo);
  git(["config", "user.email", "tests@example.invalid"], repo);
  git(["config", "user.name", "Harness Tests"], repo);
  git(["commit", "--allow-empty", "-q", "-m", "bootstrap-base"], repo);
}

function writeFrozenNotReadyReview(repo, changeId, decisionId) {
  const reviewPath = path.join(repo, ".changes", changeId, "review-log.md");
  const round = bootstrapReviewRound({
    decision: "NOT_READY",
    decisionId,
    executorId: "bootstrap-executor",
    reviewerId: "bootstrap-reviewer"
  });
  fs.appendFileSync(reviewPath, `\n${round}`);
  return sha256Text(canonicalReviewRoundText(round));
}

function writeForgedConsumedBootstrap(repo, changeId, registryId) {
  const control = path.join(repo, ".changes", ".control", registryId);
  const currentPath = path.join(control, "current.json");
  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const authorityId = registryId.replace(/^migration-bootstrap-/, "migration-apply-bootstrap-");
  const forged = {
    authority_event_sha256: JSON.parse(fs.readFileSync(path.join(control, "events", "000002-scoped.json"), "utf8")).authority_event_sha256,
    bootstrap_id: authorityId,
    close_evidence_sha256: "0".repeat(64),
    close_gate_ref: {
      artifact_path: "review-log.md",
      artifact_sha256: "0".repeat(64),
      change_id: changeId,
      decision: "READY",
      decision_id: "bootstrap-close-r01"
    },
    executor_id: "bootstrap-executor",
    generation: 3,
    implementation_snapshot_sha256: "0".repeat(64),
    originating_change_id: changeId,
    reviewer_id: "bootstrap-reviewer",
    scope_event_sha256: current.event_sha256,
    state: "consumed",
    state_root_realpath: path.resolve(repo),
    validation_evidence_sha256: "0".repeat(64)
  };
  writeCanonicalJson(path.join(control, "events", "000003-consumed.json"), forged);
  writeCanonicalJson(currentPath, {
    event: "events/000003-consumed.json",
    event_sha256: sha256Text(canonicalJson(forged)),
    generation: 3,
    state: "consumed"
  });
}

function writeConsumedBootstrap(repo, changeId, registryId, bootstrap) {
  const control = path.join(repo, ".changes", ".control", registryId);
  const currentPath = path.join(control, "current.json");
  const authorityId = registryId.replace(/^migration-bootstrap-/, "migration-apply-bootstrap-");
  const consumed = {
    authority_event_sha256: bootstrap.authority_event_sha256,
    bootstrap_id: authorityId,
    close_evidence_sha256: bootstrap.close_evidence_sha256,
    close_gate_ref: {
      artifact_path: "review-log.md",
      artifact_sha256: bootstrap.review_sha256,
      change_id: changeId,
      decision: "READY",
      decision_id: "bootstrap-close-r01"
    },
    executor_id: "bootstrap-executor",
    generation: 3,
    implementation_snapshot_sha256: bootstrap.snapshot_sha256,
    originating_change_id: changeId,
    reviewer_id: "bootstrap-reviewer",
    scope_event_sha256: bootstrap.scope_event_sha256,
    state: "consumed",
    state_root_realpath: path.resolve(repo),
    validation_evidence_sha256: bootstrap.validation_evidence_sha256
  };
  writeCanonicalJson(path.join(control, "events", "000003-consumed.json"), consumed);
  writeCanonicalJson(currentPath, {
    event: "events/000003-consumed.json",
    event_sha256: sha256Text(canonicalJson(consumed)),
    generation: 3,
    state: "consumed"
  });
}

function writeForgedRevokedBootstrap(repo, changeId, registryId, { scoped }) {
  const control = path.join(repo, ".changes", ".control", registryId);
  const currentPath = path.join(control, "current.json");
  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const authorityId = registryId.replace(/^migration-bootstrap-/, "migration-apply-bootstrap-");
  const revoked = {
    bootstrap_id: authorityId,
    generation: 3,
    originating_change_id: changeId,
    ...(scoped ? { scope_event_sha256: current.event_sha256 } : { prior_event_sha256: current.event_sha256 }),
    ...(scoped ? {} : { replacement_bootstrap_id: "migration-apply-bootstrap-v2" }),
    reason: "fixture-terminal-containment",
    state: "revoked",
    state_root_realpath: path.resolve(repo)
  };
  writeCanonicalJson(path.join(control, "events", "000003-revoked.json"), revoked);
  writeCanonicalJson(currentPath, {
    event: "events/000003-revoked.json",
    event_sha256: sha256Text(canonicalJson(revoked)),
    generation: 3,
    state: "revoked"
  });
}

function writeReviewedRevokedBootstrap(repo, changeId, registryId) {
  const control = path.join(repo, ".changes", ".control", registryId);
  const currentPath = path.join(control, "current.json");
  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const decisionId = "bootstrap-revoke-r01";
  const reviewHash = writeFrozenNotReadyReview(repo, changeId, decisionId);
  const authorityId = registryId.replace(/^migration-bootstrap-/, "migration-apply-bootstrap-");
  const revoked = {
    bootstrap_id: authorityId,
    generation: 3,
    originating_change_id: changeId,
    reason: "fixture-reviewed-containment",
    revoke_gate_ref: {
      artifact_path: "review-log.md",
      artifact_sha256: reviewHash,
      change_id: changeId,
      decision: "NOT_READY",
      decision_id: decisionId
    },
    scope_event_sha256: current.event_sha256,
    state: "revoked",
    state_root_realpath: path.resolve(repo)
  };
  writeCanonicalJson(path.join(control, "events", "000003-revoked.json"), revoked);
  writeCanonicalJson(currentPath, {
    event: "events/000003-revoked.json",
    event_sha256: sha256Text(canonicalJson(revoked)),
    generation: 3,
    state: "revoked"
  });
}

function refreshScopedBootstrapReviewDigest(repo, changeId, registryId) {
  const control = path.join(repo, ".changes", ".control", registryId);
  const scopedPath = path.join(control, "events", "000002-scoped.json");
  const scoped = JSON.parse(fs.readFileSync(scopedPath, "utf8"));
  scoped.scope_gate_ref.artifact_sha256 = sha256Text(reviewRoundText(fs.readFileSync(path.join(repo, ".changes", changeId, "review-log.md"), "utf8"), "bootstrap-scope-r01"));
  writeCanonicalJson(scopedPath, scoped);
  writeCanonicalJson(path.join(control, "current.json"), {
    event: "events/000002-scoped.json",
    event_sha256: sha256Text(canonicalJson(scoped)),
    generation: 2,
    state: "scoped"
  });
}

function writeCanonicalJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, canonicalJson(value));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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
