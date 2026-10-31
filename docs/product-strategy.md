# Reclaim: product strategy

## Product thesis

Reclaim helps a reverse-logistics operator decide what to do with each returned asset, using expected net recovery, evidence quality, and operational constraints. The first customer is an electronics refurbisher or recommerce operator handling serialized units. Intake, testing, condition, pricing, disposition, and realized proceeds should form one traceable record.

The immediate value proposition is measurable: recover more dollars per comparable incoming unit, reduce avoidable handling, and shorten the time from receipt to cash. Improving those results is a hypothesis to test, not a promise made by the demo.

## What the supplied sources establish

[SSI's reverse-logistics case study](https://www.ssidecisions.com/ai-powered-decision-intelligence-transformation-for-reverse-logistics) describes classification, valuation, and routing as a coordinated workflow. It reports 7–10-second decisions and an 85% ML accuracy figure for its client's implementation. The article does not define enough of the evaluation protocol to make that accuracy an independent product benchmark. Reclaim does not inherit those results.

[ModusLink's market outlook](https://www.moduslink.com/blog/the-reverse-logistics-market-is-valued-at-usd-860-4-billion-in-2025-and-is-projected-to-grow-at-a-cagr-of-9-8-to-reach-usd-1-99-trillion-by-2034/) cites a November 2025 Research and Markets release. [The publisher's release](https://www.globenewswire.com/news-release/2025/11/13/3187632/28124/en/reverse-logistics-market-outlook-report-2026-2034-1-99-trillion-opportunities-in-ai-driven-disposition-decisioning-automation-to-enhance-efficiency-and-expanding-recommerce-channel.html) gives a $860.4 billion estimate for 2025 and forecasts approximately $1.99 trillion by 2034, at 9.8% CAGR. This measures a broad logistics market, including physical services; it is not the addressable revenue of disposition software.

Forecasts vary materially. [Research and Markets' February 2026 IMARC listing](https://www.researchandmarkets.com/report/reverse-logistics) gives a $711.1 billion 2025 estimate and $1.07 trillion 2034 forecast, with 4.7% CAGR. Market definitions and methods matter. These publications support investigating the category; customer interviews, operating data, and willingness to pay must determine the business case.

## The Optoro reference and the current competitive position

The user-supplied [April 2021 Nanalyze article](https://www.nanalyze.com/2021/04/reverse-logistics-ai-retail/) adds a useful design pattern: combine operational rules with demand estimates, then use observed sales to update pricing and routing. Its Returnly partnership, BULQ channel, financing totals, customer results, and environmental figures describe that historical period; they are not Reclaim results or a current integration inventory.

The present competitor is broader. [Optoro's official announcement](https://www.optoro.com/returns-news/blue-yonder-acquires-optoro/) says its acquisition by Blue Yonder closed on August 19, 2025. [Blue Yonder's January 9, 2026 update](https://blueyonder.com/blog/2026/new-returns-enhancements-help-retailers-capture-value-as-peak-returns-begin) describes business rules combined with ML for disposition, resale-value prediction, bulk receipt, mobile processing, recommerce/liquidation workflows, and warehouse-system integration. Its [2026.1 release](https://blueyonder.com/release-announcements/2026-1-release/cognitive-solutions-for-execution) adds granular unit attributes including serial numbers, lot numbers, country of origin, and expiration dates. These are the vendor's published capabilities, not independently measured performance.

[Loop's migration page](https://www.loopreturns.com/returnly/) confirms that Returnly shut down on October 1, 2023. BULQ's official site and FAQ could not be retrieved during this review; its availability has therefore not been verified from a current primary source. Neither legacy service should be a required dependency. The valuable B2B idea is manifested lot formation and verified buyer/channel economics, which can work through available contracted partners.

**Differentiation to validate:** an electronics-focused workbench for independent refurbishers and liquidators, with a short path from legacy CSV/WMS data to explainable unit economics, repair-versus-liquidation decisions, and measured outcomes. AI disposition alone is already a published incumbent capability. Reclaim must prove easier adoption, better fit for its chosen operators, and improved realized recovery. This is a positioning hypothesis, not a claim that incumbents lack these features.

## Entry point and expansion

| Phase | Customer problem | Product capability | Evidence needed to advance |
| --- | --- | --- | --- |
| 1. Electronics pilot | Inconsistent disposition decisions and opaque unit margins | Serialized intake, cost-aware route comparison, human approval, actual outcome capture | Useful recommendations on a representative batch; operators trust explanations |
| 2. Connected decision service | Re-entered data and stale pricing | WMS intake adapter, approved market-data feeds, diagnostic results, repair quotes | Identity matching, source timestamps, condition-normalized sold comps |
| 3. Learned economics | Manually estimated sale, return, and repair probabilities | Calibrated price intervals, time-to-sale models, repair-success and return-risk models | Sufficient labeled outcomes, holdout validation, drift monitoring |
| 4. Governed execution | Repetitive high-confidence routing | Idempotent work orders, listing drafts, approved channel actions, reconciliation | Low error rates in shadow mode; reversible operations; cost and safety checks |
| 5. Additional categories | Different condition and cost structures | Category-specific inspection, eligibility, warranty, and recovery models | A proven data and operating partner for each category |

The decision service should integrate with an operator's existing WMS. It does not need to replace receiving, inventory accounting, or fulfillment to demonstrate value.

## Extending decisions from a route to an operating plan

The next version should jointly select **action, eligible channel, price, and timing**. Five generic recovery routes are a useful first comparison, but actual economics depend on the operator's contracts and constraints. Each channel needs accepted categories/grades, testing and warranty requirements, geography, sale terms, fees, freight, return liabilities, settlement delay, capacity, and minimum lot size. Return-to-vendor credits, primary-stock restock, or donation can become additional actions when documented rights and economics support them; tax benefits must not be invented.

The independent best decision for every unit may overload one repair bench or resale channel. A portfolio optimizer should respect repair hours, parts availability, working-capital budgets, warehouse space, pickup windows, and receiving capacity. Consolidation should compare freight savings against waiting cost, deterioration, and delayed cash. Lot manifests must preserve unit identity and reconcile realized proceeds and allocated costs back to the total lot.

## The demand and outcome feedback loop

The durable learning cycle is: identified unit and condition → evidence at decision time → eligible price/channel alternatives → approved action → listing exposure and price history → sale or unsold observation → returns, repair result, and settled proceeds → model evaluation and policy update.

Sales alone are insufficient to estimate demand. Preserve listings that did not sell, elapsed exposure, availability, price changes, channel, condition, shipping offer, and the time each fact became known. Distinguish observed sold comparables from active asking prices. Start with transparent SKU/condition/channel baselines and uncertainty intervals; use broader category estimates when samples are sparse. Evaluate price, time-to-sale, repair-success, and return-risk models separately using data that was unavailable at training time.

Price elasticity is a later learned capability, not a percentage inferred from two arbitrary prices. Historical price changes can be confounded by age, condition, season, and promotions. Where permitted by the operator, bounded experiments can test price effects with price floors, maximum step size, cooldowns, budget limits, and retained comparison groups. Repricing requires fresh inventory and contract checks, an approval policy, idempotent channel writes, and a complete change log. Strong uncertainty should return a unit to review rather than trigger aggressive discounts.

These learning, channel, and capacity features are planned. The current application uses explicit assumptions and preserves the evidence needed to start collecting outcomes. The dependency-ordered implementation plan is in [roadmap.md](roadmap.md).

## Design choices in this version

- Keep gross price, expected net recovery, and expected profit separate. Acquisition cost affects profit but should not change the best forward-looking route for an already-owned unit.
- Account for unsuccessful repair and unsold inventory explicitly. A failed repair cannot be sold as a working wholesale unit.
- Treat data-erasure and safety holds as hard blocks, independent of the apparent margin.
- Show an evidence-quality heuristic; do not mislabel it as a calibrated probability of being correct.
- Save the policy and evaluation at approval time. Later assumption changes must not silently rewrite the historical decision.
- Keep fictional demo records and the user's live workspace separate.
- Record actual proceeds and costs to make later model training and economic evaluation possible.

## Pilot measurement

Use a baseline workflow or a matched comparison cohort. Stratify units by SKU/model, condition, age, acquisition cohort, and channel eligibility; otherwise a change in inbound mix can look like software improvement. Start in shadow mode, where the existing operator retains the disposition decision.

The primary outcome is **realized net recovery per incoming unit** after actual channel fees, fulfillment, returns, repair, and incremental holding costs. Also record receipt-to-disposition time, receipt-to-cash time, repair success, sell-through by horizon, returns, manual-review minutes, and recommendation overrides. Maintain an outcome window and account for unsold inventory and unresolved returns rather than silently excluding them.

Compare recommended versus realized economics for calibration. When route changes are approved, compare actual outcomes against a credible baseline; estimated uplift is not demonstrated causal uplift. Set acceptable operational error rates and minimum business improvement with the pilot operator before evaluation.

For environmental reporting, keep a unit-level destination ledger and measured weights with processor or resale evidence. Reuse, repair, recycling, and disposal are different outcomes. Any avoided-emissions estimate needs a stated counterfactual and method, and must avoid counting the same unit at several intermediate steps. Historical vendor diversion percentages cannot substitute for this evidence.

## Commercial model to validate

Test a facility subscription plus a per-processed-unit charge, with a paid implementation package for integrations. Price against verified value delivered and the customer's return volume. A gain-share contract requires an agreed baseline, full cost accounting, and auditable attribution; it is not the simplest starting agreement.

An illustrative calculation, not a forecast: 10,000 units/month × $3 incremental realized recovery/unit = $30,000/month of gross customer benefit before software and implementation costs. Both volume and uplift need customer evidence. Build a bottom-up market model from reachable facilities, units per facility, adoption, and sustainable revenue per unit; do not multiply the entire logistics market by an arbitrary software share.

## Production work remaining

Live marketplace data and execution, trained models, photo-based grading, diagnostic-device integration, multi-tenant organizations and roles, repair-capacity scheduling, carrier/hazmat workflows, processor certification verification, durable task queues, and accounting reconciliation are subsequent releases. Environmental claims require measured weights, destination evidence, and a documented methodology; this version does not invent CO₂ savings.

For higher volume, normalize unit, inspection, evidence, decision, work-order, and outcome records; add background evaluation and integration queues. The initial bounded workspace snapshot provides atomic approval and revision control for a pilot, not an enterprise throughput claim.
