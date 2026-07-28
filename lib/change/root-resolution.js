import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function resolveChangeContext(input = {}) {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const env = input.env ?? process.env;
  const cwdChange = findCwdChange(cwd);
  const changeId = input.changeId ?? input.change_id ?? cwdChange?.changeId ?? null;
  const stateRoot = resolveExplicitRoot(input.stateRoot ?? input.state_root, cwd, "state-root");
  const repoRoot = resolveExplicitRoot(input.repoRoot ?? input.repo_root, cwd, "repo-root");
  const codeRoot = resolveCodeRoot(input.codeRoot ?? input.code_root, cwd);

  const aliasedRoot = [stateRoot, repoRoot].find((root) => root && root.requested !== root.resolved);
  if (aliasedRoot) {
    return unresolvedContext({
      codeRoot,
      changeId,
      source: "unresolved",
      unresolvedReason: "aliased-state-root",
      candidates: [explicitCandidate(aliasedRoot.resolved, changeId, aliasedRoot.source, aliasedRoot.requested)]
    });
  }

  if (stateRoot && repoRoot && !samePath(stateRoot.resolved, repoRoot.resolved)) {
    return unresolvedContext({
      codeRoot,
      changeId,
      source: "conflict",
      unresolvedReason: "conflicting-explicit-roots",
      candidates: [
        explicitCandidate(stateRoot.resolved, changeId, "state-root", stateRoot.requested),
        explicitCandidate(repoRoot.resolved, changeId, "repo-root", repoRoot.requested)
      ]
    });
  }

  if (stateRoot || repoRoot) {
    const selected = stateRoot ?? repoRoot;
    if (isLinkedWorktree(selected.resolved, gitWorktrees(selected.resolved))) {
      return unresolvedContext({
        codeRoot,
        changeId,
        source: "unresolved",
        unresolvedReason: "linked-worktree-state-root",
        isLinked: true,
        candidates: [explicitCandidate(selected.resolved, changeId, selected.source, selected.requested)]
      });
    }
    return resolvedContext({
      stateRoot: selected.resolved,
      codeRoot,
      changeId,
      source: selected.source,
      candidates: [explicitCandidate(selected.resolved, changeId, selected.source, selected.requested)]
    });
  }

  const envRoot = resolveExplicitRoot(env.HARNESS_CHANGE_STATE_ROOT, cwd, "environment");
  if (envRoot) {
    if (envRoot.requested !== envRoot.resolved) {
      return unresolvedContext({
        codeRoot,
        changeId,
        source: "unresolved",
        unresolvedReason: "aliased-state-root",
        candidates: [explicitCandidate(envRoot.resolved, changeId, "environment", envRoot.requested)]
      });
    }
    if (isLinkedWorktree(envRoot.resolved, gitWorktrees(envRoot.resolved))) {
      return unresolvedContext({
        codeRoot,
        changeId,
        source: "unresolved",
        unresolvedReason: "linked-worktree-state-root",
        isLinked: true,
        candidates: [explicitCandidate(envRoot.resolved, changeId, "environment", envRoot.requested)]
      });
    }
    return resolvedContext({
      stateRoot: envRoot.resolved,
      codeRoot,
      changeId,
      source: "environment",
      candidates: [explicitCandidate(envRoot.resolved, changeId, "environment", envRoot.requested)]
    });
  }

  const worktrees = gitWorktrees(codeRoot);
  const isLinked = isLinkedWorktree(codeRoot, worktrees);
  const candidates = [];
  const knownWorktreeCandidates = [];

  if (changeId && cwdChange?.changeId === changeId) {
    addCandidate(candidates, cwdChange.stateRoot, changeId, "cwd-change", true);
  }
  if (changeId) {
    addCandidate(candidates, codeRoot, changeId, "code-root", true);
  }
  for (const worktreeRoot of worktrees) {
    const candidate = explicitCandidate(worktreeRoot, changeId, "git-worktree");
    knownWorktreeCandidates.push(candidate);
    if (changeId && candidate.exists) {
      addCandidate(candidates, worktreeRoot, changeId, samePath(worktreeRoot, codeRoot) ? "code-root" : "git-worktree", true);
    }
  }

  if (candidates.length > 1) {
    return unresolvedContext({
      codeRoot,
      changeId,
      source: "unresolved",
      unresolvedReason: "ambiguous-state-root",
      isLinked,
      candidates
    });
  }

  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (!samePath(candidate.state_root, codeRoot) && candidate.source === "git-worktree") {
      return unresolvedContext({
        codeRoot,
        changeId,
        source: "unresolved",
        unresolvedReason: "other-worktree-state-root",
        isLinked,
        candidates
      });
    }
    return resolvedContext({
      stateRoot: candidate.state_root,
      codeRoot,
      changeId,
      source: candidate.source,
      isLinked,
      candidates
    });
  }

  if (isLinked) {
    return unresolvedContext({
      codeRoot,
      changeId,
      source: "unresolved",
      unresolvedReason: "linked-worktree-unresolved",
      isLinked,
      candidates: knownWorktreeCandidates
    });
  }

  return resolvedContext({
    stateRoot: codeRoot,
    codeRoot,
    changeId,
    source: cwdChange ? "cwd-change" : "cwd",
    isLinked,
    candidates
  });
}

export function resolveChangeContextFromArgs(args, options = {}) {
  return resolveChangeContext({
    stateRoot: args.values.get("state-root"),
    repoRoot: args.values.get("repo-root"),
    codeRoot: args.values.get("code-root"),
    changeId: options.changeId,
    cwd: options.cwd,
    env: options.env
  });
}

