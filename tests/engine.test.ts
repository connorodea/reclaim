import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DEFAULT_POLICY, evaluateAsset, evaluatePortfolio } from '../lib/engine.ts';
import type { Asset, Policy } from '../lib/types';

const now = new Date('2026-10-31T12:00:00.000Z');
const base: Asset = {
  id: 'asset-1', usn: 'USN0000000001', sku: 'TEST-LAPTOP', title: 'Test laptop',
  category: 'Laptop', grade: 'G', receivedAt: '2026-10-25T12:00:00.000Z', location: 'A-01',
  acquisitionCost: 100, marketPrice: 400, refurbishedPrice: 600, wholesalePrice: 220,
  partsValue: 75, recycleValue: 10, repairCost: 40, repairDays: 3, repairSuccess: 0.95,
  expectedDays: 20, sellThrough: 0.9, returnRate: 0.04, testStatus: 'passed',
  dataStatus: 'cleared', safetyStatus: 'clear', priceSource: 'observed',
  priceObservedAt: '2026-10-31T12:00:00.000Z', comparableCount: 10, notes: '', stage: 'pending',
};
const evaluate = (changes: Partial<Asset> = {}, policy: Policy = DEFAULT_POLICY) => evaluateAsset({ ...base, ...changes }, policy, now);

test('refurbishment wins when incremental recovery exceeds its costs and risks', () => {
  const evaluation = evaluate();
  assert.equal(evaluation.recommendedRoute, 'refurbish');
  assert.ok(evaluation.uplift > 0);
  assert.ok(evaluation.recommended!.eligible);
  assert.equal(evaluation.evidenceScore, 100);
});

test('expensive repair changes the route instead of maximizing gross resale price', () => {
  const evaluation = evaluate({ repairCost: 500 });
  assert.equal(evaluation.recommendedRoute, 'retail');
  const repair = evaluation.routes.find(route => route.id === 'refurbish')!;
  assert.ok(repair.expectedNet < evaluation.recommended!.expectedNet);
  assert.equal(repair.repairSpend, 500);
});

test('failed repair falls back to parts and still spends the repair quote', () => {
  const zeroCost: Policy = {
    ...DEFAULT_POLICY, retailFeeRate: 0, wholesaleFeeRate: 0, partsFeeRate: 0,
    shippingCost: 0, partsShippingCost: 0, packagingCost: 0, holdingCostPerDay: 0,
    returnHandlingCost: 0, warrantyReserveRate: 0, depreciationRatePerDay: 0, recyclingCost: 0,
  };
  const evaluation = evaluate({ repairSuccess: 0.25, sellThrough: 1, returnRate: 0 }, zeroCost);
  const repair = evaluation.routes.find(route => route.id === 'refurbish')!;
  assert.equal(repair.netIfSuccessful, 560);
  assert.equal(repair.netIfUnsuccessful, 35);
  assert.equal(repair.expectedNet, 0.25 * 560 + 0.75 * 35);
  assert.equal(repair.repairSpend, 40);
});

test('acquisition cost affects profit without changing route decisions', () => {
  const low = evaluate({ acquisitionCost: 20 });
  const high = evaluate({ acquisitionCost: 2000 });
  assert.equal(low.recommendedRoute, high.recommendedRoute);
  assert.equal(low.recommended!.expectedNet, high.recommended!.expectedNet);
  assert.equal(Math.round((low.recommended!.expectedProfit - high.recommended!.expectedProfit) * 100), 198000);
});

test('safety and data clearance each hard-block all routes and force zero displayed uplift', () => {
  for (const changes of [{ safetyStatus: 'hold' as const }, { dataStatus: 'pending' as const }]) {
    const evaluation = evaluate(changes);
    assert.equal(evaluation.recommendedRoute, 'hold');
    assert.equal(evaluation.recommended, null);
    assert.equal(evaluation.uplift, 0);
    assert.equal(evaluation.baselineNet, 0);
    assert.ok(evaluation.routes.every(route => !route.eligible));
    assert.ok(evaluation.blockers.length > 0);
  }
});

