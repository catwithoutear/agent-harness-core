import crypto from "node:crypto";

export const PROJECTION_STATE_SCHEMA_VERSION = 2;
export const DEFAULT_PACKAGE_NAME = "@catwithoutear/agent-harness-core";

const SUPPORTED_STRATEGIES = new Set([
  "materialize-copy",
  "materialize-render",
  "json-merge"
]);
const SUPPORTED_MODES = new Set(["copy", "render", "symlink", "json-merge"]);
const TOP_LEVEL_FIELDS = new Set(["schema_version", "package", "package_version", "operations"]);
const OPERATION_FIELDS = new Set([
  "id",
  "target",
  "strategy",
  "mode",
  "sources",
  "desired_hash",
  "renderer",
  "consumers",
  "managed_fragments",
  "introduced"
]);
const CONSUMER_FIELDS = new Set(["asset_id", "kind", "client", "scope"]);
const FRAGMENT_FIELDS = new Set([
  "identity",
  "event",
  "matcher",
  "recognition_hash",
  "prior_hash",
  "desired_hash"
]);

export class ProjectionStateError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProjectionStateError";
    this.code = code;
    this.details = details;
  }
}

export function projectionOperationId(strategy, target) {
  return crypto
    .createHash("sha256")
    .update(`projection-operation\0${strategy}\0${target}`)
    .digest("hex");
}

export function emptyProjectionState({
  packageName = DEFAULT_PACKAGE_NAME,
  packageVersion = "unknown"
} = {}) {
  return {
    schema_version: PROJECTION_STATE_SCHEMA_VERSION,
    package: packageName,
    package_version: packageVersion,
    operations: []
  };
}

export function normalizeProjectionState(raw, defaults = {}) {
  if (raw === undefined || raw === null) {
    return emptyProjectionState(defaults);
  }
  if (!isPlainObject(raw)) {
    throw stateError("projection-state-migration-invalid", "projection state must be an object");
  }

  if (raw.schema_version === PROJECTION_STATE_SCHEMA_VERSION) {
    return normalizeV2(raw);
  }
  if (raw.schema_version === undefined || raw.schema_version === 1) {
    if (Array.isArray(raw.records)) {
      return normalizeV1(raw, defaults);
    }
  }
  throw stateError(
    "projection-state-migration-invalid",
    "projection state must contain v2 operations or a v1 records array"
  );
}

