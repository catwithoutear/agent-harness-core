import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THIRD_PARTY_PREFIX = "skills/third-party/";

/**
 * Measure the core skill prompt surface in characters.
 *
 * Scope: only the default-enabled, non-third-party skills declared in
 * `harness.manifest.json`. Rules, commands, agents, templates, hooks, and other
 * prompt-bearing assets are outside this metric.
 *
 * Characters are JavaScript string lengths (UTF-16 code units), the unit used
 * for the prompt-surface baseline.
 *
 * Three load classes are reported separately:
 * - `alwaysOnCoreSkillDescriptionChars`: manifest descriptions loaded as the
 *   skill catalog before any skill body is opened;
 * - `defaultLoadedCoreSkillChars`: whole core `SKILL.md` files loaded by
 *   default;
 * - `coreSkillPackageChars`: every file in the core skill packages, references
 *   and scripts included.
 *
 * The third class is a size baseline, not a guard against moving text: moving a
 * paragraph from a `SKILL.md` into its `references/` keeps
 * `coreSkillPackageChars` unchanged while lowering
 * `defaultLoadedCoreSkillChars`. The classes therefore describe where the core
 * skill surface is loaded, not what a change is allowed to relocate.
 */
export function measureCoreSkillPromptSurface(root = packageRoot) {
  const manifestPath = path.join(root, "harness.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const skills = manifest.assets?.skills;
  if (!Array.isArray(skills)) {
    throw new Error(`${manifestPath} has no assets.skills list`);
  }

  const coreSkills = skills.filter(
    (skill) =>
      skill.enabledByDefault !== false &&
      !normalizeSource(skill.source).startsWith(THIRD_PARTY_PREFIX)
  );

  let alwaysOnCoreSkillDescriptionChars = 0;
  let defaultLoadedCoreSkillChars = 0;
  let coreSkillPackageChars = 0;
  for (const skill of coreSkills) {
    const skillRoot = path.join(root, normalizeSource(skill.source));
    alwaysOnCoreSkillDescriptionChars += skill.description.length;
    defaultLoadedCoreSkillChars += fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8").length;
    coreSkillPackageChars += directoryCharacters(skillRoot);
  }

  return {
    coreSkillCount: coreSkills.length,
    alwaysOnCoreSkillDescriptionChars,
    defaultLoadedCoreSkillChars,
    coreSkillPackageChars
  };
}

function normalizeSource(value) {
  return value.split(path.sep).join("/");
}

function directoryCharacters(root) {
  let total = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      total += directoryCharacters(fullPath);
    } else if (entry.isFile()) {
      total += fs.readFileSync(fullPath, "utf8").length;
    }
  }
  return total;
}
