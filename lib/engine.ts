import type { Asset, Evaluation, Policy, RouteEconomics, RouteId } from './types';

/** Transparent planning assumptions. These are not current marketplace quotes. */
export const DEFAULT_POLICY: Policy = {
  retailFeeRate: 0.13,
  wholesaleFeeRate: 0.03,
  partsFeeRate: 0.10,
  shippingCost: 14,
  partsShippingCost: 8,
  packagingCost: 3,
  returnHandlingCost: 12,
  warrantyReserveRate: 0.02,
  holdingCostPerDay: 0.35,
  depreciationRatePerDay: 0.001,
  recyclingCost: 5,
  minimumUplift: 10,
  minimumEvidenceScore: 75,
  staleAfterDays: 14,
  maxRepairDays: 14,
};

export const ENGINE_VERSION = 'recovery-ev/1.0.0';
const DAY = 86_400_000;
const WHOLESALE_DAYS = 3;
const PARTS_DAYS = 7;
const RECYCLE_DAYS = 2;
const SELLABLE_GRADES = new Set(['LN', 'VG', 'G', 'AC']);
const money = (amount: number) => Math.round(amount * 100) / 100;
const usd = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
}).format(amount);

interface Branch {
  gross: number;
  fees: number;
  fulfillment: number;
  holding: number;
  repair: number;
  risk: number;
  days: number;
}

function total(branch: Branch): number {
  return branch.gross - branch.fees - branch.fulfillment - branch.holding - branch.repair - branch.risk;
}

function blend(a: Branch, b: Branch, probability: number): Branch {
  return {
    gross: probability * a.gross + (1 - probability) * b.gross,
    fees: probability * a.fees + (1 - probability) * b.fees,
    fulfillment: probability * a.fulfillment + (1 - probability) * b.fulfillment,
    holding: probability * a.holding + (1 - probability) * b.holding,
    repair: probability * a.repair + (1 - probability) * b.repair,
    risk: probability * a.risk + (1 - probability) * b.risk,
    days: probability * a.days + (1 - probability) * b.days,
  };
}

function bounded(value: number, label: string, minimum: number, maximum: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  }
}

/** Shared by the API and the evaluator; invalid input is never silently clamped. */
export function validateAssumptions(asset: Asset, policy: Policy, now: Date): void {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Evaluation date is invalid.');
  const moneyFields = [
    'acquisitionCost', 'marketPrice', 'refurbishedPrice', 'wholesalePrice',
    'partsValue', 'recycleValue', 'repairCost',
  ] as const;
  for (const field of moneyFields) bounded(asset[field], field, 0, 1_000_000_000);
  for (const field of ['repairSuccess', 'sellThrough', 'returnRate'] as const) {
    bounded(asset[field], field, 0, 1);
  }
  for (const field of ['repairDays', 'expectedDays'] as const) bounded(asset[field], field, 0, 3650);
  bounded(asset.comparableCount, 'comparableCount', 0, 1_000_000);
  if (!Number.isInteger(asset.comparableCount)) throw new RangeError('comparableCount must be a whole number.');
  for (const field of ['receivedAt', 'priceObservedAt'] as const) {
    const value = asset[field];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) {
      throw new RangeError(`${field} must be a valid date.`);
    }
    // Check the source calendar date separately from its timezone conversion.
    // Date.parse otherwise silently normalizes values such as February 31.
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) throw new RangeError(`${field} must be a valid calendar date.`);
    if (Date.parse(value) > now.getTime() + 300_000) throw new RangeError(`${field} cannot be in the future.`);
  }
  for (const field of [
    'retailFeeRate', 'wholesaleFeeRate', 'partsFeeRate', 'warrantyReserveRate', 'depreciationRatePerDay',
  ] as const) bounded(policy[field], field, 0, 1);
  for (const field of [
    'shippingCost', 'partsShippingCost', 'packagingCost', 'returnHandlingCost',
    'holdingCostPerDay', 'recyclingCost', 'minimumUplift',
  ] as const) bounded(policy[field], field, 0, 1_000_000);
  bounded(policy.minimumEvidenceScore, 'minimumEvidenceScore', 0, 100);
  bounded(policy.staleAfterDays, 'staleAfterDays', 1, 3650);
  bounded(policy.maxRepairDays, 'maxRepairDays', 0, 3650);
  const accepted: Record<string, readonly string[]> = {
    grade: ['LN', 'VG', 'G', 'AC', 'S', 'DNL', 'NRFB', 'NDCL'],
    testStatus: ['passed', 'failed', 'untested'],
    dataStatus: ['cleared', 'pending', 'not_required'],
    safetyStatus: ['clear', 'hold'],
    priceSource: ['sample', 'estimate', 'observed'],
  };
  for (const [field, allowed] of Object.entries(accepted)) {
    if (!allowed.includes(String(asset[field as keyof Asset]))) throw new RangeError(`${field} is invalid.`);
  }
}

