import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasFlag, parseArgs, printJson } from "../cli/args.js";
import { loadManifest, validateManifest } from "../manifest/validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARED_KINDS = new Set(["rules", "templates", "tools"]);
const CONTENT_ALIASES = new Map([["subagents", "agents"]]);

export function runHarnessProject(argv) {
  const args = parseArgs(argv);
  if (hasFlag(args, "help")) {
    process.stdout.write(helpText());
    return 0;
  }

  const configResult = loadConfig(args.values.get("config"));
  if (configResult.error) {
    process.stderr.write(`ERROR: ${configResult.error}\n`);
    return 2;
  }
  const config = configResult.config ?? {};
  const cliTarget = args.values.get("target");
  const configTarget = config.target;
  if (cliTarget && configTarget && path.resolve(cliTarget) !== path.resolve(configTarget) && !hasFlag(args, "allow-config-target-override")) {
    process.stderr.write("ERROR: --target conflicts with config target; pass --allow-config-target-override to use CLI target\n");
    return 2;
  }
  const target = cliTarget ?? configTarget;
  if (!target) {
    process.stderr.write("ERROR: harness-project requires --target <path>\n");
    return 2;
  }

  const { manifest } = loadManifest(packageRoot);
  const manifestValidation = validateManifest(manifest, { packageRoot });
  if (!manifestValidation.ok) {
    emitProjectResult(args, {
      command: "harness-project",
      ok: false,
      action: "manifest",
      errors: manifestValidation.errors,
      warnings: manifestValidation.warnings,
      records: []
    });
    return 1;
  }

  const options = resolveOptions(args, config, manifest, target);
  const plan = buildProjectionPlan(manifest, options);
  let result;
  if (hasFlag(args, "dry-run")) {
    result = {
      command: "harness-project",
      ok: true,
      action: "dry-run",
      target: options.targetRoot,
      scope: options.scope,
      mode: options.mode,
      conflict: options.conflict,
      summary: summarizePlan(plan),
      records: plan,
      errors: [],
      warnings: unsupportedCapabilityDiagnostics(manifest, options)
    };
  } else if (hasFlag(args, "verify")) {
    result = verifyProjection(plan, options);
  } else {
    result = applyProjection(plan, options, manifest);
  }

  emitProjectResult(args, result);
  return result.errors.length > 0 ? 1 : 0;
}

export function buildProjectionPlan(manifest, options) {
  const records = [];
  const assets = manifest.assets ?? {};
  for (const kind of options.content) {
    const assetKind = CONTENT_ALIASES.get(kind) ?? kind;
    const items = assets[assetKind] ?? [];
    if (SHARED_KINDS.has(assetKind)) {
      for (const asset of items) {
        if (!assetMatchesClients(asset, options.clients)) {
          continue;
        }
        const targetTemplate = asset.target ?? defaultSharedTarget(assetKind, asset);
        records.push(recordFor(assetKind, asset, "shared", targetTemplate, options));
      }
      continue;
    }
    for (const asset of items) {
      for (const client of options.clients) {
        if (!asset.clients?.includes(client)) {
          continue;
        }
        if (assetKind === "hooks") {
          const capability = hookCapability(manifest, client, asset);
          if (!capability.supported) {
            records.push({
              asset_id: asset.id,
              content_kind: assetKind,
              client,
              source: path.join(packageRoot, asset.source),
              target: null,
              status: "unsupported",
              diagnostic: capability.diagnostic
            });
            continue;
          }
        }
        if (assetKind === "commands") {
          const capability = commandCapability(manifest, client, options.scope);
          if (!capability.supported) {
            records.push({
              asset_id: asset.id,
              content_kind: assetKind,
              client,
              source: path.join(packageRoot, asset.source),
              target: null,
              status: "unsupported",
              diagnostic: capability.diagnostic
            });
            continue;
          }
        }
        const templates = manifest.clients?.[client]?.targets?.[options.scope]?.[assetKind] ?? [];
        if (templates.length === 0) {
          records.push({
            asset_id: asset.id,
            content_kind: assetKind,
            client,
            source: path.join(packageRoot, asset.source),
            target: null,
            status: "unsupported",
            diagnostic: `client ${client} has no ${options.scope}.${assetKind} target template`
          });
          continue;
        }
        for (const targetTemplate of templates) {
          records.push(recordFor(assetKind, asset, client, targetTemplate, options));
        }
      }
    }
  }
  return records;
}

