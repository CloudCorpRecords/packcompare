import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comparePackages } from "../src/packcompare.js";

/**
 * All tests are pure local computation over inline snapshots:
 * no filesystem and no network. The pinned diff semantics
 * (file added/removed/changed sorted by path, dependency
 * added/removed/changed sorted by name, export set diff
 * sorted, summed sizes with a possibly negative delta, and
 * breaking exactly on removed exports with reasons in sorted
 * order) and every validation path, including duplicate file
 * paths and snapshot-prefixed error paths, are each pinned.
 */

type Snap = Record<string, unknown>;

const snap = (over: Snap = {}): Snap => ({
  version: "1.0.0",
  files: [],
  dependencies: {},
  exports: [],
  ...over,
});

const diff = (before: Snap, after: Snap) => comparePackages({ before, after });

const emptyDiff = {
  files: { added: [], removed: [], changed: [] },
  dependencies: { added: [], removed: [], changed: [] },
  exports: { added: [], removed: [] },
};

describe("comparePackages — identical and empty snapshots", () => {
  it("identical snapshots produce empty diffs, delta 0, breaking false", () => {
    const s = snap({
      files: [
        { path: "index.js", size: 100 },
        { path: "lib/a.js", size: 50 },
      ],
      dependencies: { react: "18.0.0" },
      exports: ["./index.js"],
    });
    const out = diff(structuredClone(s), structuredClone(s));
    assert.deepEqual(out, {
      version_before: "1.0.0",
      version_after: "1.0.0",
      ...emptyDiff,
      size_before: 150,
      size_after: 150,
      size_delta: 0,
      file_count_before: 2,
      file_count_after: 2,
      breaking: false,
      breaking_reasons: [],
    });
  });

  it("empty files, dependencies, and exports on both sides are valid", () => {
    const out = diff(snap({ version: "0.1.0" }), snap({ version: "0.2.0" }));
    assert.deepEqual(out, {
      version_before: "0.1.0",
      version_after: "0.2.0",
      ...emptyDiff,
      size_before: 0,
      size_after: 0,
      size_delta: 0,
      file_count_before: 0,
      file_count_after: 0,
      breaking: false,
      breaking_reasons: [],
    });
  });

  it("version strings are echoed verbatim, even when unchanged in content", () => {
    const out = diff(snap({ version: "1.0.0-beta.1" }), snap({ version: "2.0.0" }));
    assert.equal(out.version_before, "1.0.0-beta.1");
    assert.equal(out.version_after, "2.0.0");
  });
});

describe("comparePackages — files", () => {
  it("added, removed, and changed files are reported and sorted by path", () => {
    const before = snap({
      files: [
        { path: "z-removed.js", size: 10 },
        { path: "b-changed.js", size: 20 },
        { path: "a-removed.js", size: 30 },
        { path: "same.js", size: 40 },
      ],
    });
    const after = snap({
      files: [
        { path: "y-added.js", size: 5 },
        { path: "same.js", size: 40 },
        { path: "b-changed.js", size: 25 },
        { path: "c-added.js", size: 15 },
      ],
    });
    const out = diff(before, after);
    assert.deepEqual(out.files, {
      added: ["c-added.js", "y-added.js"],
      removed: ["a-removed.js", "z-removed.js"],
      changed: [{ path: "b-changed.js", size_before: 20, size_after: 25 }],
    });
    assert.equal(out.size_before, 100);
    assert.equal(out.size_after, 85);
    assert.equal(out.size_delta, -15);
    assert.equal(out.file_count_before, 4);
    assert.equal(out.file_count_after, 4);
  });

  it("multiple changed files are sorted by path", () => {
    const before = snap({
      files: [
        { path: "m.js", size: 1 },
        { path: "a.js", size: 2 },
        { path: "z.js", size: 3 },
      ],
    });
    const after = snap({
      files: [
        { path: "z.js", size: 30 },
        { path: "m.js", size: 10 },
        { path: "a.js", size: 20 },
      ],
    });
    assert.deepEqual(diff(before, after).files.changed, [
      { path: "a.js", size_before: 2, size_after: 20 },
      { path: "m.js", size_before: 1, size_after: 10 },
      { path: "z.js", size_before: 3, size_after: 30 },
    ]);
  });

  it("a file with the same size in both snapshots is not changed", () => {
    const out = diff(
      snap({ files: [{ path: "a.js", size: 7 }] }),
      snap({ files: [{ path: "a.js", size: 7 }] }),
    );
    assert.deepEqual(out.files.changed, []);
  });

  it("size 0 files count, sum as 0, and resizing from 0 is a change", () => {
    const before = snap({
      files: [
        { path: "empty.js", size: 0 },
        { path: "grows.js", size: 0 },
      ],
    });
    const after = snap({
      files: [
        { path: "empty.js", size: 0 },
        { path: "grows.js", size: 12 },
      ],
    });
    const out = diff(before, after);
    assert.deepEqual(out.files.changed, [
      { path: "grows.js", size_before: 0, size_after: 12 },
    ]);
    assert.equal(out.size_before, 0);
    assert.equal(out.size_after, 12);
    assert.equal(out.file_count_before, 2);
  });

  it("shrinking a file to size 0 is a change, not a removal", () => {
    const out = diff(
      snap({ files: [{ path: "a.js", size: 9 }] }),
      snap({ files: [{ path: "a.js", size: 0 }] }),
    );
    assert.deepEqual(out.files, {
      added: [],
      removed: [],
      changed: [{ path: "a.js", size_before: 9, size_after: 0 }],
    });
    assert.equal(out.size_delta, -9);
  });

  it("the size delta is negative when the package shrinks overall", () => {
    const out = diff(
      snap({ files: [{ path: "big.js", size: 1000 }] }),
      snap({ files: [{ path: "big.js", size: 10 }] }),
    );
    assert.equal(out.size_delta, -990);
  });
});

