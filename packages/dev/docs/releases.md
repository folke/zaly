# Releases

Changesets maintains one rolling version PR for the seven public packages. They
form one **linked** group: packages selected for release share the next version,
while unaffected packages keep theirs. Exact `workspace:*` dependencies bring
CLI and other affected dependents into a library release. Private root/dev
versions are not product versions and are not managed by Changesets.

Each package has its own changelog, npm publication, tag (`@zaly/cli@0.1.0`, for
example), and GitHub release. The [CLI changelog](../../cli/CHANGELOG.md) is the
product-facing changelog. Earlier aggregate history remains in the
[root changelog](../../../CHANGELOG.md); existing tags/releases are preserved.

## Writing release notes

Run `bun changeset`, or create a Markdown file under `.changeset/`:

```md
---
"@zaly/agent": patch
"@zaly/cli": patch
---

Explain the user-visible change and any action needed when upgrading.
```

Name the affected packages. Also name CLI when the explanation belongs in product
release notes; otherwise CLI receives dependency-update notes rather than the
library's authored summary. Choose patch/minor/major explicitly: minor means a
real minor bump even before 1.0. Multiple changesets use the highest required bump,
not one bump per file.

Commit notes with the code, through a PR or directly on `main`. One changeset may
cover several commits. Tests, internal refactors, and contributor docs normally
need none. Do not manually bump versions. Models automation maintains one patch
changeset on its rolling catalog PR.

## CI and publication

Every PR and main push runs lint, build, tests under Node 22.18.0 and Bun, and a
check for uncommitted generated artifacts. An offline Changesets plan packs every
public package through pnpm, including already-published versions, so PR smoke
tests never depend on registry version discovery.

On main, the native split Changesets actions select one mode:

- **version:** after verification succeeds, create/update the version PR. Its
  script runs `changeset version`, refreshes `bun.lock`, and formats package
  manifests/changelogs. It consumes the pending changesets; no publication occurs.
- **publish:** after verification succeeds, build the same commit and pack the
  native registry-derived publication plan. Download and smoke-test that exact
  artifact before the protected publishing job can run.
- **none:** nothing needs versioning or publication; normal verification still runs.

The publisher downloads the tested artifact and never rebuilds or repacks. Native
Changesets handles registry discovery, dependency ordering, existing versions,
tags, and GitHub releases. Packed plans include tarball integrity hashes, also
checked by our smoke-test adapter. Main workflows are serialized and publication
is never canceled mid-run; PR runs may cancel obsolete runs.

## One-time setup

Enable **Allow GitHub Actions to create and approve pull requests**. Changesets
and Models use `GITHUB_TOKEN`; bot-created PR updates do not automatically trigger
other workflows. Configure branch protection accordingly, or use a GitHub App
token if automatic release-PR checks are required. Main CI always verifies the
merged commit before publishing.

For each public npm package, configure a trusted publisher for owner `folke`,
repository `zaly`, workflow `ci.yml`, environment `npm`. Create that environment,
optionally requiring maintainer approval. No `NPM_TOKEN` is needed; publication
requests provenance. Close any obsolete release-please PR after migration.

Bun remains the development package manager. The existing `pnpm-workspace.yaml`
makes Changesets select pnpm for packing and dependency rewriting; CI pins pnpm
12.3.4. Release actions use Node 24. Keep the compatible Changesets CLI/action
versions aligned when upgrading.

## Manual runs and recovery

Dispatch CI normally for verification only. On `main`, enabling its `publish`
checkbox also runs Changesets automation: pending changesets update the version
PR; otherwise unpublished versions can be published after verification.

```sh
gh workflow run ci.yml --ref main -f publish=true
```

For partial failures, rerun failed jobs in the same run to reuse the tested pack
artifact (retained for 30 days). npm publication is not atomic. Do not edit code
or rebuild while retrying those artifacts. Never reuse an already-published
version for changed content.

For local verification/recovery, use Node 24 and the pinned pnpm on PATH, check out
the exact release commit, and use native Changesets commands:

```sh
bun install --frozen-lockfile
bun z build
bun z test --bun
bun changeset publish-plan --output /tmp/zaly-publish-plan.json
bun changeset pack --from-publish-plan /tmp/zaly-publish-plan.json --out-dir /tmp/zaly-release
RELEASE_ARTIFACTS=/tmp/zaly-release bun z test packages/dev/test/release.integration.test.ts
# Only when publication is intended:
bun changeset publish --from-pack-dir /tmp/zaly-release
```

Use a fresh pack directory. Local publication uses your npm credentials and lacks
Actions provenance; prefer CI for routine publication. Native CLI publishing can
create local tags; use the Actions publishing job for GitHub release creation.

Smoke tests install the packed artifacts into a temporary project and exercise
exports, CLI version, catalog/theme assets, and a real Shiki worker under Node and
Bun. They skip ordinary test runs unless `RELEASE_ARTIFACTS` is set.
