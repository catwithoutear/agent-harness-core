import fs from "node:fs";
import path from "node:path";

const SUPPORTED_CLIENTS = new Set(["codex", "claude", "opencode", "omp"]);
const SKILL_CATEGORIES = new Set([
  "entry",
  "workflow",
  "change",
  "knowledge",
  "operations",
  "review",
  "third-party"
]);
const SKILL_AUDIENCES = new Set(["user", "model"]);
const AGENT_KINDS = new Set(["coordinator", "specialist"]);
const TEMPLATE_VARIABLES = new Set(["runtimeName", "assetId", "client"]);
const COMMAND_RUNTIME_NAME_RE = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+$/;
const D_BACKUP_ONLY_TOKENS = [
  "DBackup",
  "dbackup2",
  "dbackup3",
  "dbackup-change-",
  "quick-project",
  "Redmine",
  "Jenkins",
  "Pi default"
];

export function loadManifest(packageRoot) {
  const manifestPath = path.join(packageRoot, "harness.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return { manifest, manifestPath };
}

export function validateManifest(manifest, options = {}) {
  const packageRoot = options.packageRoot ?? process.cwd();
  const errors = [];
  const warnings = [];

  requireString(manifest, "name", errors);
  requireString(manifest, "version", errors);
  requireObject(manifest, "clients", errors);
  requireObject(manifest, "commands", errors);
  requireObject(manifest, "assets", errors);

  const clients = manifest.clients && typeof manifest.clients === "object"
    ? manifest.clients
    : {};
  for (const [clientId, descriptor] of Object.entries(clients)) {
    if (!SUPPORTED_CLIENTS.has(clientId)) {
      errors.push(`unsupported client: ${clientId}`);
    }
    validateClientDescriptor(clientId, descriptor, errors);
  }

  const clientIds = new Set(Object.keys(clients));
  const assets = manifest.assets && typeof manifest.assets === "object"
    ? manifest.assets
    : {};
  const projectedTargets = new Map();

  validateRules(assets.rules, { packageRoot, clientIds, errors });
  validateCommands(assets.commands, {
    packageRoot,
    clientIds,
    errors,
    projectedTargets,
    clients
  });
  validateSkills(assets.skills, {
    packageRoot,
    clientIds,
    errors,
    warnings,
    projectedTargets,
    clients
  });
  validateAgents(assets.agents, {
    packageRoot,
    clientIds,
    errors,
    projectedTargets,
    clients
  });
  validateHooks(assets.hooks, { packageRoot, clientIds, errors });
  validateTemplates(assets.templates, { packageRoot, clientIds, errors });
  validateOptionalArray(assets.tools, "assets.tools", errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      clients: clientIds.size,
      rules: countArray(assets.rules),
      commands: countArray(assets.commands),
      skills: countArray(assets.skills),
      agents: countArray(assets.agents),
      hooks: countArray(assets.hooks),
      templates: countArray(assets.templates),
      tools: countArray(assets.tools)
    }
  };
}

export function validateCurrentManifest(packageRoot = process.cwd()) {
  const { manifest, manifestPath } = loadManifest(packageRoot);
  return {
    manifestPath,
    ...validateManifest(manifest, { packageRoot })
  };
}

function validateClientDescriptor(clientId, descriptor, errors) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    errors.push(`client ${clientId} descriptor must be an object`);
    return;
  }
  requireObject(descriptor, "targets", errors, `client ${clientId}`);
  requireObject(descriptor, "capabilities", errors, `client ${clientId}`);
  validateClientCapabilities(clientId, descriptor.capabilities, errors);

  const targets = descriptor.targets ?? {};
  for (const scope of ["project", "global"]) {
    const scopeTargets = targets[scope];
    if (!scopeTargets || typeof scopeTargets !== "object" || Array.isArray(scopeTargets)) {
      errors.push(`client ${clientId} targets.${scope} must be an object`);
      continue;
    }
    for (const [kind, templates] of Object.entries(scopeTargets)) {
      if (!Array.isArray(templates) || templates.length === 0) {
        errors.push(`client ${clientId} targets.${scope}.${kind} must be a non-empty array`);
        continue;
      }
      for (const template of templates) {
        validateTargetTemplate(`client ${clientId} targets.${scope}.${kind}`, template, errors);
      }
    }
  }
}

function validateClientCapabilities(clientId, capabilities, errors) {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    return;
  }
  validateProjectionCapability(`client ${clientId} capabilities.commands`, capabilities.commands, errors);
}

