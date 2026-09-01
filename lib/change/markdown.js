import fs from "node:fs";
import path from "node:path";

const FRONT_MATTER_RE = /^---\n([\s\S]*?)\n---\n/;

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

export function parseFrontMatter(filePath) {
  if (!fs.existsSync(filePath) || path.extname(filePath) !== ".md") {
    return null;
  }
  const match = readText(filePath).match(FRONT_MATTER_RE);
  if (!match) {
    return null;
  }
  const data = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#") || !line.includes(":")) {
      continue;
    }
    const index = line.indexOf(":");
    data[line.slice(0, index).trim()] = parseScalar(line.slice(index + 1));
  }
  return data;
}

export function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const body = trimmed.slice(1, -1).trim();
    if (!body) {
      return [];
    }
    return body.split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, ""));
  }
  return trimmed.replace(/^['"]|['"]$/g, "");
}

export function frontMatter(artifact, status, tags, description) {
  return [
    "---",
    `artifact: ${artifact}`,
    `status: ${status}`,
    `tags: [${tags.join(", ")}]`,
    `description: "${description}"`,
    "---",
    ""
  ].join("\n");
}

export function markdownTableAfterHeading(text, heading) {
  return parseMarkdownTable(markdownTableLinesAfterHeading(text, heading));
}

export function markdownTableLinesAfterHeading(text, heading) {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== `## ${heading}`) {
      continue;
    }
    const tableLines = [];
    for (const candidate of lines.slice(index + 1)) {
      if (candidate.startsWith("## ")) {
        break;
      }
      if (candidate.trim().startsWith("|")) {
        tableLines.push(candidate.trim());
      } else if (tableLines.length > 0 && candidate.trim()) {
        break;
      }
    }
    return tableLines;
  }
  return [];
}

export function insertMarkdownTableRowAfterHeading(text, heading, expectedColumns, row) {
  const lines = text.split("\n");
  const headingText = `## ${heading}`;
  const headingIndexes = lines
    .map((line, index) => (line.trim() === headingText ? index : -1))
    .filter((index) => index >= 0);
  const invalid = (reason) => {
    throw new Error(`document requires one valid unique ${heading} table: ${reason}`);
  };
  if (headingIndexes.length !== 1) {
    invalid(`found ${headingIndexes.length} exact headings`);
  }

  let headerIndex = headingIndexes[0] + 1;
  while (headerIndex < lines.length && !lines[headerIndex].trim()) {
    headerIndex += 1;
  }
  if (headerIndex >= lines.length || !lines[headerIndex].trim().startsWith("|")) {
    invalid("table header is missing");
  }
  const actualColumns = splitTableRow(lines[headerIndex]);
  if (actualColumns.length !== expectedColumns.length || actualColumns.some((column, index) => column !== expectedColumns[index])) {
    invalid(`expected columns ${expectedColumns.join(", ")}`);
  }

  const dividerIndex = headerIndex + 1;
  if (dividerIndex >= lines.length || !lines[dividerIndex].trim().startsWith("|")) {
    invalid("table divider is missing");
  }
  const dividerCells = splitTableRow(lines[dividerIndex]);
  if (dividerCells.length !== expectedColumns.length || dividerCells.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    invalid("table divider is malformed");
  }

  let tableEnd = dividerIndex + 1;
  while (tableEnd < lines.length && lines[tableEnd].trim().startsWith("|")) {
    tableEnd += 1;
  }
  if (lines.slice(dividerIndex + 1, tableEnd).some((line) => line.trim() === row.trim())) {
    return text;
  }
  lines.splice(tableEnd, 0, row);
  return lines.join("\n");
}

export function parseMarkdownTable(lines) {
  if (lines.length < 2) {
    return [];
  }
  const headers = splitTableRow(lines[0]);
  return lines.slice(2).map((line) => {
    const cells = splitTableRow(line);
    while (cells.length < headers.length) {
      cells.push("");
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

export function splitTableRow(line) {
  let stripped = line.trim();
  if (stripped.startsWith("|")) {
    stripped = stripped.slice(1);
  }
  if (stripped.endsWith("|")) {
    stripped = stripped.slice(0, -1);
  }
  return stripped.split("|").map((cell) => cell.trim().replace(/^`|`$/g, ""));
}

export function walkFiles(root, predicate = () => true) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

export function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function kebabSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}
