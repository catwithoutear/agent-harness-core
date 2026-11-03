import fs from "node:fs";
import path from "node:path";
import { readText, markdownTableLinesAfterHeading, splitTableRow } from "./markdown.js";

// Derived work is a marker-gated table in an objective's requirements (or plan)
// artifact. The marker keeps existing change workspaces valid while making the
// policy explicit in the artifact that opts in.

const REQUIRED_POLICY_KEYS = [
  "heading",
  "id_pattern",
  "columns",
  "allowed_statuses",
  "active_statuses"
];

export function derivedWorkPolicyFor(schema, packageSchema) {
  const base = packageSchema?.derived_work ?? null;
  const override = schema?.derived_work;
  if (!base && !override) return null;
  const merged = { ...(base ?? {}), ...(override ?? {}) };
  for (const key of REQUIRED_POLICY_KEYS) {
    if (merged[key] === undefined) {
      throw new Error(`derived_work policy is missing required key: ${key}`);
    }
  }
  return merged;
}

export function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, "\n");
}

// Returns { present, enabled, value }: an absent key means an inert legacy
// table, while a present key with an unsupported value is a hard error so a typo
// cannot silently disable every ledger rule.
export function derivedWorkMarker(text, policy) {
  const front = normalizeNewlines(text).match(/^---\n([\s\S]*?)\n---/);
  if (!front) return { present: false, enabled: false, value: null };
  for (const line of front[1].split("\n")) {
    const keyValue = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!keyValue) continue;
    if (keyValue[1].toLowerCase() !== "derived_work") continue;
    const value = keyValue[2].trim();
    return { present: true, enabled: value === policy.marker, value };
  }
  return { present: false, enabled: false, value: null };
}

export function normalizeHeader(cell) {
  return cell.toLowerCase().replace(/\s+/g, " ").trim();
}

function activeStatus(policy, status) {
  return (policy.active_statuses ?? []).includes(status);
}

