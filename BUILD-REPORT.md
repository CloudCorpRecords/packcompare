# packcompare — Build Report

MCP Rebuild 1000, Batch 17. Original program build from the
packages-100 plan (cluster F #72), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch17/packcompare.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `packcompare`, npm `@reneturcios/packcompare`,
MCP name `io.github.CloudCorpRecords/packcompare`, version
`0.1.0`, bin `packcompare` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Diff two
  versions of a package: files, dependencies, size, and
  exports." — 71 chars, verified by count; npm entry carries
  `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/packcompare:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/packcompare"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`compare --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/packcompare.ts` (core,
  `VERSION = "0.1.0"`)
- `test/packcompare.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/packcompare`,
  smoke-test server-name assertion `packcompare`)

Plus the parity fixture at
`harness/fixtures/packcompare-tools-original.json`, labelled
as a program spec from the packages-100 plan cluster F #72.

## Tools implemented (1)

- `compare_packages` — arguments: `before` (object,
  required) and `after` (object, required), each a package
  snapshot with `version` (string, required, non-empty),
  `files` (array, required, may be empty) of {`path`
  (string, required, non-empty, unique within the
  snapshot), `size` (integer, required, >= 0)},
  `dependencies` (object, required; a map of dependency
  name to version string), and `exports` (array of
  non-empty strings, required, may be empty; duplicates
  within a snapshot ignored after the first).

  Pinned diff semantics: files `added` / `removed` are path
  strings only in after / only in before and `changed`
  carries {path, size_before, size_after} for paths in both
  with different sizes — all sorted by path. Dependencies
  `added` carries {name, version} (the after version),
  `removed` carries {name, version} (the before version),
  and `changed` carries {name, from, to} for names in both
  with different version strings — all sorted by name.
  Exports are compared as sets; `added` / `removed` are
  sorted. `size_before` / `size_after` are the summed file
  sizes, `size_delta` is size_after − size_before (may be
  negative), and the file counts count each snapshot's
  files. Breaking (pinned) is true exactly when at least
  one export was removed, with `breaking_reasons` holding
  one "removed export: <name>" string per removed export
  in the removed-exports sorted order, otherwise [].
  Returns {version_before, version_after, files,
  dependencies, exports, size_before, size_after,
  size_delta, file_count_before, file_count_after,
  breaking, breaking_reasons}.

  The fixture literal
  (`harness/fixtures/packcompare-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no top-level
  `$schema` key — confirmed by the parity run below.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). The snapshot object schema is spelled
  out in full for both `before` and `after`, following the
  apisurface precedent for nested snapshots. Every
  `tools/call` is validated by the core itself, so the MCP
  and CLI paths share one validation implementation; the
  core takes the full arguments object (`{before, after}`).
- **Dependencies-fragment choice (recorded)**: the
  `dependencies` property in the schema literal is
  `{"type": "object", "description": "Dependency name to
  version string map", "additionalProperties": {"type":
  "string"}}` — the standard string-to-string map fragment
  of this program, following the repoready `package_scripts`
  precedent (SCOREBOARD gap 238). The fixture and the
  `src/mcp.ts` literal carry this fragment identically, so
  parity is exact. No other `additionalProperties` key and
  no top-level `$schema` key appears in the literal.
- Validation is path-naming and total, with snapshot
  prefixes: a missing or non-object `before` / `after`; a
  missing, empty, or non-string version; a missing or
  non-array files list; a file entry that is not an object
  or has a missing, empty, non-string, or duplicate `path`
  (reported as e.g. "before.files[1].path is a duplicate")
  or a missing or badly-typed `size`; a missing or
  non-object `dependencies`; a dependency with an empty
  name or a missing, empty, or non-string version; or a
  missing or non-array `exports` or a non-string/empty
  exports entry throws an Error naming the offending path
  and produces no partial result (MCP: `isError`; CLI:
  exit 1). `before` is validated fully before `after`.
  Dependency membership is tested with own-property checks
  and the validated map is built with `Object.fromEntries`,
  so names colliding with `Object.prototype` members are
  handled as ordinary dependencies.