export function writeRootContextError(context, stream = process.stderr) {
  stream.write(`${rootContextErrorText(context)}\n`);
}

export function rootContextErrorText(context) {
  const change = context.change_id ? ` for change ${context.change_id}` : "";
  if (context.unresolved_reason === "conflicting-explicit-roots") {
    const state = context.candidates.find((candidate) => candidate.source === "state-root")?.state_root ?? "<missing>";
    const repo = context.candidates.find((candidate) => candidate.source === "repo-root")?.state_root ?? "<missing>";
    return [
      `ERROR: conflicting state roots${change}: --state-root ${state} differs from --repo-root ${repo}`,
      "GUIDE: retry with one canonical state root."
    ].join("\n");
  }
  if (context.unresolved_reason === "aliased-state-root") {
    const candidate = context.candidates[0];
    return [
      `ERROR: state root alias${change}: ${candidate?.requested_root ?? "<missing>"} resolves to ${candidate?.state_root ?? "<missing>"}`,
      "GUIDE: retry with the canonical state-root path."
    ].join("\n");
  }
  if (context.unresolved_reason === "linked-worktree-state-root") {
    const candidate = context.candidates[0];
    return [
      `ERROR: state root${change} is a linked worktree: ${candidate?.state_root ?? "<missing>"}`,
      "GUIDE: retry with the canonical shared state-root, not a linked worktree."
    ].join("\n");
  }
  if (context.unresolved_reason === "ambiguous-state-root") {
    return [
      `ERROR: ambiguous state root${change}`,
      ...candidateLines(context),
      "GUIDE: inspect candidates and retry with --state-root <canonical-state-root>."
    ].join("\n");
  }
  if (context.unresolved_reason === "other-worktree-state-root") {
    return [
      `ERROR: state root unresolved${change}; matching change workspace is in another worktree`,
      ...candidateLines(context),
      "GUIDE: retry with explicit --state-root after confirming the canonical workspace."
    ].join("\n");
  }
  return [
    `ERROR: state root unresolved${change}`,
    ...candidateLines(context),
    "GUIDE: retry with --state-root <canonical-state-root>."
  ].join("\n");
}

function resolvedContext({ stateRoot, codeRoot, changeId, source, isLinked = false, candidates = [] }) {
  return {
    state_root: stateRoot,
    code_root: codeRoot,
    change_id: changeId,
    source,
    is_linked_worktree: isLinked,
    candidates,
    unresolved_reason: null
  };
}

function unresolvedContext({ codeRoot, changeId, source, unresolvedReason, isLinked = false, candidates = [] }) {
  return {
    state_root: null,
    code_root: codeRoot,
    change_id: changeId,
    source,
    is_linked_worktree: isLinked,
    candidates,
    unresolved_reason: unresolvedReason
  };
}

function candidateLines(context) {
  return context.candidates.map(
    (candidate) =>
      `CANDIDATE: ${candidate.state_root} source=${candidate.source} exists=${candidate.exists ? "yes" : "no"}`
  );
}

function explicitCandidate(stateRoot, changeId, source, requestedRoot = null) {
  return {
    state_root: stateRoot,
    change_dir: changeId ? path.join(stateRoot, ".changes", changeId) : null,
    source,
    exists: changeId ? fs.existsSync(path.join(stateRoot, ".changes", changeId)) : fs.existsSync(stateRoot),
    ...(requestedRoot ? { requested_root: requestedRoot } : {})
  };
}

function addCandidate(candidates, stateRoot, changeId, source, requireExists) {
  const candidate = explicitCandidate(stateRoot, changeId, source);
  if (requireExists && !candidate.exists) {
    return;
  }
  if (candidates.some((entry) => samePath(entry.state_root, candidate.state_root))) {
    return;
  }
  candidates.push(candidate);
}

function resolveRoot(value, cwd) {
  return resolveExplicitRoot(value, cwd, "explicit")?.resolved ?? null;
}

function resolveExplicitRoot(value, cwd, source) {
  if (!value) {
    return null;
  }
  const requested = path.resolve(cwd, value);
  return { requested, resolved: realPathOrResolve(requested), source };
}

function resolveCodeRoot(value, cwd) {
  const explicit = resolveRoot(value, cwd);
  if (explicit) {
    return explicit;
  }
  return realPathOrResolve(gitRoot(cwd) ?? cwd);
}

function gitRoot(cwd) {
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  return path.resolve(result.stdout.trim());
}

function gitWorktrees(codeRoot) {
  const result = spawnSync("git", ["-C", codeRoot, "worktree", "list", "--porcelain"], { encoding: "utf8" });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length).trim()))
    .filter(Boolean);
}

function isLinkedWorktree(codeRoot, worktrees) {
  if (worktrees.length <= 1) {
    return false;
  }
  const current = realPathOrResolve(codeRoot);
  return worktrees.some((worktreeRoot, index) => index > 0 && samePath(realPathOrResolve(worktreeRoot), current));
}

function findCwdChange(cwd) {
  const parts = path.resolve(cwd).split(path.sep);
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    if (parts[index] !== ".changes" || !parts[index + 1]) {
      continue;
    }
    const stateRootParts = parts.slice(0, index);
    const stateRoot = stateRootParts.length === 0 ? path.sep : stateRootParts.join(path.sep) || path.sep;
    return {
      stateRoot: path.resolve(stateRoot),
      changeId: parts[index + 1],
      changeDir: path.join(path.resolve(stateRoot), ".changes", parts[index + 1])
    };
  }
  return null;
}

function samePath(left, right) {
  return realPathOrResolve(left) === realPathOrResolve(right);
}

function realPathOrResolve(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}