function parseDependencies(cell) {
  const value = (cell ?? "").trim();
  if (!value || value === "-") return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseDate(value) {
  const text = (value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

// Returns null when the table cannot be parsed at all, so callers report the same
// diagnostic the Python implementation does.
export function parseDerivedWorkRows(text, policy) {
  const lines = markdownTableLinesAfterHeading(normalizeNewlines(text), policy.heading);
  if (lines.length < 2) return null;
  const headers = splitTableRow(lines[0]).map(normalizeHeader);
  const expected = policy.columns.map(normalizeHeader);
  if (headers.join("|") !== expected.join("|")) {
    return { headers, rows: null };
  }
  const rows = [];
  for (const line of lines.slice(2)) {
    const cells = splitTableRow(line);
    if (cells.length !== headers.length) return { headers, rows: null };
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
  }
  return { headers, rows };
}

export function ledgerArtifactFor(changeDir, policy) {
  const candidates = [policy.artifact ?? "requirements.md", policy.plan_artifact ?? "plan.md"];
  for (const candidate of candidates) {
    const file = path.join(changeDir, candidate);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

export function validateDerivedWork({ changeDir, schema, packageSchema, errors, warnings, now = new Date() }) {
  let policy;
  try {
    policy = derivedWorkPolicyFor(schema, packageSchema);
  } catch (error) {
    errors.push(`${changeDir}: ${error.message}`);
    return null;
  }
  if (!policy) return null;

  const file = ledgerArtifactFor(changeDir, policy);
  if (!file) return null;
  const text = readText(file);
  const marker = derivedWorkMarker(text, policy);
  if (!marker.present) return null;
  if (!marker.enabled) {
    errors.push(
      `${file}: unsupported derived_work marker ${JSON.stringify(marker.value)}; expected ${policy.marker} (remove the key to leave a legacy table inert)`
    );
    return null;
  }

  const ids = new Set();
  if (!normalizeNewlines(text).split("\n").some((line) => line.trim() === `## ${policy.heading}`)) {
    errors.push(`${file}: derived_work marker requires a ## ${policy.heading} section`);
    return null;
  }
  const parsed = parseDerivedWorkRows(text, policy);
  if (!parsed || parsed.rows === null) {
    errors.push(`${file}: ## ${policy.heading} must contain a table with the policy columns`);
    return null;
  }
  if (parsed.rows.length === 0) {
    errors.push(`${file}: ## ${policy.heading} must contain at least one work item`);
    return null;
  }

  const idPattern = new RegExp(`^(?:${policy.id_pattern})$`);
  const rows = [];
  parsed.rows.forEach((row, index) => {
    const label = `derived work row ${index + 1}`;
    const id = row[normalizeHeader("work")] ?? "";
    const status = row[normalizeHeader("status")] ?? "";
    const owner = row[normalizeHeader("owner")] ?? "";
    const outcome = row[normalizeHeader("outcome")] ?? "";
    const nextAction = row[normalizeHeader("next action")] ?? "";
    const evidence = row[normalizeHeader("evidence")] ?? "";
    const change = row[normalizeHeader("change")] ?? "";
    const updated = row[normalizeHeader("updated")] ?? "";
    const dependsOn = row[normalizeHeader("depends on")] ?? "";

    if (!idPattern.test(id)) errors.push(`${file}: ${label} has invalid work id: ${id || "(empty)"}`);
    else if (ids.has(id)) errors.push(`${file}: duplicate work id: ${id}`);
    else ids.add(id);

    if (!policy.allowed_statuses.includes(status)) {
      errors.push(`${file}: ${id || label} has unknown status: ${status || "(empty)"}; allowed: ${policy.allowed_statuses.join(", ")}`);
    }
    if (!outcome || outcome === "-") errors.push(`${file}: ${id || label} requires an outcome`);
    if (!owner || owner === "-") errors.push(`${file}: ${id || label} requires an owner`);
    if (activeStatus(policy, status)) {
      if (!nextAction || nextAction === "-") errors.push(`${file}: ${id || label} is ${status} and requires a next action`);
      if (!parseDate(updated)) errors.push(`${file}: ${id || label} is ${status} and requires an Updated date (YYYY-MM-DD)`);
    }
    if (status === "done" && policy.done_requires_evidence_or_change) {
      const hasEvidence = evidence && evidence !== "-";
      const hasChange = change && change !== "-";
      if (!hasEvidence && !hasChange) {
        errors.push(`${file}: ${id || label} is done but names neither evidence nor a change`);
      }
    }
    if (updated && updated !== "-" && !parseDate(updated)) {
      errors.push(`${file}: ${id || label} has an invalid Updated date: ${updated}`);
    }
    rows.push({ id, status, nextAction, change, updated, dependsOn, label });
  });

  for (const row of rows) {
    for (const dependency of parseDependencies(row.dependsOn)) {
      if (dependency === row.id) errors.push(`${file}: ${row.id || row.label} depends on itself`);
      else if (!ids.has(dependency)) errors.push(`${file}: ${row.id || row.label} depends on unknown work id: ${dependency}`);
    }
  }

  const windowDays = policy.stale_after_days ?? 0;
  if (windowDays > 0) {
    for (const row of rows) {
      if (!activeStatus(policy, row.status)) continue;
      const date = parseDate(row.updated);
      if (!date) continue;
      const ageDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
      if (ageDays > windowDays) {
        warnings.push(`${file}: ${row.id} has been ${row.status} for ${ageDays} days; confirm the next action is still current`);
      }
    }
  }

  return { file, ids, rows };
}

function relationRows(readmePath) {
  if (!fs.existsSync(readmePath)) return [];
  const lines = markdownTableLinesAfterHeading(readText(readmePath), "Change Relations");
  if (lines.length < 2) return [];
  const headers = splitTableRow(lines[0]).map(normalizeHeader);
  const typeIndex = headers.indexOf("type");
  const changeIndex = headers.indexOf("change");
  if (typeIndex === -1 || changeIndex === -1) return [];
  return lines
    .slice(2)
    .map(splitTableRow)
    .filter((cells) => cells.length === headers.length)
    .map((cells) => ({ type: cells[typeIndex], change: cells[changeIndex].replace(/`/g, "") }));
}

// Direction 1: a change that declares `spawned-from <objective>` must be named in
// that objective's ledger.
export function validatePromotion({ changeDir, changeId, schema, packageSchema, repoRoot, errors }) {
  let policy;
  try {
    policy = derivedWorkPolicyFor(schema, packageSchema);
  } catch {
    return;
  }
  if (!policy || !repoRoot) return;
  const readme = path.join(changeDir, "README.md");
  const promoted = relationRows(readme).filter((row) => row.type === "spawned-from");
  for (const promotion of promoted) {
    if (!promotion.change || promotion.change === ".." || promotion.change.includes("/")) continue;
    const objectiveDir = path.join(repoRoot, ".changes", promotion.change);
    const artifact = ledgerArtifactFor(objectiveDir, policy);
    if (!artifact) continue;
    const marker = derivedWorkMarker(readText(artifact), policy);
    if (!marker.enabled) continue;
    const parsed = parseDerivedWorkRows(readText(artifact), policy);
    if (!parsed || !parsed.rows) continue;
    const names = parsed.rows.some((row) => (row[normalizeHeader("change")] ?? "").replace(/`/g, "") === changeId);
    if (!names) {
      errors.push(`${readme}: spawned-from ${promotion.change} requires a derived work row naming ${changeId}`);
    }
  }
}

// Direction 2: an objective row that names a change must point at a change whose
// index declares `spawned-from <objective>`, and that change must exist.
export function validateLedgerPromotions({ changeDir, schema, packageSchema, repoRoot, ledger, errors }) {
  if (!ledger || !repoRoot) return;
  const objectiveId = path.basename(changeDir);
  for (const row of ledger.rows) {
    const change = (row.change ?? "").replace(/`/g, "").trim();
    if (!change || change === "-") continue;
    if (change === ".." || /[\\/]/.test(change)) {
      errors.push(`${ledger.file}: ${row.id} names an invalid change: ${change}`);
      continue;
    }
    const childDir = path.join(repoRoot, ".changes", change);
    if (!fs.existsSync(childDir)) {
      errors.push(`${ledger.file}: ${row.id} names a change that does not exist: ${change}`);
      continue;
    }
    const declared = relationRows(path.join(childDir, "README.md")).some(
      (relation) => relation.type === "spawned-from" && relation.change === objectiveId
    );
    if (!declared) {
      errors.push(
        `${ledger.file}: ${row.id} names ${change} but that change does not declare spawned-from ${objectiveId}`
      );
    }
  }
}
