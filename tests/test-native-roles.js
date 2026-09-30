import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { runNativeRoles } from "../lib/project/native-roles.js";
import { snapshotTarget } from "../lib/project/backup.js";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("../harness.manifest.json", import.meta.url)));
const roles = manifest.assets.agents;
const body = (role) => fs.readFileSync(new URL(`../${role.source}`, import.meta.url), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
const prefix = (name) => `You are the \`${name}\` specialist subagent of a DeepSeek Harness agent. The parent agent's dispatch prompt is your Input Packet. Follow the role definition below exactly: respect its Authority, Required Inputs, stop conditions, and Output Packet contract, and return the Output Packet as your final message.\n\n\n`;

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
  let yamlDirectory;
  try { yamlDirectory = path.dirname(require.resolve("yaml/package.json")); }
  catch { process.stdout.write("skip - DSH tests require an installed yaml (profile runtime dependency)\n"); return; }
  const YAML = require("yaml");
  function dsh(root) {
    const profile = path.join(root, "web"); fs.mkdirSync(path.join(profile, "node_modules"), { recursive: true }); fs.symlinkSync(yamlDirectory, path.join(profile, "node_modules", "yaml"));
    const pieces = ["# user-owned comment\n- id: custom\n  config:\n    script: !!js 'untouched expression'\n"];
    for (const role of roles) {
      const key = role.runtimeName.replaceAll("-", "_");
      pieces.push(`- id: tool-subagent_${key}\n  name: '@deepseek-ai/dsh-tool-subagent'\n  config:\n    toolName: subagent_${key}\n    provider: spawn\n    agentOptions:\n      model: user-model\n    toolFilter: [read, write]\n    persona: |-\n${(prefix(role.runtimeName) + "old role text").split("\n").map((line) => "      " + line).join("\n")}\n`);
    }
    fs.writeFileSync(path.join(profile, "cordis.patch.yml"), pieces.join(""), { mode: 0o640 }); return ["--client", "dsh", "--profile-dir", profile];
  }
  const parse = (text) => YAML.parseDocument(text, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] }).toJSON();
  await test("DSH refresh preserves comments, non-persona semantics and original prefix, without executing tags", () => fixture((root) => {
    const args = dsh(root), target = path.join(root, "web", "cordis.patch.yml"), before = fs.readFileSync(target, "utf8"), plan = approved(root, args);
    const apply = run([...args, "--from-plan", plan]); assert.equal(apply.status, 0, JSON.stringify(apply));
    const after = fs.readFileSync(target, "utf8"), old = parse(before), next = parse(after);
    assert(after.startsWith("# user-owned comment\n")); assert(after.includes("script: !!js 'untouched expression'"));
    for (let index = 1; index < next.length; index += 1) {
      const role = roles[index - 1]; assert.equal(next[index].config.persona, prefix(role.runtimeName) + body(role));
      delete old[index].config.persona; delete next[index].config.persona;
    }
    assert.deepEqual(next, old); assert.equal(fs.statSync(target).mode & 0o777, 0o640); assert.equal(run([...args, "--verify"]).status, 0);
    assert.equal(run([...args, "--dry-run"]).result.records[0].changed, false);
  }));
  await test("DSH duplicate native role and malformed profile reject without writing", () => fixture((root) => {
    const args = dsh(root), target = path.join(root, "web", "cordis.patch.yml");
    fs.appendFileSync(target, `- id: tool-subagent_${roles[0].runtimeName.replaceAll("-", "_")}\n`);
    const before = fs.readFileSync(target, "utf8"); assert.equal(run([...args, "--dry-run"]).status, 1); assert.equal(fs.readFileSync(target, "utf8"), before);
    fs.writeFileSync(target, "bad: [\n"); assert.equal(run([...args, "--dry-run"]).status, 1); assert(!fs.existsSync(path.join(root, "backup")));
  }));
}
export { runTests as run };
