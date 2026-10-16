import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNativeRoles } from "../lib/project/native-roles.js";
import { snapshotTarget } from "../lib/project/backup.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../harness.manifest.json", import.meta.url)));
const roles = manifest.assets.agents;
const body = (role) => fs.readFileSync(new URL(`../${role.source}`, import.meta.url), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-native-test-"));
  const previous = process.env.HOME;
  process.env.HOME = root;
  try { fn(root); }
  finally { if (previous === undefined) delete process.env.HOME; else process.env.HOME = previous; fs.rmSync(root, { recursive: true, force: true }); }
}
function run(args) {
  const previous = process.stdout.write;
  let output = "";
  process.stdout.write = (chunk) => { output += chunk; return true; };
  try { const status = runNativeRoles([...args, "--json"]); return { status, result: JSON.parse(output) }; }
  finally { process.stdout.write = previous; }
}
function zcode(root) {
  const directory = path.join(root, "agents"); fs.mkdirSync(directory);
  for (const role of roles) fs.writeFileSync(path.join(directory, `${role.runtimeName}.md`), `---\nname: ${JSON.stringify(role.runtimeName)}\ndescription: ${JSON.stringify(role.description)}\nmodel: "user-model"\nthoughtLevel: high\ncolor: cyan\ninjectAgentsMd: false\n---\n\nold role text\n`, { mode: 0o640 });
  return ["--client", "zcode", "--agents-dir", directory];
}
function approved(root, args) {
  const plan = run([...args, "--dry-run"]); assert.equal(plan.status, 0, JSON.stringify(plan));
  const file = path.join(root, "plan.json"); fs.writeFileSync(file, JSON.stringify(plan.result)); return file;
}
export async function runTests(test) {
  await test("external snapshots preserve sources, links, modes and unique mappings", () => fixture((root) => {
    const directory = path.join(root, "discovery", "skill"); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "SKILL.md"), "old", { mode: 0o640 }); fs.symlinkSync("missing", path.join(directory, "link"));
    const first = snapshotTarget(directory), second = snapshotTarget(directory);
    assert.notEqual(first.saved, second.saved); assert.equal(fs.readFileSync(path.join(directory, "SKILL.md"), "utf8"), "old");
    assert.equal(fs.readlinkSync(path.join(first.saved, "link")), "missing"); assert.equal(fs.statSync(path.join(first.saved, "SKILL.md")).mode & 0o777, 0o640);
    assert.equal(fs.statSync(path.dirname(first.saved)).mode & 0o777, 0o700); assert.equal(fs.statSync(first.manifest).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(first.manifest)).original, directory); assert(!first.saved.startsWith(path.join(root, "discovery")));
    assert.deepEqual(fs.readdirSync(path.dirname(directory)), ["skill"]);
  }));
  await test("failed snapshot leaves original and no partial archive", () => fixture((root) => {
    const target = path.join(root, "source"); fs.writeFileSync(target, "old");
    const original = fs.cpSync; fs.cpSync = () => { throw new Error("copy failure"); };
    try { assert.throws(() => snapshotTarget(target), /copy failure/); } finally { fs.cpSync = original; }
    assert.equal(fs.readFileSync(target, "utf8"), "old"); assert.deepEqual(fs.readdirSync(path.join(root, "backup", "agent-harness-core")), []);
  }));
  await test("native ZCode refresh preserves metadata and modes, verifies, and is idempotent", () => fixture((root) => {
    const args = zcode(root), plan = approved(root, args);
    assert(!fs.existsSync(path.join(root, "backup")));
    const apply = run([...args, "--from-plan", plan]); assert.equal(apply.status, 0, JSON.stringify(apply)); assert.equal(apply.result.changed.length, roles.length);
    for (const role of roles) {
      const target = path.join(root, "agents", `${role.runtimeName}.md`), text = fs.readFileSync(target, "utf8");
      assert(text.includes('model: "user-model"\nthoughtLevel: high\ncolor: cyan\ninjectAgentsMd: false\n'));
      assert(text.endsWith(`\n${body(role)}\n`)); assert.equal(fs.statSync(target).mode & 0o777, 0o640);
    }
    assert.equal(run([...args, "--verify"]).status, 0);
    const again = run([...args, "--from-plan", approved(root, args)]); assert.deepEqual(again.result.changed, []); assert.deepEqual(again.result.backups, []);
    assert.deepEqual(fs.readdirSync(path.join(root, "agents")).filter((name) => name.includes(".tmp") || name.includes(".bak")), []);
  }));
  await test("ZCode owned metadata replacement never matches a nested notes value", () => fixture((root) => {
    const args = zcode(root), target = path.join(root, "agents", `${roles[0].runtimeName}.md`);
    const notes = 'notes: |\n  description: "old"\n';
    let text = fs.readFileSync(target, "utf8").replace(/^---\n/, "---\n" + notes);
    text = text.replace(/^description:.*$/m, 'description: "old"'); fs.writeFileSync(target, text);
    const apply = run([...args, "--from-plan", approved(root, args)]); assert.equal(apply.status, 0, JSON.stringify(apply));
    const next = fs.readFileSync(target, "utf8"); assert(next.includes(notes));
    assert(next.includes(`\ndescription: ${JSON.stringify(roles[0].description)}\n`));
  }));
  await test("stale reviewed native plan rejects before any write or backup", () => fixture((root) => {
    const args = zcode(root), plan = approved(root, args);
    const first = path.join(root, "agents", `${roles[0].runtimeName}.md`), second = path.join(root, "agents", `${roles[1].runtimeName}.md`);
    const before = fs.readFileSync(first, "utf8"); fs.appendFileSync(second, "external edit");
    const apply = run([...args, "--from-plan", plan]); assert.equal(apply.status, 1); assert.match(apply.result.errors[0], /stale/);
    assert.equal(fs.readFileSync(first, "utf8"), before); assert(!fs.existsSync(path.join(root, "backup")));
  }));
  for (const failure of ["rename", "external-edit"]) await test(`native second-file ${failure} reports recoverable partial state and cleans temp`, () => fixture((root) => {
    const args = zcode(root), plan = approved(root, args), second = path.join(root, "agents", `${roles[1].runtimeName}.md`);
    const before = fs.readFileSync(second, "utf8"), original = fs.renameSync;
    let count = 0;
    fs.renameSync = (source, target) => {
      if (String(source).includes(".tmp-")) {
        count += 1;
        if (failure === "rename" && count === 2) throw new Error("replace failure");
        const value = original(source, target);
        if (failure === "external-edit" && count === 1) fs.appendFileSync(second, "external edit");
        return value;
      }
      return original(source, target);
    };
    let apply;
    try { apply = run([...args, "--from-plan", plan]); } finally { fs.renameSync = original; }
    assert.equal(apply.status, 1); assert.deepEqual(apply.result.changed, [roles[0].runtimeName]); assert.deepEqual(apply.result.failed, [roles[1].runtimeName]);
    assert.equal(apply.result.remaining.length, roles.length - 2); assert.equal(fs.readFileSync(second, "utf8"), before + (failure === "external-edit" ? "external edit" : ""));
    assert.deepEqual(fs.readdirSync(path.join(root, "agents")).filter((name) => name.includes(".tmp-")), []); assert(apply.result.backups.length >= 1);
  }));
  await test("missing, duplicate identity, or symlink native roles fail read-only", () => fixture((root) => {
    const args = zcode(root), target = path.join(root, "agents", `${roles[0].runtimeName}.md`);
    const text = fs.readFileSync(target, "utf8"); fs.writeFileSync(target, text.replace("---\nname", "---\nname: extra\nname"));
    assert.equal(run([...args, "--dry-run"]).status, 1); fs.rmSync(target); assert.equal(run([...args, "--dry-run"]).status, 1);
    fs.writeFileSync(path.join(root, "elsewhere"), text); fs.symlinkSync(path.join(root, "elsewhere"), target); assert.equal(run([...args, "--dry-run"]).status, 1); assert(!fs.existsSync(path.join(root, "backup")));
  }));
  await test("removed DSH persona refresh fails before profile IO", () => fixture((root) => {
    const profile = path.join(root, "web"); fs.mkdirSync(profile);
    const target = path.join(profile, "cordis.patch.yml"); fs.writeFileSync(target, "user-owned profile\n");
    for (const args of [
      ["--client", "dsh", "--dry-run"],
      ["--client", "dsh", "--profile-dir", profile, "--verify"],
    ]) {
      const result = run(args); assert.equal(result.status, 1);
      assert.match(result.result.errors[0], /host plugin via dsh plugin add/);
      assert.equal(fs.readFileSync(target, "utf8"), "user-owned profile\n");
      assert.equal(fs.existsSync(path.join(root, "backup")), false);
    }
    assert.match(run(["--client", "dsh", "--dry-run"]).result.errors[0], /host plugin/);
  }));
}
export { runTests as run };
