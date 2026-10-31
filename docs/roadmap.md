# Reclaim: implementation roadmap

This roadmap translates the supplied SSI implementation case, ModusLink market context, and historical Optoro product description into an ordered product plan. Completed work is explicitly separated from proposed increments. [Product strategy](product-strategy.md) contains the source review and current competitor status; [decision model](decision-model.md) defines the present economics.

## Current foundation

The current foundation implements serialized intake, five recovery-route comparisons, editable assumptions, safety/data gates, evidence review, frozen approvals, actual outcome capture, CSV exchange, and per-owner durable workspaces. Approved units can be reopened for inspection with an explicit reason: their prior route, inputs, policy, and economics are archived; functional testing resets to untested and a safety hold is applied. Completed units remain locked. It uses a deterministic model. Market connections, trained demand models, automated execution, lot optimization, and customer-facing returns are future work.

Contributor scripts and a GitHub CI workflow run the regression suite, TypeScript check, and production build. Their actual run status is recorded separately in [verification.md](verification.md); the existence of a workflow does not establish that remote CI has passed.

## Delivery sequence

| Increment | Deliverable | Dependencies | Acceptance evidence |
| --- | --- | --- | --- |
| 1. Evidence and outcome records | Normalize units, inspections, price evidence, decisions, cost entries, listings, and settlements; migrate existing workspaces without changing historical decisions | Current unit IDs and frozen snapshots | Reconcile every imported settlement to a unit or lot; reject duplicate external events; preserve historical approvals exactly |
| 2. Channel and contract economics | Versioned channel profiles, grade mappings, selling rights, fees, return liabilities, warranty requirements, settlement timing, and price floors | Unit/inspection evidence | A blocked channel can never be approved; cost calculations reconcile to actual fee/settlement examples |
| 3. Connected pilot | One WMS/intake adapter plus one authorized sales/settlement source; condition-normalized comparables; inspection and repair-quote attachments | Stable event contracts; operator access | Replay a batch without duplicate units/listings; show source, observation time, and coverage for every imported price |
| 4. Demand and repair estimates | Time-to-sale/sell-through curves, resale price intervals, return likelihood, and repair-success estimates with sparse-data fallbacks | Exposure history and sufficient outcomes | Time-based holdout comparisons against simple baselines; calibration and error by SKU/grade/channel; no future-data leakage |
| 5. Capacity and B2B lots | Repair-hour/parts/budget allocation; consolidation and pickup windows; manifested lots with contract-specific proceeds allocation | Channel economics and operating-capacity inputs | No double allocation; all resource constraints satisfied; lot/unit totals reconcile; sensitivity to waiting cost is visible |
| 6. Controlled execution and repricing | Approved work orders, listing drafts, bounded price updates, idempotency, retries, reconciliation, and emergency stop | Stable adapters, baseline outcomes, policy ownership | Shadow-mode results accepted by operator; replay creates no duplicate actions; tests cover stale stock, races, policy changes, and partial failures |
| 7. Customer return orchestration | Adapter for return authorization, labels/drop-off, refund/exchange policy, expected condition, and downstream receipt reconciliation | Warehouse data quality and a selected customer channel | Returned item matches original order; refund authorization remains separate; late/missing/incorrect returns are reconcilable |
| 8. Category expansion | Category-specific inspections, evidence, routes, policies, and cost models | Successful electronics pilot | Demonstrated fit and outcomes with a partner in the new category; no reuse of unvalidated probabilities |

## 1. Establish an auditable data spine

Define stable `asset_id`, `product_id`, `inspection_id`, `price_observation_id`, `decision_id`, `work_order_id`, `listing_id`, and `settlement_id`. Keep incoming source IDs and idempotency keys. Separate event time from ingestion time. Every decision must reference the exact data, policy version, model version, allowed actions, and estimated economics used at approval.

Store item condition evidence independently from a mutable display grade: diagnostic outcomes, missing accessories, cosmetic findings, activation/ownership restrictions, data-erasure evidence, and inspection author/time. A price observation needs source, model/variant identity, condition, currency, geography, observed date, sold-versus-asking status, shipping treatment, and sample coverage. Retain uncertainty instead of manufacturing precision from incomplete matching.