/**
 * Compare five recovery paths using explicit branch probabilities and costs.
 * All route values are future net recovery. Historical acquisition cost only
 * changes expectedProfit, never ranking. This is a deterministic scenario model.
 */
export function evaluateAsset(
  asset: Asset,
  policy: Policy = DEFAULT_POLICY,
  now: Date = new Date(),
): Evaluation {
  validateAssumptions(asset, policy, now);
  const quoteAge = Math.max(0, (now.getTime() - Date.parse(asset.priceObservedAt)) / DAY);
  const depreciated = (quote: number, days: number) => quote * Math.pow(1 - policy.depreciationRatePerDay, quoteAge + days);
  const blockers: string[] = [];
  if (asset.safetyStatus === 'hold') blockers.push('Resolve the safety hold before selecting a recovery route.');
  if (asset.dataStatus === 'pending') blockers.push('Verify data clearance before releasing this asset.');

  const wholesale = (delay: number, repair = 0): Branch => {
    const days = delay + WHOLESALE_DAYS;
    const gross = depreciated(asset.wholesalePrice, days);
    return {
      gross, fees: gross * policy.wholesaleFeeRate,
      fulfillment: policy.shippingCost + policy.packagingCost,
      holding: days * policy.holdingCostPerDay, repair, risk: 0, days,
    };
  };
  const parts = (delay: number, repair = 0): Branch => {
    const days = delay + PARTS_DAYS;
    const gross = depreciated(asset.partsValue, days);
    return {
      gross, fees: gross * policy.partsFeeRate,
      fulfillment: policy.partsShippingCost + policy.packagingCost,
      holding: days * policy.holdingCostPerDay, repair, risk: 0, days,
    };
  };
  const retail = (quote: number, delay: number, repair = 0): Branch => {
    const days = delay + asset.expectedDays;
    const gross = depreciated(quote, days);
    return {
      gross, fees: gross * policy.retailFeeRate,
      fulfillment: policy.shippingCost + policy.packagingCost,
      holding: days * policy.holdingCostPerDay, repair,
      // Conservative horizon reserve: returned units have no second recovery
      // inside this decision horizon. Warranty reserve is incremental.
      risk: asset.returnRate * (gross + policy.returnHandlingCost) + policy.warrantyReserveRate * gross,
      days,
    };
  };

  const makeRoute = (
    id: RouteId, label: string, channel: string, success: Branch, failure: Branch,
    probability: number, reasons: string[], explanation: string,
  ): RouteEconomics => {
    const result = blend(success, failure, probability);
    const grossValue = money(result.gross);
    const fees = money(result.fees);
    const fulfillment = money(result.fulfillment);
    const holdingCost = money(result.holding);
    const repairSpend = money(result.repair);
    const riskCost = money(result.risk);
    const expectedNet = money(grossValue - fees - fulfillment - holdingCost - repairSpend - riskCost);
    const blockedReasons = [...blockers, ...reasons];
    return {
      id, label, channel, eligible: blockedReasons.length === 0, blockedReasons,
      expectedNet, expectedProfit: money(expectedNet - asset.acquisitionCost),
      expectedDays: money(result.days), grossValue, fees, fulfillment, holdingCost,
      repairSpend, riskCost, netIfSuccessful: money(total(success)),
      netIfUnsuccessful: money(total(failure)), probability, explanation,
    };
  };

  const retailReasons: string[] = [];
  if (asset.testStatus !== 'passed') retailReasons.push('A passed functional inspection is required for direct retail.');
  if (!SELLABLE_GRADES.has(asset.grade)) retailReasons.push(`Grade ${asset.grade} needs regrading before direct retail.`);
  if (asset.marketPrice <= 0) retailReasons.push('Add a positive retail price estimate.');
  if (asset.wholesalePrice <= 0 && asset.sellThrough < 1) retailReasons.push('Add a wholesale fallback quote for unsold stock.');

  const refurbishReasons: string[] = [];
  if (asset.testStatus === 'untested') refurbishReasons.push('Complete diagnostics before committing to refurbishment.');
  if (asset.refurbishedPrice <= 0) refurbishReasons.push('Add a post-refurbishment retail price estimate.');
  if (asset.repairCost <= 0) refurbishReasons.push('Add a repair quote before committing to refurbishment.');
  if (asset.repairDays > policy.maxRepairDays) refurbishReasons.push(`Repair exceeds the ${policy.maxRepairDays}-day policy limit.`);
  if (asset.repairSuccess <= 0) refurbishReasons.push('Repair success probability must be greater than zero.');
  if (asset.wholesalePrice <= 0 && asset.sellThrough < 1) refurbishReasons.push('Add a wholesale fallback quote for unsold repaired stock.');

  const retailSuccess = retail(asset.marketPrice, 0);
  const retailFailure = wholesale(asset.expectedDays);
  const repairSuccess = blend(
    retail(asset.refurbishedPrice, asset.repairDays, asset.repairCost),
    wholesale(asset.repairDays + asset.expectedDays, asset.repairCost),
    asset.sellThrough,
  );
  // Failed repair does not produce working wholesale inventory.
  const repairFailure = parts(asset.repairDays, asset.repairCost);
  const wholesaleBranch = wholesale(0);
  const partsBranch = parts(0);
  const recycling: Branch = {
    gross: asset.recycleValue, fees: 0, fulfillment: policy.recyclingCost,
    holding: RECYCLE_DAYS * policy.holdingCostPerDay, repair: 0, risk: 0, days: RECYCLE_DAYS,
  };
  const routes = [
    makeRoute('retail', 'Sell as-is', 'Retail resale', retailSuccess, retailFailure, asset.sellThrough, retailReasons,
      'Sell-through weights a retail sale against wholesale fallback at the end of the retail horizon. Includes fees, fulfillment, refund/warranty reserves, holding, and price decay.'),
    makeRoute('refurbish', 'Refurbish & sell', 'Repair → retail', repairSuccess, repairFailure, asset.repairSuccess, refurbishReasons,
      'Repair success leads to retail with a wholesale fallback for unsold stock. Failed repair goes to parts. The repair quote is spent in both branches; post-repair testing is required before listing.'),
    makeRoute('wholesale', 'Wholesale', 'B2B liquidation', wholesaleBranch, wholesaleBranch, 1,
      asset.wholesalePrice > 0 ? [] : ['Add a positive as-is wholesale quote.'],
      'Assumes an executable as-is wholesale quote and a three-day exit. Condition must be disclosed. Fee and shipping assumptions are editable.'),
    makeRoute('parts', 'Harvest parts', 'Parts recovery', partsBranch, partsBranch, 1,
      asset.partsValue > 0 ? [] : ['Add a positive parts recovery estimate.'],
      'Assumes a realizable parts recovery value and a seven-day exit. Parts handling and extraction must be included in the supplied net-of-extraction parts value.'),
    makeRoute('recycle', 'Recycle', 'Recycling partner', recycling, recycling, 1, [],
      'Uses the stated recycling credit less the collection/processing cost and two days of holding. A negative value represents a disposal cost.'),
  ];

  // Ties favor quicker cash recovery; exact ties retain the stable route order.
  const eligible = routes.filter(route => route.eligible).sort((a, b) => b.expectedNet - a.expectedNet || a.expectedDays - b.expectedDays);
  const recommended = eligible[0] ?? null;
  const baseline = routes.find(route => route.id === 'wholesale' && route.eligible)
    ?? routes.find(route => route.id === 'parts' && route.eligible)
    ?? routes.find(route => route.id === 'recycle' && route.eligible);

  const sourcePoints = asset.priceSource === 'observed' ? 50 : asset.priceSource === 'estimate' ? 15 : 5;
  const coveragePoints = Math.min(25, asset.comparableCount * 2.5);
  const freshnessPoints = Math.max(0, 20 * (1 - quoteAge / policy.staleAfterDays));
  const inspectionPoints = asset.testStatus === 'passed' ? 5 : asset.testStatus === 'failed' ? 3 : 0;
  const evidenceScore = Math.round(sourcePoints + coveragePoints + freshnessPoints + inspectionPoints);
  const evidenceLabel = evidenceScore >= 80 ? 'Strong' : evidenceScore >= 55 ? 'Moderate' : 'Limited';
  const reviewReasons = [...blockers];
  if (asset.priceSource === 'sample') reviewReasons.push('Sample prices are for demonstration; replace them with verified comparable sales.');
  if (asset.priceSource === 'estimate') reviewReasons.push('Prices are operator estimates and require verification.');
  if (quoteAge > policy.staleAfterDays) reviewReasons.push(`Price evidence is older than ${policy.staleAfterDays} days.`);
  if (asset.comparableCount < 3) reviewReasons.push('Fewer than three comparable sales support the price assumptions.');
  if (evidenceScore < policy.minimumEvidenceScore) reviewReasons.push(`Evidence score ${evidenceScore}/100 is below the ${policy.minimumEvidenceScore} review threshold.`);
  if (recommended && eligible[1] && recommended.expectedNet - eligible[1].expectedNet < policy.minimumUplift) {
    reviewReasons.push(`The leading routes are within ${usd(policy.minimumUplift)}; review the operational trade-off.`);
  }
  if (asset.testStatus === 'untested') reviewReasons.push('Functional inspection is incomplete; wholesale/parts values must reflect untested condition.');
  if (asset.grade === 'DNL') reviewReasons.push('DNL stock requires operator review before disposition.');
  if (recommended?.id === 'refurbish') reviewReasons.push('Confirm the repair quote and complete a new functional inspection after repair.');

  return {
    engineVersion: ENGINE_VERSION,
    evaluatedAt: now.toISOString(),
    recommendedRoute: recommended?.id ?? 'hold', recommended, routes,
    baselineNet: baseline?.expectedNet ?? 0,
    uplift: recommended && baseline ? money(recommended.expectedNet - baseline.expectedNet) : 0,
    evidenceScore, evidenceLabel,
    reviewRequired: reviewReasons.length > 0,
    reviewReasons, blockers,
    summary: recommended
      ? `${recommended.label} has the highest modeled net recovery at ${usd(recommended.expectedNet)} per unit, with an estimated ${recommended.expectedDays.toFixed(1)}-day exit.`
      : `Hold this asset. ${blockers.join(' ') || 'No eligible recovery route is available.'}`,
  };
}

export function evaluatePortfolio(assets: Asset[], policy: Policy = DEFAULT_POLICY, now: Date = new Date()) {
  const evaluations = assets.map(asset => ({ assetId: asset.id, evaluation: evaluateAsset(asset, policy, now) }));
  return {
    evaluations,
    expectedNet: money(evaluations.reduce((sum, item) => sum + (item.evaluation.recommended?.expectedNet ?? 0), 0)),
    expectedProfit: money(evaluations.reduce((sum, item) => sum + (item.evaluation.recommended?.expectedProfit ?? 0), 0)),
    uplift: money(evaluations.reduce((sum, item) => sum + item.evaluation.uplift, 0)),
    reviewCount: evaluations.filter(item => item.evaluation.reviewRequired).length,
    holdCount: evaluations.filter(item => item.evaluation.recommendedRoute === 'hold').length,
  };
}
