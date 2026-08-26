import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  collectChangedSurface,
  normalizeChangedLine
} from "../skills/review/review-packet-gate/scripts/review-changed-surface.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "git failed");
}

function initRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-surface-"));
  git(root, ["init", "-q"]);
  fs.writeFileSync(path.join(root, "a.txt"), "line1\nline2\nline3\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

export async function run(run) {
  await run("modified file yields hunk and changed-line inventory", async () => {
    const root = initRepo();
    try {
      fs.writeFileSync(path.join(root, "a.txt"), "line1\nline2-CHANGED\nline3\nline4\n");
      const { surface, files, hunks, lines } = collectChangedSurface(root, { base: "HEAD", head: "HEAD" });
      assert.equal(files.length, 1);
      assert.equal(files[0].status, "modified");
      assert.ok(hunks.length >= 1);
      assert.ok(hunks.every((h) => typeof h.patch_digest === "string" && h.patch_digest.startsWith("sha256:")));
      assert.ok(lines.length >= 1);
      assert.ok(lines.every((l) => l.hunk_ref && l.number >= 1));
      assert.match(surface.inventory_digest, /^sha256:[0-9a-f]{64}$/u);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await run("untracked file is inventoried as added", async () => {
    const root = initRepo();
    try {
      fs.writeFileSync(path.join(root, "new.txt"), "x\n");
      const { files } = collectChangedSurface(root, { base: "HEAD", head: "HEAD" });
      assert.ok(files.some((f) => f.path === "new.txt" && f.status === "added"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await run("deleted file is inventoried with deleted status and no hunks", async () => {
    const root = initRepo();
    try {
      fs.unlinkSync(path.join(root, "a.txt"));
      const { files, hunks } = collectChangedSurface(root, { base: "HEAD", head: "HEAD" });
      const deleted = files.find((f) => f.path === "a.txt");
      assert.ok(deleted);
      assert.equal(deleted.status, "deleted");
      assert.ok(hunks.filter((h) => h.file_ref.id === deleted.record_id).length === 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await run("inventory digest is stable for identical state", async () => {
    const root = initRepo();
    try {
      fs.writeFileSync(path.join(root, "a.txt"), "line1\nline2-CHANGED\nline3\nline4\n");
      const first = collectChangedSurface(root, { base: "HEAD", head: "HEAD" });
      const second = collectChangedSurface(root, { base: "HEAD", head: "HEAD" });
      assert.equal(first.surface.inventory_digest, second.surface.inventory_digest);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await run("normalizeChangedLine rejects a line with no hunk_ref", async () => {
    assert.throws(() => normalizeChangedLine({ side: "new", number: 1, kind: "added", content_digest: "sha256:" + "a".repeat(64) }), ReviewRunError);
  });
}