describe("comparePackages — dependencies", () => {
  it("added carries the after version, removed the before version, changed carries from/to; all sorted by name", () => {
    const before = snap({
      dependencies: { zebra: "1.0.0", alpha: "1.0.0", mid: "1.0.0", gone: "9.9.9" },
    });
    const after = snap({
      dependencies: { mid: "2.0.0", alpha: "1.0.0", zebra: "1.0.1", fresh: "0.1.0", another: "3.0.0" },
    });
    const out = diff(before, after);
    assert.deepEqual(out.dependencies, {
      added: [
        { name: "another", version: "3.0.0" },
        { name: "fresh", version: "0.1.0" },
      ],
      removed: [{ name: "gone", version: "9.9.9" }],
      changed: [
        { name: "mid", from: "1.0.0", to: "2.0.0" },
        { name: "zebra", from: "1.0.0", to: "1.0.1" },
      ],
    });
  });

  it("a dependency with an identical version string is not changed", () => {
    const out = diff(
      snap({ dependencies: { a: "1.0.0" } }),
      snap({ dependencies: { a: "1.0.0" } }),
    );
    assert.deepEqual(out.dependencies, { added: [], removed: [], changed: [] });
  });

  it("any version string difference counts, including downgrades and ranges", () => {
    const out = diff(
      snap({ dependencies: { a: "^2.0.0", b: "2.0.0" } }),
      snap({ dependencies: { a: "^1.0.0", b: "2.0.0 " } }),
    );
    assert.deepEqual(out.dependencies.changed, [
      { name: "a", from: "^2.0.0", to: "^1.0.0" },
      { name: "b", from: "2.0.0", to: "2.0.0 " },
    ]);
  });
});