export function serializeProjectionState(state) {
  const normalized = normalizeProjectionState(state);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function normalizeV1(raw, defaults) {
  const records = raw.records;
  const packageName = readPackageName(
    raw.package,
    records.find((record) => isPlainObject(record))?.package,
    defaults.packageName
  );
  const packageVersion = readPackageVersion(
    raw.package_version,
    raw.version,
    records.find((record) => isPlainObject(record))?.version,
    defaults.packageVersion
  );
  const seenTargets = new Set();
  const operations = records.map((record, index) => {
    const label = `records[${index}]`;
    if (!isPlainObject(record)) {
      throw stateError("projection-state-migration-invalid", `${label} must be an object`);
    }
    const target = requiredString(record.target, `${label}.target`);
    if (seenTargets.has(target)) {
      throw stateError(
        "projection-state-migration-invalid",
        `${label}.target duplicates another v1 record: ${target}`,
        { target }
      );
    }
    seenTargets.add(target);
    const source = requiredString(record.source, `${label}.source`);
    const assetId = requiredString(record.asset_id, `${label}.asset_id`);
    const kind = requiredString(record.content_kind ?? record.kind, `${label}.content_kind`);
    const client = requiredString(record.client, `${label}.client`);
    const scope = typeof record.scope === "string" && record.scope.length > 0
      ? record.scope
      : defaults.scope ?? "project";
    const mode = requiredMode(record.mode, `${label}.mode`);
    const sourceHash = requiredHash(record.source_hash, `${label}.source_hash`);
    const desiredHash = mode === "symlink"
      ? null
      : requiredHash(record.target_hash, `${label}.target_hash`);
    const strategy = mode === "render" ? "materialize-render" : "materialize-copy";
    const operation = {
      id: projectionOperationId(strategy, target),
      target,
      strategy,
      mode,
      sources: [{ path: source, hash: sourceHash }],
      desired_hash: desiredHash,
      renderer: record.renderer === undefined
        ? legacyRenderer(kind, client)
        : nullableString(record.renderer, `${label}.renderer`),
      consumers: [{ asset_id: assetId, kind, client, scope }]
    };
    return normalizeOperation(operation, `v1 ${label}`);
  });

  return {
    schema_version: PROJECTION_STATE_SCHEMA_VERSION,
    package: packageName,
    package_version: packageVersion,
    operations: sortOperations(operations)
  };
}

function legacyRenderer(kind, client) {
  if (kind === "agents") {
    return `${client}-agent@1`;
  }
  if (kind === "hooks") {
    return "hook-descriptor@1";
  }
  return null;
}

function normalizeV2(raw) {
  rejectUnknownFields(raw, TOP_LEVEL_FIELDS, "projection state");
  const packageName = requiredString(raw.package, "package");
  const packageVersion = requiredString(raw.package_version, "package_version");
  if (!Array.isArray(raw.operations)) {
    throw stateError("projection-state-migration-invalid", "operations must be an array");
  }
  const operations = raw.operations.map((operation, index) =>
    normalizeOperation(operation, `operations[${index}]`)
  );
  const seenTargets = new Set();
  for (const operation of operations) {
    if (seenTargets.has(operation.target)) {
      throw stateError(
        "projection-state-migration-invalid",
        `operations contains duplicate target: ${operation.target}`,
        { target: operation.target }
      );
    }
    seenTargets.add(operation.target);
  }
  return {
    schema_version: PROJECTION_STATE_SCHEMA_VERSION,
    package: packageName,
    package_version: packageVersion,
    operations: sortOperations(operations)
  };
}

function normalizeOperation(operation, label) {
  if (!isPlainObject(operation)) {
    throw stateError("projection-state-migration-invalid", `${label} must be an object`);
  }
  rejectUnknownFields(operation, OPERATION_FIELDS, label);
  const id = requiredString(operation.id, `${label}.id`);
  const target = requiredString(operation.target, `${label}.target`);
  const strategy = requiredString(operation.strategy, `${label}.strategy`);
  const mode = requiredMode(operation.mode, `${label}.mode`);
  if (!SUPPORTED_STRATEGIES.has(strategy)) {
    throw stateError("projection-state-migration-invalid", `${label}.strategy is unsupported: ${strategy}`);
  }
  if (!SUPPORTED_MODES.has(mode)) {
    throw stateError("projection-state-migration-invalid", `${label}.mode is unsupported: ${mode}`);
  }
  if (strategy === "materialize-copy" && !["copy", "symlink"].includes(mode)) {
    throw stateError("projection-state-migration-invalid", `${label} has incompatible copy strategy/mode`);
  }
  if (strategy === "materialize-render" && mode !== "render") {
    throw stateError("projection-state-migration-invalid", `${label} has incompatible render strategy/mode`);
  }
  if (strategy === "json-merge" && mode !== "json-merge") {
    throw stateError("projection-state-migration-invalid", `${label} has incompatible merge strategy/mode`);
  }
  if (id !== projectionOperationId(strategy, target)) {
    throw stateError(
      "projection-state-migration-invalid",
      `${label}.id does not match strategy and target`,
      { target, strategy, expected: projectionOperationId(strategy, target), observed: id }
    );
  }

  if (!Array.isArray(operation.sources) || operation.sources.length === 0) {
    throw stateError("projection-state-migration-invalid", `${label}.sources must be a non-empty array`);
  }
  const sources = operation.sources.map((source, index) => normalizeSource(source, `${label}.sources[${index}]`));
  const desiredHash = mode === "symlink"
    ? nullableHash(operation.desired_hash, `${label}.desired_hash`)
    : requiredHash(operation.desired_hash, `${label}.desired_hash`);
  const renderer = nullableString(operation.renderer, `${label}.renderer`);
  if (!Array.isArray(operation.consumers) || operation.consumers.length === 0) {
    throw stateError("projection-state-migration-invalid", `${label}.consumers must be a non-empty array`);
  }
  const consumers = sortConsumers(
    operation.consumers.map((consumer, index) => normalizeConsumer(consumer, `${label}.consumers[${index}]`))
  );
  const normalized = {
    id,
    target,
    strategy,
    mode,
    sources: sortSources(sources),
    desired_hash: desiredHash,
    renderer,
    consumers
  };

  if (operation.managed_fragments !== undefined) {
    if (strategy !== "json-merge" || !Array.isArray(operation.managed_fragments)) {
      throw stateError(
        "projection-state-migration-invalid",
        `${label}.managed_fragments is only valid as an array on json-merge operations`
      );
    }
    normalized.managed_fragments = operation.managed_fragments
      .map((fragment, index) => normalizeFragment(fragment, `${label}.managed_fragments[${index}]`))
      .sort(compareFragments);
  }
  if (operation.introduced !== undefined) {
    if (strategy !== "json-merge" || !isPlainObject(operation.introduced)) {
      throw stateError(
        "projection-state-migration-invalid",
        `${label}.introduced is only valid as an object on json-merge operations`
      );
    }
    rejectUnknownFields(operation.introduced, new Set(["hooks_enabled"]), `${label}.introduced`);
    if (typeof operation.introduced.hooks_enabled !== "boolean") {
      throw stateError(
        "projection-state-migration-invalid",
        `${label}.introduced.hooks_enabled must be a boolean`
      );
    }
    normalized.introduced = { hooks_enabled: operation.introduced.hooks_enabled };
  }
  return normalized;
}

function normalizeSource(source, label) {
  if (!isPlainObject(source)) {
    throw stateError("projection-state-migration-invalid", `${label} must be an object`);
  }
  rejectUnknownFields(source, new Set(["path", "hash"]), label);
  const path = requiredString(source.path, `${label}.path`);
  const hash = requiredHash(source.hash, `${label}.hash`);
  return { path, hash };
}

function normalizeConsumer(consumer, label) {
  if (!isPlainObject(consumer)) {
    throw stateError("projection-state-migration-invalid", `${label} must be an object`);
  }
  rejectUnknownFields(consumer, CONSUMER_FIELDS, label);
  return {
    asset_id: requiredString(consumer.asset_id, `${label}.asset_id`),
    kind: requiredString(consumer.kind, `${label}.kind`),
    client: requiredString(consumer.client, `${label}.client`),
    scope: requiredString(consumer.scope, `${label}.scope`)
  };
}

function normalizeFragment(fragment, label) {
  if (!isPlainObject(fragment)) {
    throw stateError("projection-state-migration-invalid", `${label} must be an object`);
  }
  rejectUnknownFields(fragment, FRAGMENT_FIELDS, label);
  return {
    identity: requiredString(fragment.identity, `${label}.identity`),
    event: requiredString(fragment.event, `${label}.event`),
    matcher: fragment.matcher === null ? null : nullableString(fragment.matcher, `${label}.matcher`),
    recognition_hash: requiredHash(fragment.recognition_hash, `${label}.recognition_hash`),
    prior_hash: nullableHash(fragment.prior_hash, `${label}.prior_hash`),
    desired_hash: requiredHash(fragment.desired_hash, `${label}.desired_hash`)
  };
}

function readPackageName(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? DEFAULT_PACKAGE_NAME;
}

function readPackageVersion(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "unknown";
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw stateError("projection-state-migration-invalid", `${label} must be a non-empty string`);
  }
  return value;
}

