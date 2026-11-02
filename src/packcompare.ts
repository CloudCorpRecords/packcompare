/**
 * packcompare core: diff two versions of a package.
 *
 *   comparePackages(args) -> { version_before, version_after,
 *     files: {added, removed, changed},
 *     dependencies: {added, removed, changed},
 *     exports: {added, removed},
 *     size_before, size_after, size_delta,
 *     file_count_before, file_count_after,
 *     breaking, breaking_reasons }
 *
 * Pinned semantics:
 * - Files: added = paths only in after; removed = paths only
 *   in before; changed = paths in both with different sizes,
 *   as {path, size_before, size_after}. All three sorted by
 *   path ascending.
 * - Dependencies: added = names only in after, as
 *   {name, version} (the after version); removed = names
 *   only in before, as {name, version} (the before version);
 *   changed = names in both with different version strings,
 *   as {name, from, to}. All three sorted by name ascending.
 * - Exports: added / removed = the export strings only in
 *   after / only in before, sorted ascending, compared as
 *   sets (duplicates within a snapshot are ignored after
 *   the first).
 * - Sizes: size_before / size_after = the sum of the
 *   snapshot's file sizes; size_delta = size_after -
 *   size_before (may be negative). File counts are the
 *   number of files in each snapshot.
 * - Breaking (pinned): breaking is true exactly when at
 *   least one export was removed. breaking_reasons holds
 *   one "removed export: <name>" string per removed export,
 *   in the removed-exports sorted order; otherwise [].
 *
 * Validation is strict and path-naming, with paths prefixed
 * by the snapshot name ("before" / "after"): any malformed
 * input throws an Error naming the offending path (for
 * example "before.files[1].path is a duplicate") and no
 * partial result is produced. Unknown extra fields are
 * ignored; a non-object top-level argument is treated
 * as {}.
 */
import type {
  DependencyChange,
  DependencyEntry,
  FileChange,
  PackCompareResult,
  PackageSnapshot,
} from "./types.js";

export const VERSION = "0.1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Validate one snapshot under its label ("before" / "after"). */
function validateSnapshot(value: unknown, label: string): PackageSnapshot {
  if (value === undefined) throw new Error(`${label} is required`);
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const raw = value;

  if (raw.version === undefined) throw new Error(`${label}.version is required`);
  if (typeof raw.version !== "string" || raw.version.length === 0) {
    throw new Error(`${label}.version must be a non-empty string`);
  }

  if (raw.files === undefined) throw new Error(`${label}.files is required`);
  if (!Array.isArray(raw.files)) throw new Error(`${label}.files must be an array`);
  const seenPaths = new Set<string>();
  const files = raw.files.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`${label}.files[${i}] must be an object`);
    if (entry.path === undefined) {
      throw new Error(`${label}.files[${i}].path is required`);
    }
    if (typeof entry.path !== "string" || entry.path.length === 0) {
      throw new Error(`${label}.files[${i}].path must be a non-empty string`);
    }
    if (seenPaths.has(entry.path)) {
      throw new Error(`${label}.files[${i}].path is a duplicate`);
    }
    seenPaths.add(entry.path);
    if (entry.size === undefined) {
      throw new Error(`${label}.files[${i}].size is required`);
    }
    if (
      typeof entry.size !== "number" ||
      !Number.isInteger(entry.size) ||
      entry.size < 0
    ) {
      throw new Error(`${label}.files[${i}].size must be an integer >= 0`);
    }
    return { path: entry.path, size: entry.size };
  });

  if (raw.dependencies === undefined) {
    throw new Error(`${label}.dependencies is required`);
  }
  if (!isRecord(raw.dependencies)) {
    throw new Error(`${label}.dependencies must be an object`);
  }
  const depEntries: [string, string][] = [];
  for (const [name, version] of Object.entries(raw.dependencies)) {
    if (name.length === 0) {
      throw new Error(`${label}.dependencies name must be a non-empty string`);
    }
    if (typeof version !== "string" || version.length === 0) {
      throw new Error(`${label}.dependencies.${name} must be a non-empty string`);
    }
    depEntries.push([name, version]);
  }
  const dependencies: Record<string, string> = Object.fromEntries(depEntries);

  if (raw.exports === undefined) throw new Error(`${label}.exports is required`);
  if (!Array.isArray(raw.exports)) throw new Error(`${label}.exports must be an array`);
  const exportsList = raw.exports.map((entry, i) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`${label}.exports[${i}] must be a non-empty string`);
    }
    return entry;
  });

  return { version: raw.version, files, dependencies, exports: exportsList };
}

