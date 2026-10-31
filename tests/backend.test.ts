import test from 'node:test';
import assert from 'node:assert/strict';
import type { Asset, Workspace } from '../lib/types.ts';
import { DEFAULT_POLICY, evaluateAsset } from '../lib/engine.ts';
import { applyWorkspaceAction, checkWorkspaceCapacity, validateAsset, validatePolicy, WorkspaceError } from '../lib/validation.ts';

const NOW = new Date('2026-10-31T12:00:00.000Z');
function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1', usn: 'USN00000001', sku: 'EXAMPLE-01', title: 'Example tested laptop', category: 'Laptop', grade: 'VG',
    receivedAt: '2026-10-20T00:00:00.000Z', location: 'A-01', acquisitionCost: 90,
    marketPrice: 340, refurbishedPrice: 380, wholesalePrice: 150, partsValue: 60, recycleValue: 5,
    repairCost: 60, repairDays: 4, repairSuccess: 0.8, expectedDays: 14, sellThrough: 0.85, returnRate: 0.05,
    testStatus: 'passed', dataStatus: 'cleared', safetyStatus: 'clear', priceSource: 'sample',
    priceObservedAt: '2026-10-30T00:00:00.000Z', comparableCount: 0, notes: '', stage: 'pending', ...overrides,
  };
}
function workspace(assets: Asset[] = [asset()]): Workspace {
  return { assets, policy: structuredClone(DEFAULT_POLICY), events: [], revision: 0, updatedAt: NOW.toISOString() };
}
function errorCode(code: string) {
  return (error: unknown) => error instanceof WorkspaceError && error.code === code;
}

test('asset validation rejects nonfinite, coerced, negative, and impossible-date inputs', () => {
  for (const bad of [NaN, Infinity, -1, '340']) assert.throws(() => validateAsset({ ...asset(), marketPrice: bad }, NOW));
  assert.throws(() => validateAsset({ ...asset(), receivedAt: '2026-02-31' }, NOW));
  assert.throws(() => validateAsset({ ...asset(), priceSource: 'observed', comparableCount: 0 }, NOW));
  assert.throws(() => validatePolicy({ ...DEFAULT_POLICY, retailFeeRate: 1.1 }));
});

test('intake strips forged workflow fields and records a single atomic event', () => {
  const original = workspace([]);
  const forged = { ...asset(), stage: 'completed', approvedRoute: 'retail', outcome: { grossProceeds: 1 } };
  const result = applyWorkspaceAction(original, { revision: 0, action: 'intake', assets: [forged] }, 'live', NOW);
  assert.equal(result.assets[0].stage, 'pending');
  assert.equal(result.assets[0].approvedRoute, undefined);
  assert.equal(result.assets[0].outcome, undefined);
  assert.equal(result.revision, 1);
  assert.equal(result.events.length, 1);
  assert.equal(original.assets.length, 0);
});

test('duplicate and invalid batch rows reject the whole import without mutating state', () => {
  const original = workspace();
  assert.throws(() => applyWorkspaceAction(original, { revision: 0, action: 'intake', assets: [asset({ id: 'new-1', usn: 'NEW-1' }), asset({ id: 'new-2', usn: 'usn00000001' })] }, 'live', NOW), errorCode('duplicate_asset'));
  assert.throws(() => applyWorkspaceAction(original, { revision: 0, action: 'intake', assets: [asset({ id: 'new-1', usn: 'NEW-1' }), asset({ id: 'new-2', usn: 'NEW-2', repairSuccess: 2 })] }, 'live', NOW));
  assert.equal(original.assets.length, 1);
  assert.equal(original.events.length, 0);
  assert.equal(original.revision, 0);
});

test('stale revisions are rejected before a mutation', () => {
  assert.throws(() => applyWorkspaceAction(workspace(), { revision: 1, action: 'policy', policy: DEFAULT_POLICY }, 'live', NOW), errorCode('revision_conflict'));
});

test('safety and data-release gates are enforced server-side', () => {
  for (const blocked of [asset({ safetyStatus: 'hold' }), asset({ dataStatus: 'pending' })]) {
    assert.throws(() => applyWorkspaceAction(workspace([blocked]), { revision: 0, action: 'approve', assetId: blocked.id, route: 'wholesale', reason: 'An operator attempts to override this hard gate.' }, 'live', NOW), errorCode('route_blocked'));
  }
});