test('inspection, grade, and repair time gates exclude otherwise profitable routes', () => {
  const untested = evaluate({ testStatus: 'untested' });
  assert.equal(untested.routes.find(route => route.id === 'retail')!.eligible, false);
  assert.equal(untested.routes.find(route => route.id === 'refurbish')!.eligible, false);
  assert.equal(untested.recommendedRoute, 'wholesale');
  const dnl = evaluate({ grade: 'DNL' });
  assert.equal(dnl.routes.find(route => route.id === 'retail')!.eligible, false);
  assert.ok(dnl.reviewRequired);
  const delayed = evaluate({ repairDays: 30 });
  assert.equal(delayed.routes.find(route => route.id === 'refurbish')!.eligible, false);
  assert.equal(delayed.recommendedRoute, 'retail');
});

test('retail non-sale probability uses a later wholesale exit, not zero-cost instant sale', () => {
  const evaluation = evaluate({ sellThrough: 0, repairCost: 999 });
  const retail = evaluation.routes.find(route => route.id === 'retail')!;
  const wholesale = evaluation.routes.find(route => route.id === 'wholesale')!;
  assert.ok(retail.expectedNet < wholesale.expectedNet);
  assert.equal(retail.expectedDays, 23);
  assert.equal(evaluation.recommendedRoute, 'wholesale');
});

test('sample data, stale prices, and limited comparisons require review', () => {
  const sample = evaluate({ priceSource: 'sample' });
  assert.ok(sample.reviewRequired);
  assert.ok(sample.evidenceScore < DEFAULT_POLICY.minimumEvidenceScore);
  assert.ok(sample.reviewReasons.some(reason => reason.includes('Sample')));
  const stale = evaluate({ priceObservedAt: '2026-09-01T12:00:00.000Z', comparableCount: 1 });
  assert.ok(stale.reviewReasons.some(reason => reason.includes('older')));
  assert.ok(stale.reviewReasons.some(reason => reason.includes('Fewer')));
  assert.ok(stale.recommended!.expectedNet < evaluate().recommended!.expectedNet);
});

test('all displayed route economics reconcile to expected net', () => {
  for (const route of evaluate().routes) {
    const recomputed = route.grossValue - route.fees - route.fulfillment - route.holdingCost - route.repairSpend - route.riskCost;
    assert.ok(Math.abs(route.expectedNet - recomputed) < 0.00001);
    assert.ok(Math.abs(route.expectedNet - base.acquisitionCost - route.expectedProfit) < 0.00001);
  }
});

test('invalid values throw instead of generating a misleading recommendation', () => {
  for (const change of [
    { marketPrice: -1 }, { repairSuccess: 1.01 }, { sellThrough: NaN },
    { acquisitionCost: Infinity }, { comparableCount: 0.5 },
    { priceObservedAt: 'not-a-date' }, { priceObservedAt: '2027-01-01' },
    { priceObservedAt: '2026-02-31T12:00:00+01:00' },
  ]) assert.throws(() => evaluate(change), RangeError);
  assert.throws(() => evaluate({}, { ...DEFAULT_POLICY, retailFeeRate: -0.1 }), RangeError);
  assert.throws(() => evaluate({}, { ...DEFAULT_POLICY, staleAfterDays: 0 }), RangeError);
});

test('negative recoveries remain negative and recycling can minimize a loss', () => {
  const evaluation = evaluate({
    marketPrice: 0, refurbishedPrice: 0, wholesalePrice: 0,
    partsValue: 0, recycleValue: 0,
  });
  assert.equal(evaluation.recommendedRoute, 'recycle');
  assert.ok(evaluation.recommended!.expectedNet < 0);
  assert.equal(evaluation.uplift, 0);
});

test('portfolio aggregates hold items without inventing recoverable value', () => {
  const result = evaluatePortfolio([base, { ...base, id: 'hold-1', safetyStatus: 'hold' }], DEFAULT_POLICY, now);
  assert.equal(result.holdCount, 1);
  assert.equal(result.expectedNet, evaluate().recommended!.expectedNet);
});
