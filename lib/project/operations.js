import {
  DEFAULT_PACKAGE_NAME,
  emptyProjectionState,
  normalizeProjectionState,
  projectionOperationId,
  ProjectionStateError
} from "./projection-state.js";

const RENDER_KINDS = new Set(["agents", "hooks"]);
const OPERATION_STRATEGIES = new Set([
  "materialize-copy",
  "materialize-render",
  "json-merge"
]);

export class ProjectionOperationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProjectionOperationError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Compile logical manifest bindings into one deterministic operation per
 * physical target.  The returned array contains retained unselected
 * operations as well; selected targets and selected operations are exposed as
 * non-enumerable properties for the projector without changing the state
 * schema or the simple array-shaped API.
 */
export function compileProjectionOperations(bindings, priorState = null) {
  if (!Array.isArray(bindings)) {
    throw new ProjectionOperationError(
      "projection-binding-invalid",
      "projection bindings must be an array"
    );
  }

  const state = priorState === null || priorState === undefined
    ? emptyProjectionState({ packageName: DEFAULT_PACKAGE_NAME })
    : normalizeProjectionState(priorState);
  const groups = new Map();

  for (const binding of bindings) {
    if (!binding || binding.target === null || binding.target === undefined) {
      continue;
    }
    const candidate = operationDescriptor(binding);
    const group = groups.get(candidate.target);
    if (!group) {
      groups.set(candidate.target, {
        candidate,
        bindings: [binding]
      });
      continue;
    }
    if (!sameMaterial(group.candidate, candidate) || !sameLogicalIdentity(group.bindings[0], binding)) {
      throw targetCollision(group.bindings[0], binding, candidate.target);
    }
    group.bindings.push(binding);
    group.candidate = mergeCandidateHashes(group.candidate, candidate);
  }

  const priorByTarget = new Map(state.operations.map((operation) => [operation.target, operation]));
  const selectedOperations = [];
  for (const group of [...groups.values()].sort((left, right) =>
    left.candidate.target.localeCompare(right.candidate.target)
  )) {
    const prior = priorByTarget.get(group.candidate.target);
    if (prior && !samePriorMaterial(prior, group)) {
      throw targetCollision(
        operationRepresentative(prior),
        group.bindings[0],
        group.candidate.target
      );
    }
    selectedOperations.push(buildOperation(group, prior));
  }

  const selectedTargets = new Set(selectedOperations.map((operation) => operation.target));
  const retainedOperations = state.operations.filter((operation) => !selectedTargets.has(operation.target));
  const operations = [...retainedOperations, ...selectedOperations].sort((left, right) =>
    left.target.localeCompare(right.target) || left.id.localeCompare(right.id)
  );
  Object.defineProperties(operations, {
    selectedTargets: {
      value: selectedTargets,
      enumerable: false
    },
    selectedOperations: {
      value: selectedOperations,
      enumerable: false
    }
  });
  return operations;
}

function operationDescriptor(binding) {
  const target = requiredString(binding.target, "binding.target");
  const source = requiredString(binding.source, `binding ${target} source`);
  const strategy = binding.strategy ?? defaultStrategy(binding);
  const mode = binding.physical_mode ?? defaultMode(binding, strategy);
  const renderer = binding.renderer === undefined
    ? defaultRenderer(binding, strategy)
    : nullableString(binding.renderer, `binding ${target} renderer`);
  if (!OPERATION_STRATEGIES.has(strategy)) {
    throw new ProjectionOperationError(
      "projection-binding-invalid",
      `${target}: unsupported projection operation strategy ${strategy}`,
      { target, strategy }
    );
  }
  return {
    target,
    strategy,
    mode,
    renderer,
    source,
    source_hash: nullableHash(binding.source_hash),
    desired_hash: nullableHash(binding.desired_hash)
  };
}

function defaultStrategy(binding) {
  if (binding.mode === "json-merge") {
    return "json-merge";
  }
  return RENDER_KINDS.has(binding.content_kind)
    ? "materialize-render"
    : "materialize-copy";
}

function defaultMode(binding, strategy) {
  if (strategy === "materialize-render") {
    return "render";
  }
  if (strategy === "json-merge") {
    return "json-merge";
  }
  return binding.mode ?? "copy";
}

function defaultRenderer(binding, strategy) {
  if (strategy === "json-merge") {
    return "json-merge@1";
  }
  if (strategy === "materialize-render") {
    if (binding.content_kind === "agents") {
      return `${binding.client ?? "generic"}-agent@1`;
    }
    if (binding.content_kind === "hooks") {
      return "hook-descriptor@1";
    }
    return "managed-render@1";
  }
  return null;
}

