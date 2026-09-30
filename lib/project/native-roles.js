import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { snapshotTarget } from "./backup.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");

export function runNativeRoles(argv) {
  const result = { command: "harness-native-roles", ok: false, records: [], changed: [], failed: [], remaining: [], backups: [], errors: [] };
  try {
    const options = parseOptions(argv);
    if (options.help) {
      process.stdout.write("harness-native-roles --client zcode --agents-dir <global-agents> | --client dsh --profile-dir <profile>\n  --dry-run --json > plan.json\n  --from-plan plan.json --json\n  --verify --json\nRefresh existing roles only; retain client metadata. DSH uses the profile's installed yaml.\n");
      return 0;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const roles = manifest.assets.agents.map((asset) => ({
      name: asset.runtimeName ?? asset.id,
      description: asset.description,
      body: fs.readFileSync(path.join(packageRoot, asset.source), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim()
    }));
    const files = options.client === "zcode" ? planZcode(options.root, roles) : planDsh(options.root, roles);
    Object.assign(result, { action: options.action, client: options.client, target_root: options.root, source_hash: hash(JSON.stringify(roles)) });
    result.records = files.map((file) => ({ target: file.target, original_hash: hash(file.original), desired_hash: hash(file.desired), roles: file.roles, changed_roles: file.changedRoles, changed: file.original !== file.desired }));
    if (options.action === "verify") {
      for (const record of result.records.filter((item) => item.changed)) result.errors.push(`${record.target}: canonical roles differ`);
    } else if (options.action === "apply") {
      const approved = JSON.parse(fs.readFileSync(options.fromPlan, "utf8"));
      for (const key of ["command", "client", "target_root", "source_hash", "records"]) {
        if (JSON.stringify(approved[key]) !== JSON.stringify(result[key])) throw new Error(`stale or incompatible --from-plan: ${key}`);
      }
      if (!approved.ok || approved.action !== "dry-run") throw new Error("--from-plan must be a successful dry-run plan");
      const pending = files.filter((file) => file.original !== file.desired);
      for (let index = 0; index < pending.length; index += 1) {
        const file = pending[index];
        let temporary;
        try {
          assertRegularFile(file.target);
          if (fs.readFileSync(file.target, "utf8") !== file.original) throw new Error("target changed after planning");
          const backup = snapshotTarget(file.target);
          result.backups.push(backup);
          const descriptor = fs.openSync(temporary = `${file.target}.tmp-${crypto.randomUUID()}`, "wx", file.mode);
          try { fs.fchmodSync(descriptor, file.mode); fs.writeFileSync(descriptor, file.desired, "utf8"); } finally { fs.closeSync(descriptor); }
          assertRegularFile(file.target);
          if (fs.readFileSync(file.target, "utf8") !== file.original) throw new Error("target changed before replacement");
          fs.renameSync(temporary, file.target);
          result.changed.push(...file.changedRoles);
        } catch (error) {
          result.failed = file.changedRoles;
          result.remaining = pending.slice(index + 1).flatMap((item) => item.changedRoles);
          throw new Error(`${file.target}: ${error.message}`);
        } finally {
          if (temporary && fs.existsSync(temporary)) fs.rmSync(temporary);
        }
      }
    }
    result.ok = result.errors.length === 0;
  } catch (error) {
    result.errors.push(error.message);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

function parseOptions(argv) {
  const values = new Map(); const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (["--dry-run", "--verify", "--json", "--help"].includes(key)) flags.add(key);
    else if (["--client", "--agents-dir", "--profile-dir", "--from-plan"].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith("--") || values.has(key)) throw new Error(`invalid ${key}`);
      values.set(key, value);
    } else throw new Error(`unknown option: ${key}`);
  }
  if (flags.has("--help")) return { help: true };
  const client = values.get("--client");
  if (!["zcode", "dsh"].includes(client)) throw new Error("--client must be zcode or dsh");
  const rootKey = client === "zcode" ? "--agents-dir" : "--profile-dir";
  if (!values.has(rootKey) || values.has(client === "zcode" ? "--profile-dir" : "--agents-dir")) throw new Error(`require only ${rootKey} for ${client}`);
  const modes = [flags.has("--dry-run"), flags.has("--verify"), values.has("--from-plan")].filter(Boolean).length;
  if (modes !== 1) throw new Error("choose exactly one of --dry-run, --verify, --from-plan");
  return { client, root: path.resolve(values.get(rootKey)), action: flags.has("--dry-run") ? "dry-run" : flags.has("--verify") ? "verify" : "apply", fromPlan: values.get("--from-plan") };
}

function assertRegularFile(target) {
  let current = path.resolve(target);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${target}: symlinked path component`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (!fs.statSync(target).isFile()) throw new Error(`${target}: expected existing regular file`);
}

function plannedFile(target, original, desired, roles, changedRoles) {
  assertRegularFile(target);
  return { target, original, desired, roles, changedRoles, mode: fs.statSync(target).mode & 0o777 };
}

function planZcode(root, roles) {
  return roles.map((role) => {
    const target = path.join(root, `${role.name}.md`);
    assertRegularFile(target);
    const original = fs.readFileSync(target, "utf8");
    const match = /^---\n([\s\S]*?)\n---\n/.exec(original);
    if (!match) throw new Error(`${target}: unsupported frontmatter`);
    const header = match[1].split("\n");
    for (const field of ["name", "description"]) {
      const indexes = header.flatMap((line, index) => line.startsWith(`${field}:`) ? [index] : []);
      if (indexes.length !== 1) throw new Error(`${target}: require unique inline ${field}`);
      const raw = header[indexes[0]].slice(field.length + 1).trim();
      // Existing projections use JSON strings or plain role names; reject folds/tags.
      let value;
      if (raw.startsWith('"')) value = JSON.parse(raw);
      else if (/^[A-Za-z0-9_-]+$/.test(raw)) value = raw;
      else throw new Error(`${target}: unsupported inline ${field}`);
      if (typeof value !== "string" || !value || (field === "name" && value !== role.name)) throw new Error(`${target}: invalid ${field}`);
      header[indexes[0]] = `${field}: ${JSON.stringify(field === "name" ? role.name : role.description)}`;
    }
    const desired = `---\n${header.join("\n")}\n---\n\n${role.body}\n`;
    return plannedFile(target, original, desired, [role.name], original === desired ? [] : [role.name]);
  });
}

function dshPrefix(name) {
  return `You are the \`${name}\` specialist subagent of a DeepSeek Harness agent. The parent agent's dispatch prompt is your Input Packet. Follow the role definition below exactly: respect its Authority, Required Inputs, stop conditions, and Output Packet contract, and return the Output Packet as your final message.\n\n\n`;
}

function parseProfile(YAML, text) {
  const document = YAML.parseDocument(text, { keepSourceTokens: true, customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }] });
  if (document.errors.length || document.warnings.length) throw new Error("profile YAML has errors or unsupported tags");
  return document;
}

