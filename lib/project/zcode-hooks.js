import crypto from "node:crypto";
import path from "node:path";
import {
  ZCODE_CONTEXT_ADAPTER_RUNTIME,
  renderZCodeContextAdapter
} from "../../hooks/adapters/zcode-context.mjs";

export const ZCODE_PRE_TOOL_MATCHER = "Bash|Write|Edit|ApplyPatch";
export { ZCODE_CONTEXT_ADAPTER_RUNTIME };
export { renderZCodeContextAdapter as renderZCodeAdapter };

const SUPPORTED_EVENTS = new Set(["SessionStart", "PreToolUse"]);
const NATIVE_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop"
]);

export class ZCodeHookError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ZCodeHookError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Build the stable identity used by a managed ZCode hook receipt.  The
 * identity intentionally does not appear in ZCode's config schema.
 */
export function zcodeHookIdentity(scope, event, intent) {
  requireScope(scope);
  requireNonEmptyString(event, "event", "zcode-hook-event-type");
  requireNonEmptyString(intent, "intent", "zcode-hook-intent-type");
  return sha256(`agent-harness-core\0zcode-hook\0${scope}\0${event}\0${intent}`);
}

/**
 * Render one self-contained adapter operation.  The returned operation is a
 * pure descriptor: it has no filesystem or trust-state side effects.
 */
export function buildZCodeAdapterOperation(binding = {}) {
  const normalized = normalizeBinding(binding);
  const context = `[agent-harness-core:${normalized.intent}]\n${normalized.body.trimEnd()}`;
  const desiredText = renderZCodeContextAdapter({
    intent: normalized.intent,
    context
  });
  const fragment = buildFragment(normalized);
  const sourceHash = normalized.context_hash ?? sha256(normalized.body);
  const receipt = toReceipt(fragment);
  return {
    asset_id: normalized.asset_id,
    content_kind: "hooks",
    client: "zcode",
    scope: normalized.scope,
    intent: normalized.intent,
    source: normalized.source,
    target: normalized.adapter_target,
    adapter_target: normalized.adapter_target,
    strategy: "materialize-render",
    mode: "render",
    renderer: normalized.renderer,
    sources: [{ path: normalized.source, hash: sourceHash }],
    desired_hash: sha256(desiredText),
    desired_text: desiredText,
    consumers: [{
      asset_id: normalized.asset_id,
      kind: "hooks",
      client: "zcode",
      scope: normalized.scope
    }],
    identity: fragment.identity,
    event: fragment.event,
    matcher: fragment.matcher,
    recognition_hash: fragment.recognition_hash,
    fragment: fragment.declaration,
    managed_fragment: receipt,
    managed_fragments: [receipt]
  };
}

export function buildZCodeAdapterOperations(bindings) {
  if (!Array.isArray(bindings)) {
    throw new ZCodeHookError(
      "zcode-hook-binding-type",
      "ZCode adapter bindings must be an array"
    );
  }
  return bindings
    .map((binding) => buildZCodeAdapterOperation(binding))
    .sort((left, right) => left.target.localeCompare(right.target));
}

/**
 * Plan a merge into a ZCode config file.  This function only parses and
 * constructs bytes; the projector owns staging and committing those bytes.
 */
