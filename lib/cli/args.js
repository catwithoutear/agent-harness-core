export function parseArgs(argv) {
  const result = {
    flags: new Set(),
    values: new Map(),
    positionals: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      result.positionals.push(token);
      continue;
    }

    const eq = token.indexOf("=");
    if (eq !== -1) {
      result.values.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }

    const name = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("-")) {
      result.values.set(name, next);
      index += 1;
    } else {
      result.flags.add(name);
    }
  }

  return result;
}

export function hasFlag(parsed, name) {
  return parsed.flags.has(name) || parsed.values.get(name) === "true";
}

export function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