/** Diff two package snapshots. */
export function comparePackages(args: unknown): PackCompareResult {
  const raw: Record<string, unknown> = isRecord(args) ? args : {};
  const before = validateSnapshot(raw.before, "before");
  const after = validateSnapshot(raw.after, "after");

  // Files, keyed by path.
  const beforeFiles = new Map(before.files.map((f) => [f.path, f.size]));
  const afterFiles = new Map(after.files.map((f) => [f.path, f.size]));
  const filesAdded = [...afterFiles.keys()]
    .filter((p) => !beforeFiles.has(p))
    .sort(compareStrings);
  const filesRemoved = [...beforeFiles.keys()]
    .filter((p) => !afterFiles.has(p))
    .sort(compareStrings);
  const filesChanged: FileChange[] = [...beforeFiles.keys()]
    .filter((p) => afterFiles.has(p) && afterFiles.get(p) !== beforeFiles.get(p))
    .sort(compareStrings)
    .map((p) => ({
      path: p,
      size_before: beforeFiles.get(p) as number,
      size_after: afterFiles.get(p) as number,
    }));

  // Dependencies, keyed by name.
  const beforeDeps = before.dependencies;
  const afterDeps = after.dependencies;
  const has = (obj: Record<string, string>, key: string) =>
    Object.prototype.hasOwnProperty.call(obj, key);
  const depsAdded: DependencyEntry[] = Object.keys(afterDeps)
    .filter((n) => !has(beforeDeps, n))
    .sort(compareStrings)
    .map((n) => ({ name: n, version: afterDeps[n] }));
  const depsRemoved: DependencyEntry[] = Object.keys(beforeDeps)
    .filter((n) => !has(afterDeps, n))
    .sort(compareStrings)
    .map((n) => ({ name: n, version: beforeDeps[n] }));
  const depsChanged: DependencyChange[] = Object.keys(beforeDeps)
    .filter((n) => has(afterDeps, n) && afterDeps[n] !== beforeDeps[n])
    .sort(compareStrings)
    .map((n) => ({ name: n, from: beforeDeps[n], to: afterDeps[n] }));

  // Exports, compared as sets (duplicates ignored after the first).
  const beforeExports = new Set(before.exports);
  const afterExports = new Set(after.exports);
  const exportsAdded = [...afterExports]
    .filter((e) => !beforeExports.has(e))
    .sort(compareStrings);
  const exportsRemoved = [...beforeExports]
    .filter((e) => !afterExports.has(e))
    .sort(compareStrings);

  const sizeBefore = before.files.reduce((sum, f) => sum + f.size, 0);
  const sizeAfter = after.files.reduce((sum, f) => sum + f.size, 0);

  const breaking = exportsRemoved.length > 0;

  return {
    version_before: before.version,
    version_after: after.version,
    files: { added: filesAdded, removed: filesRemoved, changed: filesChanged },
    dependencies: { added: depsAdded, removed: depsRemoved, changed: depsChanged },
    exports: { added: exportsAdded, removed: exportsRemoved },
    size_before: sizeBefore,
    size_after: sizeAfter,
    size_delta: sizeAfter - sizeBefore,
    file_count_before: before.files.length,
    file_count_after: after.files.length,
    breaking,
    breaking_reasons: exportsRemoved.map((name) => `removed export: ${name}`),
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
