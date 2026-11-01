# Verification record

## Current automation setting

Automatic and hosted GitHub Actions runs are disabled at the owner's request, and the CI workflow has been removed. The results below are historical verification records. Local check commands remain optional manual references; they do not authorize or require new runs. There is no pending requirement to change billing settings or rerun hosted CI.

## Browser workflow checks

The following workflows were exercised in the managed local browser preview during implementation:

| Check | Result |
| --- | --- |
| Demo and live workspace separation | Passed: fictional demo inventory and the live workspace remain separate |
| New return intake and persistence | Passed after the intake-ID compatibility fix: a new return saved successfully and remained after a full browser reload |
| Explicit route override | Passed: an approved alternative route retains its own frozen economics |
| Actual recovery outcome and history | Passed: entered proceeds/costs update realized economics and append an audit event |
| Repair-cost scenario | Passed: the tested repair-cost scenario changed the iPhone recommendation from refurbishment to wholesale |
| Held unit | Passed: the held unit remains blocked from outbound approval |

These are local preview checks, not evidence of a live marketplace transaction, production load capacity, or trained-model accuracy.

## Baseline application verification

The following results describe the initial application before the contributor/CI and controlled-reinspection changes:

| Gate | Status |
| --- | --- |
| Full decision/CSV/backend regression suite | Passed after the final intake-ID compatibility fix: 34 tests total — 12 decision-engine, 12 CSV, and 10 backend |
| TypeScript check | Passed: `tsc --noEmit` exited successfully |
| Production build | Passed: the production build exited successfully |
| Hosted deployment | Passed: private release `appgdep_6ae5a27b30dc8191a4974de1943d1778` succeeded |

The deployment rows preserve the recorded publication results for those releases.

## Historical local and workflow verification

`npm run check` was executed successfully after adding the repeatable package scripts and controlled-reinspection support: all 43 regression tests ran as individual cases (12 engine, 15 CSV, 16 backend), followed by a successful `tsc --noEmit`. The workflow YAML was parsed and its event triggers, read-only permission, pinned actions, Node version, and credential setting were checked. The package rename and Node 24 runtime declaration are consistent between `package.json` and `package-lock.json`; no dependency versions changed.

Before its removal, the prepared GitHub workflow specified tests, type-checking, and a build, with only `contents: read` permission, no persisted checkout credentials, and no deployment step. Its official action versions were verified against their release and commit pages; the following pins are historical records, not an active workflow:

| Action | Pinned version and source |
| --- | --- |
| `actions/checkout` | [v7.0.0 release](https://github.com/actions/checkout/releases/tag/v7.0.0), commit [`9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0`](https://github.com/actions/checkout/commit/9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0) |
| `actions/setup-node` | [v7.0.0 release](https://github.com/actions/setup-node/releases/tag/v7.0.0), commit [`820762786026740c76f36085b0efc47a31fe5020`](https://github.com/actions/setup-node/commit/820762786026740c76f36085b0efc47a31fe5020) |

The test invocation uses [Node 24's documented test-isolation mode](https://nodejs.org/docs/latest-v24.x/api/test.html#test-runner-execution-model) to import the test modules into the runner process and report their individual cases.

| Current release gate | Status |
| --- | --- |
| Complete regression suite after controlled-reinspection changes | Passed: 43 tests through `npm run check` |
| TypeScript after controlled-reinspection changes | Passed: `npm run typecheck` exited successfully |
| Production build after all current application changes | Passed: Sites production build exited successfully |
| Browser approval/reinspection workflow | Passed in the managed local preview: original approval archived, new safety hold enforced, revised economics evaluated after clearance, and a new approval persisted after a full reload |
| GitHub CI | Disabled at the owner's request. The earlier [run 41186207082](https://github.com/connorodea/reclaim/actions/runs/41186207082) reported no executed steps; no successful hosted CI run is claimed. |
| Updated hosted deployment | Passed: private release `appgdep_6ae5abc8e79c8191ae02a0c12acb84a8` succeeded for source `86e91541f431b61625b013d10b3b3bddf0ce9549` |

The browser example approved a fictional Dell at $153.14 expected net recovery, reopened it with a reason, and reduced its entered retail price from $239 to $199. All routes were blocked while the safety hold remained. After diagnostics and safety clearance, expected direct-resale net recovery became $126.81, while the original $153.14 decision and $239 price input remained visible in the archived approval. These are synthetic workflow checks, not recovered revenue.

![Original approval retained during reinspection](reclaim-reinspection-20261031.jpg)

The complete source was published to the private `connorodea/reclaim` repository on `main` at application commit `9a0931fc24fe3f6b33524753bb57c8ce55e54c83`. Its Git tree, `243ccbe51b1f361e3fe5373335463aaac26aab1f`, exactly matched the verified Sites source tree. Later documentation commits record the release receipts. Automatic and hosted CI are now disabled at the owner's request; no billing change or hosted CI rerun is planned.

## Scope limits

No marketplace execution, live market-data ingestion, ML training, load test, external penetration test, or environmental-impact validation is claimed. The workspace byte cap and separate unit-count bound are documented in the README.