function validateProjectionCapability(label, value, errors) {
  if (value === undefined) {
    return;
  }
  if (isCapabilityValue(value)) {
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be a boolean, status string, or scope object`);
    return;
  }
  for (const scope of ["project", "global"]) {
    if (!(scope in value)) {
      errors.push(`${label}.${scope} must be declared`);
      continue;
    }
    if (!isCapabilityValue(value[scope])) {
      errors.push(`${label}.${scope} must be a boolean or status string`);
    }
  }
}

function isCapabilityValue(value) {
  return typeof value === "boolean" || value === "warning" || value === "deprecated" || value === "source-confirmed";
}

function validateRules(rules, context) {
  validateOptionalArray(rules, "assets.rules", context.errors);
  for (const rule of rules ?? []) {
    requireAssetFields(rule, "rule", context);
  }
}

function validateCommands(commands, context) {
  validateOptionalArray(commands, "assets.commands", context.errors);
  for (const command of commands ?? []) {
    requireAssetFields(command, "command", context);
    if (!COMMAND_RUNTIME_NAME_RE.test(command.runtimeName ?? "")) {
      context.errors.push(`command ${command.id} runtimeName must be namespaced like namespace/name`);
    }
    validateProjectionCollisions(command, "commands", context);
  }
}

function validateSkills(skills, context) {
  validateOptionalArray(skills, "assets.skills", context.errors);
  for (const skill of skills ?? []) {
    requireAssetFields(skill, "skill", context);
    if (!isKebabCase(skill.runtimeName)) {
      context.errors.push(`skill ${skill.id} runtimeName must be kebab-case`);
    }
    if (!SKILL_CATEGORIES.has(skill.category)) {
      context.errors.push(`skill ${skill.id} has unsupported category: ${skill.category}`);
    }
    if (!SKILL_AUDIENCES.has(skill.audience)) {
      context.errors.push(`skill ${skill.id} has unsupported audience: ${skill.audience}`);
    }
    if (!Array.isArray(skill.triggers) || skill.triggers.length === 0) {
      context.errors.push(`skill ${skill.id} must declare triggers`);
    }
    validateProjectionCollisions(skill, "skills", context);
  }
}

function validateAgents(agents, context) {
  validateOptionalArray(agents, "assets.agents", context.errors);
  for (const agent of agents ?? []) {
    requireAssetFields(agent, "agent", context);
    if (!isKebabCase(agent.runtimeName)) {
      context.errors.push(`agent ${agent.id} runtimeName must be kebab-case`);
    }
    if (!AGENT_KINDS.has(agent.kind)) {
      context.errors.push(`agent ${agent.id} has unsupported kind: ${agent.kind}`);
    }
    validateProjectionCollisions(agent, "agents", context);
  }
}

function validateTemplates(templates, context) {
  validateOptionalArray(templates, "assets.templates", context.errors);
  for (const template of templates ?? []) {
    requireAssetFields(template, "template", context);
    if (typeof template.target !== "string" || template.target.length === 0) {
      context.errors.push(`template ${template.id} must declare target`);
    }
  }
}

function validateHooks(hooks, context) {
  validateOptionalArray(hooks, "assets.hooks", context.errors);
  for (const hook of hooks ?? []) {
    requireAssetFields(hook, "hook", context);
    if (typeof hook.intent !== "string" || hook.intent.length === 0) {
      context.errors.push(`hook ${hook.id ?? "<unknown>"} must declare intent`);
    }
  }
}

function requireAssetFields(asset, kind, context) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    context.errors.push(`${kind} asset must be an object`);
    return;
  }
  for (const field of ["id", "source", "description", "clients"]) {
    if (field === "clients") {
      if (!Array.isArray(asset.clients) || asset.clients.length === 0) {
        context.errors.push(`${kind} ${asset.id ?? "<unknown>"} must declare clients`);
      }
      continue;
    }
    if (typeof asset[field] !== "string" || asset[field].length === 0) {
      context.errors.push(`${kind} ${asset.id ?? "<unknown>"} must declare ${field}`);
    }
  }
  for (const client of asset.clients ?? []) {
    if (!context.clientIds.has(client)) {
      context.errors.push(`${kind} ${asset.id} references unknown client: ${client}`);
    }
  }
  if (typeof asset.source === "string") {
    const sourcePath = path.join(context.packageRoot, asset.source);
    if (!fs.existsSync(sourcePath)) {
      context.errors.push(`${kind} ${asset.id} source is missing: ${asset.source}`);
    }
    for (const token of D_BACKUP_ONLY_TOKENS) {
      if (asset.source.includes(token)) {
        context.errors.push(`${kind} ${asset.id} source contains project-only token: ${token}`);
      }
    }
  }
}

function validateProjectionCollisions(asset, kind, context) {
  for (const clientId of asset.clients ?? []) {
    const templates = context.clients[clientId]?.targets?.project?.[kind] ?? [];
    for (const template of templates) {
      const rendered = template
        .replaceAll("<runtimeName>", asset.runtimeName)
        .replaceAll("<assetId>", asset.id)
        .replaceAll("<client>", clientId);
      const key = `${clientId}:${rendered}`;
      const existing = context.projectedTargets.get(key);
      if (existing) {
        context.errors.push(`projection collision: ${asset.id} and ${existing} both target ${key}`);
      } else {
        context.projectedTargets.set(key, asset.id);
      }
    }
  }
}

function validateTargetTemplate(label, template, errors) {
  if (typeof template !== "string" || template.length === 0) {
    errors.push(`${label} target template must be a string`);
    return;
  }
  const matches = template.matchAll(/<([^>]+)>/g);
  for (const match of matches) {
    if (!TEMPLATE_VARIABLES.has(match[1])) {
      errors.push(`${label} target template uses unsupported variable: ${match[1]}`);
    }
  }
}

function requireString(object, field, errors, prefix = "manifest") {
  if (typeof object?.[field] !== "string" || object[field].length === 0) {
    errors.push(`${prefix} must declare string ${field}`);
  }
}

function requireObject(object, field, errors, prefix = "manifest") {
  if (!object?.[field] || typeof object[field] !== "object" || Array.isArray(object[field])) {
    errors.push(`${prefix} must declare object ${field}`);
  }
}

function validateOptionalArray(value, label, errors) {
  if (value !== undefined && !Array.isArray(value)) {
    errors.push(`${label} must be an array`);
  }
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function isKebabCase(value) {
  return typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}