function recordFor(kind, asset, client, targetTemplate, options) {
  const rendered = renderTemplate(targetTemplate, asset, client);
  const target = resolveTargetPath(rendered, options.targetRoot);
  const source = path.join(packageRoot, asset.source);
  return {
    package: "@catwithoutear/agent-harness-core",
    version: options.version,
    asset_id: asset.id,
    runtime_name: asset.runtimeName ?? asset.id,
    content_kind: kind,
    client,
    source,
    target,
    mode: options.mode,
    description: asset.description,
    intent: asset.intent,
    status: "planned"
  };
}

function applyProjection(plan, options, manifest) {
  const errors = [];
  const warnings = unsupportedCapabilityDiagnostics(manifest, options);
  const applied = [];
  const state = readState(options.targetRoot);
  for (const record of plan) {
    if (!record.target) {
      pushUnique(warnings, record.diagnostic);
      continue;
    }
    if (!fs.existsSync(record.source)) {
      errors.push(`${record.asset_id}: source missing: ${record.source}`);
      continue;
    }
    const conflict = classifyConflict(record, state, options);
    if (conflict && options.conflict === "error") {
      errors.push(`${record.target}: existing unmanaged or modified target`);
      continue;
    }
    if (conflict && options.conflict === "skip") {
      applied.push({ ...record, status: "skipped" });
      continue;
    }
    if (conflict && options.conflict === "backup") {
      backupTarget(record.target);
    } else if (fs.existsSync(record.target)) {
      removeTarget(record.target);
    }
    fs.mkdirSync(path.dirname(record.target), { recursive: true });
    const rendered = renderManagedContent(record);
    if (rendered !== null) {
      fs.writeFileSync(record.target, rendered, "utf8");
    } else if (options.mode === "copy") {
      copyPath(record.source, record.target);
    } else {
      fs.symlinkSync(record.source, record.target, fs.statSync(record.source).isDirectory() ? "dir" : "file");
    }
    const projected = {
      ...record,
      status: "projected",
      mode: rendered === null ? options.mode : "render",
      source_hash: hashPath(record.source),
      target_hash: rendered === null && options.mode === "symlink" ? null : hashPath(record.target),
      timestamp: new Date().toISOString()
    };
    state.records = state.records.filter((entry) => entry.target !== record.target);
    state.records.push(projected);
    applied.push(projected);
  }
  if (errors.length === 0) {
    writeState(options.targetRoot, state);
  }
  return {
    command: "harness-project",
    ok: errors.length === 0,
    action: "project",
    target: options.targetRoot,
    scope: options.scope,
    mode: options.mode,
    conflict: options.conflict,
    summary: summarizePlan(applied),
    records: applied,
    errors,
    warnings
  };
}

function verifyProjection(plan, options) {
  const errors = [];
  const warnings = [];
  const state = readState(options.targetRoot);
  const records = plan.map((record) => {
    if (!record.target) {
      pushUnique(warnings, record.diagnostic);
      return { ...record, status: "unsupported" };
    }
    if (!fs.existsSync(record.target)) {
      errors.push(`${record.target}: missing projected target`);
      return { ...record, status: "missing" };
    }
    const stateRecord = state.records.find((entry) => entry.target === record.target);
    if (!stateRecord) {
      warnings.push(`${record.target}: exists but is not recorded in projection state`);
      return { ...record, status: "unmanaged" };
    }
    const expectedMode = expectedProjectionMode(record, options);
    if (stateRecord.mode !== expectedMode) {
      errors.push(`${record.target}: projection mode ${stateRecord.mode} does not match expected ${expectedMode}`);
      return { ...record, status: "mismatch" };
    }
    if (stateRecord.mode === "copy") {
      const actualHash = hashPath(record.target);
      if (actualHash !== stateRecord.target_hash) {
        errors.push(`${record.target}: copy target hash mismatch`);
        return { ...record, status: "mismatch" };
      }
    }
    if (stateRecord.mode === "render") {
      const actualHash = hashPath(record.target);
      if (actualHash !== stateRecord.target_hash) {
        errors.push(`${record.target}: rendered target hash mismatch`);
        return { ...record, status: "mismatch" };
      }
    }
    if (stateRecord.mode === "symlink") {
      const link = fs.lstatSync(record.target);
      if (!link.isSymbolicLink()) {
        errors.push(`${record.target}: expected symlink`);
        return { ...record, status: "mismatch" };
      }
      const resolved = path.resolve(path.dirname(record.target), fs.readlinkSync(record.target));
      if (resolved !== record.source) {
        errors.push(`${record.target}: symlink points to ${resolved}, expected ${record.source}`);
        return { ...record, status: "mismatch" };
      }
    }
    return { ...record, status: "verified" };
  });
  return {
    command: "harness-project",
    ok: errors.length === 0,
    action: "verify",
    target: options.targetRoot,
    scope: options.scope,
    mode: options.mode,
    conflict: options.conflict,
    summary: summarizePlan(records),
    records,
    errors,
    warnings
  };
}