## Verification (foreground, this session)

- `npm test` (`tsx --test test/*.test.ts`): **37 tests,
  37 pass, 0 fail** — identical snapshots (all diffs empty,
  delta 0, breaking false); empty files/deps/exports on
  both sides; file add/remove/resize sorting, same-size
  files not changed, size 0 files counting and resizing
  from/to 0, and a negative size delta; dependency
  add/remove/version-change sorting, identical versions not
  changed, and any version-string difference counting
  (including a trailing-space difference); export
  add/remove sorting, duplicate exports within a snapshot
  ignored, breaking true/false and the reasons' order; and
  every validation path (snapshot missing/non-object,
  version missing/empty/non-string per snapshot, files
  missing/non-array, file entry non-object, file path
  missing/empty/non-string/duplicate per snapshot with the
  snapshot-prefixed example path, file size missing /
  negative / fractional / string / boolean / null / NaN,
  dependencies missing/non-object/array, empty dependency
  name, empty/non-string dependency version per snapshot,
  exports missing/non-array, empty/non-string exports
  entries per snapshot, unknown extra fields ignored at
  every level, a non-object top-level argument treated as
  {}, before validated before after, and no partial result
  on invalid input).
- `npx tsc --noEmit` → exit 0; `npm run build` produced
  `dist/` with all 15 outputs.
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `compare` with no `--input` exits 2;
  `compare --input <missing file>` exits 1 naming the file;
  `compare --input <valid file>` exits 0 and prints the
  hand-checked diff for a 1.0.0 → 1.1.0 input (index.js
  resized 1200 → 1400, old.js removed, dependency `gone`
  removed, `left-pad` changed 1.3.0 → 1.4.0, export
  `./old.js` removed, size_delta 100, breaking true with
  reason "removed export: ./old.js").
- Parity: `harness/parity.py` vs
  `harness/fixtures/packcompare-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; the harness does
  not expand a `~` inside the quoted stdio command
  string). Report saved under `parity-out/`.

## Lockfile status

`package-lock.json` generated clean via Route 3 (in the
build directory with no `node_modules` present, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/packcompare`, **128 package entries**.
Resolved versions match the sibling reference tree
(`@modelcontextprotocol/sdk` 1.32.2, `zod` 3.25.76,
`tsx` 4.23.15, `typescript` 5.9.3, `@types/node`
20.19.43, `qs` 6.17.0). The subsequent offline
`npm install --ignore-scripts --offline`, build, tests,
and parity all ran against this lockfile's tree.

## Gaps / honest notes

- **Pinned judgement calls** (each with a dedicated test
  where applicable): (1) the dependencies map fragment —
  `additionalProperties: {type: "string"}` carried
  identically in fixture and literal, following the
  repoready precedent (see Implementation notes); (2)
  unknown extra fields are ignored rather than rejected,
  at the top level, in a snapshot, and in a file entry
  (the spec confirms this for extras generally); (3) a
  non-object top-level arguments value is treated as an
  empty object, so it fails as `before is required` (the
  spec pins this); (4) `before` is validated fully before
  `after`, so a doubly-invalid input reports the `before`
  error; (5) within a snapshot, fields are validated in
  the order version, files, dependencies, exports, and
  within a file entry `path` (including the duplicate
  check) is validated before `size`; (6) error-message
  wording other than the spec's example
  ("before.files[1].path is a duplicate", reproduced
  exactly) follows the fleet's path-naming pattern (e.g.
  `before.files[0].size must be an integer >= 0`,
  `before.dependencies.<name> must be a non-empty string`,
  and an empty dependency name reported as
  `before.dependencies name must be a non-empty string`);
  (7) sorting is plain ascending string order, and export
  set comparison ignores duplicates after the first (the
  spec pins both). No other spec ambiguity was found in
  the core behaviour.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
