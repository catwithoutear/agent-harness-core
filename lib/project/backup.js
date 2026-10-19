import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Keep snapshots outside every client discovery root; never remove the source.
export function snapshotTarget(target) {
  const root = path.join(os.homedir(), "backup", "agent-harness-core");
  const relative = path.relative(path.resolve(target), root);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error("backup root must be outside the source tree");
  }
  let current = root;
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`backup root has symlinked path component: ${current}`);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = fs.mkdtempSync(path.join(root, "snapshot-"));
  fs.chmodSync(directory, 0o700);
  const saved = path.join(directory, "entry");
  try {
    fs.cpSync(target, saved, { recursive: true, dereference: false, verbatimSymlinks: true });
    const manifest = path.join(directory, "manifest.json");
    fs.writeFileSync(manifest, `${JSON.stringify({ original: path.resolve(target), saved }, null, 2)}\n`, { mode: 0o600 });
    return { original: path.resolve(target), saved, manifest };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