function renderManagedContent(record) {
  if (record.content_kind === "agents") {
    return renderAgent(record);
  }
  if (record.content_kind === "hooks") {
    return renderHook(record);
  }
  return null;
}

function renderAgent(record) {
  const source = fs.readFileSync(record.source, "utf8");
  const body = stripFrontMatter(source).trimEnd();
  if (record.client === "codex") {
    return [
      `name = ${JSON.stringify(record.runtime_name)}`,
      `description = ${JSON.stringify(record.description ?? record.asset_id)}`,
      "developer_instructions = '''",
      body,
      "'''",
      ""
    ].join("\n");
  }
  const frontMatter = [
    "---",
    `name: ${record.runtime_name}`,
    `description: ${record.description ?? record.asset_id}`,
    "---",
    ""
  ].join("\n");
  return `${frontMatter}${body}\n`;
}

function renderHook(record) {
  const body = fs.readFileSync(record.source, "utf8").trim();
  return `${JSON.stringify(
    {
      id: record.asset_id,
      intent: record.intent,
      description: record.description,
      client: record.client,
      body
    },
    null,
    2
  )}\n`;
}

function stripFrontMatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function resolveOptions(args, config, manifest, target) {
  const clientsValue = args.values.get("clients") ?? config.clients?.join?.(",") ?? "all";
  const contentValue = args.values.get("content") ?? config.content?.join?.(",") ?? "all";
  const clients = clientsValue === "all"
    ? Object.keys(manifest.clients)
    : splitList(clientsValue).filter((client) => manifest.clients[client]);
  const allContent = ["rules", "tools", "templates", "skills", "commands", "agents", "hooks"];
  const content = contentValue === "all" ? allContent : splitList(contentValue);
  return {
    targetRoot: path.resolve(target),
    scope: args.values.get("scope") ?? config.scope ?? "project",
    clients,
    content,
    mode: args.values.get("mode") ?? config.mode ?? "copy",
    conflict: args.values.get("conflict") ?? config.conflict ?? "error",
    version: manifest.version
  };
}

function loadConfig(configPath) {
  if (!configPath) {
    return { config: null };
  }
  try {
    return { config: JSON.parse(fs.readFileSync(configPath, "utf8")) };
  } catch (error) {
    return { error: `cannot read config ${configPath}: ${error.message}` };
  }
}

function emitProjectResult(args, result) {
  if (hasFlag(args, "json")) {
    printJson(result);
    return;
  }
  process.stdout.write(`${result.command}: ${result.action} ${result.ok ? "ok" : "failed"}\n`);
  process.stdout.write(`summary: ${JSON.stringify(result.summary)}\n`);
  for (const error of result.errors) {
    process.stdout.write(`ERROR: ${error}\n`);
  }
  for (const warning of result.warnings) {
    process.stdout.write(`WARN: ${warning}\n`);
  }
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => CONTENT_ALIASES.get(item) ?? item);
}

function assetMatchesClients(asset, clients) {
  if (!asset.clients?.length) {
    return true;
  }
  return asset.clients.some((client) => clients.includes(client));
}

function renderTemplate(template, asset, client) {
  return template
    .replaceAll("<runtimeName>", asset.runtimeName ?? asset.id)
    .replaceAll("<assetId>", asset.id)
    .replaceAll("<client>", client);
}

function resolveTargetPath(rendered, targetRoot) {
  const target = rendered.startsWith("~/")
    ? path.join(os.homedir(), rendered.slice(2))
    : path.join(targetRoot, rendered);
  return stripTrailingSeparators(target);
}