test('sample evidence requires review and approvals retain frozen economics', () => {
  const original = workspace();
  const decision = evaluateAsset(original.assets[0], original.policy, NOW);
  assert.notEqual(decision.recommendedRoute, 'hold');
  assert.throws(() => applyWorkspaceAction(original, { revision: 0, action: 'approve', assetId: 'asset-1', route: decision.recommendedRoute }, 'live', NOW), errorCode('review_reason_required'));
  const approved = applyWorkspaceAction(original, { revision: 0, action: 'approve', assetId: 'asset-1', route: decision.recommendedRoute, reason: 'Reviewed this fictional example and its assumptions.' }, 'demo', NOW);
  assert.equal(approved.assets[0].stage, 'approved');
  assert.equal(approved.assets[0].approvalSnapshot?.evaluation.evaluatedAt, NOW.toISOString());
  const previousFee = approved.assets[0].approvalSnapshot!.policy.retailFeeRate;
  const modified = applyWorkspaceAction(approved, { revision: 1, action: 'policy', policy: { ...approved.policy, retailFeeRate: 0.5 } }, 'demo', NOW);
  assert.equal(modified.assets[0].approvalSnapshot!.policy.retailFeeRate, previousFee);
  assert.equal(modified.policy.retailFeeRate, 0.5);
  assert.throws(() => applyWorkspaceAction(approved, { revision: 1, action: 'update', asset: asset({ marketPrice: 900 }) }, 'demo', NOW), errorCode('asset_locked'));
  assert.equal(original.assets[0].stage, 'pending');
});

test('an eligible nonrecommended route requires a documented override', () => {
  const original = workspace([asset({ priceSource: 'observed', comparableCount: 40 })]);
  const decision = evaluateAsset(original.assets[0], original.policy, NOW);
  const alternative = decision.routes.find(route => route.eligible && route.id !== decision.recommendedRoute);
  assert.ok(alternative);
  assert.throws(() => applyWorkspaceAction(original, { revision: 0, action: 'approve', assetId: 'asset-1', route: alternative.id, reason: 'Ok' }, 'live', NOW), errorCode('review_reason_required'));
});

test('completion requires approval and can only be recorded once', () => {
  const original = workspace();
  const outcome = { grossProceeds: 250, actualCosts: 40, completedAt: NOW.toISOString(), notes: 'Actual proceeds from the operator.' };
  assert.throws(() => applyWorkspaceAction(original, { revision: 0, action: 'complete', assetId: 'asset-1', outcome }, 'live', NOW), errorCode('approval_required'));
  const decision = evaluateAsset(original.assets[0], original.policy, NOW);
  const approved = applyWorkspaceAction(original, { revision: 0, action: 'approve', assetId: 'asset-1', route: decision.recommendedRoute, reason: 'Reviewed estimate and approved the modeled route.' }, 'live', NOW);
  const completed = applyWorkspaceAction(approved, { revision: 1, action: 'complete', assetId: 'asset-1', outcome }, 'live', NOW);
  assert.equal(completed.assets[0].stage, 'completed');
  assert.deepEqual(completed.assets[0].outcome, outcome);
  assert.match(completed.events.at(-1)!.details, /210\.00/);
  assert.throws(() => applyWorkspaceAction(completed, { revision: 2, action: 'complete', assetId: 'asset-1', outcome }, 'live', NOW), errorCode('approval_required'));
});

test('live reset is forbidden while sample reset advances the revision', () => {
  assert.throws(() => applyWorkspaceAction(workspace(), { revision: 0, action: 'reset_demo' }, 'live', NOW), errorCode('reset_forbidden'));
  const reset = applyWorkspaceAction(workspace(), { revision: 0, action: 'reset_demo' }, 'demo', NOW);
  assert.equal(reset.revision, 1);
  assert.ok(reset.assets.length > 1);
  assert.equal(reset.events.at(-1)!.action, 'reset_demo');
});

test('storage capacity rejects oversized state instead of discarding history', () => {
  const oversized = workspace();
  oversized.assets[0].notes = 'x'.repeat(1_800_001);
  assert.throws(() => checkWorkspaceCapacity(oversized), errorCode('workspace_capacity'));
});

function approve(current = workspace(), now = NOW): Workspace {
  const target = current.assets[0];
  const decision = evaluateAsset(target, current.policy, now);
  return applyWorkspaceAction(current, { revision: current.revision, action: 'approve', assetId: target.id, route: decision.recommendedRoute, reason: 'Reviewed the input evidence and selected this recovery route.' }, 'live', now);
}

