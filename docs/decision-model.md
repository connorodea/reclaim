# Reclaim decision model

Version: `recovery-ev/1.0.0`.

This is an explainable, deterministic planning model. It does not infer condition from photographs, train a model, fetch live market prices, or estimate calibrated confidence. Prices and probabilities are inputs that an operator must verify. Sample data are illustrative.

## Objective and accounting

Choose the eligible route with the highest expected future net recovery. Net recovery is expected gross proceeds less marketplace fees, fulfillment, holding, repair spend, and refund/warranty reserves. Expected profit additionally subtracts the asset's acquisition cost. Acquisition cost is already incurred and therefore never changes the disposition ranking.

All displayed cost components are probability-weighted and rounded to cents. Their difference exactly reconciles to displayed net recovery. Negative outcomes remain negative. A disposal credit of zero with positive disposal costs is a loss, not a zero-value route.

## Branches

- **Sell as-is:** Retail sell-through probability weights a retail sale against a wholesale exit after the retail horizon. The unsold branch includes the extra holding time and price decay. Wholesale fallback needs a positive quote when sell-through is less than 100%.
- **Refurbish and sell:** Repair success probability weights a repaired-retail branch against a failed-repair parts branch. The repaired-retail branch has its own sell-through/wholesale fallback. The full repair quote and repair delay apply to both repair outcomes. Failed repair never receives the working-unit wholesale value. Post-repair testing remains required before external listing.
- **Wholesale:** A supplied as-is quote is treated as executable, with three days to cash. The quote must reflect the item's actual disclosed condition.
- **Parts:** The supplied parts value must already account for extraction labor. The route deducts parts channel fees, fulfillment, and seven days of holding.
- **Recycle:** The supplied credit less collection/processing cost and two days of holding. Recycling value does not use consumer-electronics price decay.

Retail gross price, wholesale value, and parts value decay from their observation date through expected exit using `quote × (1 − daily depreciation rate) ^ elapsed days`. Historical holding costs are sunk and are excluded; future holding is included.

Retail refund reserves equal `return probability × (gross sale price + return handling cost)`. This conservatively assumes no recovery of a returned unit within the modeled horizon. Warranty reserve is an additional, non-overlapping budget assumption. If returns and warranty costs overlap in actual accounting, adjust those input reserves to avoid duplication. Sale fees and fulfillment are assumed non-refundable.

## Eligibility and review

Safety holds and pending data clearance block every recovery route and produce **Hold**. Direct retail requires passed functional tests and one of grades LN, VG, G, or AC. Other grade codes need regrading before direct retail. Refurbishment needs diagnostics, a positive repair quote, a positive post-repair price, nonzero repair success, and repair time within policy. A DNL grade always requests operator review.

The evidence score is a heuristic: source quality contributes up to 50 points, number of comparable sales up to 25, freshness up to 20, and inspection status up to 5. It is **not** a probability of a correct recommendation. Sample and estimated prices always require review. Stale prices, fewer than three comparable sales, low evidence scores, near-tied routes, untested assets, and refurbishment add review reasons.

Uplift compares the selected route with immediate wholesale where eligible; otherwise parts, then recycling. Held assets have zero modeled uplift and zero available baseline, so blocked stock cannot inflate the opportunity estimate.

## Approval, reinspection, and the audit record

Approval freezes the selected route, the complete decision inputs, the policy, the evaluation, its engine version, the approval time, and the operator's rationale. Approved units cannot be edited in place. A later policy change affects pending decisions while an approved or completed unit retains its approved economics.

An approved unit can be **reopened for inspection** with a reason of at least ten characters. Reopening archives the original approval and its input snapshot, removes the active approval, and returns the unit to pending with its functional test set to untested and a safety hold. These gates block every recovery route until the operator records the new inspection and explicitly clears the hold. The existing data-clearance status is preserved; the operator must update it if the new findings also affect data-release evidence. A new approval is required before completion. Completed outcomes remain locked.

Archived approvals are appended and retained when current inspection inputs change. Snapshot inputs contain only explicit asset fields: they do not contain earlier approvals, history, or workflow state, so repeated reinspection does not create recursive snapshots. Clients cannot supply or overwrite archived history through intake or update requests. Existing approvals from the first version may lack a separate input snapshot; because those assets were locked, reopening captures their unchanged original inputs before resetting the inspection and hold statuses.

CSV exports identify the economic route separately from the engine's recommended route. Approved and completed rows use the active approval's selected-route economics and original input fields; reopened pending rows use current inputs and current policy. The export includes the active approval time and rationale, archived approval count, latest reopening time and reason, engine version, and actual outcomes where recorded. `inputBasis` identifies frozen approval inputs, legacy locked inputs, or current inputs. CSV imports create fresh pending assets and ignore exported approval/history metadata; a CSV is not a means of restoring or forging decisions. The full JSON audit export retains all historical approvals, their inputs, policies, evaluations, and reopening reasons.

## Practical limits

The model is per unit and does not optimize batch constraints, channel demand saturation, repair staffing, capital budgets, carrier surcharges, or multiple rounds of returns. Three-day wholesale, seven-day parts, and two-day recycling exits are initial planning assumptions. Retail and repair timing are item inputs. Model decisions should be calibrated against recorded actual proceeds, actual costs, time to sale, repair success, and returns before introducing automatic external actions.