A transaction ledger should retain sale proceeds, channel fees, shipping, repair parts/labor, returns, refunds, adjustments, and settlement dates. Inventory acquisition cost remains separate from incremental recovery costs. Lot allocation methods must be explicit and versioned; allocated unit proceeds must sum to actual lot proceeds.

## 2. Treat channel rules as constraints

Replace generic retail/wholesale estimates with operator-owned channel profiles. Model acceptance rules, selling rights, warranty promises, grade semantics, service regions, return responsibility, settlement delay, handling requirements, and price floors. Keep contractual facts distinct from inferred demand. A high predicted selling price cannot override a blocked channel.

Add return-to-vendor only when the applicable contract and credit entitlement are documented. Restock requires the relevant new/open-box standard and inventory destination. Donation can use documented handling/transport costs; any tax treatment requires separately supplied, verified assumptions.

## 3. Learn demand from both sales and non-sales

Collect listing exposures, availability, prices over time, condition, channel, shipping offer, promotions, units sold, unsold age, returns, and settled costs. A sold-only dataset overstates demand because it omits failures. Retain censored observations for units still on sale at the end of a measurement window.

Begin with transparent, grouped baselines before selecting complex models. Use SKU/grade/channel estimates where data supports them, with category-level pooling for sparse segments. Split validation by time and check product/customer overlap so the system is evaluated on decisions it could actually have made. Compare model value against the existing manual policy and the deterministic engine, not just against another ML model.

Do not treat a model's confidence score as an authorization. Eligibility, evidence freshness, return exposure, margin constraints, and approval policy still apply.

## 4. Evaluate price and timing together

Choose price by expected net recovery over a defined horizon, including probability of sale, returns, carrying cost, fallback value, and time to settled cash. Price elasticity describes demand response to price; it needs evidence beyond observed correlations. Condition, seasonality, inventory age, promotions, and product mix can confound historical price changes.

Start with operator-approved bounded experiments. Configure a floor, maximum absolute/percentage adjustment, minimum time between changes, sufficient comparable evidence, and a maximum exposure budget. Preserve a baseline group when feasible. Request review when data is sparse or the proposed action exceeds policy. Only move to automated repricing after approved shadow results and reliable external reconciliation.

## 5. Allocate scarce repair and logistics capacity

A profitable repair can still be inferior when it consumes the last technician hour needed for a better repair. Optimize the batch using expected incremental recovery per constrained resource, with deadlines and precedence relationships. Keep a feasible fallback plan when parts, pickup windows, or quoted costs change.

For consolidation and liquidation lots, compare freight and handling savings against waiting costs and price decay. Track compatible goods, maximum weight/volume, buyer contract, manifest quality, minimum size, and pickup destination. Keep buyer/channel selection open through adapters; building a two-sided marketplace is a separate business requiring verified liquidity and buyer trust.

## 6. Close the action-to-outcome loop

External actions need explicit operation IDs, idempotency, status reconciliation, retry classification, and compensation/manual-recovery procedures. Before acting, recheck inventory ownership, availability, latest condition, policy version, and approval. A decision record does not prove a listing, repair, shipment, sale, or settlement happened.

Measure realized net recovery and time to cash across all incoming units, including holds, failures, unsold stock, and unresolved returns. Compare matched cohorts or a retained baseline and disclose the outcome window. Save override reasons and failure modes as learning signals, without treating every operator choice as ground truth.

Environmental reporting should follow verified destinations and measured weights. Distinguish repair/reuse, recycling, and disposal; calculate avoided emissions only with a declared method and counterfactual. Do not reuse historical vendor percentages as Reclaim outcomes.

## First connected pilot: concrete exit criteria

1. An operator can import a representative received batch with complete unit identity and inspected condition.
2. At least one selling channel has verified fee, return, freight, and settlement terms.
3. Every recommendation shows its source assumptions, eligible alternatives, and expected net recovery.
4. The operator can approve or override with a recorded reason, and the external workflow remains reconcilable.
5. Actual settlement and costs reconcile back to the approved decision without double counting.
6. A held-out comparison shows whether the workflow improves realized recovery and time to cash; the result includes failures and unresolved inventory.

Implementation order follows these dependencies. Delivery dates should be set after access to the pilot operator's WMS, marketplace data, and outcome records is confirmed.
