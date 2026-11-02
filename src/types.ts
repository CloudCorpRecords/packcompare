/**
 * packcompare types.
 *
 * packcompare diffs two snapshots of a package: a "before"
 * snapshot and an "after" snapshot. Each snapshot carries a
 * version string, a file inventory (path plus size), a map
 * of dependency names to version strings, and a list of
 * export paths. From those two snapshots alone, as pure
 * local computation, packcompare reports:
 *
 *   - which files were added, removed, or resized
 *   - which dependencies were added, removed, or changed
 *   - which exports were added or removed
 *   - the summed sizes and file counts of each snapshot
 *   - whether the change is breaking (pinned: exactly when
 *     at least one export was removed)
 */

/** One file in a package snapshot. */
export interface PackageFile {
  /** File path; non-empty and unique within the snapshot. */
  path: string;
  /** File size in bytes; an integer of at least 0. */
  size: number;
}

/** One version of a package, as supplied by the caller. */
export interface PackageSnapshot {
  /** Package version string; non-empty. */
  version: string;
  /** Files in this snapshot; may be empty. */
  files: PackageFile[];
  /** Dependency name to version string map. */
  dependencies: Record<string, string>;
  /** Export paths; may be empty, duplicates ignored after the first. */
  exports: string[];
}

/** A file present in both snapshots whose size changed. */
export interface FileChange {
  path: string;
  size_before: number;
  size_after: number;
}

/** A dependency present on only one side of the diff. */
export interface DependencyEntry {
  name: string;
  version: string;
}

/** A dependency present in both snapshots whose version changed. */
export interface DependencyChange {
  name: string;
  from: string;
  to: string;
}

/** The full diff between two package snapshots. */
export interface PackCompareResult {
  version_before: string;
  version_after: string;
  files: {
    added: string[];
    removed: string[];
    changed: FileChange[];
  };
  dependencies: {
    added: DependencyEntry[];
    removed: DependencyEntry[];
    changed: DependencyChange[];
  };
  exports: {
    added: string[];
    removed: string[];
  };
  size_before: number;
  size_after: number;
  size_delta: number;
  file_count_before: number;
  file_count_after: number;
  breaking: boolean;
  breaking_reasons: string[];
}
