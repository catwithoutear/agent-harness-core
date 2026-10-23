import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Keep snapshots outside every client discovery root. `snapshotTarget` copies and
// leaves the source in place; `snapshotTarget(..., { move: true })` moves the
// replaced target into the snapshot for conflict backups.
export function snapshotTarget(target, { original = target, move = false } = {}) {
  const root = backupRoot();
  assertBackupRootOutside(target, root);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = fs.mkdtempSync(path.join(root, "snapshot-"));
  fs.chmodSync(directory, 0o700);
  const saved = path.join(directory, "entry");
  try {
    if (move) {
      moveEntry(target, saved);
    } else {
      fs.cpSync(target, saved, { recursive: true, dereference: false, verbatimSymlinks: true });
    }
    const resolvedOriginal = path.resolve(original);
    const manifest = path.join(directory, "manifest.json");
    fs.writeFileSync(manifest, `${JSON.stringify({ original: resolvedOriginal, saved }, null, 2)}\n`, { mode: 0o600 });
    return { original: resolvedOriginal, saved, manifest, directory };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function restoreTargetSnapshot(snapshot, target) {
  moveEntry(snapshot.saved, target);
  fs.rmSync(snapshot.directory, { recursive: true, force: true });
}

function backupRoot() {
  return path.join(os.homedir(), "backup", "agent-harness-core");
}

function assertBackupRootOutside(target, root) {
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
}

function moveEntry(source, destination) {
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.cpSync(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
}