test('new approvals freeze explicit input fields without embedding workflow state', () => {
  const current = workspace();
  const approved = approve(current);
  const inputs = approved.assets[0].approvalSnapshot!.inputs!;
  const { stage: _stage, ...expected } = current.assets[0];
  assert.deepEqual(inputs, expected);
  for (const serverField of ['stage', 'approvedRoute', 'approvalSnapshot', 'approvalHistory', 'outcome']) {
    assert.equal(Object.hasOwn(inputs, serverField), false);
  }
  assert.notEqual(inputs, current.assets[0]);
});

test('reopen archives an immutable decision and restores release gates', () => {
  const approved = approve();
  const before = structuredClone(approved);
  const originalSnapshot = structuredClone(approved.assets[0].approvalSnapshot!);
  const later = new Date(NOW.getTime() + 60_000);
  const reopened = applyWorkspaceAction(approved, { revision: 1, action: 'reopen', assetId: 'asset-1', reason: 'A new defect was identified during the outbound inspection.' }, 'live', later);
  const target = reopened.assets[0];
  assert.equal(target.stage, 'pending');
  assert.equal(target.testStatus, 'untested');
  assert.equal(target.safetyStatus, 'hold');
  assert.equal(target.dataStatus, approved.assets[0].dataStatus);
  assert.equal(target.approvedRoute, undefined);
  assert.equal(target.approvalSnapshot, undefined);
  assert.equal(target.outcome, undefined);
  assert.equal(target.approvalHistory!.length, 1);
  assert.equal(target.approvalHistory![0].approvedRoute, approved.assets[0].approvedRoute);
  assert.deepEqual(target.approvalHistory![0].approvalSnapshot, originalSnapshot);
  assert.equal(target.approvalHistory![0].reopenedAt, later.toISOString());
  assert.match(target.approvalHistory![0].reason, /new defect/);
  assert.equal(reopened.events.at(-1)!.action, 'reopen');
  assert.equal(reopened.revision, 2);
  assert.deepEqual(approved, before);
  assert.throws(() => applyWorkspaceAction(reopened, { revision: 2, action: 'approve', assetId: 'asset-1', route: 'wholesale', reason: 'Attempting to skip the new inspection and safety hold.' }, 'live', later), errorCode('route_blocked'));
  assert.throws(() => applyWorkspaceAction(reopened, { revision: 2, action: 'complete', assetId: 'asset-1', outcome: { grossProceeds: 1, actualCosts: 0, completedAt: later.toISOString(), notes: '' } }, 'live', later), errorCode('approval_required'));
});

test('reopen requires an approved decision, a reason, and the latest revision', () => {
  const approved = approve();
  for (const reason of [undefined, '', '  too short  ']) {
    assert.throws(() => applyWorkspaceAction(approved, { revision: 1, action: 'reopen', assetId: 'asset-1', reason }, 'live', NOW), errorCode('reopen_reason_required'));
  }
  assert.throws(() => applyWorkspaceAction(approved, { revision: 0, action: 'reopen', assetId: 'asset-1', reason: 'Reinspect after a newly observed defect.' }, 'live', NOW), errorCode('revision_conflict'));
  assert.throws(() => applyWorkspaceAction(workspace(), { revision: 0, action: 'reopen', assetId: 'asset-1', reason: 'Reinspect after a newly observed defect.' }, 'live', NOW), errorCode('reopen_forbidden'));
  const completed = applyWorkspaceAction(approved, { revision: 1, action: 'complete', assetId: 'asset-1', outcome: { grossProceeds: 250, actualCosts: 40, completedAt: NOW.toISOString(), notes: 'Settled sale.' } }, 'live', NOW);
  assert.throws(() => applyWorkspaceAction(completed, { revision: 2, action: 'reopen', assetId: 'asset-1', reason: 'Reinspect after a newly observed defect.' }, 'live', NOW), errorCode('reopen_forbidden'));
});