function stripTrailingSeparators(target) {
  const parsed = path.parse(target);
  let normalized = target;
  while (normalized.length > parsed.root.length && /[/\\]$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function defaultSharedTarget(kind, asset) {
  if (kind === "tools") {
    return `tools/${asset.runtimeName ?? asset.id}`;
  }
  if (kind === "templates") {
    return `templates/${asset.runtimeName ?? asset.id}`;
  }
  return asset.target ?? `${kind}/${asset.runtimeName ?? asset.id}`;
}

function classifyConflict(record, state, options) {
  if (!fs.existsSync(record.target)) {
    return false;
  }
  const stateRecord = state.records.find((entry) => entry.target === record.target);
  if (!stateRecord) {
    return true;
  }
  if (stateRecord.mode !== expectedProjectionMode(record, options)) {
    return true;
  }
  if (stateRecord.mode === "copy") {
    return hashPath(record.target) !== stateRecord.target_hash;
  }
  if (stateRecord.mode === "symlink") {
    return !fs.lstatSync(record.target).isSymbolicLink();
  }
  return true;
}

function expectedProjectionMode(record, options) {
  if (record.content_kind === "agents" || record.content_kind === "hooks") {
    return "render";
  }
  return options.mode;
}

function readState(targetRoot) {
  const statePath = projectionStatePath(targetRoot);
  if (!fs.existsSync(statePath)) {
    return { records: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { records: [] };
  }
}

function writeState(targetRoot, state) {
  const statePath = projectionStatePath(targetRoot);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function projectionStatePath(targetRoot) {
  return path.join(targetRoot, ".harness", "projection-state.json");
}

function copyPath(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.cpSync(source, target, { recursive: true });
  } else {
    fs.copyFileSync(source, target);
  }
}

function removeTarget(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function backupTarget(target) {
  if (!fs.existsSync(target)) {
    return;
  }
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  fs.renameSync(target, `${target}.bak.${stamp}`);
}

function hashPath(target) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    const hash = crypto.createHash("sha256");
    const files = listFiles(target);
    for (const file of files) {
      const relPath = path.relative(target, file).split(path.sep).join("/");
      hash.update(relPath);
      hash.update("\0");
      hash.update(fs.readFileSync(file));
      hash.update("\0");
    }
    return hash.digest("hex");
  }
  return crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
}

function listFiles(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

function summarizePlan(records) {
  const summary = {
    total: records.length,
    rules: 0,
    tools: 0,
    templates: 0,
    skills: 0,
    commands: 0,
    agents: 0,
    hooks: 0,
    unsupported: 0
  };
  for (const record of records) {
    if (record.status === "unsupported") {
      summary.unsupported += 1;
    }
    if (record.content_kind in summary) {
      summary[record.content_kind] += 1;
    }
  }
  return summary;
}

function hookCapability(manifest, client, asset) {
  const capability = manifest.clients?.[client]?.capabilities?.hooks?.[asset.intent];
  if (capability === false || capability === undefined) {
    return {
      supported: false,
      diagnostic: `client ${client} does not support hook intent ${asset.intent}`
    };
  }
  return { supported: true, value: capability };
}

function commandCapability(manifest, client, scope) {
  const commands = manifest.clients?.[client]?.capabilities?.commands;
  const value = commands && typeof commands === "object" && !Array.isArray(commands)
    ? commands[scope]
    : commands;
  if (value === false || value === undefined) {
    return {
      supported: false,
      diagnostic: `client ${client} does not support ${scope} command projection`
    };
  }
  return { supported: true, value };
}

function commandCapabilityWarning(client, scope, value) {
  if (value === "deprecated") {
    return `client ${client} ${scope} command projection uses a deprecated client feature`;
  }
  return null;
}

function unsupportedCapabilityDiagnostics(manifest, options) {
  const diagnostics = [];
  if (options.content.includes("hooks")) {
    for (const client of options.clients) {
      const hooks = manifest.clients?.[client]?.capabilities?.hooks ?? {};
      for (const [intent, capability] of Object.entries(hooks)) {
        if (capability === false) {
          pushUnique(diagnostics, `client ${client} does not support hook intent ${intent}`);
        }
      }
    }
  }
  if (options.content.includes("commands")) {
    for (const client of options.clients) {
      const commands = manifest.clients?.[client]?.capabilities?.commands;
      const value = commands && typeof commands === "object" && !Array.isArray(commands)
        ? commands[options.scope]
        : commands;
      if (value === false || value === undefined) {
        pushUnique(diagnostics, `client ${client} does not support ${options.scope} command projection`);
      }
      const warning = commandCapabilityWarning(client, options.scope, value);
      if (warning) {
        pushUnique(diagnostics, warning);
      }
    }
  }
  return diagnostics;
}

function pushUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function helpText() {
  return [
    "harness-project --target <path>",
    "harness-project --target <path> --dry-run --json",
    "harness-project --target <path> --verify --json",
    "harness-project --target <path> --clients codex,claude,opencode,omp",
    "harness-project --target <path> --scope project|global",
    "harness-project --target <path> --content rules,tools,templates,skills,subagents,hooks,config",
    "harness-project --target <path> --mode copy|symlink (default: copy)",
    "harness-project --target <path> --conflict error|skip|overwrite|backup",
    "harness-project --target <path> --config <harness-project.json>",
    ""
  ].join("\n");
}
