import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
    assert.equal(policy.commands.init, "harness-change-doc init <change> --json");
    assert.equal(policy.commands.add_implementation_design, "harness-change-doc add-implementation-design");
    assert.equal(policy.commands.migrate, "harness-change-doc migrate <change> --dry-run | --apply");
    assert.doesNotMatch(result.stdout, /dbackup-change-/i);
    assert.doesNotMatch(result.stdout, /quick-project/i);

    const pyResult = runPythonChangeDoc(["--repo-root", packageRoot, "policy", "--json"]);
    assert.equal(pyResult.status, 0, pyResult.stdout + pyResult.stderr);
    const pyPolicy = JSON.parse(pyResult.stdout);
    assert.equal(pyPolicy.commands.policy, "harness-change-doc policy --json");
    assert.equal(pyPolicy.commands.resolve, "harness-change-doc resolve --json");
    assert.equal(pyPolicy.commands.execution_map, "harness-change-doc execution-map <change> --json");
    assert.equal(pyPolicy.commands.assign_slice, "harness-change-doc assign-slice <change> --slice <slice>");
    assert.equal(pyPolicy.commands.init, "harness-change-doc init <change> --json");
    assert.equal(pyPolicy.commands.migrate, "harness-change-doc migrate <change> --dry-run | --apply");
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

  await test("JS and Python init create one managed structured workspace contract", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        const result = client([
          "--state-root",
          repo,
          "--code-root",
          repo,
          "init",
          "managed-workspace",
          "--description",
          "Managed workspace fixture.",
          "--json"
        ]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const payload = JSON.parse(result.stdout);
        assert.equal(payload.change_id, "managed-workspace");
        assert.equal(payload.initialized, true);
        assert.equal(payload.change_root, ".changes/managed-workspace");

        const change = path.join(repo, ".changes", "managed-workspace");
        for (const expected of [
          "README.md",
          "requirements.md",
          "research.md",
          "proposal.md",
          "design.md",
          "plan.md",
          "tasks.md",
          "specs/README.md",
          "decisions/README.md",
          "timeline/README.md",
          "reviews/README.md",
          "tasks/README.md"
        ]) {
          assert.equal(fs.existsSync(path.join(change, expected)), true, `${expected} missing`);
        }

        const validate = capture(() => runChangeValidate([
          "--state-root",
          repo,
          "--change",
          "managed-workspace",
          "--strict-layout"
        ]));
        assert.equal(validate.status, 0, validate.stdout + validate.stderr);
        assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=0/);

        const repeated = client(["--state-root", repo, "init", "managed-workspace", "--json"]);
        assert.equal(repeated.status, 1, repeated.stdout + repeated.stderr);
        assert.match(repeated.stderr, /change already exists/);
      });
    }
  });

  await test("init rejects invalid change ids before creating a workspace", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        const result = client(["--state-root", repo, "init", "../escape", "--json"]);
        assert.equal(result.status, 2, result.stdout + result.stderr);
        assert.match(result.stderr, /invalid change id/);
        assert.equal(fs.existsSync(path.join(repo, "escape")), false);
      });
    }
  });

  await test("add-review inserts only into the exact Child Index table and stays idempotent", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "structured-one");
        const reviews = path.join(repo, ".changes", "structured-one", "reviews");
        fs.mkdirSync(reviews, { recursive: true });
        const indexPath = path.join(reviews, "README.md");
        const before = frontMatter("reviews-index", "review") + [
          "# Reviews",
          "",
          "## Child Index Archive",
          "",
          "| path | artifact | status | order | description |",
          "|---|---|---|---|---|",
          "| `archive-r01.md` | review-round | superseded | r01 | Archived row. |",
          "",
          "## Child Index",
          "",
          "| path | artifact | status | order | description |",
          "|---|---|---|---|---|",
          "",
          "## Review Notes",
          "",
          "Keep this section unchanged.",
          ""
        ].join("\n");
        fs.writeFileSync(indexPath, before);

        const args = [
          "--state-root",
          repo,
          "add-review",
          "structured-one",
          "--target",
          "implementation",
          "--round",
          "4",
          "--description",
          "Implementation review."
        ];
        const first = client(args);
        assert.equal(first.status, 0, first.stdout + first.stderr);
        const afterFirst = fs.readFileSync(indexPath, "utf8");
        const row = "| `implementation-r04.md` | review-round | draft | r04 | Implementation review. |";
        assert.equal(afterFirst.match(new RegExp(escapeRegExp(row), "g"))?.length, 1);
        assert.ok(afterFirst.indexOf(row) > afterFirst.indexOf("## Child Index\n"));
        assert.ok(afterFirst.indexOf(row) < afterFirst.indexOf("## Review Notes"));
        assert.match(afterFirst, /## Child Index Archive[\s\S]*Archived row\.[\s\S]*## Child Index\n/);
        assert.match(afterFirst, /## Review Notes\n\nKeep this section unchanged\.\n$/);

        const second = client([...args, "--force"]);
        assert.equal(second.status, 0, second.stdout + second.stderr);
        assert.equal(fs.readFileSync(indexPath, "utf8"), afterFirst);
      });
    }
  });

  await test("add-review fails closed for missing, ambiguous, or malformed Child Index sections", () => {
    const invalidBodies = [
      "# Reviews\n\n## Findings\n\nNo child index.\n",
      "# Reviews\n\n## Child Index\n\n| path | artifact |\n|---|---|\n\n## Child Index\n\n| path | artifact | status | order | description |\n|---|---|---|---|---|\n",
      "# Reviews\n\n## Child Index\n\n| path | artifact | status | description |\n|---|---|---|---|\n"
    ];
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      for (const body of invalidBodies) {
        withTempRepo((repo) => {
          writeStructuredProposal(repo, "structured-one");
          const reviews = path.join(repo, ".changes", "structured-one", "reviews");
          fs.mkdirSync(reviews, { recursive: true });
          const indexPath = path.join(reviews, "README.md");
          const original = frontMatter("reviews-index", "review") + body;
          fs.writeFileSync(indexPath, original);

          const result = client([
            "--state-root",
            repo,
            "add-review",
            "structured-one",
            "--target",
            "implementation",
            "--round",
            "4"
          ]);
          assert.equal(result.status, 1, result.stdout + result.stderr);
          assert.match(result.stderr, /valid unique Child Index table/);
          assert.equal(fs.readFileSync(indexPath, "utf8"), original);
          assert.equal(fs.existsSync(path.join(reviews, "implementation-r04.md")), false);
        });
      }
    }
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

  await test("migration previews and applies one monotonic Node/Python contract", () => {
    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const change = path.join(repo, ".changes", "feature-one");
      const proposalWithBom = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        fs.readFileSync(path.join(change, "proposal.md"))
      ]);
      fs.writeFileSync(path.join(change, "proposal.md"), proposalWithBom);
      const reviewBytes = Buffer.from([0xff, 0x00, 0x6c, 0x65, 0x67, 0x61, 0x63, 0x79]);
      fs.writeFileSync(path.join(change, "review-log.md"), reviewBytes);
      const taskBytes = fs.readFileSync(path.join(change, "tasks.md"));

      const jsDry = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]));
      const pyDry = runPythonChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
      assert.equal(jsDry.status, 0, jsDry.stdout + jsDry.stderr);
      assert.equal(pyDry.status, 0, pyDry.stdout + pyDry.stderr);
      const plan = JSON.parse(jsDry.stdout);
      assert.deepEqual(JSON.parse(pyDry.stdout), plan);
      assert.deepEqual(Object.keys(plan), [
        "mode",
        "change_id",
        "legacy_sources",
        "generated_paths",
        "already_migrated"
      ]);
      assert.deepEqual(plan.legacy_sources.map((source) => source.path), ["review-log.md", "tasks.md"]);
      for (const source of plan.legacy_sources) {
        assert.deepEqual(Object.keys(source), [
          "path",
          "archive_path",
          "target_directory",
          "source_state",
          "archive_state"
        ]);
        assert.equal(source.source_state, "present");
        assert.equal(source.archive_state, "absent");
      }
      assert.deepEqual(plan.generated_paths, [...plan.generated_paths].sort());
      assert.equal(plan.already_migrated, false);

      const applied = runPythonChangeDoc(["--state-root", repo, "migrate", "feature-one", "--apply"]);
      assert.equal(applied.status, 0, applied.stdout + applied.stderr);
      assert.equal(JSON.parse(applied.stdout).mode, "applied");
      assert.deepEqual(
        fs.readFileSync(path.join(repo, ".changes", "archive", "feature-one", "legacy", "review-log.md")),
        reviewBytes
      );
      assert.deepEqual(
        fs.readFileSync(path.join(repo, ".changes", "archive", "feature-one", "legacy", "tasks.md")),
        taskBytes
      );
      assert.equal(fs.existsSync(path.join(change, "review-log.md")), false);
      assert.equal(fs.existsSync(path.join(change, "tasks.md")), false);
      assert.equal(fs.existsSync(path.join(repo, ".changes", ".control", "migrations")), false);

      const pythonSnapshot = migrationSnapshot(repo, "feature-one");
      withTempRepo((nodeRepo) => {
        writeLegacyProposal(nodeRepo, "feature-one");
        fs.writeFileSync(
          path.join(nodeRepo, ".changes", "feature-one", "proposal.md"),
          proposalWithBom
        );
        fs.writeFileSync(path.join(nodeRepo, ".changes", "feature-one", "review-log.md"), reviewBytes);
        const nodeApplied = capture(() =>
          runChangeDoc(["--state-root", nodeRepo, "migrate", "feature-one", "--apply"])
        );
        assert.equal(nodeApplied.status, 0, nodeApplied.stdout + nodeApplied.stderr);
        assert.deepEqual(migrationSnapshot(nodeRepo, "feature-one"), pythonSnapshot);
      });

      const editedReadme = `${fs.readFileSync(path.join(change, "README.md"), "utf8")}\n## Later Edit\n\nKeep me.\n`;
      fs.writeFileSync(path.join(change, "README.md"), editedReadme);
      const repeated = capture(() => runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--apply"]));
      assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
      assert.equal(JSON.parse(repeated.stdout).already_migrated, true);
      assert.deepEqual(JSON.parse(repeated.stdout).generated_paths, []);
      assert.equal(fs.readFileSync(path.join(change, "README.md"), "utf8"), editedReadme);

      const jsValidate = capture(() => runChangeValidate(["--state-root", repo, "--change", "feature-one"]));
      const pyValidate = runPythonChangeValidate(["--state-root", repo, "--change", "feature-one"]);
      assert.equal(jsValidate.status, 0, jsValidate.stdout + jsValidate.stderr);
      assert.equal(pyValidate.status, 0, pyValidate.stdout + pyValidate.stderr);
    });
  });

  await test("migration resumes from archive state without stored recovery data", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const change = path.join(repo, ".changes", "feature-one");
        fs.writeFileSync(path.join(change, "review-log.md"), "review\n");
        const archive = path.join(repo, ".changes", "archive", "feature-one", "legacy", "tasks.md");
        fs.mkdirSync(path.dirname(archive), { recursive: true });
        fs.copyFileSync(path.join(change, "tasks.md"), archive);
        fs.unlinkSync(path.join(change, "tasks.md"));

        const result = client(["--state-root", repo, "migrate", "feature-one", "--apply"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const sources = JSON.parse(result.stdout).legacy_sources;
        assert.deepEqual(sources.map((source) => source.path), ["review-log.md", "tasks.md"]);
        assert.equal(sources[1].source_state, "absent");
        assert.equal(sources[1].archive_state, "present");
        assert.equal(fs.existsSync(path.join(change, "review-log.md")), false);
      });
    }

    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const change = path.join(repo, ".changes", "feature-one");
      const archive = path.join(repo, ".changes", "archive", "feature-one", "legacy", "tasks.md");
      fs.mkdirSync(path.dirname(archive), { recursive: true });
      fs.copyFileSync(path.join(change, "tasks.md"), archive);

      const bothPresent = capture(() =>
        runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--dry-run"])
      );
      assert.equal(bothPresent.status, 0, bothPresent.stdout + bothPresent.stderr);
      const taskSource = JSON.parse(bothPresent.stdout).legacy_sources.find(
        (source) => source.path === "tasks.md"
      );
      assert.equal(taskSource.source_state, "present");
      assert.equal(taskSource.archive_state, "present");

      const first = capture(() =>
        runChangeDoc(["--state-root", repo, "migrate", "feature-one", "--apply"])
      );
      assert.equal(first.status, 0, first.stdout + first.stderr);
      fs.copyFileSync(archive, path.join(change, "tasks.md"));
      fs.rmSync(path.join(change, "reviews", "README.md"));
      fs.rmSync(path.join(change, "tasks", "README.md"));

      const resumed = runPythonChangeDoc([
        "--state-root",
        repo,
        "migrate",
        "feature-one",
        "--apply"
      ]);
      assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
      assert.equal(fs.existsSync(path.join(change, "tasks.md")), false);
      assert.equal(fs.existsSync(path.join(change, "reviews", "README.md")), true);
      assert.equal(fs.existsSync(path.join(change, "tasks", "README.md")), true);
    });
  });

  await test("migration conflicts and invalid transform input retain legacy sources", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const change = path.join(repo, ".changes", "feature-one");
        const archive = path.join(repo, ".changes", "archive", "feature-one", "legacy", "tasks.md");
        fs.mkdirSync(path.dirname(archive), { recursive: true });
        fs.writeFileSync(archive, "different\n");

        const result = client(["--state-root", repo, "migrate", "feature-one", "--apply"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /conflicts with archive/);
        assert.equal(fs.existsSync(path.join(change, "tasks.md")), true);
      });

      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const change = path.join(repo, ".changes", "feature-one");
        fs.mkdirSync(path.join(change, "decisions"), { recursive: true });
        fs.writeFileSync(path.join(change, "decisions", "README.md"), "different\n");

        const result = client(["--state-root", repo, "migrate", "feature-one", "--apply"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /generated file conflicts/);
        assert.equal(fs.existsSync(path.join(change, "tasks.md")), true);
      });

      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const change = path.join(repo, ".changes", "feature-one");
        fs.writeFileSync(path.join(change, "README.md"), Buffer.from([0xff]));

        const result = client(["--state-root", repo, "migrate", "feature-one", "--apply"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /valid UTF-8/);
        assert.equal(fs.existsSync(path.join(change, "tasks.md")), true);
      });

      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const change = path.join(repo, ".changes", "feature-one");
        fs.unlinkSync(path.join(change, "tasks.md"));
        const absent = client(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
        assert.equal(absent.status, 1, absent.stdout + absent.stderr);
        assert.match(absent.stderr, /requires a legacy/);
      });
    }
  });

  await test("migration rejects non-file paths and usage consistently", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const usage = client(["--state-root", repo, "migrate", "feature-one"]);
        assert.equal(usage.status, 2, usage.stdout + usage.stderr);

        const change = path.join(repo, ".changes", "feature-one");
        fs.symlinkSync(path.join(change, "tasks.md"), path.join(change, "review-log.md"));
        const sourceLink = client(["--state-root", repo, "migrate", "feature-one", "--dry-run"]);
        assert.equal(sourceLink.status, 1, sourceLink.stdout + sourceLink.stderr);
        assert.match(sourceLink.stderr, /symlink/);
      });

      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const change = path.join(repo, ".changes", "feature-one");
        fs.mkdirSync(path.join(change, "reviews", "README.md"), { recursive: true });
        const directoryTarget = client(["--state-root", repo, "migrate", "feature-one", "--apply"]);
        assert.equal(directoryTarget.status, 1, directoryTarget.stdout + directoryTarget.stderr);
        assert.match(directoryTarget.stderr, /regular file/);
        assert.equal(fs.existsSync(path.join(change, "tasks.md")), true);
      });
    }
  });

  await test("migration still rejects symlink and linked-worktree state roots", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        writeLegacyProposal(repo, "feature-one");
        const external = fs.mkdtempSync(path.join(os.tmpdir(), "harness-migration-escape-"));
        fs.symlinkSync(external, path.join(repo, ".changes", "archive"), "dir");
        try {
          const result = client(["--state-root", repo, "migrate", "feature-one", "--apply"]);
          assert.equal(result.status, 1, result.stdout + result.stderr);
          assert.match(result.stderr, /must not traverse a symlink/);
          assert.equal(fs.readdirSync(external).length, 0);
          assert.equal(
            fs.existsSync(path.join(repo, ".changes", "feature-one", "tasks.md")),
            true
          );
        } finally {
          fs.rmSync(external, { recursive: true, force: true });
        }
      });
    }

    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      const alias = `${repo}-alias`;
      fs.symlinkSync(repo, alias, "dir");
      try {
        const jsResult = capture(() => runChangeDoc(["--state-root", alias, "migrate", "feature-one", "--dry-run"]));
        const pyResult = runPythonChangeDoc(["--state-root", alias, "migrate", "feature-one", "--dry-run"]);
        assert.equal(jsResult.status, 2, jsResult.stdout + jsResult.stderr);
        assert.equal(pyResult.status, 2, pyResult.stdout + pyResult.stderr);
      } finally {
        fs.unlinkSync(alias);
      }
    });

    withGitWorktrees(({ linked }) => {
      writeLegacyProposal(linked, "feature-one");
      const jsResult = capture(() => runChangeDoc(["--state-root", linked, "migrate", "feature-one", "--dry-run"]));
      const pyResult = runPythonChangeDoc(["--state-root", linked, "migrate", "feature-one", "--dry-run"]);
      assert.equal(jsResult.status, 2, jsResult.stdout + jsResult.stderr);
      assert.equal(pyResult.status, 2, pyResult.stdout + pyResult.stderr);
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

function migrationSnapshot(repo, changeId) {
  const roots = [
    path.join(repo, ".changes", changeId),
    path.join(repo, ".changes", "archive", changeId, "legacy")
  ];
  const snapshot = {};
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    for (const filePath of walkTestFiles(root)) {
      snapshot[path.relative(path.join(repo, ".changes"), filePath).split(path.sep).join("/")] =
        fs.readFileSync(filePath).toString("base64");
    }
  }
  return snapshot;
}

function walkTestFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTestFiles(filePath));
    } else if (entry.isFile()) {
      files.push(filePath);
    }
  }
  return files.sort();
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
