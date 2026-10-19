import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasFlag, parseArgs, printJson } from "../cli/args.js";
import { loadManifest, validateManifest } from "../manifest/validate.js";
import { compileProjectionOperations } from "./operations.js";
import {
  emptyProjectionState,
  normalizeProjectionState,
  projectionOperationId,
  serializeProjectionState
} from "./projection-state.js";
import {
  buildZCodeAdapterOperation,
  planZCodeHookMerge,
  verifyZCodeHookMerge,
  zcodeHookIdentity
} from "./zcode-hooks.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARED_KINDS = new Set(["rules", "templates", "tools"]);
const CONTENT_ALIASES = new Map([["subagents", "agents"]]);
const ZCODE_CONFIG_RENDERER = "zcode-hooks@1";
const ZCODE_PRESERVED_AGENT_METADATA = new Set([
  "model",
  "thinking",
  "reasoningEffort",
  "reasoning_effort",
  "model_reasoning_effort",
  "reasoning",
  "effort"
]);
const DEFAULT_STAGING_FILE_MODE = 0o600;
const DEFAULT_STAGING_DIRECTORY_MODE = 0o700;

class ProjectionTransactionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProjectionTransactionError";
    this.code = code;
    this.details = details;
  }
}

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
    result = dryRunProjection(plan, options, manifest);
  } else if (hasFlag(args, "verify")) {
    result = verifyProjection(plan, options, null, manifest);
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
      if (assetKind === "skills" && !skillMatchesSelection(asset, options)) {
        continue;
      }
      for (const client of options.clients) {
        if (!asset.clients?.includes(client)) {
          continue;
        }
        let hookMetadata;
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
          hookMetadata = capability.value;
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
          records.push(recordFor(
            assetKind,
            asset,
            client,
            targetTemplate,
            options,
            hookMetadata
          ));
        }
      }
    }
  }
  return records;
}

function recordFor(kind, asset, client, targetTemplate, options, metadata = undefined) {
  const rendered = renderTemplate(targetTemplate, asset, client);
  const zcodeHook = kind === "hooks" && client === "zcode";
  const targetTemplateWithoutFragment = zcodeHook
    ? rendered.split("#", 1)[0]
    : rendered;
  const target = resolveTargetPath(targetTemplateWithoutFragment, options.targetRoot);
  const source = path.join(packageRoot, asset.source);
  return {
    package: "@catwithoutear/agent-harness-core",
    version: options.version,
    asset_id: asset.id,
    runtime_name: asset.runtimeName ?? asset.id,
    content_kind: kind,
    client,
    scope: options.scope,
    source,
    target,
    mode: zcodeHook ? "json-merge" : options.mode,
    strategy: zcodeHook ? "json-merge" : undefined,
    renderer: zcodeHook ? ZCODE_CONFIG_RENDERER : undefined,
    description: asset.description,
    intent: asset.intent,
    metadata: zcodeHook ? metadata : undefined,
    status: "planned"
  };
}