export function planZCodeHookMerge(input = {}) {
  const normalized = normalizeMergeInput(input);
  const parsed = parseConfig(normalized.current_text, normalized.target);
  const selected = normalizeSelections(normalized.selected, normalized.scope);
  const prior = normalizePrior(normalized.prior, normalized.target);
  const config = parsed.value;
  validateConfig(config, normalized.target);

  const receiptMap = new Map(prior.managed_fragments.map((fragment) => [fragment.identity, fragment]));
  let mutated = false;

  for (const selectedFragment of selected) {
    const priorFragment = receiptMap.get(selectedFragment.identity);
    const matches = findMatches(config, selectedFragment);
    if (matches.length > 1) {
      throw ownershipError(
        "managed-hook-duplicate",
        normalized.target,
        selectedFragment,
        {
          matching_indexes: matches.map((match) => match.index)
        }
      );
    }
    if (priorFragment) {
      if (matches.length === 0) {
        throw ownershipError("managed-hook-missing", normalized.target, selectedFragment);
      }
      if (matches.some((match) => !match.exact)) {
        throw ownershipError(
          "managed-hook-modified",
          normalized.target,
          selectedFragment,
          {
            matching_index: matches[0].index,
            matching_event: matches[0].event
          }
        );
      }
      if (priorFragment.recognition_hash !== selectedFragment.recognition_hash) {
        throw ownershipError(
          "managed-hook-modified",
          normalized.target,
          selectedFragment,
          {
            expected_recognition_hash: priorFragment.recognition_hash,
            observed_recognition_hash: selectedFragment.recognition_hash
          }
        );
      }
      const observedHash = hashJson(matches[0].declaration);
      if (observedHash !== priorFragment.desired_hash) {
        throw ownershipError(
          "managed-hook-modified",
          normalized.target,
          selectedFragment,
          {
            expected_hash: priorFragment.desired_hash,
            observed_hash: observedHash,
            matching_index: matches[0].index
          }
        );
      }
      receiptMap.set(selectedFragment.identity, {
        ...selectedFragment,
        prior_hash: priorFragment.prior_hash
      });
      continue;
    }

    if (matches.length > 0) {
      throw ownershipError(
        "unowned-hook-collision",
        normalized.target,
        selectedFragment,
        { matching_index: matches[0].index }
      );
    }

    appendDeclaration(config, selectedFragment);
    mutated = true;
    receiptMap.set(selectedFragment.identity, selectedFragment);
  }

  const warnings = [];
  const introduced = {
    hooks_enabled: prior.introduced.hooks_enabled
  };
  if (selected.length > 0 && normalized.hooks_explicitly_selected) {
    if (!config.hooks) {
      config.hooks = {};
      mutated = true;
    }
    if (config.hooks.enabled === undefined) {
      config.hooks.enabled = true;
      introduced.hooks_enabled = true;
      mutated = true;
    } else if (config.hooks.enabled === false) {
      warnings.push({ code: "configured-disabled", target: normalized.target });
    }
  } else if (config.hooks?.enabled === false && normalized.hooks_explicitly_selected) {
    warnings.push({ code: "configured-disabled", target: normalized.target });
  }

  const managedFragments = [...receiptMap.values()]
    .map(toReceipt)
    .sort(compareFragments);
  const desiredSubsetHash = hashJson(managedFragments);
  const desiredText = mutated
    ? serializeConfig(config, parsed.format)
    : parsed.originalText;
  return {
    desired_text: desiredText,
    changed: desiredText !== normalized.current_text,
    desired_subset_hash: desiredSubsetHash,
    managed_fragments: managedFragments,
    introduced,
    warnings
  };
}

/**
 * Verify the selected managed subset without normalizing or rewriting
 * unrelated config.  Structural and ownership failures are represented as
 * structured errors so a caller can include them in JSON diagnostics.
 */
