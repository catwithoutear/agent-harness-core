import fs from "node:fs";
import path from "node:path";
import { readText, markdownTableLinesAfterHeading, parseMarkdownTable, splitTableRow } from "./markdown.js";

// Derived work is a marker-gated table in an objective's requirements artifact.
// The marker keeps existing change workspaces valid while making the policy
// explicit in the artifact that opts in.
export const DERIVED_WORK_MARKER_KEY = "derived_work";

export function derivedWorkPolicyFor(primary, fallback) {
  const base = fallback?.derived_work ?? null;
  const override = primary?.derived_work;
  if (!override) {
    return base;
  }
  return { ...(base ?? {}), ...override };
}

export function derivedWorkEnabled(text, policy) {
  if (!policy) return false;
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return false;
  for (const line of match[1].split("\n")) {
    const keyValue = line.match(/^derived_work:\s*(\S+)\s*$/);
    if (keyValue) return keyValue[1] === policy.marker;
  }
  return false;
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
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3])) {
    return null;
  }
  return date;
}

export function parseDerivedWorkRows(text, policy) {
  const lines = markdownTableLinesAfterHeading(text, policy.heading);
  if (lines.length < 2) return null;
  const headers = splitTableRow(lines[0]).map(normalizeHeader);
  const rows = parseMarkdownTable(lines).map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = value;
    }
    return normalized;
  });
  return { headers, rows };
}

export function validateDerivedWork({ changeDir, schema, errors, warnings, now = new Date() }) {
  const basePolicy = schema?.derived_work ?? null;
  if (!basePolicy) return null;
  const file = path.join(changeDir, basePolicy.artifact ?? "requirements.md");
  if (!fs.existsSync(file)) return null;
  const text = readText(file);
  if (!derivedWorkEnabled(text, basePolicy)) return null;

  const policy = basePolicy;
  const columns = policy.columns.map(normalizeHeader);
  const ids = new Set();

  if (!text.split("\n").some((line) => line.trim() === `## ${policy.heading}`)) {
    errors.push(`${file}: derived_work marker requires a ## ${policy.heading} section`);
    return null;
  }
  const parsed = parseDerivedWorkRows(text, policy);
  if (!parsed) {
    errors.push(`${file}: ## ${policy.heading} must contain a table with the policy columns`);
    return null;
  }
  if (parsed.headers.join("|") !== columns.join("|")) {
    errors.push(
      `${file}: derived work columns must be exactly: ${policy.columns.join(", ")}; found: ${parsed.headers.join(", ")}`
    );
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
    rows.push({ id, status, nextAction, change, updated, dependsOn });
  });

  for (const row of rows) {
    for (const dependency of parseDependencies(row.dependsOn)) {
      if (!ids.has(dependency)) {
        errors.push(`${file}: ${row.id} depends on unknown work id: ${dependency}`);
      }
      if (dependency === row.id) {
        errors.push(`${file}: ${row.id} depends on itself`);
      }
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

// A change that promoted an item declares `spawned-from: <objective>`; the
// objective's ledger must name that change in the matching item.
export function validatePromotion({ changeDir, changeId, schema, repoRoot, errors }) {
  const policy = schema?.derived_work ?? null;
  if (!policy || !repoRoot) return;
  const readme = path.join(changeDir, "README.md");
  if (!fs.existsSync(readme)) return;
  const text = readText(readme);
  const relations = markdownTableLinesAfterHeading(text, schema.relations?.heading ?? "Change Relations");
  if (relations.length < 2) return;
  const rows = parseMarkdownTable(relations);
  const promoted = rows
    .map((row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) normalized[key.trim().toLowerCase()] = value;
      return normalized;
    })
    .filter((row) => row.type === "spawned-from");
  for (const promotion of promoted) {
    const objectiveDir = path.join(repoRoot, ".changes", promotion.change);
    const requirements = path.join(objectiveDir, "requirements.md");
    if (!fs.existsSync(requirements)) continue;
    const objectiveText = readText(requirements);
    if (!derivedWorkEnabled(objectiveText, policy)) continue;
    const parsed = parseDerivedWorkRows(objectiveText, policy);
    if (!parsed) continue;
    const names = parsed.rows.some((row) => {
      const change = row[normalizeHeader("change")] ?? "";
      return change === changeId || change === `\`${changeId}\``;
    });
    if (!names) {
      errors.push(
        `${readme}: spawned-from ${promotion.change} requires a derived work row naming ${changeId}`
      );
    }
  }
}