function preflightProjectionConfinement(plan, options, io = fs) {
  const targets = [{
    target: projectionStatePath(options.targetRoot),
    root: path.resolve(options.targetRoot)
  }];
  for (const binding of plan.filter(isZCodeHookBinding)) {
    const root = zcodeConfinementRoot(binding.scope, options.targetRoot);
    targets.push(
      { target: binding.target, root },
      { target: zcodeAdapterTarget(binding.target, binding.scope, binding.intent), root }
    );
  }
  const seen = new Set();
  for (const { target, root } of targets) {
    const key = `${root}\0${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assertProjectionConfinement(target, root, io);
  }
}

function assertProjectionConfinement(target, root, io = fs) {
  const absoluteTarget = path.resolve(target);
  const absoluteRoot = path.resolve(root);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw projectionConfinementError(target, "path escapes projection root");
  }

  const components = relative ? relative.split(path.sep) : [];
  let current = absoluteRoot;
  for (let index = -1; index < components.length; index += 1) {
    if (index >= 0) {
      current = path.join(current, components[index]);
    }
    let stat;
    try {
      stat = io.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }
      if (error?.code === "ENOTDIR") {
        throw projectionConfinementError(target, "path component is not a directory");
      }
      throw projectionConfinementError(target, "path cannot be inspected");
    }
    if (stat.isSymbolicLink()) {
      throw projectionConfinementError(target, "path contains a symbolic link");
    }
    if (index < components.length - 1 && !stat.isDirectory()) {
      throw projectionConfinementError(target, "path component is not a directory");
    }
  }
}

function projectionConfinementError(target, reason) {
  return new ProjectionTransactionError(
    "projection-target-confinement",
    `${target}: projection target is not confined (${reason})`,
    { target }
  );
}

function dryRunProjection(plan, options, manifest) {
  const warnings = unsupportedCapabilityDiagnostics(manifest, options);
  if (plan.some(isZCodeHookBinding)) {
    try {
      preflightProjectionConfinement(plan, options, fs);
      const stateResult = readState(options.targetRoot, options, fs);
      if (stateResult.error) {
        return projectionFailure("dry-run", options, plan, stateResult.error, warnings);
      }
      const regularBindings = plan.filter((binding) => !isZCodeHookBinding(binding));
      const regularResult = compileProjectionOperations(regularBindings);
      preflightZCodeAgentOperations(regularResult.selectedOperations ?? regularResult, fs);
      const zcodeBindings = plan.filter(isZCodeHookBinding);
      const zcode = prepareZCodeOperations(
        zcodeBindings,
        options,
        stateResult.state,
        fs,
        manifest
      );
      if (zcode.errors.length > 0) {
        return projectionResult(
          "dry-run",
          options,
          plan,
          [],
          [],
          zcode.errors,
          [...warnings, ...zcode.warnings]
        );
      }
      const selected = [
        ...(regularResult.selectedOperations ?? regularResult),
        ...zcode.adapters.map(({ operation }) => operation),
        ...(zcode.config ? [zcode.config.operation] : [])
      ].sort(compareOperations);
      return projectionResult(
        "dry-run",
        options,
        plan,
        selected,
        selected.map((operation) => operationResult(operation, "planned")),
        [],
        [...warnings, ...zcode.warnings]
      );
    } catch (error) {
      return projectionFailure("dry-run", options, plan, error, warnings);
    }
  }
  try {
    const operations = compileProjectionOperations(plan);
    const selected = operations.selectedOperations ?? operations;
    preflightZCodeAgentOperations(selected, fs);
    return {
      command: "harness-project",
      ok: true,
      action: "dry-run",
      target: options.targetRoot,
      scope: options.scope,
      mode: options.mode,
      conflict: options.conflict,
      summary: summarizePlan(plan, selected),
      records: [...selected.map((operation) => operationResult(operation, "planned")), ...unsupportedRecords(plan, warnings)],
      errors: [],
      warnings
    };
  } catch (error) {
    return projectionFailure("dry-run", options, plan, error, warnings);
  }
}

function preflightZCodeAgentOperations(operations, io) {
  for (const operation of operations.filter(isZCodeAgentOperation)) {
    renderManagedContent(operationRepresentative(operation), io);
  }
}

function applyProjection(plan, options, manifest) {
  return applyProjectionTransaction(plan, options, manifest);
}

/**
 * Apply a projection through one target/state transaction.  `fsOverrides` is
 * deliberately an internal test seam: callers can replace individual fs
 * operations without changing the CLI or touching real user configuration.
 */
export function applyProjectionTransaction(plan, options, manifest, fsOverrides = null) {
  const io = fsOverrides ? { ...fs, ...fsOverrides } : fs;
  const warnings = unsupportedCapabilityDiagnostics(manifest, options);
  try {
    preflightProjectionConfinement(plan, options, io);
  } catch (error) {
    return projectionFailure("project", options, plan, error, warnings);
  }
  const stateResult = readState(options.targetRoot, options, io);
  if (stateResult.error) {
    return projectionFailure("project", options, plan, stateResult.error, warnings);
  }

  let preparedPlan;
  try {
    preparedPlan = prepareProjection(plan, options, stateResult.state, io, manifest);
  } catch (error) {
    return projectionFailure("project", options, plan, error, warnings);
  }
  const selected = preparedPlan.operations;
  const errors = preparedPlan.errors;
  if (errors.length > 0) {
    return projectionResult(
      "project",
      options,
      plan,
      selected,
      preparedPlan.records,
      errors,
      [...warnings, ...preparedPlan.warnings]
    );
  }

  try {
    preflightProjectionConfinement(plan, options, io);
  } catch (error) {
    return projectionFailure("project", options, plan, error, warnings);
  }

  const finalState = buildFinalState(stateResult.state, preparedPlan);
  let serializedState;
  try {
    serializedState = serializeProjectionState(finalState);
  } catch (error) {
    return projectionFailure("project", options, plan, error, warnings);
  }

  const transaction = {
    operations: preparedPlan.stagedOperations,
    confinementRoot: path.resolve(options.targetRoot),
    state: {
      target: projectionStatePath(options.targetRoot),
      desiredText: serializedState,
      desiredHash: sha256(serializedState),
      sourceHash: null
    }
  };
  const transactionResult = commitProjectionTransaction(transaction, io);
  const transactionRecords = applyTransactionRecordStatuses(
    preparedPlan.records,
    transactionResult.recordStatuses
  );
  if (!transactionResult.ok) {
    return projectionResult(
      "project",
      options,
      plan,
      selected,
      transactionRecords,
      [transactionFailureMessage(transactionResult.error)],
      [...warnings, ...preparedPlan.warnings]
    );
  }

  return projectionResult(
    "project",
    options,
    plan,
    selected,
    transactionRecords,
    [],
    [...warnings, ...preparedPlan.warnings]
  );
}

function prepareProjection(plan, options, priorState, io, manifest = null) {
  const zcodeBindings = plan.filter(isZCodeHookBinding);
  const regularBindings = plan.filter((binding) => !isZCodeHookBinding(binding));
  const errors = [];
  const warnings = [];
  const stagedOperations = [];
  const operations = [];
  const records = [];

  const regularResult = compileProjectionOperations(regularBindings, priorState);
  const regularSelected = regularResult.selectedOperations ?? regularResult;
  for (const operation of regularSelected) {
    const prepared = prepareMaterializedOperation(operation, priorState, options, io);
    if (prepared.error) {
      errors.push(prepared.error);
      continue;
    }
    operations.push(prepared.operation);
    if (prepared.conflict && options.conflict === "error") {
      errors.push(`${operation.target}: existing unmanaged or modified target`);
      records.push(operationResult(operation, "planned"));
      continue;
    }
    if (prepared.conflict && options.conflict === "skip") {
      records.push(operationResult(operation, "skipped"));
      continue;
    }
    stagedOperations.push(prepared.descriptor);
    records.push(operationResult(prepared.operation, "planned", prepared.sourceHash, prepared.desiredHash));
  }

  let zcode;
  if (zcodeBindings.length > 0) {
    zcode = prepareZCodeOperations(zcodeBindings, options, priorState, io, manifest);
    warnings.push(...zcode.warnings);
    errors.push(...zcode.errors);
    const skipZCodeGroup = options.conflict === "skip" && zcode.adapters.some((adapter) => adapter.conflict);
    for (const adapter of zcode.adapters) {
      operations.push(adapter.operation);
      if (adapter.conflict && options.conflict === "error") {
        errors.push(`${adapter.operation.target}: existing unmanaged or modified target`);
        records.push(operationResult(adapter.operation, "planned"));
        continue;
      }
      if (skipZCodeGroup) {
        records.push(operationResult(adapter.operation, "skipped"));
        continue;
      }
      stagedOperations.push(adapter.descriptor);
      records.push(operationResult(adapter.operation, "planned", adapter.sourceHash, adapter.desiredHash));
    }
    if (zcode.config) {
      operations.push(zcode.config.operation);
      if (skipZCodeGroup) {
        records.push(operationResult(zcode.config.operation, "skipped"));
      } else {
        stagedOperations.push(zcode.config.descriptor);
        records.push(operationResult(
          zcode.config.operation,
          "planned",
          zcode.config.sourceHash,
          zcode.config.desiredHash
        ));
      }
    }
  }

  return {
    operations: operations.sort(compareOperations),
    stagedOperations: stagedOperations.sort(compareStagedOperations),
    records,
    errors,
    warnings,
    version: options.version,
  };
}

function prepareMaterializedOperation(operation, priorState, options, io) {
  const source = operation.sources[0]?.path;
  if (!source || !pathExists(source, io)) {
    return { error: `${operation.asset_id}: source missing: ${source}` };
  }
  let rendered = null;
  let sourceHash;
  let desiredHash;
  try {
    rendered = operation.mode === "render"
      ? renderManagedContent(operationRepresentative(operation), io)
      : null;
    sourceHash = hashPath(source, io);
    desiredHash = operation.mode === "symlink"
      ? null
      : rendered !== null
        ? managedRenderedHash(operation, rendered)
        : sourceHash;
  } catch (error) {
    return { error: `${operation.target}: cannot prepare projection: ${safeErrorMessage(error)}` };
  }
  const plannedOperation = {
    ...operation,
    sources: [{ path: source, hash: sourceHash }],
    desired_hash: desiredHash
  };
  const conflict = classifyConflict(plannedOperation, priorState, options, io);
  return {
    operation: plannedOperation,
    conflict,
    sourceHash,
    desiredHash,
    descriptor: {
      operation: plannedOperation,
      desiredText: rendered,
      desiredSource: rendered === null && operation.mode !== "symlink" ? source : null,
      desiredKind: operation.mode === "symlink"
        ? "symlink"
        : rendered !== null
          ? "file"
          : sourceKind(source, io),
      preserveBackup: conflict && options.conflict === "backup",
      sourceHash,
      desiredHash,
      target: plannedOperation.target
    }
  };
}

function prepareZCodeOperations(bindings, options, priorState, io, manifest = null) {
  const errors = [];
  const warnings = [];
  const adapterBindings = [];
  for (const binding of bindings) {
    const source = binding.source;
    if (!source || !pathExists(source, io)) {
      errors.push(`${binding.asset_id}: source missing: ${source}`);
      continue;
    }
    try {
      const adapter = buildZCodeAdapterOperation({
        ...binding,
        body: io.readFileSync(source, "utf8"),
        adapter_target: zcodeAdapterTarget(binding.target, binding.scope, binding.intent),
        metadata: binding.metadata
      });
      adapterBindings.push({
        ...adapter,
        source_hash: adapter.sources[0].hash,
        managed_fragments: undefined
      });
    } catch (error) {
      errors.push(`${binding.target}: cannot prepare ZCode adapter: ${safeErrorMessage(error)}`);
    }
  }
  if (errors.length > 0) {
    return { adapters: [], config: null, errors, warnings };
  }

  const compiled = compileProjectionOperations(adapterBindings, priorState);
  const selectedAdapters = compiled.selectedOperations ?? compiled;
  const adapters = selectedAdapters.map((operation) => {
    const sourceHash = operation.sources[0].hash;
    const desiredHash = operation.desired_hash;
    const conflict = classifyConflict(operation, priorState, options, io);
    return {
      operation,
      conflict,
      sourceHash,
      desiredHash,
      descriptor: {
        operation,
        desiredText: operation.desired_text,
        desiredSource: null,
        desiredKind: "file",
        preserveBackup: conflict && options.conflict === "backup",
        sourceHash,
        desiredHash,
        target: operation.target,
        confinementRoot: zcodeConfinementRoot(operation.scope, options.targetRoot)
      }
    };
  });

  const configTarget = bindings[0]?.target;
  const configRecord = priorState.operations.find((operation) => operation.target === configTarget);
  if (configRecord && !isCompatibleZCodeConfigRecord(
    configRecord,
    configTarget,
    options,
    bindings,
    adapters,
    manifest
  )) {
    throw new ProjectionTransactionError(
      "projection-target-collision",
      `${configTarget}: incompatible prior operation cannot be used for ZCode Hook merge`,
      { target: configTarget }
    );
  }
  let currentText = null;
  if (configTarget && pathExists(configTarget, io)) {
    try {
      currentText = io.readFileSync(configTarget, "utf8");
    } catch (error) {
      errors.push(`${configTarget}: cannot read ZCode config: ${safeErrorMessage(error)}`);
    }
  }
  if (errors.length > 0) {
    return { adapters, config: null, errors, warnings };
  }

  const selected = adapters.map(({ operation }) => ({
    intent: operation.intent,
    event: operation.event,
    matcher: operation.matcher,
    adapter_target: operation.target,
    context_hash: operation.sources[0].hash
  }));
  let merge;
  try {
    merge = planZCodeHookMerge({
      scope: options.scope,
      target: configTarget,
      current_text: currentText,
      hooks_explicitly_selected: true,
      selected,
      prior: configRecord
        ? {
            managed_fragments: configRecord.managed_fragments ?? [],
            introduced: configRecord.introduced ?? { hooks_enabled: false }
          }
        : null
    });
  } catch (error) {
    errors.push(formatZCodeError(error));
    return { adapters, config: null, errors, warnings };
  }
  warnings.push(...merge.warnings.map((warning) => `${warning.code}: ${warning.target}`));
  const configConsumers = bindings.map((binding) => ({
    asset_id: binding.asset_id,
    kind: "hooks",
    client: "zcode",
    scope: binding.scope
  }));
  const allConfigConsumers = mergeConsumers(configRecord?.consumers ?? [], configConsumers);
  const configOperation = {
    package: "@catwithoutear/agent-harness-core",
    version: options.version,
    id: projectionOperationId("json-merge", configTarget),
    asset_id: allConfigConsumers[0]?.asset_id ?? "zcode-hooks",
    content_kind: "hooks",
    client: "zcode",
    scope: options.scope,
    target: configTarget,
    strategy: "json-merge",
    mode: "json-merge",
    renderer: ZCODE_CONFIG_RENDERER,
    sources: [{ path: configTarget, hash: jsonMergeSourceHash(configTarget) }],
    desired_hash: sha256(merge.desired_text),
    desired_text: merge.desired_text,
    consumers: allConfigConsumers,
    managed_fragments: merge.managed_fragments,
    introduced: merge.introduced,
    selectedConsumers: configConsumers.sort(compareConsumers)
  };
  return {
    adapters,
    config: {
      operation: configOperation,
      sourceHash: jsonMergeSourceHash(configTarget),
      desiredHash: configOperation.desired_hash,
      descriptor: {
        operation: configOperation,
        desiredText: merge.desired_text,
        desiredSource: null,
        desiredKind: "file",
        sourceHash: jsonMergeSourceHash(configTarget),
        desiredHash: configOperation.desired_hash,
        target: configTarget,
        confinementRoot: zcodeConfinementRoot(options.scope, options.targetRoot)
      }
    },
    errors,
    warnings
  };
}

function isCompatibleZCodeConfigRecord(record, configTarget, options, bindings, adapters, manifest) {
  if (
    record.id !== projectionOperationId("json-merge", configTarget) ||
    record.target !== configTarget ||
    record.strategy !== "json-merge" ||
    record.mode !== "json-merge" ||
    record.renderer !== ZCODE_CONFIG_RENDERER
  ) {
    return false;
  }

  const catalog = zcodeCompatibilityCatalog(options.scope, bindings, adapters, manifest);
  const source = record.sources?.[0];
  if (
    record.sources?.length !== 1 ||
    !source ||
    source.path !== configTarget ||
    source.hash !== jsonMergeSourceHash(configTarget)
  ) {
    return false;
  }
  if (!Array.isArray(record.consumers) || record.consumers.length === 0) {
    return false;
  }
  if (record.consumers.some((consumer) =>
    consumer.kind !== "hooks" ||
    consumer.client !== "zcode" ||
    consumer.scope !== options.scope ||
    !catalog.assetIds.has(consumer.asset_id)
  )) {
    return false;
  }
  if (!Array.isArray(record.managed_fragments) || record.managed_fragments.length === 0) {
    return false;
  }

  const seenIdentities = new Set();
  for (const fragment of record.managed_fragments) {
    if (seenIdentities.has(fragment.identity)) {
      return false;
    }
    seenIdentities.add(fragment.identity);
    const expected = catalog.fragments.get(fragment.identity);
    if (
      !expected ||
      fragment.event !== expected.event ||
      fragment.matcher !== expected.matcher ||
      (expected.recognition_hash && fragment.recognition_hash !== expected.recognition_hash)
    ) {
      return false;
    }
  }
  return true;
}

function zcodeCompatibilityCatalog(scope, bindings, adapters, manifest) {
  const assetIds = new Set();
  const fragments = new Map();
  const addFragment = (identity, details) => {
    if (!identity) return;
    assetIds.add(details.assetId);
    fragments.set(identity, details);
  };

  for (const binding of bindings) {
    assetIds.add(binding.asset_id);
  }
  for (const adapter of adapters) {
    const operation = adapter.operation;
    const receipt = operation.managed_fragment ?? operation.managed_fragments?.[0];
    if (receipt) {
      addFragment(receipt.identity, {
        assetId: operation.asset_id,
        event: receipt.event,
        matcher: receipt.matcher,
        recognition_hash: receipt.recognition_hash
      });
    }
  }

  for (const asset of manifest?.assets?.hooks ?? []) {
    if (!asset.clients?.includes("zcode")) {
      continue;
    }
    const metadata = manifest.clients?.zcode?.capabilities?.hooks?.[asset.intent];
    if (!metadata || metadata.support !== "native") {
      continue;
    }
    assetIds.add(asset.id);
    try {
      const identity = zcodeHookIdentity(scope, metadata.event, asset.intent);
      const adapter = adapters.find(({ operation }) => operation.identity === identity);
      addFragment(identity, {
        assetId: asset.id,
        event: metadata.event,
        matcher: metadata.matcher ?? null,
        recognition_hash: adapter?.operation.recognition_hash ?? null
      });
    } catch {
      // Manifest capability validation owns the public error for bad metadata.
    }
  }
  return { assetIds, fragments };
}

function verifyProjection(plan, options, fsOverrides = null, manifest = null) {
  const io = fsOverrides ? { ...fs, ...fsOverrides } : fs;
  const warnings = [];
  try {
    preflightProjectionConfinement(plan, options, io);
  } catch (error) {
    return projectionFailure("verify", options, plan, error, warnings);
  }
  const stateResult = readState(options.targetRoot, options, io);
  if (stateResult.error) {
    return projectionFailure("verify", options, plan, stateResult.error, warnings);
  }
  const state = stateResult.state;
  const zcodeBindings = plan.filter(isZCodeHookBinding);
  const regularBindings = plan.filter((binding) => !isZCodeHookBinding(binding));
  let regularOperations;
  try {
    regularOperations = compileProjectionOperations(regularBindings, state);
  } catch (error) {
    return projectionFailure("verify", options, plan, error, warnings);
  }
  const regularSelected = regularOperations.selectedOperations ?? regularOperations;
  const errors = [];
  const records = [];
  for (const operation of regularSelected) {
    verifyMaterializedOperation(operation, state, io, errors, records, warnings);
  }

  let zcode;
  if (zcodeBindings.length > 0) {
    try {
      zcode = prepareZCodeOperations(zcodeBindings, options, state, io, manifest);
      errors.push(...zcode.errors);
      warnings.push(...zcode.warnings);
    } catch (error) {
      return projectionFailure("verify", options, plan, error, warnings);
    }
    for (const adapter of zcode.adapters) {
      verifyMaterializedOperation(adapter.operation, state, io, errors, records, warnings);
    }
    const configOperation = zcode.config?.operation;
    if (configOperation) {
      const configRecord = state.operations.find((operation) => operation.target === configOperation.target);
      const configExists = pathExists(configOperation.target, io);
      if (!configExists) {
        errors.push(`${configOperation.target}: missing projected target`);
        records.push(operationResult(configOperation, "missing"));
      } else if (!configRecord) {
        warnings.push(`${configOperation.target}: exists but is not recorded in projection state`);
        records.push(operationResult(configOperation, "unmanaged"));
      } else if (
        configRecord.strategy !== "json-merge" ||
        configRecord.mode !== "json-merge" ||
        !configOperation.consumers.every((consumer) => hasConsumer(configRecord.consumers, consumer))
      ) {
        errors.push(`${configOperation.target}: projection state does not match requested ZCode Hook merge`);
        records.push(operationResult(configOperation, "mismatch"));
      } else {
        const verification = verifyZCodeHookMerge({
          scope: options.scope,
          target: configOperation.target,
          current_text: io.readFileSync(configOperation.target, "utf8"),
          hooks_explicitly_selected: true,
          selected: zcode.adapters.map(({ operation }) => ({
            intent: operation.intent,
            event: operation.event,
            matcher: operation.matcher,
            adapter_target: operation.target,
            context_hash: operation.sources[0].hash
          })),
          prior: {
            managed_fragments: configRecord.managed_fragments ?? [],
            introduced: configRecord.introduced ?? { hooks_enabled: false }
          }
        });
        for (const error of verification.errors) {
          errors.push(formatZCodeError(error));
        }
        warnings.push(...verification.warnings.map((warning) => `${warning.code}: ${warning.target}`));
        records.push(operationResult(
          configOperation,
          verification.ok ? "verified" : "mismatch",
          configOperation.sources[0].hash,
          configRecord.desired_hash
        ));
      }
    }
  }

  const selected = [
    ...regularSelected,
    ...(zcode?.adapters.map(({ operation }) => operation) ?? []),
    ...(zcode?.config ? [zcode.config.operation] : [])
  ].sort(compareOperations);
  records.push(...unsupportedRecords(plan, warnings));
  return projectionResult("verify", options, plan, selected, records, errors, warnings);
}

function verifyMaterializedOperation(operation, state, io, errors, records, warnings = []) {
  const representative = operationRepresentative(operation);
  if (!pathExists(operation.target, io)) {
    errors.push(`${operation.target}: missing projected target`);
    records.push(operationResult(operation, "missing"));
    return;
  }
  const source = operation.sources[0]?.path;
  if (!source || !pathExists(source, io)) {
    errors.push(`${operation.asset_id}: source missing: ${source}`);
    records.push(operationResult(operation, "missing"));
    return;
  }
  const stateRecord = state.operations.find((entry) => entry.target === operation.target);
  if (!stateRecord) {
    warnings.push(`${operation.target}: exists but is not recorded in projection state`);
    records.push(operationResult(operation, "unmanaged"));
    return;
  }
  if (stateRecord.strategy !== operation.strategy || stateRecord.mode !== operation.mode) {
    errors.push(`${operation.target}: projection operation does not match expected strategy or mode`);
    records.push(operationResult(operation, "mismatch"));
    return;
  }
  if (!operation.selectedConsumers.every((consumer) => hasConsumer(stateRecord.consumers, consumer))) {
    errors.push(`${operation.target}: projection state is missing a requested consumer`);
    records.push(operationResult(operation, "mismatch"));
    return;
  }
  const sourceRecord = stateRecord.sources[0];
  if (!sourceRecord) {
    errors.push(`${operation.target}: projection source is not recorded`);
    records.push(operationResult(operation, "mismatch"));
    return;
  }
  let sourceHash;
  try {
    sourceHash = hashPath(source, io);
  } catch (error) {
    errors.push(`${operation.target}: cannot read source: ${safeErrorMessage(error)}`);
    records.push(operationResult(operation, "missing"));
    return;
  }
  if (sourceHash !== sourceRecord.hash) {
    errors.push(`${operation.target}: source hash mismatch`);
    records.push(operationResult(operation, "mismatch"));
    return;
  }
  if (operation.mode === "copy" || operation.mode === "render") {
    const actualHash = managedTargetHash(operation, io);
    if (actualHash !== stateRecord.desired_hash) {
      errors.push(`${operation.target}: ${operation.mode} target hash mismatch`);
      records.push(operationResult(operation, "mismatch"));
      return;
    }
  }
  if (operation.mode === "render") {
    const expectedContent = operation.desired_text ?? renderManagedContent(representative, io);
    const actualContent = io.readFileSync(operation.target, "utf8");
    if (
      expectedContent === null ||
      normalizeManagedRenderedContent(operation, actualContent) !==
        normalizeManagedRenderedContent(operation, expectedContent)
    ) {
      errors.push(`${operation.target}: rendered target does not match current renderer`);
      records.push(operationResult(operation, "mismatch"));
      return;
    }
  }
  if (operation.mode === "symlink") {
    const link = io.lstatSync(operation.target);
    if (!link.isSymbolicLink()) {
      errors.push(`${operation.target}: expected symlink`);
      records.push(operationResult(operation, "mismatch"));
      return;
    }
    const resolved = path.resolve(path.dirname(operation.target), io.readlinkSync(operation.target));
    if (resolved !== source) {
      errors.push(`${operation.target}: symlink points to ${resolved}, expected ${source}`);
      records.push(operationResult(operation, "mismatch"));
      return;
    }
  }
  records.push(operationResult(operation, "verified", sourceHash, stateRecord.desired_hash));
}

function operationRepresentative(operation) {
  const consumer = operation.consumers?.[0] ?? {};
  return {
    ...operation,
    asset_id: operation.asset_id ?? consumer.asset_id,
    content_kind: operation.content_kind ?? consumer.kind,
    client: operation.client ?? consumer.client,
    scope: operation.scope ?? consumer.scope,
    source: operation.source ?? operation.sources?.[0]?.path
  };
}

function operationResult(operation, status, sourceHash = null, targetHash = null) {
  const representative = operationRepresentative(operation);
  const {
    desired_text: _desiredText,
    desiredSource: _desiredSource,
    selectedConsumers: _selectedConsumers,
    logicalBindings: _logicalBindings,
    managed_fragment: _managedFragment,
    fragment: _fragment,
    ...publicRepresentative
  } = representative;
  return {
    ...publicRepresentative,
    id: operation.id,
    strategy: operation.strategy,
    mode: operation.mode,
    renderer: operation.renderer,
    sources: operation.sources.map((source, index) => ({
      path: source.path,
      hash: index === 0 ? sourceHash ?? source.hash : source.hash
    })),
    desired_hash: targetHash ?? operation.desired_hash ?? null,
    consumers: operation.consumers,
    source_hash: sourceHash ?? operation.sources?.[0]?.hash ?? null,
    target_hash: targetHash ?? operation.desired_hash ?? null,
    status
  };
}

function stateOperation(operation, sourceHash, targetHash) {
  const result = {
    id: operation.id,
    target: operation.target,
    strategy: operation.strategy,
    mode: operation.mode,
    sources: operation.sources.map((source, index) => ({
      path: source.path,
      hash: index === 0 ? sourceHash : source.hash
    })),
    desired_hash: targetHash,
    renderer: operation.renderer,
    consumers: operation.consumers
  };
  if (operation.managed_fragments !== undefined) {
    result.managed_fragments = operation.managed_fragments;
  }
  if (operation.introduced !== undefined) {
    result.introduced = operation.introduced;
  }
  return result;
}

function buildFinalState(priorState, preparedPlan) {
  const updates = new Map();
  for (const descriptor of preparedPlan.stagedOperations) {
    updates.set(
      descriptor.operation.target,
      stateOperation(descriptor.operation, descriptor.sourceHash, descriptor.desiredHash)
    );
  }
  const operations = priorState.operations
    .filter((operation) => !updates.has(operation.target))
    .concat([...updates.values()])
    .sort(compareOperations);
  return {
    schema_version: 2,
    package: "@catwithoutear/agent-harness-core",
    package_version: preparedPlan.version ?? "unknown",
    operations
  };
}

function projectionResult(action, options, plan, selected, records, errors, warnings) {
  const allWarnings = [...warnings];
  const unsupported = unsupportedRecords(plan, allWarnings);
  return {
    command: "harness-project",
    ok: errors.length === 0,
    action,
    target: options.targetRoot,
    scope: options.scope,
    mode: options.mode,
    conflict: options.conflict,
    summary: summarizePlan(plan, selected),
    records: [...records, ...unsupported],
    errors,
    warnings: allWarnings
  };
}

function applyTransactionRecordStatuses(records, statuses) {
  if (!(statuses instanceof Map)) {
    return records;
  }
  return records.map((record) => {
    const status = statuses.get(record.target);
    return status && record.status === "planned"
      ? { ...record, status }
      : record;
  });
}

function commitProjectionTransaction(transaction, io) {
  const stateDescriptor = stateStagingDescriptor(transaction);
  const allDescriptors = [...transaction.operations, stateDescriptor];
  try {
    for (const descriptor of allDescriptors) {
      if (descriptor.confinementRoot) {
        assertProjectionConfinement(descriptor.target, descriptor.confinementRoot, io);
      }
    }
  } catch (error) {
    return {
      ok: false,
      error,
      recordStatuses: statusesFor(allDescriptors, "not-applied")
    };
  }
  const staged = [];
  try {
    for (const descriptor of allDescriptors) {
      staged.push(stageProjectionOperation(descriptor, io));
    }
  } catch (error) {
    const failedDescriptor = error.stageDescriptor;
    const cleanupDescriptors = [failedDescriptor, ...staged].filter(Boolean);
    const cleanupErrors = [
      ...(error.stageCleanupErrors ?? []),
      ...cleanupTemps(staged, io),
      ...cleanupCreatedDirectories(cleanupDescriptors, io)
    ];
    if (error?.code === "projection-target-confinement") {
      return {
        ok: false,
        error,
        recordStatuses: statusesFor(allDescriptors, "not-applied")
      };
    }
    return {
      ok: false,
      error: new ProjectionTransactionError(
        "projection-commit-failed",
        formatStageFailure(error, error.stageDescriptor, cleanupErrors),
        { action: "stage", cause: safeErrorMessage(error), cleanup: cleanupErrors }
      ),
      recordStatuses: statusesFor(allDescriptors, "not-applied")
    };
  }

  const committed = [];
  let current = null;
  try {
    for (const descriptor of staged) {
      current = descriptor;
      commitStagedOperation(descriptor, io);
      committed.push(descriptor);
    }
  } catch (error) {
    const rollbackCandidates = staged.filter((descriptor) =>
      descriptor.backupCreated || descriptor.targetReplaced || descriptor.desiredInstalled
    );
    const rollbackErrors = rollbackStaged(rollbackCandidates, io);
    const cleanupErrors = cleanupTemps(staged, io);
    const directoryErrors = cleanupCreatedDirectories(staged, io);
    const allRollbackErrors = [...rollbackErrors, ...cleanupErrors, ...directoryErrors];
    const recordStatuses = statusesForCommitFailure(staged, rollbackCandidates, allRollbackErrors);
    if (allRollbackErrors.length > 0) {
      return {
        ok: false,
        error: new ProjectionTransactionError(
          "projection-transaction-rollback-failed",
          formatRollbackFailure(error, allRollbackErrors),
          { cause: safeErrorMessage(error), rollback: allRollbackErrors }
        ),
        recordStatuses
      };
    }
    if (error?.code === "projection-target-confinement") {
      return {
        ok: false,
        error,
        recordStatuses
      };
    }
    return {
      ok: false,
      error: new ProjectionTransactionError(
        "projection-commit-failed",
        formatCommitFailure(error, current, committed),
        { cause: safeErrorMessage(error) }
      ),
      recordStatuses
    };
  }

  const cleanupErrors = cleanupCommittedStaged(staged, io);
  const recordStatuses = statusesFor(staged, "projected");
  if (cleanupErrors.length > 0) {
    return {
      ok: false,
      error: new ProjectionTransactionError(
        "projection-cleanup-failed",
        formatCleanupFailure(cleanupErrors),
        { action: "cleanup", cleanup: cleanupErrors }
      ),
      recordStatuses
    };
  }
  return { ok: true, recordStatuses };
}

function stateStagingDescriptor(transaction) {
  return {
    operation: {
      id: projectionOperationId("materialize-render", transaction.state.target),
      target: transaction.state.target,
      strategy: "materialize-render",
      mode: "render",
      renderer: "projection-state@2",
      sources: [{ path: transaction.state.target, hash: "projection-state" }],
      consumers: [{ asset_id: "projection-state", kind: "state", client: "harness", scope: "project" }]
    },
    desiredText: transaction.state.desiredText,
    desiredSource: null,
    desiredKind: "file",
    sourceHash: null,
    desiredHash: transaction.state.desiredHash,
    target: transaction.state.target,
    confinementRoot: transaction.confinementRoot
  };
}

function statusesFor(descriptors, status) {
  const statuses = new Map();
  for (const descriptor of descriptors) {
    statuses.set(descriptor.target, status);
  }
  return statuses;
}

function statusesForCommitFailure(staged, rollbackCandidates, rollbackErrors) {
  const statuses = statusesFor(staged, "not-applied");
  const failedTargets = new Set(rollbackErrors.map((entry) => entry.target));
  for (const descriptor of rollbackCandidates) {
    statuses.set(
      descriptor.target,
      failedTargets.has(descriptor.target) ? "rollback-failed" : "rolled-back"
    );
  }
  return statuses;
}

function stageProjectionOperation(descriptor, io) {
  const target = descriptor.target;
  let staged = null;
  try {
    if (descriptor.confinementRoot) {
      assertProjectionConfinement(target, descriptor.confinementRoot, io);
    }
    const createdDirectories = missingParentDirectories(target, io);
    const targetExists = pathExists(target, io);
    const prior = targetExists
      ? {
          exists: true,
          kind: targetKind(target, io),
          mode: targetMode(target, io),
          hash: safeHashPath(target, io)
        }
      : { exists: false, kind: null, mode: null, hash: null };
    const desiredTemp = uniqueSibling(target, "tmp", io);
    const backupTemp = prior.exists ? uniqueSibling(target, "backup", io) : null;
    const stagingMode = stagingModeFor(descriptor, prior);
    staged = {
      ...descriptor,
      target,
      desiredTemp,
      backupTemp,
      persistentBackupPath: prior.exists && descriptor.preserveBackup
        ? uniquePersistentBackupPath(target, io)
        : null,
      backupPath: null,
      stagingMode,
      createdDirectories,
      prior,
      backupCreated: false,
      targetReplaced: false,
      desiredInstalled: false
    };
    io.mkdirSync(path.dirname(target), { recursive: true });
    if (descriptor.desiredKind === "symlink") {
      const sourceType = sourceKind(descriptor.operation.sources[0].path, io);
      io.symlinkSync(descriptor.operation.sources[0].path, desiredTemp, sourceType === "directory" ? "dir" : "file");
    } else if (descriptor.desiredSource) {
      try {
        copyPath(descriptor.desiredSource, desiredTemp, io);
      } finally {
        applyStagingMode(staged, io);
      }
    } else {
      io.writeFileSync(desiredTemp, descriptor.desiredText ?? "", {
        encoding: "utf8",
        mode: stagingMode ?? DEFAULT_STAGING_FILE_MODE
      });
    }
    if (descriptor.desiredKind !== "symlink") {
      applyStagingMode(staged, io);
    }
    return staged;
  } catch (error) {
    const cleanupErrors = staged ? cleanupTemps([staged], io) : [];
    if (staged) {
      error.stageDescriptor = staged;
    }
    error.stageCleanupErrors = cleanupErrors;
    throw error;
  }
}

function stagingModeFor(descriptor, prior) {
  if (descriptor.desiredKind === "symlink") {
    return null;
  }
  if (prior.mode !== null) {
    return prior.mode;
  }
  return descriptor.desiredKind === "directory"
    ? DEFAULT_STAGING_DIRECTORY_MODE
    : DEFAULT_STAGING_FILE_MODE;
}

function applyStagingMode(descriptor, io) {
  if (descriptor.stagingMode !== null && pathExists(descriptor.desiredTemp, io)) {
    io.chmodSync(descriptor.desiredTemp, descriptor.stagingMode);
  }
}

function commitStagedOperation(descriptor, io) {
  if (descriptor.confinementRoot) {
    assertProjectionConfinement(descriptor.target, descriptor.confinementRoot, io);
  }
  if (descriptor.prior.exists) {
    io.renameSync(descriptor.target, descriptor.backupTemp);
    descriptor.backupCreated = true;
    descriptor.targetReplaced = true;
    descriptor.backupPath = descriptor.backupTemp;
    if (descriptor.persistentBackupPath) {
      io.renameSync(descriptor.backupTemp, descriptor.persistentBackupPath);
      descriptor.backupPath = descriptor.persistentBackupPath;
    }
  }
  io.renameSync(descriptor.desiredTemp, descriptor.target);
  descriptor.desiredInstalled = true;
}

function rollbackStaged(descriptors, io) {
  const errors = [];
  for (const descriptor of [...descriptors].reverse()) {
    const requiresBackup = descriptor.prior.exists && (
      descriptor.backupCreated || descriptor.targetReplaced
    );
    try {
      const backupPath = descriptor.backupPath ?? descriptor.backupTemp;
      if (requiresBackup && (!backupPath || !pathExists(backupPath, io))) {
        errors.push({
          target: descriptor.target,
          residue: backupPath,
          action: "restore-backup",
          expected_prior_hash: descriptor.prior.hash,
          observed_hash: safeHashPath(descriptor.target, io),
          cause: "required rollback backup is missing"
        });
        continue;
      }
      if (descriptor.desiredInstalled && pathExists(descriptor.target, io)) {
        removeTarget(descriptor.target, io);
      } else if (descriptor.targetReplaced && pathExists(descriptor.target, io)) {
        removeTarget(descriptor.target, io);
      }
      if (requiresBackup) {
        io.renameSync(backupPath, descriptor.target);
        descriptor.backupCreated = false;
        descriptor.backupPath = null;
        if (descriptor.persistentBackupPath && pathExists(descriptor.persistentBackupPath, io)) {
          removeTarget(descriptor.persistentBackupPath, io);
        }
      }
    } catch (error) {
      errors.push({
        target: descriptor.target,
        residue: descriptor.persistentBackupPath ?? descriptor.backupPath ?? descriptor.backupTemp,
        action: requiresBackup ? "restore-backup" : "remove-installed",
        expected_prior_hash: descriptor.prior.hash,
        observed_hash: safeHashPath(descriptor.target, io),
        cause: safeErrorMessage(error)
      });
    }
  }
  return errors;
}

function cleanupCommittedStaged(descriptors, io) {
  const errors = cleanupTemps(descriptors, io);
  for (const descriptor of descriptors) {
    if (!descriptor.backupTemp) {
      continue;
    }
    try {
      if (pathExists(descriptor.backupTemp, io)) {
        removeTarget(descriptor.backupTemp, io);
      }
    } catch (error) {
      errors.push({
        target: descriptor.target,
        residue: descriptor.backupTemp,
        action: "cleanup-backup",
        expected_prior_hash: descriptor.prior.hash,
        observed_hash: safeHashPath(descriptor.target, io),
        cause: safeErrorMessage(error)
      });
    }
  }
  return errors;
}

function cleanupTemps(descriptors, io) {
  const errors = [];
  for (const descriptor of descriptors) {
    if (!descriptor.desiredTemp) {
      continue;
    }
    try {
      if (pathExists(descriptor.desiredTemp, io)) {
        removeTarget(descriptor.desiredTemp, io);
      }
    } catch (error) {
      errors.push({
        target: descriptor.target,
        residue: descriptor.desiredTemp,
        action: "cleanup-temp",
        expected_prior_hash: descriptor.prior.hash,
        observed_hash: safeHashPath(descriptor.target, io),
        cause: safeErrorMessage(error)
      });
    }
  }
  return errors;
}

function missingParentDirectories(target, io) {
  const missing = [];
  let current = path.dirname(target);
  while (current !== path.dirname(current)) {
    if (pathExists(current, io)) {
      break;
    }
    missing.push(current);
    current = path.dirname(current);
  }
  return missing.reverse();
}

function cleanupCreatedDirectories(descriptors, io) {
  const directories = [];
  const seen = new Set();
  for (const descriptor of [...descriptors].reverse()) {
    for (const directory of [...(descriptor.createdDirectories ?? [])].reverse()) {
      if (!seen.has(directory)) {
        seen.add(directory);
        directories.push({ descriptor, directory });
      }
    }
  }
  const errors = [];
  for (const { descriptor, directory } of directories) {
    let stat;
    try {
      stat = io.lstatSync(directory);
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      errors.push({
        target: descriptor.target,
        residue: directory,
        action: "cleanup-directory",
        expected_prior_hash: descriptor.prior?.hash ?? null,
        observed_hash: safeHashPath(descriptor.target, io),
        cause: safeErrorMessage(error)
      });
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      continue;
    }
    try {
      io.rmdirSync(directory);
    } catch (error) {
      if (["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) {
        continue;
      }
      errors.push({
        target: descriptor.target,
        residue: directory,
        action: "cleanup-directory",
        expected_prior_hash: descriptor.prior?.hash ?? null,
        observed_hash: safeHashPath(descriptor.target, io),
        cause: safeErrorMessage(error)
      });
    }
  }
  return errors;
}

let stagingSequence = 0;

function uniqueSibling(target, label, io) {
  const base = path.basename(target);
  const directory = path.dirname(target);
  let candidate;
  do {
    stagingSequence += 1;
    candidate = path.join(
      directory,
      `.${base}.harness-${label}-${process.pid}-${stagingSequence}`
    );
  } while (pathExists(candidate, io));
  return candidate;
}

function uniquePersistentBackupPath(target, io) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  let candidate = `${target}.bak.${stamp}`;
  let suffix = 0;
  while (pathExists(candidate, io)) {
    suffix += 1;
    candidate = `${target}.bak.${stamp}.${suffix}`;
  }
  return candidate;
}

function formatCommitFailure(error, current, committed) {
  const target = current?.target ?? committed.at(-1)?.target ?? "unknown";
  return `projection-commit-failed: target=${target} action=commit cause=${safeErrorMessage(error)}`;
}

function formatStageFailure(error, failedDescriptor, cleanupErrors) {
  const target = failedDescriptor?.target ?? "unknown";
  const residue = cleanupErrors.map((entry) =>
    `residue=${entry.residue ?? entry.target} action=${entry.action} cause=${entry.cause}`
  ).join("; ");
  return `projection-commit-failed: staging failed: target=${target} action=stage cause=${safeErrorMessage(error)}${residue ? `; ${residue}` : ""}`;
}

function formatRollbackFailure(error, rollbackErrors) {
  const details = rollbackErrors.map((entry) =>
    `${entry.target}: ${entry.residue ? `residue=${entry.residue} ` : ""}action=${entry.action} expected_prior_hash=${entry.expected_prior_hash ?? "null"} observed_hash=${entry.observed_hash ?? "unknown"} cause=${entry.cause}`
  ).join("; ");
  return `projection-transaction-rollback-failed: commit=${safeErrorMessage(error)}; rollback=${details}`;
}

function formatCleanupFailure(cleanupErrors) {
  const details = cleanupErrors.map((entry) =>
    `${entry.target}: ${entry.residue ? `residue=${entry.residue} ` : ""}action=${entry.action} expected_prior_hash=${entry.expected_prior_hash ?? "null"} observed_hash=${entry.observed_hash ?? "unknown"} cause=${entry.cause}`
  ).join("; ");
  return `projection-cleanup-failed: committed state retained; cleanup=${details}`;
}

function transactionFailureMessage(error) {
  const code = error?.code;
  const message = error?.message ?? String(error);
  return code && !message.startsWith(`${code}:`)
    ? `${code}: ${message}`
    : message;
}

function unsupportedRecords(plan, warnings) {
  return plan
    .filter((record) => !record.target)
    .map((record) => {
      pushUnique(warnings, record.diagnostic);
      return { ...record, status: "unsupported" };
    });
}

function projectionFailure(action, options, plan, error, warnings = []) {
  const code = error?.code ?? "projection-error";
  const message = `${code}: ${error?.message ?? String(error)}`;
  return {
    command: "harness-project",
    ok: false,
    action,
    target: options.targetRoot,
    scope: options.scope,
    mode: options.mode,
    conflict: options.conflict,
    summary: summarizePlan(plan, []),
    records: unsupportedRecords(plan, warnings),
    errors: [message],
    warnings
  };
}

function hasConsumer(consumers, expected) {
  return consumers.some((consumer) =>
    consumer.asset_id === expected.asset_id &&
    consumer.kind === expected.kind &&
    consumer.client === expected.client &&
    consumer.scope === expected.scope
  );
}

function mergeConsumers(prior, current) {
  const byKey = new Map();
  for (const consumer of [...prior, ...current]) {
    const key = [consumer.asset_id, consumer.kind, consumer.client, consumer.scope].join("\0");
    byKey.set(key, consumer);
  }
  return [...byKey.values()].sort(compareConsumers);
}

function renderManagedContent(record, io = fs) {
  if (record.content_kind === "agents") {
    return renderAgent(record, io);
  }
  if (record.content_kind === "hooks") {
    return renderHook(record, io);
  }
  return null;
}

function renderAgent(record, io = fs) {
  const source = io.readFileSync(record.source, "utf8");
  const body = stripFrontMatter(source).trimEnd();
  const description = record.description ?? record.asset_id;
  if (record.client === "codex") {
    return [
      `name = ${JSON.stringify(record.runtime_name)}`,
      `description = ${JSON.stringify(description)}`,
      "developer_instructions = '''",
      body,
      "'''",
      ""
    ].join("\n");
  }
  if (record.client === "zcode") {
    return renderZCodeAgent(record, body, io);
  }
  const frontMatter = [
    "---",
    `name: ${record.runtime_name}`,
    `description: ${JSON.stringify(description)}`,
    ...(record.client === "opencode" ? ["mode: subagent"] : []),
    "---",
    ""
  ].join("\n");
  return `${frontMatter}${body}\n`;
}

function renderZCodeAgent(record, body, io) {
  const description = record.description ?? record.asset_id;
  const preservedMetadata = readZCodeAgentMetadata(record.target, io);
  const frontMatter = [
    "---",
    `name: ${record.runtime_name}`,
    `description: ${JSON.stringify(description)}`,
    ...preservedMetadata,
    "---",
    ""
  ].join("\n");
  return `${frontMatter}${body}\n`;
}

function isZCodeAgentOperation(operation) {
  const representative = operationRepresentative(operation);
  return representative.client === "zcode" && representative.content_kind === "agents";
}

function managedRenderedHash(operation, content) {
  return sha256(normalizeManagedRenderedContent(operation, content));
}

function managedTargetHash(operation, io) {
  if (!isZCodeAgentOperation(operation)) {
    return hashPath(operation.target, io);
  }
  return managedRenderedHash(operation, io.readFileSync(operation.target, "utf8"));
}

function normalizeManagedRenderedContent(operation, content) {
  if (!isZCodeAgentOperation(operation)) {
    return content;
  }
  const parsed = parseZCodeAgentFrontMatter(content);
  const { managed: managedLines } = partitionZCodeAgentMetadata(parsed.lines);
  return `---\n${managedLines.join("\n")}\n---\n${parsed.body}`;
}

function readZCodeAgentMetadata(target, io) {
  if (!target || !pathExists(target, io)) {
    return [];
  }
  let info;
  let text;
  try {
    info = io.lstatSync(target);
    text = io.readFileSync(target, "utf8");
  } catch (error) {
    throw new Error(`invalid existing ZCode agent frontmatter: ${safeErrorMessage(error)}`);
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("invalid existing ZCode agent frontmatter: expected a regular Markdown file");
  }
  const parsed = parseZCodeAgentFrontMatter(text);
  return partitionZCodeAgentMetadata(parsed.lines).preserved;
}

function partitionZCodeAgentMetadata(lines) {
  const preserved = [];
  const managed = [];
  const seen = new Set();
  for (const line of lines) {
    if (!line.trim()) {
      managed.push(line);
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):[ \t]+(.+)$/.exec(line);
    if (!match) {
      throw new Error(`invalid existing ZCode agent frontmatter: unsupported line ${JSON.stringify(line)}`);
    }
    const [, key, value] = match;
    if (!ZCODE_PRESERVED_AGENT_METADATA.has(key)) {
      managed.push(line);
      continue;
    }
    if (seen.has(key)) {
      throw new Error(`invalid existing ZCode agent frontmatter: duplicate ${key}`);
    }
    if (["|", ">"].includes(value.trim())) {
      throw new Error(`invalid existing ZCode agent frontmatter: ${key} must be a scalar value`);
    }
    seen.add(key);
    preserved.push(line);
  }
  return { managed, preserved };
}

function parseZCodeAgentFrontMatter(text) {
  if (!text.startsWith("---\n")) {
    throw new Error("invalid existing ZCode agent frontmatter: missing opening delimiter");
  }
  const closing = text.indexOf("\n---\n", 4);
  if (closing === -1) {
    throw new Error("invalid existing ZCode agent frontmatter: missing closing delimiter");
  }
  return {
    lines: text.slice(4, closing).split("\n"),
    body: text.slice(closing + 5)
  };
}

function renderHook(record, io = fs) {
  const body = io.readFileSync(record.source, "utf8").trim();
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
  const skillValue = args.values.get("skills") ?? config.skills?.join?.(",");
  const skillCategoryValue = args.values.get("skill-categories") ?? config.skillCategories?.join?.(",");
  const clients = clientsValue === "all"
    ? Object.keys(manifest.clients)
    : splitList(clientsValue).filter((client) => manifest.clients[client]);
  const allContent = ["rules", "tools", "templates", "skills", "commands", "agents", "hooks"];
  const content = contentValue === "all" ? allContent : splitList(contentValue);
  const selectedSkills = skillValue ? new Set(splitList(skillValue)) : null;
  const selectedSkillCategories = skillCategoryValue ? new Set(splitList(skillCategoryValue)) : null;
  return {
    targetRoot: path.resolve(target),
    scope: args.values.get("scope") ?? config.scope ?? "project",
    clients,
    content,
    mode: args.values.get("mode") ?? config.mode ?? "copy",
    conflict: args.values.get("conflict") ?? config.conflict ?? "error",
    version: manifest.version,
    selectedSkills,
    selectedSkillCategories,
    includeOptionalSkills: hasFlag(args, "include-optional-skills") || config.includeOptionalSkills === true
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

function skillMatchesSelection(asset, options) {
  if (options.selectedSkills) {
    return options.selectedSkills.has(asset.id) || options.selectedSkills.has(asset.runtimeName);
  }
  if (options.selectedSkillCategories) {
    return options.selectedSkillCategories.has(asset.category);
  }
  if (options.includeOptionalSkills) {
    return true;
  }
  return asset.enabledByDefault !== false;
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

function classifyConflict(operation, state, options, io = fs) {
  if (!pathExists(operation.target, io)) {
    return false;
  }
  const stateRecord = state.operations.find((entry) => entry.target === operation.target);
  if (!stateRecord) {
    return true;
  }
  if (stateRecord.strategy !== operation.strategy || stateRecord.mode !== operation.mode) {
    return true;
  }
  if (stateRecord.mode === "json-merge" || operation.mode === "json-merge") {
    return false;
  }
  if (stateRecord.mode === "copy" || stateRecord.mode === "render") {
    if (!stateRecord.desired_hash) {
      return true;
    }
    return managedTargetHash(operation, io) !== stateRecord.desired_hash;
  }
  if (stateRecord.mode === "symlink") {
    return !io.lstatSync(operation.target).isSymbolicLink();
  }
  return true;
}

function readState(targetRoot, options = {}, io = fs) {
  const statePath = projectionStatePath(targetRoot);
  if (!pathExists(statePath, io)) {
    return {
      state: emptyProjectionState({
        packageName: "@catwithoutear/agent-harness-core",
        packageVersion: options.version ?? "unknown"
      })
    };
  }
  try {
    return {
      state: normalizeProjectionState(JSON.parse(io.readFileSync(statePath, "utf8")), {
        packageName: "@catwithoutear/agent-harness-core",
        packageVersion: options.version ?? "unknown",
        scope: options.scope
      })
    };
  } catch (error) {
    return {
      error: error?.code
        ? error
        : {
            code: "projection-state-migration-invalid",
            message: `cannot read projection state: ${error.message}`
          }
    };
  }
}

function projectionStatePath(targetRoot) {
  return path.join(targetRoot, ".harness", "projection-state.json");
}

function copyPath(source, target, io = fs) {
  const stat = io.statSync(source);
  if (stat.isDirectory()) {
    io.cpSync(source, target, { recursive: true });
  } else {
    io.copyFileSync(source, target);
  }
}

function removeTarget(target, io = fs) {
  io.rmSync(target, { recursive: true, force: true });
}

function hashPath(target, io = fs) {
  const stat = io.statSync(target);
  if (stat.isDirectory()) {
    const hash = crypto.createHash("sha256");
    const files = listFiles(target, io);
    for (const file of files) {
      const relPath = path.relative(target, file).split(path.sep).join("/");
      hash.update(relPath);
      hash.update("\0");
      hash.update(io.readFileSync(file));
      hash.update("\0");
    }
    return hash.digest("hex");
  }
  return crypto.createHash("sha256").update(io.readFileSync(target)).digest("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function listFiles(root, io = fs) {
  const result = [];
  for (const entry of io.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(fullPath, io));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

function pathExists(target, io = fs) {
  try {
    io.lstatSync(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

function safeHashPath(target, io = fs) {
  try {
    return pathExists(target, io) ? hashPath(target, io) : null;
  } catch {
    return null;
  }
}

function targetKind(target, io = fs) {
  const stat = io.lstatSync(target);
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  return "other";
}

function sourceKind(source, io = fs) {
  const stat = io.statSync(source);
  return stat.isDirectory() ? "directory" : "file";
}

function targetMode(target, io = fs) {
  const stat = io.statSync(target);
  return stat.mode & 0o7777;
}

function compareOperations(left, right) {
  return left.target.localeCompare(right.target) || left.id.localeCompare(right.id);
}

function compareStagedOperations(left, right) {
  return left.target.localeCompare(right.target) || left.operation.id.localeCompare(right.operation.id);
}

function compareConsumers(left, right) {
  return [left.asset_id, left.kind, left.client, left.scope].join("\0")
    .localeCompare([right.asset_id, right.kind, right.client, right.scope].join("\0"));
}

function isZCodeHookBinding(binding) {
  return binding?.content_kind === "hooks" && binding?.client === "zcode" && Boolean(binding.target);
}

function zcodeAdapterTarget(configTarget, scope, intent) {
  const root = scope === "global"
    ? path.dirname(path.dirname(configTarget))
    : path.dirname(configTarget);
  return path.join(root, "harness", "hooks", `${intent}.mjs`);
}

function zcodeConfinementRoot(scope, targetRoot) {
  return path.resolve(scope === "global" ? os.homedir() : targetRoot);
}

function jsonMergeSourceHash(target) {
  return sha256(`zcode-json-merge\0${target}`);
}

function formatZCodeError(error) {
  if (error?.code && error?.message) {
    return `${error.code}: ${safeErrorMessage(error)}`;
  }
  return safeErrorMessage(error);
}

function safeErrorMessage(error) {
  return String(error?.message ?? error ?? "unknown error")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 1000);
}

function summarizePlan(logicalRecords, physicalOperations = []) {
  const records = logicalRecords ?? [];
  const summary = {
    total: records.length,
    logical_total: records.length,
    physical_total: physicalOperations.length,
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
    "harness-project --target <path> --content skills --skills glab,redmine",
    "harness-project --target <path> --content skills --skill-categories third-party",
    "harness-project --target <path> --content skills --include-optional-skills",
    "harness-project --target <path> --mode copy|symlink (default: copy)",
    "harness-project --target <path> --conflict error|skip|overwrite|backup",
    "harness-project --target <path> --config <harness-project.json>",
    ""
  ].join("\n");
}