describe("comparePackages — exports and breaking", () => {
  it("added and removed exports are sorted ascending", () => {
    const out = diff(
      snap({ exports: ["./z", "./a", "./keep"] }),
      snap({ exports: ["./keep", "./m", "./b"] }),
    );
    assert.deepEqual(out.exports, { added: ["./b", "./m"], removed: ["./a", "./z"] });
  });

  it("duplicate exports within a snapshot are ignored after the first (pinned)", () => {
    const out = diff(
      snap({ exports: ["./a", "./a", "./b", "./b", "./b"] }),
      snap({ exports: ["./b", "./b", "./c", "./c"] }),
    );
    assert.deepEqual(out.exports, { added: ["./c"], removed: ["./a"] });
  });

  it("breaking is true exactly when an export was removed, with reasons in sorted removed order", () => {
    const out = diff(
      snap({ exports: ["./z", "./a", "./keep"] }),
      snap({ exports: ["./keep"] }),
    );
    assert.equal(out.breaking, true);
    assert.deepEqual(out.breaking_reasons, ["removed export: ./a", "removed export: ./z"]);
  });

  it("breaking is false when exports were only added", () => {
    const out = diff(snap({ exports: [] }), snap({ exports: ["./new"] }));
    assert.equal(out.breaking, false);
    assert.deepEqual(out.breaking_reasons, []);
  });

  it("breaking is false when files and dependencies change but no export is removed", () => {
    const out = diff(
      snap({
        files: [{ path: "a.js", size: 1 }],
        dependencies: { a: "1.0.0" },
        exports: ["./a"],
      }),
      snap({
        files: [{ path: "b.js", size: 500 }],
        dependencies: { b: "9.0.0" },
        exports: ["./a", "./b"],
      }),
    );
    assert.equal(out.breaking, false);
    assert.deepEqual(out.breaking_reasons, []);
  });

  it("removing every export is breaking, with one reason per removed export", () => {
    const out = diff(snap({ exports: ["./b", "./a"] }), snap({ exports: [] }));
    assert.equal(out.breaking, true);
    assert.deepEqual(out.breaking_reasons, ["removed export: ./a", "removed export: ./b"]);
  });
});

describe("comparePackages — validation: snapshots and version", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => comparePackages(args), { message });

  it("before missing or not an object names before", () => {
    throws({}, "before is required");
    throws({ after: snap() }, "before is required");
    throws({ before: "x", after: snap() }, "before must be an object");
    throws({ before: [], after: snap() }, "before must be an object");
    throws({ before: null, after: snap() }, "before must be an object");
  });

  it("after missing or not an object names after", () => {
    throws({ before: snap() }, "after is required");
    throws({ before: snap(), after: 42 }, "after must be an object");
    throws({ before: snap(), after: [] }, "after must be an object");
  });

  it("a non-object top-level argument is treated as {} (pinned judgement call)", () => {
    throws(null, "before is required");
    throws([], "before is required");
    throws("x", "before is required");
    throws(42, "before is required");
  });

  it("version missing, empty, or non-string names the snapshot-prefixed path", () => {
    const b = snap();
    delete b.version;
    throws({ before: b, after: snap() }, "before.version is required");
    throws({ before: snap({ version: "" }), after: snap() }, "before.version must be a non-empty string");
    throws({ before: snap({ version: 3 }), after: snap() }, "before.version must be a non-empty string");
    throws({ before: snap(), after: snap({ version: "" }) }, "after.version must be a non-empty string");
    throws({ before: snap(), after: snap({ version: null }) }, "after.version must be a non-empty string");
  });

  it("before is validated before after", () => {
    throws(
      { before: snap({ version: "" }), after: snap({ version: "" }) },
      "before.version must be a non-empty string",
    );
  });
});