export function verifyZCodeHookMerge(input = {}) {
  const normalized = normalizeMergeInput(input);
  try {
    const parsed = parseConfig(normalized.current_text, normalized.target);
    const selected = normalizeSelections(normalized.selected, normalized.scope);
    const prior = normalizePrior(normalized.prior, normalized.target);
    validateConfig(parsed.value, normalized.target);
    const errors = [];
    const warnings = [];
    const priorMap = new Map(prior.managed_fragments.map((fragment) => [fragment.identity, fragment]));

    for (const selectedFragment of selected) {
      const priorFragment = priorMap.get(selectedFragment.identity);
      const matches = findMatches(parsed.value, selectedFragment);
      if (matches.length > 1) {
        errors.push(publicError(ownershipError(
          "managed-hook-duplicate",
          normalized.target,
          selectedFragment,
          { matching_indexes: matches.map((match) => match.index) }
        )));
        continue;
      }
      if (!priorFragment) {
        errors.push(publicError(ownershipError(
          matches.length > 0 ? "unowned-hook-collision" : "managed-hook-missing",
          normalized.target,
          selectedFragment,
          matches.length > 0 ? { matching_index: matches[0].index } : {}
        )));
        continue;
      }
      if (matches.length === 0) {
        errors.push(publicError(ownershipError("managed-hook-missing", normalized.target, selectedFragment)));
        continue;
      }
      if (matches.some((match) => !match.exact)) {
        errors.push(publicError(ownershipError(
          "managed-hook-modified",
          normalized.target,
          selectedFragment,
          {
            matching_index: matches[0].index,
            matching_event: matches[0].event
          }
        )));
        continue;
      }
      if (priorFragment.recognition_hash !== selectedFragment.recognition_hash) {
        errors.push(publicError(ownershipError(
          "managed-hook-modified",
          normalized.target,
          selectedFragment,
          {
            expected_recognition_hash: priorFragment.recognition_hash,
            observed_recognition_hash: selectedFragment.recognition_hash
          }
        )));
        continue;
      }
      const observedHash = hashJson(matches[0].declaration);
      if (observedHash !== priorFragment.desired_hash) {
        errors.push(publicError(ownershipError(
          "managed-hook-modified",
          normalized.target,
          selectedFragment,
          {
            expected_hash: priorFragment.desired_hash,
            observed_hash: observedHash,
            matching_index: matches[0].index
          }
        )));
      }
    }

    if (parsed.value.hooks?.enabled === false && normalized.hooks_explicitly_selected) {
      warnings.push({ code: "configured-disabled", target: normalized.target });
    }
    return { ok: errors.length === 0, errors, warnings };
  } catch (error) {
    if (!(error instanceof ZCodeHookError)) {
      throw error;
    }
    return { ok: false, errors: [publicError(error)], warnings: [] };
  }
}

function normalizeBinding(binding) {
  const metadata = binding.metadata ?? binding;
  const intent = requireNonEmptyString(
    binding.intent ?? binding.asset_id,
    "intent",
    "zcode-hook-intent-type"
  );
  validateIntentName(intent);
  const scope = requireScope(binding.scope);
  const support = metadata.support ?? binding.support ?? "native";
  if (support === "unsupported") {
    throw new ZCodeHookError(
      "zcode-hook-unsupported",
      `${intent}: ZCode Hook intent is unsupported`,
      { intent, scope }
    );
  }
  if (support !== "native") {
    throw new ZCodeHookError(
      "zcode-hook-support-type",
      `${intent}: ZCode Hook support must be native or unsupported`,
      { intent, support }
    );
  }
  const event = normalizeEvent(metadata.event ?? binding.event, intent);
  const matcher = normalizeMatcher(metadata.matcher ?? binding.matcher ?? null, intent);
  const effect = metadata.effect ?? binding.effect ?? "additionalContext";
  if (effect !== "additionalContext") {
    throw new ZCodeHookError(
      "zcode-hook-effect-type",
      `${intent}: ZCode Hook effect must be additionalContext`,
      { intent, effect }
    );
  }
  const renderer = metadata.adapter_runtime_name ?? binding.renderer ?? ZCODE_CONTEXT_ADAPTER_RUNTIME;
  if (typeof renderer !== "string" || renderer.length === 0) {
    throw new ZCodeHookError(
      "zcode-hook-renderer-type",
      `${intent}: adapter runtime name must be a non-empty string`,
      { intent }
    );
  }
  const adapterTarget = binding.adapter_target ?? binding.adapterTarget;
  if (typeof adapterTarget !== "string" || !path.isAbsolute(adapterTarget) ||
      path.basename(adapterTarget) !== `${intent}.mjs` || adapterTarget.includes("\0")) {
    throw new ZCodeHookError(
      "zcode-hook-target-type",
      `${intent}: adapter_target must be an absolute path`,
      { intent, adapter_target: adapterTarget }
    );
  }
  const source = requireNonEmptyString(binding.source, "source", "zcode-hook-source-type");
  const body = binding.body ?? binding.source_text ?? binding.context_markdown;
  if (typeof body !== "string") {
    throw new ZCodeHookError(
      "zcode-hook-source-type",
      `${intent}: canonical intent body must be a string`,
      { intent }
    );
  }
  const contextHash = binding.context_hash ?? binding.source_hash;
  if (contextHash !== undefined &&
      (typeof contextHash !== "string" || contextHash.length === 0)) {
    throw new ZCodeHookError(
      "zcode-hook-context-hash-type",
      `${intent}: context_hash must be a non-empty string`,
      { intent }
    );
  }
  const assetId = requireNonEmptyString(binding.asset_id ?? intent, "asset_id", "zcode-hook-asset-type");
  return {
    asset_id: assetId,
    intent,
    scope,
    event,
    matcher,
    renderer,
    source,
    body,
    adapter_target: adapterTarget,
    context_hash: contextHash
  };
}

function normalizeMergeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ZCodeHookError("zcode-hook-input-type", "ZCode Hook merge input must be an object");
  }
  const scope = requireScope(input.scope);
  const target = requireNonEmptyString(input.target, "target", "zcode-hook-target-type");
  const suppliedText = input.current_text ?? input.live_text;
  const currentText = suppliedText === undefined || suppliedText === null
    ? null
    : suppliedText;
  if (currentText !== null && typeof currentText !== "string") {
    throw new ZCodeHookError(
      "zcode-config-json-invalid",
      `${target}: current_text must be a string`,
      { target }
    );
  }
  const selected = input.selected ?? [];
  if (!Array.isArray(selected)) {
    throw new ZCodeHookError(
      "zcode-hook-selection-type",
      `${target}: selected must be an array`,
      { target }
    );
  }
  const explicitlySelected = input.hooks_explicitly_selected === undefined
    ? true
    : input.hooks_explicitly_selected;
  if (typeof explicitlySelected !== "boolean") {
    throw new ZCodeHookError(
      "zcode-hook-selection-type",
      `${target}: hooks_explicitly_selected must be boolean`,
      { target }
    );
  }
  return {
    scope,
    target,
    current_text: currentText,
    selected,
    prior: input.prior ?? null,
    hooks_explicitly_selected: explicitlySelected
  };
}

function normalizeSelections(selected, scope) {
  const fragments = selected.map((entry, index) => normalizeSelection(entry, scope, index));
  const identities = new Set();
  for (const fragment of fragments) {
    if (identities.has(fragment.identity)) {
      throw ownershipError(
        "managed-hook-duplicate",
        "<selection>",
        fragment,
        { selection_index: selected.findIndex((entry) => entry.intent === fragment.intent) }
      );
    }
    identities.add(fragment.identity);
  }
  return fragments.sort(compareFragments);
}

function normalizeSelection(entry, scope, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new ZCodeHookError(
      "zcode-hook-selection-type",
      `selected[${index}] must be an object`,
      { selection_index: index }
    );
  }
  const intent = requireNonEmptyString(entry.intent, `selected[${index}].intent`, "zcode-hook-intent-type");
  validateIntentName(intent);
  const event = normalizeEvent(entry.event, intent);
  const matcher = normalizeMatcher(entry.matcher ?? null, intent);
  const adapterTarget = entry.adapter_target;
  if (typeof adapterTarget !== "string" || !path.isAbsolute(adapterTarget) ||
      path.basename(adapterTarget) !== `${intent}.mjs` || adapterTarget.includes("\0")) {
    throw new ZCodeHookError(
      "zcode-hook-target-type",
      `selected[${index}].adapter_target must be an absolute path`,
      { selection_index: index, adapter_target: adapterTarget }
    );
  }
  if (entry.context_hash !== undefined &&
      (typeof entry.context_hash !== "string" || entry.context_hash.length === 0)) {
    throw new ZCodeHookError(
      "zcode-hook-context-hash-type",
      `selected[${index}].context_hash must be a non-empty string`,
      { selection_index: index }
    );
  }
  const fragment = {
    identity: zcodeHookIdentity(scope, event, intent),
    event,
    matcher,
    recognition_hash: hashJson(recognitionTuple(event, matcher, adapterTarget)),
    prior_hash: null,
    desired_hash: null,
    intent,
    adapter_target: adapterTarget,
    declaration: declarationFor(event, matcher, adapterTarget)
  };
  fragment.desired_hash = hashJson(fragment.declaration);
  return fragment;
}