function nullableString(value, label) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw stateError("projection-state-migration-invalid", `${label} must be a string or null`);
  }
  return value;
}

function requiredHash(value, label) {
  return requiredString(value, label);
}

function nullableHash(value, label) {
  if (value === null || value === undefined) {
    return null;
  }
  return requiredHash(value, label);
}

function requiredMode(value, label) {
  const mode = requiredString(value, label);
  if (!SUPPORTED_MODES.has(mode)) {
    throw stateError("projection-state-migration-invalid", `${label} is unsupported: ${mode}`);
  }
  return mode;
}

function rejectUnknownFields(value, allowed, label) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw stateError("projection-state-migration-invalid", `${label}.${field} is not supported`);
    }
  }
}

function sortOperations(operations) {
  return [...operations].sort((left, right) =>
    left.target.localeCompare(right.target) || left.id.localeCompare(right.id)
  );
}

function sortSources(sources) {
  return [...sources].sort((left, right) => left.path.localeCompare(right.path) || left.hash.localeCompare(right.hash));
}

function sortConsumers(consumers) {
  return [...consumers].sort((left, right) =>
    consumerKey(left).localeCompare(consumerKey(right))
  );
}

function compareFragments(left, right) {
  return left.identity.localeCompare(right.identity);
}

function consumerKey(consumer) {
  return [consumer.asset_id, consumer.kind, consumer.client, consumer.scope].join("\0");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stateError(code, message, details = {}) {
  return new ProjectionStateError(code, message, details);
}
