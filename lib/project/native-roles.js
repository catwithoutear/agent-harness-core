import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotTarget } from "./backup.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");

export function runNativeRoles(argv) {
  const result = { command: "harness-native-roles", ok: false, records: [], changed: [], failed: [], remaining: [], backups: [], errors: [] };
  try {
    const options = parseOptions(argv);
    if (options.help) {
      process.stdout.write("harness-native-roles --client zcode --agents-dir <global-agents>\n  --dry-run --json > plan.json\n  --from-plan plan.json --json\n  --verify --json\nRefresh existing roles only; retain client metadata.\n");
      return 0;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const roles = manifest.assets.agents.map((asset) => ({
      name: asset.runtimeName ?? asset.id,
      description: asset.description,
      body: fs.readFileSync(path.join(packageRoot, asset.source), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim()
    }));
    const files = planZcode(options.root, roles);
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
    if (key === "--profile-dir") throw new Error("--profile-dir has been removed; DSH uses the Core host plugin via dsh plugin add");
    if (["--dry-run", "--verify", "--json", "--help"].includes(key)) flags.add(key);
    else if (["--client", "--agents-dir", "--from-plan"].includes(key)) {
      const value = argv[++index];
      if (!value || value.startsWith("--") || values.has(key)) throw new Error(`invalid ${key}`);
      values.set(key, value);
    } else throw new Error(`unknown option: ${key}`);
  }
  if (flags.has("--help")) return { help: true };
  const client = values.get("--client");
  if (client !== "zcode") throw new Error("--client must be zcode; DSH uses the Core host plugin via dsh plugin add");
  const rootKey = "--agents-dir";
  if (!values.has(rootKey)) throw new Error(`require ${rootKey} for ${client}`);
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