function buildFragment(binding) {
  const selected = normalizeSelection({
    intent: binding.intent,
    event: binding.event,
    matcher: binding.matcher,
    adapter_target: binding.adapter_target
  }, binding.scope, 0);
  return {
    ...selected,
    prior_hash: null
  };
}

function normalizeEvent(event, intent) {
  if (typeof event !== "string" || !event.length) {
    throw new ZCodeHookError(
      "zcode-hook-event-type",
      `${intent}: event must be a non-empty native event`,
      { intent, event }
    );
  }
  if (!NATIVE_EVENTS.has(event)) {
    throw new ZCodeHookError(
      "zcode-hook-event-type",
      `${intent}: unsupported native event ${event}`,
      { intent, event }
    );
  }
  if (!SUPPORTED_EVENTS.has(event)) {
    throw new ZCodeHookError(
      "zcode-hook-unsupported",
      `${intent}: no supported ZCode adapter mapping for ${event}`,
      { intent, event }
    );
  }
  return event;
}

function normalizeMatcher(matcher, intent) {
  if (matcher !== null && typeof matcher !== "string") {
    throw new ZCodeHookError(
      "zcode-hook-matcher-type",
      `${intent}: matcher must be a string or null`,
      { intent, matcher }
    );
  }
  return matcher;
}

function declarationFor(event, matcher, adapterTarget) {
  const declaration = {};
  if (matcher !== null) {
    declaration.matcher = matcher;
  }
  declaration.hooks = [{
    type: "process",
    command: "node",
    args: [adapterTarget],
    timeoutMs: 5000
  }];
  return declaration;
}

function recognitionTuple(event, matcher, adapterTarget) {
  return {
    event,
    matcher,
    command: "node",
    adapter_target: adapterTarget,
    adapter_filename: path.basename(adapterTarget)
  };
}

function parseConfig(currentText, target) {
  if (currentText === null) {
    return {
      value: {},
      originalText: null,
      format: { indent: "  ", eol: "\n", finalNewline: true }
    };
  }
  let value;
  try {
    value = JSON.parse(currentText);
  } catch (error) {
    throw new ZCodeHookError(
      "zcode-config-json-invalid",
      `${target}: invalid JSON: ${error.message}`,
      { target }
    );
  }
  return {
    value,
    originalText: currentText,
    format: detectFormat(currentText)
  };
}

function validateConfig(config, target) {
  if (!isPlainObject(config)) {
    throw structuralError("zcode-config-root-type", "$", "object", config, target);
  }
  const hooks = config.hooks;
  if (hooks === undefined) {
    return;
  }
  if (!isPlainObject(hooks)) {
    throw structuralError("zcode-hooks-type", "$.hooks", "object", hooks, target);
  }
  if (hooks.enabled !== undefined && typeof hooks.enabled !== "boolean") {
    throw structuralError("zcode-hooks-enabled-type", "$.hooks.enabled", "boolean", hooks.enabled, target);
  }
  const events = hooks.events;
  if (events === undefined) {
    return;
  }
  if (!isPlainObject(events)) {
    throw structuralError("zcode-hooks-events-type", "$.hooks.events", "object", events, target);
  }
  for (const [event, bucket] of Object.entries(events)) {
    if (!Array.isArray(bucket)) {
      throw structuralError(
        "zcode-hook-event-bucket-type",
        `$.hooks.events.${event}`,
        "array",
        bucket,
        target
      );
    }
    bucket.forEach((declaration, declarationIndex) =>
      validateDeclaration(declaration, `$.hooks.events.${event}[${declarationIndex}]`, target)
    );
  }
}

