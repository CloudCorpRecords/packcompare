# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `compare_packages` MCP tool and `compare`
  CLI command diffing two package snapshots.
- Files report added and removed paths and changed entries
  carrying `size_before` / `size_after`, all sorted by path.
- Dependencies report added and removed entries carrying
  their version and changed entries carrying `from` / `to`,
  all sorted by name.
- Exports are compared as sets, with duplicate entries
  within a snapshot ignored after the first; the added and
  removed lists are sorted.
- Sizes are summed per snapshot with a possibly negative
  `size_delta`, and file counts are reported per snapshot.
- Breaking is pinned to removed exports only, with one
  `removed export: <name>` reason per removed export in
  sorted order.
- Path-naming validation errors for malformed snapshots,
  including snapshot-prefixed paths such as
  `before.files[1].path is a duplicate`.
