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
    assert.equal(
      policy.commands.relation,
      'harness-change-doc relation <change> --target <change-id> --type <type> --reason "..."'
    );
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
    assert.equal(
      pyPolicy.commands.relation,
      'harness-change-doc relation <change> --target <change-id> --type <type> --reason "..."'
    );
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
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=1/);
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
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=1/);
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
      assert.match(result.stdout, /mode=legacy_proposal errors=0 warnings=2/);
      assert.match(result.stdout, /validated_changes=1 errors=0 warnings=2/);
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

  await test("absolute --schema ignores a repository schema overlay", () => {
    const packageSchema = path.join(packageRoot, "schemas", "change-workspace.schema.json");

    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      writeRepoSchema(repo, (schema) => {
        schema.change_id.pattern = "^local-[a-z0-9-]+$";
      });
      const local = capture(() => runChangeValidate(["--repo-root", repo, "--change", "feature-one"]));
      assert.equal(local.status, 1, local.stdout + local.stderr);
      assert.match(local.stdout, /invalid change id/u);

      const absolute = capture(() => runChangeValidate([
        "--repo-root",
        repo,
        "--change",
        "feature-one",
        "--schema",
        packageSchema
      ]));
      assert.equal(absolute.status, 0, absolute.stdout + absolute.stderr);
      assert.match(absolute.stdout, /mode=legacy_proposal errors=0/u);
    });

    withTempRepo((repo) => {
      writeLegacyProposal(repo, "feature-one");
      fs.mkdirSync(path.join(repo, ".rules"), { recursive: true });
      fs.writeFileSync(path.join(repo, ".rules", "change-doc-schema.json"), "{ not valid json");
      assert.throws(
        () => runChangeValidate(["--repo-root", repo, "--change", "feature-one"]),
        SyntaxError,
        "the invalid repository overlay must be read without --schema"
      );
      const absolute = capture(() => runChangeValidate([
        "--repo-root",
        repo,
        "--change",
        "feature-one",
        "--schema",
        packageSchema
      ]));
      assert.equal(absolute.status, 0, absolute.stdout + absolute.stderr);
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

        const requirements = fs.readFileSync(path.join(change, "requirements.md"), "utf8");
        for (const heading of [
          "## Motivation",
          "## Problem",
          "## Success Signals",
          "## Goal",
          "## Constraints",
          "## Non-goals",
          "## Open Questions"
        ]) {
          assert.match(requirements, new RegExp(`^${heading}$`, "m"), `requirements.md missing ${heading}`);
        }
        const readme = fs.readFileSync(path.join(change, "README.md"), "utf8");
        assert.match(readme, /^## Change Relations$/m);
        assert.match(readme, /^\| change \| type \| reason \|$/m);
        assert.match(readme, /harness-change-doc relation/);

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

  await test("relation command writes, updates, and preserves Change Relations rows", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        initChangeWorkspaces(repo, ["relation-owner", "relation-target", "relation-other"]);
        const readme = path.join(repo, ".changes", "relation-owner", "README.md");
        const relation = (target, type, reason) =>
          client([
            "--state-root",
            repo,
            "relation",
            "relation-owner",
            "--target",
            target,
            "--type",
            type,
            "--reason",
            reason
          ]);

        let result = relation("relation-target", "depends-on", "Target lands first.");
        assert.equal(result.status, 0, result.stdout + result.stderr);
        let payload = JSON.parse(result.stdout);
        assert.equal(payload.change_id, "relation-owner");
        assert.equal(payload.target, "relation-target");
        assert.equal(payload.type, "depends-on");
        assert.equal(payload.reason, "Target lands first.");
        assert.equal(payload.target_state, "active");
        assert.equal(payload.path, ".changes/relation-owner/README.md");
        assert.equal(payload.created, true);
        assert.equal(payload.updated, false);
        assert.match(fs.readFileSync(readme, "utf8"), /\| `relation-target` \| depends-on \| Target lands first\. \|/);

        result = relation("relation-other", "relates-to", "Same requirement chain.");
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(JSON.parse(result.stdout).created, true);
        let text = fs.readFileSync(readme, "utf8");
        assert.match(text, /\| `relation-target` \| depends-on \| Target lands first\. \|/);
        assert.match(text, /\| `relation-other` \| relates-to \| Same requirement chain\. \|/);

        result = relation("relation-other", "supersedes", "Other change is absorbed.");
        assert.equal(result.status, 0, result.stdout + result.stderr);
        payload = JSON.parse(result.stdout);
        assert.equal(payload.created, false);
        assert.equal(payload.updated, true);
        text = fs.readFileSync(readme, "utf8");
        assert.equal((text.match(/\| `relation-other` \|/g) ?? []).length, 1);
        assert.match(text, /\| `relation-other` \| supersedes \| Other change is absorbed\. \|/);
        assert.match(text, /\| `relation-target` \| depends-on \| Target lands first\. \|/);

        const repeated = relation("relation-other", "supersedes", "Other change is absorbed.");
        assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
        payload = JSON.parse(repeated.stdout);
        assert.equal(payload.created, false);
        assert.equal(payload.updated, false);

        for (const [args, pattern] of [
          [["relation-owner", "--target", "relation-owner", "--type", "depends-on", "--reason", "self"], /must not be the change itself/],
          [["relation-owner", "--target", "relation-target", "--type", "likes", "--reason", "bad type"], /unknown relation type/],
          [["relation-owner", "--target", "missing-change", "--type", "depends-on", "--reason", "missing"], /not found/],
          [["relation-owner", "--target", "relation-target", "--type", "depends-on", "--reason", "pipe | reason"], /must not contain/]
        ]) {
          const invalid = client(["--state-root", repo, "relation", ...args]);
          assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
          assert.match(invalid.stderr, pattern);
        }
        const missingFlags = client([
          "--state-root",
          repo,
          "relation",
          "relation-owner",
          "--target",
          "relation-target"
        ]);
        assert.equal(missingFlags.status, 2, missingFlags.stdout + missingFlags.stderr);
        assert.match(missingFlags.stderr, /requires --target|arguments are required/);
        assert.equal((fs.readFileSync(readme, "utf8").match(/\| `relation-other` \|/g) ?? []).length, 1);

        fs.mkdirSync(path.join(repo, ".changes", "archive"), { recursive: true });
        fs.renameSync(
          path.join(repo, ".changes", "relation-target"),
          path.join(repo, ".changes", "archive", "relation-target")
        );
        const archived = relation("relation-target", "relates-to", "Target closed after delivery.");
        assert.equal(archived.status, 0, archived.stdout + archived.stderr);
        assert.equal(JSON.parse(archived.stdout).target_state, "archived");
      });
    }
  });

  await test("validator validates Change Relations targets and reports archived targets as warnings", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        initChangeWorkspaces(repo, ["relation-edge", "edge-target"]);
        const relation = writeRelation(repo, "relation-edge", "edge-target", "depends-on", "Target lands first.");
        assert.equal(relation.status, 0, relation.stdout + relation.stderr);

        const active = client(["--state-root", repo, "--change", "relation-edge"]);
        assert.equal(active.status, 0, active.stdout + active.stderr);
        assert.match(active.stdout, /errors=0 warnings=0/);

        fs.mkdirSync(path.join(repo, ".changes", "archive"), { recursive: true });
        fs.renameSync(
          path.join(repo, ".changes", "edge-target"),
          path.join(repo, ".changes", "archive", "edge-target")
        );
        const archived = client(["--state-root", repo, "--change", "relation-edge"]);
        assert.equal(archived.status, 0, archived.stdout + archived.stderr);
        assert.match(archived.stdout, /relation target archived: edge-target/);
        assert.match(archived.stdout, /errors=0 warnings=1/);
      });

      withTempRepo((repo) => {
        initChangeWorkspaces(repo, ["relation-edge"]);
        seedRelationRows(repo, "relation-edge", [
          "| `missing-change` | relates-to | Dangling target. |",
          "| `missing-change` | blocks | Duplicate target. |",
          "| `relation-edge` | relates-to | Self reference. |",
          "| `edge-target` | likes | Unknown type. |",
          "| `edge-target` | belongs-to |"
        ]);
        const result = client(["--state-root", repo, "--change", "relation-edge"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /relation target not found: missing-change/);
        assert.match(result.stdout, /duplicate relation target: missing-change/);
        assert.match(result.stdout, /relation must not reference the change itself: relation-edge/);
        assert.match(result.stdout, /unknown relation type likes/);
        assert.match(result.stdout, /malformed Change Relations row/);
      });
    }
  });

  await test("validator rejects depends-on cycles across active change workspaces", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        initChangeWorkspaces(repo, ["cycle-a", "cycle-b"]);
        for (const [owner, target, reason] of [
          ["cycle-a", "cycle-b", "B first."],
          ["cycle-b", "cycle-a", "A first."]
        ]) {
          const relation = writeRelation(repo, owner, target, "depends-on", reason);
          assert.equal(relation.status, 0, relation.stdout + relation.stderr);
        }
        const a = client(["--state-root", repo, "--change", "cycle-a"]);
        assert.equal(a.status, 1, a.stdout + a.stderr);
        assert.match(a.stdout, /depends-on cycle: cycle-a -> cycle-b -> cycle-a/);
        const b = client(["--state-root", repo, "--change", "cycle-b"]);
        assert.equal(b.status, 1, b.stdout + b.stderr);
        assert.match(b.stdout, /depends-on cycle: cycle-b -> cycle-a -> cycle-b/);
      });

      withTempRepo((repo) => {
        initChangeWorkspaces(repo, ["pair-a", "pair-b"]);
        for (const [owner, target, type] of [
          ["pair-a", "pair-b", "relates-to"],
          ["pair-b", "pair-a", "blocks"]
        ]) {
          const relation = writeRelation(repo, owner, target, type, "Declared relation.");
          assert.equal(relation.status, 0, relation.stdout + relation.stderr);
        }
        const pair = client(["--state-root", repo, "--change", "pair-a"]);
        assert.equal(pair.status, 0, pair.stdout + pair.stderr);
        assert.match(pair.stdout, /errors=0 warnings=0/);
      });
    }
  });

  await test("index and list expose Change Relations with resolution state", () => {
    for (const client of [
      (args) => capture(() => runChangeDoc(args)),
      (args) => runPythonChangeDoc(args)
    ]) {
      withTempRepo((repo) => {
        initChangeWorkspaces(repo, ["index-owner", "index-target"]);
        const relation = writeRelation(repo, "index-owner", "index-target", "depends-on", "Target lands first.");
        assert.equal(relation.status, 0, relation.stdout + relation.stderr);
        seedRelationRows(repo, "index-owner", ["| `missing-change` | relates-to | Dangling target. |"]);

        for (const command of ["index", "list"]) {
          const result = client(["--state-root", repo, command, "index-owner", "--json"]);
          assert.equal(result.status, 0, result.stdout + result.stderr);
          assert.deepEqual(JSON.parse(result.stdout).relations, [
            {
              change: "index-target",
              type: "depends-on",
              reason: "Target lands first.",
              resolved: "active"
            },
            {
              change: "missing-change",
              type: "relates-to",
              reason: "Dangling target.",
              resolved: "missing"
            }
          ]);
        }
        const humanList = client(["--state-root", repo, "list", "index-owner"]);
        assert.equal(humanList.status, 0, humanList.stdout + humanList.stderr);
        assert.match(humanList.stdout, /relation\tindex-target\tdepends-on\tactive/);
        assert.match(humanList.stdout, /relation\tmissing-change\trelates-to\tmissing/);
      });
    }
  });

  await test("relation schema keys drive allowed types and validation", () => {
    withTempRepo((repo) => {
      initChangeWorkspaces(repo, ["schema-owner", "schema-target"]);
      writeRepoSchema(repo, (schema) => {
        schema.relations.allowed_types = ["relates-to"];
      });
      const rejected = writeRelation(repo, "schema-owner", "schema-target", "depends-on", "Not allowed.");
      assert.equal(rejected.status, 2, rejected.stdout + rejected.stderr);
      assert.match(rejected.stderr, /unknown relation type depends-on; allowed: relates-to/);

      const accepted = writeRelation(repo, "schema-owner", "schema-target", "relates-to", "Allowed.");
      assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
      seedRelationRows(repo, "schema-owner", ["| `schema-target` | depends-on | Schema rejects this. |"]);
      const validate = capture(() => runChangeValidate(["--state-root", repo, "--change", "schema-owner"]));
      assert.equal(validate.status, 1, validate.stdout + validate.stderr);
      assert.match(validate.stdout, /unknown relation type depends-on/);
    });
  });

  await test("relation appends the Change Relations section to a legacy workspace idempotently", () => {
    const template = fs.readFileSync(path.join(packageRoot, "templates", "changes", "README.md"), "utf8");
    const templateInstruction = template
      .split("## Change Relations")[1]
      .split("## Current Phase")[0]
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("|"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const compact = (text) => text.replace(/\s+/g, " ").trim();
    const appended = {};

    for (const [name, client, validateClient] of [
      ["js", (args) => capture(() => runChangeDoc(args)), (args) => capture(() => runChangeValidate(args))],
      ["python", (args) => runPythonChangeDoc(args), (args) => runPythonChangeValidate(args)]
    ]) {
      withTempRepo((repo) => {
        initChangeWorkspaces(repo, ["legacy-owner", "legacy-target"]);
        removeRelationSection(repo, "legacy-owner");
        const readme = path.join(repo, ".changes", "legacy-owner", "README.md");
        assert.doesNotMatch(fs.readFileSync(readme, "utf8"), /## Change Relations/);

        // A workspace without the table stays valid: absence means no relations.
        const legacyValid = validateClient(["--state-root", repo, "--change", "legacy-owner"]);
        assert.equal(legacyValid.status, 0, legacyValid.stdout + legacyValid.stderr);
        assert.match(legacyValid.stdout, /errors=0 warnings=0/);

        const first = client([
          "--state-root",
          repo,
          "relation",
          "legacy-owner",
          "--target",
          "legacy-target",
          "--type",
          "depends-on",
          "--reason",
          "Legacy workspace backfill."
        ]);
        assert.equal(first.status, 0, first.stdout + first.stderr);
        const firstPayload = JSON.parse(first.stdout);
        assert.equal(firstPayload.created, true);

        const text = fs.readFileSync(readme, "utf8");
        assert.match(text, /^## Change Relations$/m);
        assert.match(text, /^\| change \| type \| reason \|$/m);
        assert.match(text, /\| `legacy-target` \| depends-on \| Legacy workspace backfill\. \|/);
        assert(
          compact(text).includes(templateInstruction),
          `${name} appended Change Relations section is missing the template instruction block`
        );
        assert(
          text.indexOf("## Change Relations") < text.indexOf("## Current Phase"),
          `${name} inserted Change Relations after the phase section`
        );

        const snapshot = fs.readFileSync(readme, "utf8");
        const repeated = client([
          "--state-root",
          repo,
          "relation",
          "legacy-owner",
          "--target",
          "legacy-target",
          "--type",
          "depends-on",
          "--reason",
          "Legacy workspace backfill."
        ]);
        assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
        const repeatedPayload = JSON.parse(repeated.stdout);
        assert.equal(repeatedPayload.created, false);
        assert.equal(repeatedPayload.updated, false);
        assert.equal(fs.readFileSync(readme, "utf8"), snapshot, `${name} legacy append is not idempotent`);
        appended[name] = fs.readFileSync(readme, "utf8");
      });
    }
    assert.equal(appended.js, appended.python, "JS and Python legacy append output diverged");
  });

  await test("overlay without relations falls back to the package relations policy", () => {
    for (const [name, client] of [
      ["js", (args) => capture(() => runChangeValidate(args))],
      ["python", (args) => runPythonChangeValidate(args)]
    ]) {
      withTempRepo((repo) => {
        initChangeWorkspaces(repo, ["overlay-owner", "overlay-target"]);
        writeRepoSchema(repo, (schema) => {
          delete schema.relations;
        });
        const relation = writeRelation(repo, "overlay-owner", "overlay-target", "depends-on", "Target lands first.");
        assert.equal(relation.status, 0, relation.stdout + relation.stderr);

        const valid = client(["--state-root", repo, "--change", "overlay-owner"]);
        assert.equal(valid.status, 0, valid.stdout + valid.stderr);
        assert.match(valid.stdout, /errors=0 warnings=0/);

        seedRelationRows(repo, "overlay-owner", [
          "| `missing-change` | relates-to | Dangling target. |",
          "| `../../../../tmp/evil` | blocks | Traversal target. |"
        ]);
        const invalid = client(["--state-root", repo, "--change", "overlay-owner"]);
        assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
        assert.match(invalid.stdout, /relation target not found: missing-change/);
        assert.match(invalid.stdout, /invalid relation target: \.\.\/\.\.\/\.\.\/\.\.\/tmp\/evil/);
      });
    }
  });

  await test("relation requires full change-id matches and never writes outside the state root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-relation-traversal-"));
    try {
      for (const [name, fn] of [
        ["js", (args) => capture(() => runChangeDoc(args))],
        ["python", (args) => runPythonChangeDoc(args)]
      ]) {
        const base = path.join(root, name);
        const repo = path.join(base, "repo");
        const outside = path.join(base, "outside-change");
        const outsideReadme = path.join(outside, "README.md");
        fs.mkdirSync(repo, { recursive: true });
        fs.mkdirSync(outside, { recursive: true });
        // A legacy-style outside README already carries the relation table; an
        // unanchored id match used to let `relation` append a row there.
        fs.writeFileSync(
          outsideReadme,
          ["# Outside", "", "## Change Relations", "", "| change | type | reason |", "|---|---|---|", ""].join("\n")
        );
        const outsideSnapshot = fs.readFileSync(outsideReadme, "utf8");
        initChangeWorkspaces(repo, ["valid-owner", "traversal-target"]);
        // An unanchored overlay template must not turn a relative path into a partial match.
        writeRepoSchema(repo, (schema) => {
          schema.change_id.pattern = "[a-z0-9-]+";
        });

        const traversalChange = fn([
          "--state-root",
          repo,
          "relation",
          "../../outside-change",
          "--target",
          "traversal-target",
          "--type",
          "depends-on",
          "--reason",
          "Traversal."
        ]);
        assert.equal(traversalChange.status, 2, `${name}: ${traversalChange.stdout}${traversalChange.stderr}`);
        assert.match(traversalChange.stderr, /invalid change id/i);
        assert.equal(fs.readFileSync(outsideReadme, "utf8"), outsideSnapshot, `${name} wrote outside the state root`);

        const ownerReadme = path.join(repo, ".changes", "valid-owner", "README.md");
        const ownerSnapshot = fs.readFileSync(ownerReadme, "utf8");
        const traversalTarget = fn([
          "--state-root",
          repo,
          "relation",
          "valid-owner",
          "--target",
          "../../outside-change",
          "--type",
          "depends-on",
          "--reason",
          "Traversal."
        ]);
        assert.equal(traversalTarget.status, 2, `${name}: ${traversalTarget.stdout}${traversalTarget.stderr}`);
        assert.match(traversalTarget.stderr, /invalid relation target/i);
        assert.equal(fs.readFileSync(ownerReadme, "utf8"), ownerSnapshot);
        assert.equal(fs.readFileSync(outsideReadme, "utf8"), outsideSnapshot);

        seedRelationRows(repo, "valid-owner", ["| `../../outside-change` | relates-to | Traversal target. |"]);
        const validation = name === "js"
          ? capture(() => runChangeValidate(["--state-root", repo, "--change", "valid-owner"]))
          : runPythonChangeValidate(["--state-root", repo, "--change", "valid-owner"]);
        assert.equal(validation.status, 1, `${name}: ${validation.stdout}${validation.stderr}`);
        assert.match(validation.stdout, /invalid relation target/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await test("marked delta specs with acceptance ids and existing evidence pass", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-ok");
        removeDefaultSpec(repo, "acceptance-ok");
        writeEvidenceFile(repo);
        writeAcceptanceSpec(repo, "acceptance-ok", "capability.md");
        const result = client(["--state-root", repo, "--change", "acceptance-ok"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /mode=structured_proposal errors=0 warnings=0/);
      });
    }
  });

  await test("marked specs require an acceptance scenario with a valid id", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-missing-id");
        removeDefaultSpec(repo, "acceptance-missing-id");
        writeEvidenceFile(repo);
        writeAcceptanceSpec(repo, "acceptance-missing-id", "capability.md", {
          requirements: [
            {
              title: "Guarded behavior",
              scenarios: [{ id: "Plain", heading: "No acceptance id", evidence: ["tests/evidence.js"] }]
            }
          ]
        });
        const result = client(["--state-root", repo, "--change", "acceptance-missing-id"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /requirement has no acceptance scenario: ### Requirement: Guarded behavior/);
      });

      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-bad-id");
        removeDefaultSpec(repo, "acceptance-bad-id");
        writeEvidenceFile(repo);
        writeAcceptanceSpec(repo, "acceptance-bad-id", "capability.md", {
          requirements: [
            {
              title: "Bad id behavior",
              scenarios: [{ id: "ACC-1", heading: "Short id", evidence: ["tests/evidence.js"] }]
            }
          ]
        });
        const result = client(["--state-root", repo, "--change", "acceptance-bad-id"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /invalid acceptance id ACC-1/);
      });
    }
  });

  await test("marked specs reject duplicate acceptance ids across the change", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-duplicate");
        removeDefaultSpec(repo, "acceptance-duplicate");
        writeEvidenceFile(repo);
        writeAcceptanceSpec(repo, "acceptance-duplicate", "first.md");
        writeAcceptanceSpec(repo, "acceptance-duplicate", "second.md");
        const result = client(["--state-root", repo, "--change", "acceptance-duplicate"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /duplicate acceptance id ACC-001; first declared at .*first\.md:\d+/);
      });
    }
  });

  await test("marked specs require evidence and repository-relative existing paths", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-no-evidence");
        removeDefaultSpec(repo, "acceptance-no-evidence");
        writeAcceptanceSpec(repo, "acceptance-no-evidence", "capability.md", {
          requirements: [{ title: "No evidence", scenarios: [{ id: "ACC-001", evidence: [] }] }]
        });
        const result = client(["--state-root", repo, "--change", "acceptance-no-evidence"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /acceptance scenario ACC-001 has no - Evidence: reference/);
      });

      for (const [changeId, evidence, pattern] of [
        ["acceptance-missing-path", "tests/missing-evidence.js::case", /evidence path does not exist \(from repository root\): tests\/missing-evidence\.js/],
        ["acceptance-absolute-path", "/tmp/evidence.js::case", /evidence path must be repository-relative: \/tmp\/evidence\.js/],
        ["acceptance-escaping-path", "../outside-evidence.js::case", /evidence path must not escape the repository root: \.\.\/outside-evidence\.js/]
      ]) {
        withTempRepo((repo) => {
          writeStructuredProposal(repo, changeId);
          removeDefaultSpec(repo, changeId);
          writeEvidenceFile(repo);
          writeAcceptanceSpec(repo, changeId, "capability.md", {
            requirements: [
              { title: "Evidence behavior", scenarios: [{ id: "ACC-001", evidence: [evidence] }] }
            ]
          });
          const result = client(["--state-root", repo, "--change", changeId]);
          assert.equal(result.status, 1, result.stdout + result.stderr);
          assert.match(result.stdout, pattern);
        });
      }
    }
  });

  await test("every scenario heading in a marked spec requires an acceptance id", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-mixed-scenario");
        removeDefaultSpec(repo, "acceptance-mixed-scenario");
        writeEvidenceFile(repo);
        writeAcceptanceSpec(repo, "acceptance-mixed-scenario", "capability.md", {
          requirements: [
            {
              title: "Mixed scenario behavior",
              scenarios: [
                { id: "ACC-001", heading: "Accepted", evidence: ["tests/evidence.js"] },
                { id: "Plain", heading: "No acceptance id", evidence: ["tests/evidence.js"] }
              ]
            }
          ]
        });
        const result = client(["--state-root", repo, "--change", "acceptance-mixed-scenario"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(
          result.stdout,
          /capability\.md:\d+: scenario heading requires an acceptance id matching \^ACC-\[0-9\]\{3\}\$: Plain No acceptance id/
        );
      });
    }
  });

  await test("acceptance ids require a full-pattern match under partial overlays", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-partial-id-pattern");
        removeDefaultSpec(repo, "acceptance-partial-id-pattern");
        writeRepoSchema(repo, (schema) => {
          schema.delta_spec.acceptance.id_pattern = "^ACC-[0-9]{3}";
        });
        writeEvidenceFile(repo);
        writeAcceptanceSpec(repo, "acceptance-partial-id-pattern", "capability.md", {
          requirements: [
            {
              title: "Partial pattern behavior",
              scenarios: [
                { id: "ACC-001X", heading: "Suffix after the id", evidence: ["tests/evidence.js::case"] }
              ]
            }
          ]
        });
        const result = client(["--state-root", repo, "--change", "acceptance-partial-id-pattern"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /invalid acceptance id ACC-001X; expected \^ACC-\[0-9\]\{3\}/);
      });
    }
  });

  await test("removed requirements do not require acceptance ids or evidence", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-removed");
        removeDefaultSpec(repo, "acceptance-removed");
        writeEvidenceFile(repo);
        writeAcceptanceSpec(repo, "acceptance-removed", "capability.md", {
          removedRequirements: [
            {
              title: "Removed legacy behavior",
              scenarios: [{ id: "Legacy", heading: "Removed without current evidence", evidence: [] }]
            }
          ]
        });
        const result = client(["--state-root", repo, "--change", "acceptance-removed"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /errors=0 warnings=0/);
      });
    }
  });


  await test("marked specs validate every evidence line on a scenario", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-multi-evidence");
        removeDefaultSpec(repo, "acceptance-multi-evidence");
        writeEvidenceFile(repo);
        writeEvidenceFile(repo, "tests/evidence-two.js");
        const spec = (evidence) =>
          writeAcceptanceSpec(repo, "acceptance-multi-evidence", "capability.md", {
            requirements: [
              { title: "Multi evidence behavior", scenarios: [{ id: "ACC-001", evidence }] }
            ]
          });

        spec(["tests/evidence.js::case-a", "tests/evidence-two.js::case-b"]);
        let result = client(["--state-root", repo, "--change", "acceptance-multi-evidence"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /errors=0 warnings=0/);

        spec(["tests/evidence.js::case-a", "tests/missing-evidence.js::case-b"]);
        result = client(["--state-root", repo, "--change", "acceptance-multi-evidence"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(
          result.stdout,
          /evidence path does not exist \(from repository root\): tests\/missing-evidence\.js/
        );
      });
    }
  });

  await test("overlay without acceptance policy still enforces marked specs", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-overlay-fallback");
        removeDefaultSpec(repo, "acceptance-overlay-fallback");
        writeRepoSchema(repo, (schema) => {
          delete schema.delta_spec.acceptance;
        });
        writeEvidenceFile(repo);

        writeAcceptanceSpec(repo, "acceptance-overlay-fallback", "capability.md");
        let result = client(["--state-root", repo, "--change", "acceptance-overlay-fallback"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /errors=0 warnings=0/);

        writeAcceptanceSpec(repo, "acceptance-overlay-fallback", "capability.md", {
          requirements: [
            {
              title: "Overlay behavior",
              scenarios: [{ id: "Plain", heading: "No acceptance id", evidence: ["tests/evidence.js"] }]
            }
          ]
        });
        result = client(["--state-root", repo, "--change", "acceptance-overlay-fallback"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /scenario heading requires an acceptance id matching/);
      });
    }
  });

  await test("evidence symlinks cannot escape the repository root", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-evidence-outside-"));
      try {
        fs.mkdirSync(path.join(outsideRoot, "tests"), { recursive: true });
        fs.writeFileSync(path.join(outsideRoot, "tests", "evidence.js"), "// outside repo\n");
        withTempRepo((repo) => {
          writeStructuredProposal(repo, "acceptance-symlink-escape");
          removeDefaultSpec(repo, "acceptance-symlink-escape");
          fs.symlinkSync(path.join(outsideRoot, "tests"), path.join(repo, "linked-evidence"), "dir");
          writeAcceptanceSpec(repo, "acceptance-symlink-escape", "capability.md", {
            requirements: [
              {
                title: "Symlink behavior",
                scenarios: [{ id: "ACC-001", evidence: ["linked-evidence/evidence.js::case"] }]
              }
            ]
          });
          const result = client(["--state-root", repo, "--change", "acceptance-symlink-escape"]);
          assert.equal(result.status, 1, result.stdout + result.stderr);
          assert.match(
            result.stdout,
            /evidence path must not escape the repository root: linked-evidence\/evidence\.js/
          );
        });
      } finally {
        fs.rmSync(outsideRoot, { recursive: true, force: true });
      }

      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-symlink-inside");
        removeDefaultSpec(repo, "acceptance-symlink-inside");
        fs.mkdirSync(path.join(repo, "real-evidence"), { recursive: true });
        fs.writeFileSync(path.join(repo, "real-evidence", "evidence.js"), "// inside repo\n");
        fs.symlinkSync(path.join(repo, "real-evidence"), path.join(repo, "linked-inside"), "dir");
        writeAcceptanceSpec(repo, "acceptance-symlink-inside", "capability.md", {
          requirements: [
            {
              title: "Internal symlink behavior",
              scenarios: [{ id: "ACC-001", evidence: ["linked-inside/evidence.js::case"] }]
            }
          ]
        });
        const result = client(["--state-root", repo, "--change", "acceptance-symlink-inside"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /errors=0 warnings=0/);
      });
    }
  });

  await test("acceptance evidence_base rejects unsupported bases", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-evidence-base");
        removeDefaultSpec(repo, "acceptance-evidence-base");
        writeRepoSchema(repo, (schema) => {
          schema.delta_spec.acceptance.evidence_base = "state_root";
        });
        writeEvidenceFile(repo);
        writeAcceptanceSpec(repo, "acceptance-evidence-base", "capability.md");
        const result = client(["--state-root", repo, "--change", "acceptance-evidence-base"]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(
          result.stdout,
          /unsupported acceptance evidence_base state_root; supported: repository_root/
        );
      });
    }
  });

  await test("unmarked delta specs warn while the workspace stays valid", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-unmarked");
        const result = client(["--state-root", repo, "--change", "acceptance-unmarked"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /acceptance fields are not enforced; add front matter acceptance: v1/);
        assert.match(result.stdout, /errors=0 warnings=1/);
      });

      withTempRepo((repo) => {
        writeLegacyProposal(repo, "acceptance-legacy");
        const result = client(["--state-root", repo, "--change", "acceptance-legacy"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /acceptance fields are not enforced; add front matter acceptance: v1/);
      });
    }
  });

  await test("delta-spec capability template is skipped by acceptance validation", () => {
    for (const client of [
      (args) => capture(() => runChangeValidate(args)),
      (args) => runPythonChangeValidate(args)
    ]) {
      withTempRepo((repo) => {
        writeStructuredProposal(repo, "acceptance-template-skip");
        removeDefaultSpec(repo, "acceptance-template-skip");
        fs.copyFileSync(
          path.join(packageRoot, "templates", "changes", "specs", "capability-template.md"),
          path.join(repo, ".changes", "acceptance-template-skip", "specs", "capability-template.md")
        );
        const result = client(["--state-root", repo, "--change", "acceptance-template-skip"]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /errors=0 warnings=0/);
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
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=1/);
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
      assert.match(complete.stdout, /mode=structured_proposal errors=0 warnings=1/);
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
      assert.match(strict.stdout, /mode=structured_proposal errors=0 warnings=1/);

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
      assert.match(validate.stdout, /mode=legacy_proposal errors=0 warnings=2/);
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
      assert.match(validate.stdout, /mode=structured_proposal errors=0 warnings=1/);
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

  await test("add-decision writes a structurally valid skeleton beside the documented decision template", () => {
    // The registered template documents the comparison fields; add-decision
    // does not render it. Keep the two claims separate so no test name implies
    // template rendering.
    const templatePath = path.join(packageRoot, "templates", "changes", "decisions", "decision-record.md");
    assert.equal(fs.existsSync(templatePath), true, "decision-record template asset is missing");
    const template = fs.readFileSync(templatePath, "utf8");
    assert.match(template, /^artifact: decision-record$/m);
    for (const heading of ["## Context", "## Decision", "## Alternatives Considered", "## Consequences"]) {
      assert.match(template, new RegExp(`^${heading}$`, "m"), `decision template missing ${heading}`);
    }
    for (const required of [
      "Criteria",
      "Evidence",
      "Rejected criterion",
      "Rejected reason",
      "Assumptions",
      "Revisit trigger"
    ]) {
      assert.match(template, new RegExp(required), `decision template missing ${required}`);
    }
    assert.match(template, /`add-decision` creates only the section skeleton/);
    assert.match(template, /fill the comparison fields\s+below before the solution-design review/);

    const rule = fs
      .readFileSync(path.join(packageRoot, "rules", "loop-contract.md"), "utf8")
      .replace(/\s+/g, " ");
    assert.match(rule, /`add-decision` writes only the section skeleton/);
    assert.match(rule, /fill every comparison field above before the solution-design review/);
    assert.match(rule, /`\.changes\/templates\/decisions\/decision-record\.md`/);
    assert.match(rule, /`templates\/changes\/decisions\/decision-record\.md`/);

    for (const client of ["js", "py"]) {
      withTempRepo((repo) => {
        const changeId = `decision-${client}`;
        const doc =
          client === "js"
            ? (args) => capture(() => runChangeDoc(args))
            : (args) => runPythonChangeDoc(args);
        const init = doc(["--state-root", repo, "init", changeId, "--json"]);
        assert.equal(init.status, 0, init.stdout + init.stderr);
        const add = doc(["--state-root", repo, "add-decision", changeId, "--slug", "timeout-policy"]);
        assert.equal(add.status, 0, add.stdout + add.stderr);

        const recordPath = path.join(
          repo,
          ".changes",
          changeId,
          "decisions",
          "DR-001-timeout-policy.md"
        );
        const record = fs.readFileSync(recordPath, "utf8");
        assert.match(record, /^artifact: decision-record$/m);
        assert.match(record, /^status: draft$/m);
        assert.match(record, /^tags: \[decision\]$/m);
        assert.match(record, /^# DR: timeout-policy$/m);
        for (const heading of ["## Context", "## Decision", "## Alternatives Considered", "## Consequences"]) {
          assert.match(record, new RegExp(`^${heading}$`, "m"), `${client} record missing ${heading}`);
        }
        // A skeleton, not a rendered template: the comparison fields stay for
        // the author to fill in.
        assert.doesNotMatch(
          record,
          /^(?:- )?(?:Criteria|Evidence|Rejected criterion|Rejected reason|Assumptions|Revisit trigger):/m,
          `${client} add-decision unexpectedly rendered the template's comparison fields`
        );
        const index = fs.readFileSync(
          path.join(repo, ".changes", changeId, "decisions", "README.md"),
          "utf8"
        );
        assert.match(index, /\| `DR-001-timeout-policy\.md` \| decision-record \| draft \| 001 \|/);

        const validate = capture(() =>
          runChangeValidate(["--state-root", repo, "--change", changeId])
        );
        assert.equal(validate.status, 0, validate.stdout + validate.stderr);
        assert.match(validate.stdout, /errors=0/);
      });
    }

    for (const client of ["js", "py"]) {
      const policy =
        client === "js"
          ? JSON.parse(capture(() => runChangeDoc(["--repo-root", packageRoot, "policy", "--json"])).stdout)
          : JSON.parse(runPythonChangeDoc(["--repo-root", packageRoot, "policy", "--json"]).stdout);
      assert.equal(
        policy.artifacts["decision-record"].template,
        "templates/changes/decisions/decision-record.md"
      );
    }
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
      assert.match(result.stdout, /mode=structured_proposal errors=0 warnings=3/);
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
      assert.match(strict.stdout, /mode=structured_proposal errors=2 warnings=1/);
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
  await test("objective ledger js and python insert the marker and agree byte for byte", () => {
    withTempRepo((repo) => {
      initChangeWorkspaces(repo, ["objective-demo"]);
      // Python first on purpose: the earlier ordering let JS create the marker and
      // hid a Python bug that corrupted the front matter.
      const pyAdd = runPythonChangeDoc([
        "--state-root", repo, "work", "add", "objective-demo",
        "--outcome", "Review the stacked branches",
        "--owner", "human:owner",
        "--status", "waiting-human",
        "--next-action", "push the branches"
      ]);
      assert.equal(pyAdd.status, 0, pyAdd.stdout + pyAdd.stderr);
      const file = path.join(repo, ".changes", "objective-demo", "requirements.md");
      const afterPython = readTest(file);
      assert.match(afterPython, /^derived_work: v1$/m, "python must add the marker as its own front-matter line");

      const jsAdd = capture(() =>
        runChangeDoc([
          "--state-root", repo, "work", "add", "objective-demo",
          "--outcome", "Land the second slice",
          "--owner", "agent:coordinator",
          "--status", "open",
          "--next-action", "  write the slice  ",
          "--depends-on", "W-01"
        ])
      );
      assert.equal(jsAdd.status, 0, jsAdd.stdout + jsAdd.stderr);
      assert.match(jsAdd.stdout, /created\tW-02/);
      const afterJs = readTest(file);
      assert.match(afterJs, /\| write the slice \|/, "cells must be trimmed in both implementations");

      // A ledger written by one implementation must be validated by the other.
      fs.writeFileSync(file, afterJs.replace("| agent:coordinator | open |", "| - | open |"));
      const js = outputLines(capture(() => runChangeValidate(["--state-root", repo, "--change", "objective-demo"]))).join("\n");
      const py = outputLines(runPythonChangeValidate(["--state-root", repo, "--change", "objective-demo"])).join("\n");
      assert.match(js, /W-02 requires an owner/);
      assert.match(py, /W-02 requires an owner/);

      // The same update through both tools must produce the same bytes.
      fs.writeFileSync(file, afterJs);
      const pyUpdate = runPythonChangeDoc([
        "--state-root", repo, "work", "update", "objective-demo",
        "--id", "W-02", "--status", "done", "--evidence", "tests/test-change-tools.js"
      ]);
      assert.equal(pyUpdate.status, 0, pyUpdate.stdout + pyUpdate.stderr);
      const afterPyUpdate = readTest(file);
      const jsUpdate = capture(() =>
        runChangeDoc([
          "--state-root", repo, "work", "update", "objective-demo",
          "--id", "W-02", "--status", "done", "--evidence", "tests/test-change-tools.js"
        ])
      );
      assert.equal(jsUpdate.status, 0, jsUpdate.stdout + jsUpdate.stderr);
      assert.equal(readTest(file), afterPyUpdate, "both tools must render the same file");
    });
  });

  await test("objective ledger allocates past the highest id and refuses to add over an existing id", () => {
    withTempRepo((repo) => {
      initChangeWorkspaces(repo, ["objective-demo"]);
      const file = path.join(repo, ".changes", "objective-demo", "requirements.md");
      fs.writeFileSync(file, objectiveLedger(["W-01", "W-03"]));
      for (const [name, add] of [
        ["js", (args) => capture(() => runChangeDoc(args))],
        ["python", (args) => runPythonChangeDoc(args)]
      ]) {
        fs.writeFileSync(file, objectiveLedger(["W-01", "W-03"]));
        const added = add([
          "--state-root", repo, "work", "add", "objective-demo",
          "--outcome", `auto ${name}`, "--owner", "agent:coordinator",
          "--status", "open", "--next-action", "go"
        ]);
        assert.equal(added.status, 0, added.stdout + added.stderr);
        assert.match(added.stdout, /created\tW-04/, `${name} must allocate past the highest id, not the row count`);
        const duplicated = add([
          "--state-root", repo, "work", "add", "objective-demo",
          "--outcome", "dup", "--owner", "agent:coordinator",
          "--status", "open", "--next-action", "go", "--id", "W-01"
        ]);
        assert.equal(duplicated.status, 2, `${name} must refuse to add over an existing id`);
        assert.match(outputLines(duplicated).join("\n"), /already exists/);
      }
      const rows = readTest(file).split("\n").filter((line) => line.startsWith("| W-"));
      const ids = rows.map((line) => line.split("|")[1].trim());
      assert.equal(new Set(ids).size, ids.length, `ids must stay unique: ${ids.join(", ")}`);
    });
  });

  await test("objective ledger rejects extra columns, bad markers, and invalid rows in both validators", () => {
    withTempRepo((repo) => {
      initChangeWorkspaces(repo, ["objective-demo"]);
      const file = path.join(repo, ".changes", "objective-demo", "requirements.md");
      const cases = [
        { label: "extra cell", body: objectiveLedger(["W-01"], { extraCell: true }), expected: [/policy columns/] },
        {
          label: "unsupported marker",
          body: objectiveLedger(["W-01"]).replace("derived_work: v1", "derived_work: v2"),
          expected: [/unsupported derived_work marker/]
        },
        {
          label: "invalid rows",
          body: objectiveLedger(["W-01"], {
            row: "| W-01 | Ship the slice | - | open | write it | W-09 | - | - | 2026-01-01 |",
            extraRows: [
              "| W-02 | Close the item | agent:coordinator | done | - | - | - | - | - |",
              "| W-03 | Unknown status | agent:coordinator | finished | - | - | - | - | - |",
              "| W-04 | Duplicate id | agent:coordinator | open | write it | - | - | - | 2026-01-01 |",
              "| W-04 | Duplicate again | agent:coordinator | open | write it | - | - | - | 2026-01-01 |"
            ]
          }),
          expected: [
            /W-01 requires an owner/,
            /W-01 depends on unknown work id: W-09/,
            /W-02 is done but names neither evidence nor a change/,
            /W-03 has unknown status: finished/,
            /duplicate work id: W-04/
          ]
        }
      ];
      for (const testCase of cases) {
        fs.writeFileSync(file, testCase.body);
        const js = outputLines(capture(() => runChangeValidate(["--state-root", repo, "--change", "objective-demo"]))).join("\n");
        const py = outputLines(runPythonChangeValidate(["--state-root", repo, "--change", "objective-demo"])).join("\n");
        for (const pattern of testCase.expected) {
          assert.match(js, pattern, `JS missed ${pattern} for ${testCase.label}`);
          assert.match(py, pattern, `Python missed ${pattern} for ${testCase.label}`);
        }
      }
    });
  });

  await test("objective ledger inherits the package policy when the overlay omits it", () => {
    withTempRepo((repo) => {
      initChangeWorkspaces(repo, ["objective-demo"]);
      writeRepoSchema(repo, (schema) => {
        delete schema.derived_work;
      });
      const file = path.join(repo, ".changes", "objective-demo", "requirements.md");
      fs.writeFileSync(
        file,
        objectiveLedger(["bad-id"], { row: "| bad-id | Ship it | - | nope | - | - | - | - | 2026-13-45 |" })
      );
      const js = outputLines(capture(() => runChangeValidate(["--state-root", repo, "--change", "objective-demo"]))).join("\n");
      const py = outputLines(runPythonChangeValidate(["--state-root", repo, "--change", "objective-demo"])).join("\n");
      for (const pattern of [/invalid work id: bad-id/, /unknown status: nope/, /requires an owner/]) {
        assert.match(js, pattern, `JS ignored the inherited policy for ${pattern}`);
        assert.match(py, pattern, `Python ignored the inherited policy for ${pattern}`);
      }
    });
  });

  await test("objective ledger warns about stale items and leaves an unmarked table inert", () => {
    withTempRepo((repo) => {
      initChangeWorkspaces(repo, ["objective-demo"]);
      const file = path.join(repo, ".changes", "objective-demo", "requirements.md");
      fs.writeFileSync(
        file,
        objectiveLedger(["W-01"], {
          row: "| W-01 | Ship the slice | agent:coordinator | blocked | wait for review | - | - | - | 2026-01-01 |"
        })
      );
      const js = outputLines(capture(() => runChangeValidate(["--state-root", repo, "--change", "objective-demo", "--strict-layout"]))).join("\n");
      const py = outputLines(runPythonChangeValidate(["--state-root", repo, "--change", "objective-demo", "--strict-layout"])).join("\n");
      assert.match(js, /W-01 has been blocked for \d+ days/);
      assert.match(py, /W-01 has been blocked for \d+ days/);

      const unmarked = readTest(file).replace(/^derived_work: v1\n/m, "");
      fs.writeFileSync(file, unmarked.replace("| W-01 | Ship the slice |", "| not-an-id | Ship the slice |"));
      const inert = outputLines(capture(() => runChangeValidate(["--state-root", repo, "--change", "objective-demo", "--strict-layout"]))).join("\n");
      assert.doesNotMatch(inert, /invalid work id/, "an absent marker must leave a legacy table inert");
    });
  });

  await test("promotion is validated in both directions", () => {
    withTempRepo((repo) => {
      initChangeWorkspaces(repo, ["objective-demo", "child-change"]);
      const objectiveFile = path.join(repo, ".changes", "objective-demo", "requirements.md");
      fs.writeFileSync(
        objectiveFile,
        objectiveLedger(["W-01"], {
          row: "| W-01 | Ship the child change | agent:coordinator | open | write the slice | - | - | child-change | 2026-11-01 |"
        })
      );
      const objectiveErrors = () => ({
        js: outputLines(capture(() => runChangeValidate(["--state-root", repo, "--change", "objective-demo"]))).join("\n"),
        py: outputLines(runPythonChangeValidate(["--state-root", repo, "--change", "objective-demo"])).join("\n")
      });

      const before = objectiveErrors();
      assert.match(before.js, /names child-change but that change does not declare spawned-from objective-demo/);
      assert.match(before.py, /names child-change but that change does not declare spawned-from objective-demo/);

      const relation = writeRelation(repo, "child-change", "objective-demo", "spawned-from", "Implements W-01.");
      assert.equal(relation.status, 0, relation.stdout + relation.stderr);
      const linked = objectiveErrors();
      assert.doesNotMatch(linked.js, /spawned-from/);
      assert.doesNotMatch(linked.py, /spawned-from/);

      fs.writeFileSync(objectiveFile, readTest(objectiveFile).replace("| - | child-change |", "| - | - |"));
      const childJs = outputLines(capture(() => runChangeValidate(["--state-root", repo, "--change", "child-change"]))).join("\n");
      const childPy = outputLines(runPythonChangeValidate(["--state-root", repo, "--change", "child-change"])).join("\n");
      assert.match(childJs, /spawned-from objective-demo requires a derived work row naming child-change/);
      assert.match(childPy, /spawned-from objective-demo requires a derived work row naming child-change/);

      fs.writeFileSync(
        objectiveFile,
        objectiveLedger(["W-01"], {
          row: "| W-01 | Ship the child change | agent:coordinator | open | write the slice | - | - | ghost-change | 2026-11-01 |"
        })
      );
      const dangling = objectiveErrors();
      assert.match(dangling.js, /names a change that does not exist: ghost-change/);
      assert.match(dangling.py, /names a change that does not exist: ghost-change/);
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

function initChangeWorkspaces(repo, changeIds) {
  for (const changeId of changeIds) {
    const result = capture(() => runChangeDoc(["--state-root", repo, "init", changeId, "--json"]));
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
}

function writeRelation(repo, changeId, targetId, type, reason) {
  return capture(() =>
    runChangeDoc([
      "--state-root",
      repo,
      "relation",
      changeId,
      "--target",
      targetId,
      "--type",
      type,
      "--reason",
      reason
    ])
  );
}

function seedRelationRows(repo, changeId, rows) {
  const readme = path.join(repo, ".changes", changeId, "README.md");
  const lines = fs.readFileSync(readme, "utf8").split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === "## Change Relations");
  assert.notEqual(headingIndex, -1, `${readme}: Change Relations heading missing`);
  let tableEnd = headingIndex + 1;
  while (tableEnd < lines.length && !lines[tableEnd].trim().startsWith("|")) {
    tableEnd += 1;
  }
  while (tableEnd < lines.length && lines[tableEnd].trim().startsWith("|")) {
    tableEnd += 1;
  }
  assert.notEqual(tableEnd, headingIndex + 1, `${readme}: Change Relations table missing`);
  lines.splice(tableEnd, 0, ...rows);
  fs.writeFileSync(readme, lines.join("\n"));
}

function removeRelationSection(repo, changeId) {
  const readme = path.join(repo, ".changes", changeId, "README.md");
  const lines = fs.readFileSync(readme, "utf8").split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === "## Change Relations");
  assert.notEqual(headingIndex, -1, `${readme}: Change Relations heading missing`);
  let sectionEnd = headingIndex + 1;
  while (sectionEnd < lines.length && lines[sectionEnd].trim() !== "## Current Phase") {
    sectionEnd += 1;
  }
  assert(sectionEnd < lines.length, `${readme}: Current Phase heading missing`);
  lines.splice(headingIndex, sectionEnd - headingIndex);
  fs.writeFileSync(readme, lines.join("\n"));
}

function objectiveLedger(workIds, options = {}) {
  const rows = workIds.map((workId, index) => {
    if (index === 0 && options.row) return options.row;
    return `| ${workId} | Outcome ${index + 1} | agent:coordinator | open | write it | - | - | - | 2026-11-01 |`;
  });
  if (options.extraRows) rows.push(...options.extraRows);
  if (options.extraCell) rows[0] = `${rows[0]} EXTRA |`;
  return [
    "---",
    "artifact: requirements",
    "status: draft",
    "tags: [requirements]",
    'description: "Objective requirements."',
    "derived_work: v1",
    "---",
    "",
    "# Requirements",
    "",
    "## Derived Work",
    "",
    "| work | outcome | owner | status | next action | depends on | evidence | change | updated |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    ""
  ].join("\n");
}

function outputLines(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.split("\n").filter(Boolean);
}

function objectiveFrontMatter(tags) {
  return [
    "---",
    "artifact: requirements",
    "status: draft",
    `tags: [${tags}]`,
    'description: "Objective requirements."',
    "derived_work: v1",
    "---",
    ""
  ].join("\n");
}

function readTest(filePath) {
  return fs.readFileSync(filePath, "utf8");
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

function removeDefaultSpec(repo, changeId) {
  const specPath = path.join(repo, ".changes", changeId, "specs", "feature.md");
  if (fs.existsSync(specPath)) {
    fs.unlinkSync(specPath);
  }
}

function writeEvidenceFile(repo, relPath = "tests/evidence.js") {
  const filePath = path.join(repo, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "// acceptance evidence fixture\n");
}

function acceptanceSpecBody({
  marker = "v1",
  requirements = [
    {
      title: "Accepted behavior",
      scenarios: [{ id: "ACC-001", heading: "Works", evidence: ["tests/evidence.js::case"] }]
    }
  ],
  removedRequirements = []
} = {}) {
  const lines = [
    "---",
    "artifact: delta-spec",
    "status: draft",
    "tags: [requirements]",
    'description: "Acceptance validation fixture."'
  ];
  if (marker) {
    lines.push(`acceptance: ${marker}`);
  }
  lines.push(
    "---",
    "",
    "# Capability",
    "",
    "## Purpose",
    "",
    "Acceptance validation fixture.",
    "",
    "## Traceability",
    "",
    "| Requirement | Design owner | Verification |",
    "|---|---|---|",
    "| ACC-001 | spec | tests/evidence.js |",
    "",
    "## ADDED Requirements",
    ""
  );
  for (const requirement of requirements) {
    lines.push(`### Requirement: ${requirement.title}`, "", "A capability SHALL behave.", "");
    for (const scenario of requirement.scenarios ?? []) {
      lines.push(`#### Scenario: ${scenario.id} ${scenario.heading ?? "Condition"}`, "");
      lines.push("- Given a setup", "- When it runs", "- Then it works");
      for (const evidence of scenario.evidence ?? []) {
        lines.push(`- Evidence: ${evidence}`);
      }
      lines.push("");
    }
  }
  if (removedRequirements.length > 0) {
    lines.push("## REMOVED Requirements", "");
    for (const requirement of removedRequirements) {
      lines.push(`### Requirement: ${requirement.title}`, "", "A capability is removed.", "");
      for (const scenario of requirement.scenarios ?? []) {
        lines.push(`#### Scenario: ${scenario.id} ${scenario.heading ?? "Condition"}`, "");
        lines.push("- Given a setup", "- When it runs", "- Then it is removed");
        for (const evidence of scenario.evidence ?? []) {
          lines.push(`- Evidence: ${evidence}`);
        }
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

function writeAcceptanceSpec(repo, changeId, fileName = "capability.md", options = {}) {
  const specPath = path.join(repo, ".changes", changeId, "specs", fileName);
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, acceptanceSpecBody(options));
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
