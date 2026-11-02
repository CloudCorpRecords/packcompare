# packcompare

A package can change a lot between two versions without any
single change looking dramatic: a file quietly grows, a
dependency is swapped, an export path disappears. packcompare
puts both snapshots side by side and reports the whole move
at once, so a release review starts from the diff instead of
from a hunch.

You supply two snapshots of the same package — a `before`
and an `after`. Each one is a plain description, not a real
package on disk: a `version` string, a `files` list of
`{path, size}` entries, a `dependencies` map of name to
version string, and an `exports` list of strings.

The file report splits into three sorted lists: paths only
in `after` were added, paths only in `before` were removed,
and paths present in both with different sizes are changed,
each carrying `size_before` and `size_after`. File paths must
be unique within a snapshot, and sizes may be zero — an
empty file is still a file. Dependencies get the same
treatment, sorted by name: added and removed entries carry
the version from the side they exist on, and a name present
in both with a different version string is changed, reported
as `{name, from, to}`.

Exports are compared as sets, so mentioning the same export
twice in one snapshot changes nothing. The headline numbers
are the summed file sizes of each snapshot, their difference
`size_delta` (which is negative when the package shrank),
and the file counts on each side.

Breaking is deliberately narrow and pinned: a change is
breaking exactly when at least one export was removed, and
`breaking_reasons` spells each one out as
`removed export: <name>` in the removed list's sorted order.
Added files, resized files, and dependency bumps — however
large — never make a change breaking on their own.

Malformed input is a validation error naming the offending
path, with the snapshot named in the path: a duplicate file
path is reported as `before.files[1].path is a duplicate`,
for example. No partial diff is produced. Unknown extra
fields are ignored. The computation is pure and local: no
network, no configuration, and no real package is read.

## CLI

```bash
npx @reneturcios/packcompare compare --input args.json
npx @reneturcios/packcompare --version
```

`args.json` contains the full arguments object:

```json
{
  "before": {
    "version": "1.0.0",
    "files": [{ "path": "index.js", "size": 1200 }],
    "dependencies": { "left-pad": "1.3.0" },
    "exports": ["./index.js"]
  },
  "after": {
    "version": "1.1.0",
    "files": [{ "path": "index.js", "size": 1400 }],
    "dependencies": { "left-pad": "1.3.0" },
    "exports": ["./index.js"]
  }
}
```

The result is printed as JSON:

```json
{
  "version_before": "1.0.0",
  "version_after": "1.1.0",
  "files": {
    "added": [],
    "removed": [],
    "changed": [{ "path": "index.js", "size_before": 1200, "size_after": 1400 }]
  },
  "dependencies": { "added": [], "removed": [], "changed": [] },
  "exports": { "added": [], "removed": [] },
  "size_before": 1200,
  "size_after": 1400,
  "size_delta": 200,
  "file_count_before": 1,
  "file_count_after": 1,
  "breaking": false,
  "breaking_reasons": []
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/packcompare mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "packcompare": {
      "command": "npx",
      "args": ["-y", "@reneturcios/packcompare", "mcp"]
    }
  }
}
```

### Tools

- `compare_packages` — Diff two versions of a package.
  - `before` (object, required) — the earlier package
    snapshot: `{version, files, dependencies, exports}`,
    where `version` is a non-empty string, `files` is a
    list of `{path, size}` entries with unique non-empty
    paths and integer sizes of at least 0, `dependencies`
    is a map of dependency name to non-empty version
    string, and `exports` is a list of non-empty strings
  - `after` (object, required) — the later package
    snapshot, with the same shape as `before`

  Returns `{version_before, version_after, files,
  dependencies, exports, size_before, size_after,
  size_delta, file_count_before, file_count_after,
  breaking, breaking_reasons}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/packcompare
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/packcompare compare --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