function planDsh(root, roles) {
  const target = path.join(root, "cordis.patch.yml");
  assertRegularFile(target);
  const YAML = createRequire(path.join(root, "package.json"))("yaml");
  const original = fs.readFileSync(target, "utf8");
  const document = parseProfile(YAML, original);
  const wanted = new Map(roles.map((role) => [role.name.replaceAll("-", "_"), role]));
  const nodes = new Map();
  YAML.visit(document, { Map(_, node) {
    const id = node.get("id");
    if (typeof id !== "string" || !id.startsWith("tool-subagent_")) return;
    const role = wanted.get(id.slice("tool-subagent_".length));
    if (!role) return;
    const scalar = node.getIn(["config", "persona"], true);
    if (nodes.has(role.name) || node.get("name") !== "@deepseek-ai/dsh-tool-subagent" || node.getIn(["config", "toolName"]) !== `subagent_${role.name.replaceAll("-", "_")}` || scalar?.type !== "BLOCK_LITERAL" || !scalar.range || !scalar.value.startsWith(dshPrefix(role.name))) throw new Error(`${role.name}: duplicate or unsupported native role structure`);
    nodes.set(role.name, { scalar, role });
  } });
  if (nodes.size !== roles.length) throw new Error("profile lacks a canonical role");
  const changes = [];
  for (const { scalar, role } of nodes.values()) {
    const desiredValue = dshPrefix(role.name) + role.body;
    if (scalar.value.trimEnd() === desiredValue) continue;
    if (scalar.srcToken.props.map((prop) => prop.source).join("") !== "|-\n") throw new Error(`${role.name}: unsupported scalar header`);
    const indent = " ".repeat(scalar.srcToken.indent + 2);
    const text = `|-\n${desiredValue.split("\n").map((line) => line ? indent + line : "").join("\n")}\n`;
    changes.push({ start: scalar.range[0], end: scalar.range[2], text, name: role.name });
    scalar.value = desiredValue;
  }
  let desired = original;
  for (const change of changes.sort((left, right) => right.start - left.start)) desired = desired.slice(0, change.start) + change.text + desired.slice(change.end);
  const parsed = parseProfile(YAML, desired);
  if (JSON.stringify(parsed.toJSON()) !== JSON.stringify(document.toJSON())) throw new Error("profile replacement changed non-persona semantics");
  return [plannedFile(target, original, desired, roles.map((role) => role.name), changes.map((change) => change.name))];
}
