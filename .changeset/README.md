# Changesets

Add a changeset for each independently describable user-facing or public API change:

```sh
bun changeset
```

Select the affected packages and write upgrade-facing release notes. Also select
`@zaly/cli` when the explanation belongs in the product's release notes, even if
its source did not change. Library-only notes can omit CLI.

Commit the changeset with the code, on a PR or directly on `main`. One changeset
can cover several commits; tests, internal refactors, and contributor docs usually
need none. Do not manually bump package versions.

The seven public packages are linked: releasing packages share a new version,
while unaffected packages keep theirs. Exact `workspace:*` dependencies bring
CLI and other affected dependents into the release. Minor changesets mean real
minor bumps, including before 1.0.

See the [release guide](../packages/dev/docs/releases.md) for CI and recovery.