describe("comparePackages — validation: files", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => comparePackages(args), { message });

  it("files missing or non-array names the snapshot-prefixed path", () => {
    const b = snap();
    delete b.files;
    throws({ before: b, after: snap() }, "before.files is required");
    throws({ before: snap({ files: {} }), after: snap() }, "before.files must be an array");
    throws({ before: snap(), after: snap({ files: "x" }) }, "after.files must be an array");
  });

  it("a file entry that is not an object names its index", () => {
    throws(
      { before: snap({ files: ["a.js"] }), after: snap() },
      "before.files[0] must be an object",
    );
    throws(
      { before: snap(), after: snap({ files: [null] }) },
      "after.files[0] must be an object",
    );
  });

  it("file path missing, empty, or non-string names files[i].path", () => {
    throws(
      { before: snap({ files: [{ size: 1 }] }), after: snap() },
      "before.files[0].path is required",
    );
    throws(
      { before: snap({ files: [{ path: "", size: 1 }] }), after: snap() },
      "before.files[0].path must be a non-empty string",
    );
    throws(
      { before: snap(), after: snap({ files: [{ path: 7, size: 1 }] }) },
      "after.files[0].path must be a non-empty string",
    );
  });

  it("a duplicate file path names the second occurrence, per snapshot (spec example)", () => {
    throws(
      {
        before: snap({
          files: [
            { path: "a.js", size: 1 },
            { path: "a.js", size: 2 },
          ],
        }),
        after: snap(),
      },
      "before.files[1].path is a duplicate",
    );
    throws(
      {
        before: snap(),
        after: snap({
          files: [
            { path: "x.js", size: 1 },
            { path: "y.js", size: 1 },
            { path: "x.js", size: 3 },
          ],
        }),
      },
      "after.files[2].path is a duplicate",
    );
  });

  it("the same path in both snapshots is not a duplicate", () => {
    const out = diff(
      snap({ files: [{ path: "a.js", size: 1 }] }),
      snap({ files: [{ path: "a.js", size: 1 }] }),
    );
    assert.deepEqual(out.files.changed, []);
  });

  it("file size missing or badly typed names files[i].size", () => {
    throws(
      { before: snap({ files: [{ path: "a.js" }] }), after: snap() },
      "before.files[0].size is required",
    );
    for (const bad of [-1, 1.5, "10", true, null, NaN]) {
      throws(
        { before: snap({ files: [{ path: "a.js", size: bad }] }), after: snap() },
        "before.files[0].size must be an integer >= 0",
      );
    }
    throws(
      { before: snap(), after: snap({ files: [{ path: "a.js", size: -5 }] }) },
      "after.files[0].size must be an integer >= 0",
    );
  });

  it("size 0 is a valid file size", () => {
    const out = diff(snap({ files: [{ path: "a.js", size: 0 }] }), snap());
    assert.deepEqual(out.files.removed, ["a.js"]);
  });
});

describe("comparePackages — validation: dependencies and exports", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => comparePackages(args), { message });

  it("dependencies missing or non-object names the snapshot-prefixed path", () => {
    const b = snap();
    delete b.dependencies;
    throws({ before: b, after: snap() }, "before.dependencies is required");
    throws(
      { before: snap({ dependencies: [] }), after: snap() },
      "before.dependencies must be an object",
    );
    throws(
      { before: snap(), after: snap({ dependencies: "x" }) },
      "after.dependencies must be an object",
    );
  });

  it("a dependency with an empty name names dependencies", () => {
    throws(
      { before: snap({ dependencies: { "": "1.0.0" } }), after: snap() },
      "before.dependencies name must be a non-empty string",
    );
  });

  it("a dependency with an empty or non-string version names dependencies.<name>", () => {
    throws(
      { before: snap({ dependencies: { react: "" } }), after: snap() },
      "before.dependencies.react must be a non-empty string",
    );
    throws(
      { before: snap({ dependencies: { react: 18 } }), after: snap() },
      "before.dependencies.react must be a non-empty string",
    );
    throws(
      { before: snap(), after: snap({ dependencies: { vue: null } }) },
      "after.dependencies.vue must be a non-empty string",
    );
  });

  it("exports missing or non-array names the snapshot-prefixed path", () => {
    const b = snap();
    delete b.exports;
    throws({ before: b, after: snap() }, "before.exports is required");
    throws({ before: snap({ exports: {} }), after: snap() }, "before.exports must be an array");
    throws({ before: snap(), after: snap({ exports: "./a" }) }, "after.exports must be an array");
  });

  it("an exports entry that is not a non-empty string names exports[i]", () => {
    throws(
      { before: snap({ exports: ["./a", ""] }), after: snap() },
      "before.exports[1] must be a non-empty string",
    );
    throws(
      { before: snap({ exports: [42] }), after: snap() },
      "before.exports[0] must be a non-empty string",
    );
    throws(
      { before: snap(), after: snap({ exports: [null] }) },
      "after.exports[0] must be a non-empty string",
    );
  });

  it("unknown extra fields are ignored at every level (pinned judgement call)", () => {
    const out = comparePackages({
      before: snap({
        files: [{ path: "a.js", size: 1, hash: "abc" }],
        extra: true,
      }),
      after: snap({ files: [{ path: "a.js", size: 1 }] }),
      something_else: [1, 2, 3],
    });
    assert.deepEqual(out.files, { added: [], removed: [], changed: [] });
  });

  it("no partial result is produced on invalid input", () => {
    assert.throws(() =>
      comparePackages({
        before: snap({ files: [{ path: "a.js", size: 1 }] }),
        after: snap({ files: [{ path: "a.js", size: -1 }] }),
      }),
    );
  });
});