function validateDeclaration(declaration, jsonPath, target) {
  if (!isPlainObject(declaration)) {
    throw structuralError("zcode-hook-declaration-type", jsonPath, "object", declaration, target);
  }
  if (declaration.matcher !== undefined && typeof declaration.matcher !== "string") {
    throw structuralError("zcode-hook-matcher-type", `${jsonPath}.matcher`, "string", declaration.matcher, target);
  }
  if (!Array.isArray(declaration.hooks)) {
    throw structuralError("zcode-hook-list-type", `${jsonPath}.hooks`, "array", declaration.hooks, target);
  }
  declaration.hooks.forEach((hook, hookIndex) => {
    const hookPath = `${jsonPath}.hooks[${hookIndex}]`;
    if (!isPlainObject(hook)) {
      throw structuralError("zcode-hook-process-type", hookPath, "object", hook, target);
    }
    if (hook.type !== "process") {
      return;
    }
    if (typeof hook.command !== "string" || hook.command.length === 0) {
      throw structuralError("zcode-hook-process-type", `${hookPath}.command`, "non-empty string", hook.command, target);
    }
    if (!Array.isArray(hook.args) || hook.args.some((arg) => typeof arg !== "string")) {
      throw structuralError("zcode-hook-process-type", `${hookPath}.args`, "string array", hook.args, target);
    }
    if (
      hook.timeoutMs !== undefined &&
      (!Number.isInteger(hook.timeoutMs) || hook.timeoutMs < 0)
    ) {
      throw structuralError("zcode-hook-process-type", `${hookPath}.timeoutMs`, "non-negative integer", hook.timeoutMs, target);
    }
  });
}

function findMatches(config, fragment) {
  const events = config.hooks?.events;
  if (!events) {
    return [];
  }
  const matches = [];
  for (const [event, bucket] of Object.entries(events)) {
    bucket.forEach((declaration, index) => {
      const matchingHooks = declaration.hooks.filter((hook) =>
        Array.isArray(hook.args) &&
        hook.args.length > 0 &&
        hook.args[0] === fragment.adapter_target
      );
      if (matchingHooks.length === 0) {
        return;
      }
      matches.push({
        event,
        index,
        declaration,
        exact: event === fragment.event &&
          (declaration.matcher === undefined ? null : declaration.matcher) === fragment.matcher &&
          matchingHooks.some((hook) => hook.type === "process" && hook.command === "node")
      });
    });
  }
  return matches;
}

function appendDeclaration(config, fragment) {
  if (!config.hooks) {
    config.hooks = {};
  }
  if (!config.hooks.events) {
    config.hooks.events = {};
  }
  if (!config.hooks.events[fragment.event]) {
    config.hooks.events[fragment.event] = [];
  }
  const bucket = config.hooks.events[fragment.event];
  // New managed entries are already processed by identity order because
  // selections are sorted before this function is called.  Existing entries
  // remain in their original order.
  bucket.push(fragment.declaration);
}