test('legacy approval inputs are captured before reinspection changes the locked asset', () => {
  const legacy = approve(workspace([asset({ dataStatus: 'not_required' })]));
  delete legacy.assets[0].approvalSnapshot!.inputs;
  const oldEvaluation = structuredClone(legacy.assets[0].approvalSnapshot!.evaluation);
  const reopened = applyWorkspaceAction(legacy, { revision: 1, action: 'reopen', assetId: 'asset-1', reason: 'Reinspect the legacy approval after new evidence arrived.' }, 'live', NOW);
  const archive = reopened.assets[0].approvalHistory![0];
  assert.equal(archive.approvalSnapshot.inputs.testStatus, 'passed');
  assert.equal(archive.approvalSnapshot.inputs.safetyStatus, 'clear');
  assert.equal(archive.approvalSnapshot.inputs.dataStatus, 'not_required');
  assert.equal(archive.approvalSnapshot.inputs.marketPrice, 340);
  assert.deepEqual(archive.approvalSnapshot.evaluation, oldEvaluation);
  assert.equal(reopened.assets[0].dataStatus, 'not_required');
  assert.equal(legacy.assets[0].approvalSnapshot!.inputs, undefined);
});

test('reinspection and repeated approvals preserve history without recursive snapshots', () => {
  const first = approve();
  const firstSnapshot = structuredClone(first.assets[0].approvalSnapshot!);
  const reopened = applyWorkspaceAction(first, { revision: 1, action: 'reopen', assetId: 'asset-1', reason: 'Perform another inspection after a newly reported defect.' }, 'live', NOW);
  const inspected = applyWorkspaceAction(reopened, { revision: 2, action: 'update', asset: { ...reopened.assets[0], testStatus: 'passed', safetyStatus: 'clear', marketPrice: 390, notes: 'Reinspection complete; the defect has been corrected.' } }, 'live', NOW);
  assert.deepEqual(inspected.assets[0].approvalHistory, reopened.assets[0].approvalHistory);
  const second = approve(inspected);
  assert.equal(second.assets[0].approvalSnapshot!.inputs!.marketPrice, 390);
  assert.deepEqual(second.assets[0].approvalHistory![0].approvalSnapshot, firstSnapshot);
  const again = applyWorkspaceAction(second, { revision: 4, action: 'reopen', assetId: 'asset-1', reason: 'A second issue requires another independent inspection.' }, 'live', NOW);
  assert.equal(again.assets[0].approvalHistory!.length, 2);
  assert.equal(again.assets[0].approvalHistory![0].approvalSnapshot.inputs.marketPrice, 340);
  assert.equal(again.assets[0].approvalHistory![1].approvalSnapshot.inputs.marketPrice, 390);
  for (const archive of again.assets[0].approvalHistory!) {
    for (const key of ['approvalHistory', 'approvalSnapshot', 'approvedRoute', 'stage', 'outcome']) {
      assert.equal(Object.hasOwn(archive.approvalSnapshot.inputs, key), false);
    }
  }
  assert.equal(first.assets[0].approvalHistory, undefined);
});

test('clients cannot forge or remove active approvals and archived history through intake or edits', () => {
  const approved = approve();
  const reopened = applyWorkspaceAction(approved, { revision: 1, action: 'reopen', assetId: 'asset-1', reason: 'Reinspect the asset and preserve its original approval.' }, 'live', NOW);
  const historyBefore = structuredClone(reopened.assets[0].approvalHistory!);
  const forged = { ...reopened.assets[0], marketPrice: 360, stage: 'completed', approvalHistory: [{ reason: 'forged' }], approvalSnapshot: approved.assets[0].approvalSnapshot, approvedRoute: 'retail', outcome: { grossProceeds: 99999 } };
  const edited = applyWorkspaceAction(reopened, { revision: 2, action: 'update', asset: forged }, 'live', NOW);
  assert.deepEqual(edited.assets[0].approvalHistory, historyBefore);
  assert.equal(edited.assets[0].stage, 'pending');
  assert.equal(edited.assets[0].approvalSnapshot, undefined);
  assert.equal(edited.assets[0].approvedRoute, undefined);
  assert.equal(edited.assets[0].outcome, undefined);
  const removed = applyWorkspaceAction(edited, { revision: 3, action: 'update', asset: { ...edited.assets[0], notes: 'An ordinary edit with the history omitted.', approvalHistory: undefined } }, 'live', NOW);
  assert.deepEqual(removed.assets[0].approvalHistory, historyBefore);
  const intake = applyWorkspaceAction(workspace([]), { revision: 0, action: 'intake', assets: [forged] }, 'live', NOW);
  assert.equal(intake.assets[0].approvalHistory, undefined);
  assert.equal(intake.assets[0].approvalSnapshot, undefined);
  assert.equal(intake.assets[0].stage, 'pending');
});
