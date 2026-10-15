---
---

Migrated development and release tooling from release-please and our custom
publisher to Changesets. This is an internal tooling change; the private
`@zaly/dev` package is intentionally not versioned or published.

The seven public packages now form a linked group. Only changed packages and
affected dependents release, with CLI following every public library through
exact workspace dependencies. Each releasing package gets its own changelog,
tag, and GitHub release. Authored product-facing notes explicitly name CLI;
library-only notes can remain in their package changelog.

CI uses the native split Changesets actions for a rolling version PR, pnpm
packing, and npm trusted publication. Lint, builds, tests under Node and Bun,
and generated-file checks gate releases. Installed-package smoke tests verify
the exact publication tarballs, including their recorded integrity hashes,
exports, CLI version, bundled assets, and Shiki worker. Publication reuses the
tested artifact without rebuilding or repacking.

Removed the custom packer, publisher, release manifest, and synchronized-version
guard. Added linked release-plan regressions, a lockfile/formatting version
script, and a patch changeset for the rolling Models PR. Historical aggregate
release notes remain available, and contributor, agent, and recovery guidance
now describes the Changesets workflow.