function normalizePrior(prior, target) {
  if (prior === null || prior === undefined) {
    return { managed_fragments: [], introduced: { hooks_enabled: false } };
  }
  if (!isPlainObject(prior)) {
    throw new ZCodeHookError(
      "zcode-hook-receipt-type",
      `${target}: prior receipt must be an object`,
      { target }
    );
  }
  const fragments = prior.managed_fragments ?? [];
  if (!Array.isArray(fragments)) {
    throw new ZCodeHookError(
      "zcode-hook-receipt-type",
      `${target}: prior managed_fragments must be an array`,
      { target }
    );
  }
  const identities = new Set();
  const normalized = fragments.map((fragment, index) => {
    if (!isPlainObject(fragment)) {
      throw new ZCodeHookError(
        "zcode-hook-receipt-type",
        `${target}: prior managed_fragments[${index}] must be an object`,
        { target, fragment_index: index }
      );
    }
    for (const field of ["identity", "event", "recognition_hash", "desired_hash"]) {
      if (typeof fragment[field] !== "string" || fragment[field].length === 0) {
        throw new ZCodeHookError(
          "zcode-hook-receipt-type",
          `${target}: prior managed fragment ${field} must be a non-empty string`,
          { target, fragment_index: index, field }
        );
      }
    }
    if (fragment.matcher !== null && fragment.matcher !== undefined && typeof fragment.matcher !== "string") {
      throw new ZCodeHookError(
        "zcode-hook-receipt-type",
        `${target}: prior managed fragment matcher must be a string or null`,
        { target, fragment_index: index }
      );
    }
    if (fragment.prior_hash !== null && fragment.prior_hash !== undefined && typeof fragment.prior_hash !== "string") {
      throw new ZCodeHookError(
        "zcode-hook-receipt-type",
        `${target}: prior managed fragment prior_hash must be a string or null`,
        { target, fragment_index: index }
      );
    }
    if (identities.has(fragment.identity)) {
      throw ownershipError(
        "managed-hook-duplicate",
        target,
        {
          identity: fragment.identity,
          intent: fragment.intent ?? fragment.identity,
          event: fragment.event,
          matcher: fragment.matcher ?? null,
          adapter_target: fragment.adapter_target ?? ""
        },
        { receipt_index: index }
      );
    }
    identities.add(fragment.identity);
    return {
      identity: fragment.identity,
      event: fragment.event,
      matcher: fragment.matcher === undefined ? null : fragment.matcher,
      recognition_hash: fragment.recognition_hash,
      prior_hash: fragment.prior_hash ?? null,
      desired_hash: fragment.desired_hash,
      ...(fragment.intent ? { intent: fragment.intent } : {}),
      ...(fragment.adapter_target ? { adapter_target: fragment.adapter_target } : {})
    };
  });
  return {
    managed_fragments: normalized,
    introduced: {
      hooks_enabled: prior.introduced?.hooks_enabled === true
    }
  };
}

function ownershipError(code, target, fragment, details = {}) {
  return new ZCodeHookError(
    code,
    `${target}: ${code} for ${fragment.intent ?? fragment.identity}`,
    {
      target,
      identity: fragment.identity,
      event: fragment.event,
      matcher: fragment.matcher,
      ...details
    }
  );
}

function toReceipt(fragment) {
  return {
    identity: fragment.identity,
    event: fragment.event,
    matcher: fragment.matcher,
    recognition_hash: fragment.recognition_hash,
    prior_hash: fragment.prior_hash ?? null,
    desired_hash: fragment.desired_hash
  };
}

function structuralError(code, jsonPath, expected, value, target) {
  return new ZCodeHookError(
    code,
    `${target}: ${jsonPath} must be ${expected}; got ${typeName(value)}`,
    {
      target,
      json_path: jsonPath,
      expected,
      actual: typeName(value)
    }
  );
}

function publicError(error) {
  return {
    code: error.code,
    message: error.message,
    ...(error.details ?? {})
  };
}

function serializeConfig(config, format) {
  let serialized = JSON.stringify(config, null, format.indent);
  if (format.eol !== "\n") {
    serialized = serialized.replaceAll("\n", format.eol);
  }
  if (format.finalNewline) {
    serialized += format.eol;
  }
  return serialized;
}

function detectFormat(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const indentMatch = text.match(/(?:^|\r?\n)([ \t]+)["}]/);
  return {
    indent: indentMatch?.[1] ?? "  ",
    eol,
    finalNewline: text.endsWith("\n") || text.endsWith("\r")
  };
}

function compareFragments(left, right) {
  return left.identity.localeCompare(right.identity);
}

function requireScope(scope) {
  if (scope !== "project" && scope !== "global") {
    throw new ZCodeHookError(
      "zcode-hook-scope-type",
      "ZCode Hook scope must be project or global",
      { scope }
    );
  }
  return scope;
}

function requireNonEmptyString(value, label, code) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ZCodeHookError(code, `${label} must be a non-empty string`, { [label]: value });
  }
  return value;
}

function validateIntentName(intent) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(intent)) {
    throw new ZCodeHookError(
      "zcode-hook-intent-type",
      `${intent}: intent must be kebab-case`,
      { intent }
    );
  }
  return intent;
}

function hashJson(value) {
  return sha256(stableStringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])])
    );
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function typeName(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}