function buildOperation(group, prior) {
  const representativeBinding = [...group.bindings].sort(compareBindings)[0];
  const candidate = group.candidate;
  const consumers = mergeConsumers(
    prior?.consumers ?? [],
    group.bindings.map(consumerForBinding)
  );
  const sourceHash = candidate.source_hash ?? prior?.sources?.[0]?.hash ?? null;
  const desiredHash = candidate.desired_hash ?? prior?.desired_hash ?? null;
  const operation = {
    ...representativeBinding,
    id: projectionOperationId(candidate.strategy, candidate.target),
    target: candidate.target,
    strategy: candidate.strategy,
    mode: candidate.mode,
    renderer: candidate.renderer,
    sources: [{ path: candidate.source, hash: sourceHash }],
    desired_hash: desiredHash,
    consumers,
    status: "planned"
  };
  const selectedConsumers = mergeConsumers([], group.bindings.map(consumerForBinding));
  Object.defineProperties(operation, {
    selectedConsumers: {
      value: selectedConsumers,
      enumerable: false
    },
    logicalBindings: {
      value: [...group.bindings].sort(compareBindings),
      enumerable: false
    }
  });
  return operation;
}

function sameMaterial(left, right) {
  if (
    left.target !== right.target ||
    left.strategy !== right.strategy ||
    left.mode !== right.mode ||
    left.renderer !== right.renderer ||
    left.source !== right.source
  ) {
    return false;
  }
  if (left.desired_hash !== null && right.desired_hash !== null && left.desired_hash !== right.desired_hash) {
    return false;
  }
  return true;
}

function samePriorMaterial(prior, group) {
  const candidate = group.candidate;
  if (
    prior.target !== candidate.target ||
    prior.strategy !== candidate.strategy ||
    prior.mode !== candidate.mode ||
    (prior.renderer ?? null) !== (candidate.renderer ?? null)
  ) {
    return false;
  }
  const priorIdentities = new Set(
    (prior.consumers ?? []).map((consumer) => consumerIdentity(consumer))
  );
  return group.bindings.every((binding) => priorIdentities.has(bindingIdentity(binding)));
}

function sameLogicalIdentity(left, right) {
  return bindingIdentity(left) === bindingIdentity(right);
}

function bindingIdentity(binding) {
  return consumerIdentity(consumerForBinding(binding));
}

function consumerIdentity(consumer) {
  return [consumer.asset_id, consumer.kind ?? consumer.content_kind].join("\0");
}

function mergeCandidateHashes(left, right) {
  return {
    ...left,
    source_hash: left.source_hash ?? right.source_hash,
    desired_hash: left.desired_hash ?? right.desired_hash
  };
}

function consumerForBinding(binding) {
  return {
    asset_id: requiredString(binding.asset_id, `binding ${binding.target} asset_id`),
    kind: requiredString(binding.content_kind ?? binding.kind, `binding ${binding.target} kind`),
    client: requiredString(binding.client, `binding ${binding.target} client`),
    scope: typeof binding.scope === "string" && binding.scope.length > 0 ? binding.scope : "project"
  };
}

function mergeConsumers(prior, current) {
  const byKey = new Map();
  for (const consumer of [...prior, ...current]) {
    const normalized = consumerForState(consumer);
    byKey.set(consumerKey(normalized), normalized);
  }
  return [...byKey.values()].sort((left, right) => consumerKey(left).localeCompare(consumerKey(right)));
}

function consumerForState(consumer) {
  if (!consumer || typeof consumer !== "object") {
    throw new ProjectionStateError(
      "projection-state-migration-invalid",
      "projection operation consumer must be an object"
    );
  }
  return {
    asset_id: requiredString(consumer.asset_id, "consumer.asset_id"),
    kind: requiredString(consumer.kind ?? consumer.content_kind, "consumer.kind"),
    client: requiredString(consumer.client, "consumer.client"),
    scope: requiredString(consumer.scope, "consumer.scope")
  };
}

function operationRepresentative(operation) {
  const source = operation.sources?.[0];
  const consumer = operation.consumers?.[0];
  return {
    asset_id: consumer?.asset_id ?? operation.id,
    content_kind: consumer?.kind ?? "unknown",
    client: consumer?.client ?? "unknown",
    scope: consumer?.scope ?? "unknown",
    source: source?.path ?? "unknown",
    target: operation.target,
    mode: operation.mode,
    strategy: operation.strategy,
    renderer: operation.renderer,
    desired_hash: operation.desired_hash
  };
}

function targetCollision(existing, incoming, target) {
  return new ProjectionOperationError(
    "projection-target-collision",
    `${target}: incompatible logical bindings cannot share one physical target`,
    {
      target,
      existing: bindingDetails(existing),
      incoming: bindingDetails(incoming)
    }
  );
}

function bindingDetails(binding) {
  return {
    asset_id: binding.asset_id,
    client: binding.client,
    scope: binding.scope,
    source: binding.source,
    mode: binding.mode,
    strategy: binding.strategy,
    renderer: binding.renderer
  };
}

function compareBindings(left, right) {
  return consumerKey(consumerForBinding(left)).localeCompare(consumerKey(consumerForBinding(right))) ||
    String(left.source).localeCompare(String(right.source));
}

function consumerKey(consumer) {
  return [consumer.asset_id, consumer.kind, consumer.client, consumer.scope].join("\0");
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProjectionOperationError("projection-binding-invalid", `${label} must be a non-empty string`);
  }
  return value;
}

function nullableString(value, label) {
  if (value === null || value === undefined) {
    return null;
  }
  return requiredString(value, label);
}

function nullableHash(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return requiredString(value, "projection hash");
}
