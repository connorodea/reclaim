# Reclaim — Reverse Logistics Intelligence

A working electronics recovery workbench: intake units, inspect route economics, change assumptions, approve dispositions, and record actual outcomes. Built with TypeScript, React, Vinext, Cloudflare Workers, and D1.

[Private application](https://reclaim-recovery-intelligence.cpodea5.chatgpt.site) · [Source repository](https://github.com/connorodea/reclaim) · [Continuous integration](https://github.com/connorodea/reclaim/actions)

## Implemented scope

- Separate demonstration and live workspaces. The demo starts with 18 fictional electronics units and sample assumptions; the live workspace starts empty.
- CSV intake with explicit validation, quoted/multiline field support, duplicate detection, a 500-row batch limit, and spreadsheet-safe export.
- A deterministic decision engine comparing direct retail, refurbishment, wholesale, parts recovery, and recycling.
- Expected net recovery after fees, fulfillment, repair, holding, depreciation, and risk reserves; acquisition cost is tracked separately for profit.
- Safety and data-clearance gates, route eligibility, evidence-quality review reasons, and explicit approval.
- Immutable approval snapshots, optimistic revision control, decision events, and actual outcome capture.
- Controlled reinspection of approved units, with the prior inputs, policy, route, and economics retained in approval history.
- D1 persistence keyed to the authenticated owner and workspace mode. Preview data and hosted data are separate.

This release does not connect to marketplaces, obtain live comps, generate listings, train ML models, or infer physical condition from photographs. All forecasts depend on entered assumptions. An evidence score measures input sufficiency and freshness; it is not an ML accuracy or confidence claim.

## Project structure

| Path | Purpose |
| --- | --- |
| `app/` | Application UI and API routes |
| `lib/types.ts` | Shared domain contract |
| `lib/engine.ts` | Pure recovery economics and eligibility |
| `lib/seed.ts` | Fictional demo and empty workspace factories |
| `lib/csv.ts` | Validated import and spreadsheet-safe export |
| `lib/validation.ts` | Server-side validation and workspace actions |
| `lib/store.ts` | Durable state and atomic revisions |
| `db/`, `drizzle/` | Database schema and generated migrations |
| `tests/` | Decision, validation, and CSV regression tests |
| `docs/decision-model.md` | Economic assumptions and route formulas |
| `docs/product-strategy.md` | Market context, pilot plan, and next releases |
| `docs/roadmap.md` | Dependency-ordered increments for channel economics, learned demand, bounded repricing, and execution |
| `docs/verification.md` | Completed workflow checks and the latest automated verification status |

## Development

Use **Node.js 24** and npm. The package and lockfile declare the same runtime requirement and application name. No production credentials are needed to run the pure regression tests or build the application.

From a clean checkout:

```sh
npm ci
npm run check
npm run build
```

The application requires a D1 binding named `DB` and its schema. The committed hosting manifest declares the logical binding. A local build generates the Wrangler configuration; apply the initial migration to the local database before opening the app:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_jittery_invaders.sql
npm run dev
```

Open the URL printed by the development server; a clean portable checkout normally uses loopback port 5173. Local D1 data is stored under ignored `.wrangler/state` and is separate from hosted data. Keep the development server private. When working inside the managed Sites environment, use its preview workflow instead of starting a second server.

Generate future schema changes with `npm run db:generate`, inspect the generated SQL, and apply new migrations in order. Do not rewrite or replay already-applied migrations. Hosted publication applies migrations through the Sites workflow.

### Authentication and hosting boundaries

Production API requests require the identity supplied by the Sites authentication layer. Missing identity receives a 401 response; there is no anonymous production workspace or fallback login. The application depends on D1 for persistence and does not silently substitute browser storage when the database is unavailable.

Development builds use an isolated preview identity, and the portable starter additionally supports a loopback-only simulated sign-in. These are development facilities; they are not production authentication and are not included as a production login path. `npm start` runs the built Worker locally, so its API retains the production identity requirement.

Keep production requests behind the trusted identity boundary. Moving to another host requires an authentication adapter that verifies callers and prevents visitor-supplied identity headers from becoming trusted, plus a replacement for the D1 storage binding. The existing code is not an unprotected standalone server.

### Contributor checks

| Command | Purpose |
| --- | --- |
| `npm test` | Execute every `tests/*.test.ts` case with Node's built-in runner |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run check` | Run the regression suite, then the TypeScript check |
| `npm run build` | Produce the deployable application artifact |
| `npm run db:generate` | Generate migrations after a schema change |

Tests use Node's supported `--test-isolation=none` mode so each actual test case is executed and reported consistently in both the development environment and CI. The pure tests must avoid shared mutable global state. Add a regression test when changing eligibility, unit economics, approval history, imports, or state transitions. Use synthetic fixtures; never commit customer inventories, production credentials, local database state, or build output.

### Continuous integration

`.github/workflows/ci.yml` installs locked dependencies, runs tests, checks TypeScript, and builds on pull requests and pushes to `main`; it also supports manual execution. It uses Node 24, `contents: read` permissions, disabled credential persistence, and official GitHub actions pinned to verified release commits. CI does not deploy or require application secrets. A configured workflow is not evidence of a successful remote run; the release owner checks the run result after the source is pushed.

## API

The browser uses `GET /api/workspace?mode=demo` or `mode=live` to load `{workspace, persistence, mode}`. Mutations use `POST` to the same endpoint. Hosted requests require the platform-provided authenticated identity. Mutating requests must satisfy origin checks.

Every mutation includes the workspace's current integer `revision`. Concurrent edits produce a conflict instead of silently overwriting state. Refresh the workspace before resubmitting a conflicted action.

| Action | Payload in addition to `revision` | Behavior |
| --- | --- | --- |
| `intake` | `assets: Asset[]` | Validate and add a batch atomically |
| `update` | `asset: Asset` | Edit a pending unit; existing approval history is preserved server-side |
| `approve` | `assetId`, `route`, `reason` | Re-evaluate eligibility and save an approval snapshot |
| `reopen` | `assetId`, `reason` | Reopen an approved unit for inspection and archive the previous approval |
| `complete` | `assetId`, `outcome` | Record actual proceeds and costs for an approved unit |
| `policy` | `policy: Policy` | Validate and save disposition assumptions |
| `reset_demo` | No additional fields | Reset only the demo workspace |

The live workspace is never reset by the demo action. An explicit review/override reason is required when appropriate. Safety and data holds cannot be bypassed by choosing a more profitable route.

### Reopen an approved unit for inspection

An approved unit may need a new inspection when its condition changes or the original inputs need correction. The `reopen` action requires a reason of 10–2,000 characters and applies only to an approved unit with an active approval. Pending and completed units cannot be reopened through this action.

Reopening moves the unit back to pending, sets its functional test to `untested`, and applies a safety hold. Data-clearance status is preserved. Before another outbound approval, the operator must resolve the safety hold; the engine rechecks the diagnostic requirements of the selected route. Direct retail requires a passed test, and refurbishment requires completed diagnostics.

The previous approved route, evaluation, input values, policy, approval time, and reason are retained in `approvalHistory`, alongside the reopening time and reason. A legacy approval without a separate input snapshot is captured from the locked unit before any fields are reset. The active approval is cleared, and later edits cannot forge or erase the archived history. A new approval creates a new snapshot; it does not rewrite the earlier decision. This records an internal workflow change and does not cancel a marketplace listing or shipment.

## CSV intake

Required, case-sensitive headers:

```text
usn,sku,title,category,grade,acquisitionCost,marketPrice,wholesalePrice,partsValue,testStatus,dataStatus
```

Optional fields include refurbishment assumptions, repair costs, route probabilities, dates, location, price-evidence metadata, and notes. Use the in-app template for a complete example. Prices are nonnegative decimal amounts in USD; probabilities are fractions from 0 to 1. Dates must use `YYYY-MM-DD` or an ISO timestamp.

`observed` pricing requires an observation date and a positive comparable count. Missing optional estimates use conservative defaults, including zero repair success and no assumed observed market evidence. Imports are all-or-nothing when validation fails. Source columns with approval or completion state cannot authorize operations; imported assets begin pending.

Exports mark whether projected economics use current assumptions or a frozen approval snapshot. For approved or completed units, expected net recovery follows the selected approved route, including when the operator chose a different route from the recommendation. Actual proceeds, recovery costs, net recovery, and profit are included when an outcome has been recorded.

## Limits and deployment considerations

**Each workspace is limited to 1,800,000 serialized UTF-8 bytes (1.8 MB), including all units, audit events, and approval snapshots.** The 5,000-unit limit is an additional upper bound; detailed records and accumulated history can reach the byte limit much earlier. Each import is limited to 500 units and must also fit the remaining workspace capacity. A rejected mutation leaves the saved workspace unchanged.

The first release uses one atomically revised JSON workspace per owner/mode. It supports a pilot and data collection. Higher throughput needs normalized records, background queues, workspace roles, external integration reconciliation, and appropriate observability. The implementation does not claim enterprise-scale performance without load testing.

## Verification

Browser workflow checks covered demo/live separation, an explicit route override with frozen approved economics, recording actual recovery and audit history, changing repair cost in a scenario, and the blocked state of a held unit. See [verification.md](docs/verification.md) for the latest automated test, type-check, and build status.

Never put API credentials in frontend code or committed files. Hosted access and D1 bindings are configured in `.openai/hosting.json`; runtime secrets belong in the deployment environment. The source is ordinary application code and can be adapted to another hosting environment by replacing authentication and storage adapters.

## Planned product direction

The next increments move from generic route estimates to actual operator economics: verified SKU/condition evidence, per-channel eligibility and contracts, settled outcome imports, demand and sell-through models, capacity-aware allocation, B2B lot manifests, and controlled price changes. Customer return portals can connect through an adapter after the warehouse-side economics work. These capabilities are planned, not implemented by the current decision engine.

The 2021 Optoro article is used as historical product inspiration. Current official sources show Optoro became part of Blue Yonder in August 2025; contemporary capabilities and source links are documented in [the product strategy](docs/product-strategy.md). Reclaim does not depend on the historical Returnly or BULQ integrations, copy vendor performance claims, or present sample prices as live market observations.
