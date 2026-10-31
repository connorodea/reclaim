import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssetCsv, assetsToCsv, CSV_TEMPLATE } from '../lib/csv.ts';
import { createDemoWorkspace } from '../lib/seed.ts';
import { evaluateAsset, DEFAULT_POLICY } from '../lib/engine.ts';
import { applyWorkspaceAction } from '../lib/validation.ts';
import type { Workspace } from '../lib/types.ts';

const now = new Date('2026-10-31T12:00:00.000Z');
const header = 'usn,sku,title,category,grade,acquisitionCost,marketPrice,wholesalePrice,partsValue,testStatus,dataStatus';
const line = 'TEST0001,SKU-1,Test laptop,Laptop,VG,100,250,130,40,untested,pending';

function approvalFixture(): Workspace {
  const workspace = createDemoWorkspace(now);
  workspace.assets = [{ ...workspace.assets[0], title: 'Test laptop', notes: '' }];
  return applyWorkspaceAction(workspace, {
    action: 'approve', revision: workspace.revision, assetId: workspace.assets[0].id,
    route: 'wholesale', reason: 'Reviewed quote and approved the immediate exit.',
  }, 'demo', now);
}

// Used only with deliberately plain one-row fixtures; quoted-field support is
// exercised separately through the public importer below.
function plainExportRow(workspace: Workspace): Record<string, string> {
  const [names, values] = assetsToCsv(workspace.assets, workspace.policy).trim().split('\r\n').map(row => row.split(','));
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

test('minimal intake has conservative defaults and fresh pending state', () => {
  const result = parseAssetCsv(`${header}\n${line}`, now);
  assert.deepEqual(result.errors, []);
  assert.equal(result.assets.length, 1);
  const asset = result.assets[0];
  assert.equal(asset.stage, 'pending');
  assert.equal(asset.repairSuccess, 0);
  assert.equal(asset.priceSource, 'estimate');
  assert.equal(asset.comparableCount, 0);
  assert.equal(asset.receivedAt, now.toISOString());
});

test('CSV template is importable', () => {
  assert.deepEqual(parseAssetCsv(CSV_TEMPLATE, now).errors, []);
});

test('handles BOM, CRLF, commas, escaped quotes, and multiline notes', () => {
  const result = parseAssetCsv(`\uFEFF${header},notes\r\nTEST0001,SKU-1,"Laptop, 13""",Laptop,VG,100,250,130,40,passed,cleared,"First line\nSecond line"\r\n`, now);
  assert.deepEqual(result.errors, []);
  assert.equal(result.assets[0].title, 'Laptop, 13"');
  assert.equal(result.assets[0].notes, 'First line\nSecond line');
});

test('rejects invalid amounts and prevents partial intake', () => {
  const result = parseAssetCsv(`${header}\n${line}\n${line.replace('TEST0001', 'TEST0002').replace(',100,', ',free,')}`, now);
  assert.equal(result.assets.length, 0);
  assert.ok(result.errors.some(error => error.includes('acquisitionCost')));
});

test('rejects missing columns and duplicate USNs case-insensitively', () => {
  assert.ok(parseAssetCsv('title,marketPrice\nLaptop,200', now).errors.some(error => error.includes('Missing required column')));
  const duplicate = parseAssetCsv(`${header}\n${line}\n${line.replace('TEST0001', 'test0001')}`, now);
  assert.equal(duplicate.assets.length, 0);
  assert.ok(duplicate.errors.some(error => error.includes('duplicate USN')));
});

test('rejects ambiguous headers, unknown enums, and malformed quoting', () => {
  assert.ok(parseAssetCsv(`${header},sku\n${line},DUP`, now).errors.some(error => error.includes('Duplicate column')));
  assert.ok(parseAssetCsv(`${header}\n${line.replace('Laptop', 'Toaster')}`, now).errors.some(error => error.includes('category')));
  assert.ok(parseAssetCsv(`${header}\n"unfinished`, now).errors.some(error => error.includes('unterminated')));
  assert.ok(parseAssetCsv(`${header}\n${line.replace('Test laptop', 'Test "laptop"')}`, now).errors.some(error => error.includes('Unexpected quote')));
});

test('requires real evidence metadata for observed pricing', () => {
  const bad = parseAssetCsv(`${header},priceSource\n${line},observed`, now);
  assert.ok(bad.errors.some(error => error.includes('observed pricing requires')));
  const good = parseAssetCsv(`${header},priceSource,priceObservedAt,comparableCount\n${line},observed,2026-10-30,8`, now);
  assert.deepEqual(good.errors, []);
});

test('validates numeric bounds and real calendar dates', () => {
  assert.ok(parseAssetCsv(`${header},sellThrough\n${line},1.2`, now).errors.some(error => error.includes('sellThrough')));
  assert.ok(parseAssetCsv(`${header},repairDays\n${line},2.5`, now).errors.some(error => error.includes('whole number')));
  assert.ok(parseAssetCsv(`${header},expectedDays\n${line},0`, now).errors.some(error => error.includes('between 1')));
  assert.ok(parseAssetCsv(`${header},receivedAt\n${line},2026-02-31`, now).errors.some(error => error.includes('ISO date')));
  assert.ok(parseAssetCsv(`${header},priceObservedAt\n${line},2030-10-31`, now).errors.some(error => error.includes('future')));
});

test('approved exports preserve the approved route economics despite later policy changes', () => {
  const asset = createDemoWorkspace(now).assets[0];
  asset.title = 'Test asset';
  asset.notes = '';
  asset.stage = 'approved';
  asset.approvedRoute = 'wholesale';
  const evaluation = evaluateAsset(asset, DEFAULT_POLICY, now);
  asset.approvalSnapshot = { evaluation, policy: { ...DEFAULT_POLICY }, approvedAt: now.toISOString(), reason: 'Test approved route' };
  const exported = assetsToCsv([asset], { ...DEFAULT_POLICY, wholesaleFeeRate: 0.9 });
  const [names, values] = exported.trim().split('\r\n').map(row => row.split(','));
  assert.equal(values[names.indexOf('valuationBasis')], 'approval_snapshot');
  assert.equal(values[names.indexOf('economicRoute')], 'wholesale');
  assert.equal(Number(values[names.indexOf('expectedNet')]), evaluation.routes.find(route => route.id === 'wholesale')!.expectedNet);
});

test('limits batch size to 500 rows', () => {
  const rows = Array.from({ length: 501 }, (_, i) => line.replace('TEST0001', `TEST${i}`));
  assert.ok(parseAssetCsv([header, ...rows].join('\n'), now).errors.some(error => error.includes('500')));
});

test('export escapes spreadsheet formulas and supports all editable fields', () => {
  const asset = createDemoWorkspace(now).assets[0];
  asset.title = '=HYPERLINK("https://example.invalid","click")';
  asset.notes = '+SUM(1,2)';
  const exported = assetsToCsv([asset]);
  assert.ok(exported.includes("\"'=HYPERLINK"));
  assert.ok(exported.includes("\"'+SUM"));
  const imported = parseAssetCsv(exported, now);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.assets[0].stage, 'pending');
  assert.equal(imported.assets[0].marketPrice, asset.marketPrice);
  assert.equal(imported.assets[0].grade, asset.grade);
});

test('demo dataset is fictional, unique, and includes blocking examples', () => {
  const workspace = createDemoWorkspace(now);
  assert.equal(workspace.assets.length, 18);
  assert.equal(new Set(workspace.assets.map(asset => asset.usn)).size, 18);
  assert.ok(workspace.assets.every(asset => asset.priceSource === 'sample' && asset.stage === 'pending' && asset.usn.startsWith('DEMO')));
  assert.ok(workspace.assets.some(asset => asset.safetyStatus === 'hold'));
  assert.ok(workspace.assets.some(asset => asset.dataStatus === 'pending'));
});

test('new approval exports freeze input fields as well as selected-route economics', () => {
  const approved = approvalFixture();
  const snapshot = approved.assets[0].approvalSnapshot!;
  const selected = snapshot.evaluation.routes.find(route => route.id === 'wholesale')!;
  assert.ok(snapshot.inputs);
  // Even an out-of-band difference in the current object must not rewrite the
  // decision's exported inputs. Normal server actions lock these fields.
  approved.assets[0].marketPrice = 999;
  approved.assets[0].acquisitionCost = 999;
  approved.policy.wholesaleFeeRate = 0.9;
  const row = plainExportRow(approved);
  assert.equal(row.inputBasis, 'approval_inputs');
  assert.equal(row.marketPrice, String(snapshot.inputs.marketPrice));
  assert.equal(row.acquisitionCost, String(snapshot.inputs.acquisitionCost));
  assert.equal(row.expectedNet, String(selected.expectedNet));
  assert.equal(row.engineVersion, snapshot.evaluation.engineVersion);
  assert.equal(row.approvedAt, now.toISOString());
  assert.equal(row.archivedApprovalCount, '0');
});

test('reopened CSV shows current hold economics and audit metadata without replaying approvals on import', () => {
  const approved = approvalFixture();
  const reopenedAt = new Date(now.getTime() + 60_000);
  const reopened = applyWorkspaceAction(approved, {
    action: 'reopen', revision: approved.revision, assetId: approved.assets[0].id,
    reason: 'Unexpected battery behavior requires a fresh inspection.',
  }, 'demo', reopenedAt);
  const row = plainExportRow(reopened);
  assert.equal(row.stage, 'pending');
  assert.equal(row.valuationBasis, 'current_assumptions');
  assert.equal(row.inputBasis, 'current_inputs');
  assert.equal(row.archivedApprovalCount, '1');
  assert.equal(row.lastReopenedAt, reopenedAt.toISOString());
  assert.equal(row.approvedAt, '');
  assert.equal(row.approvedRoute, '');
  assert.equal(row.economicRoute, 'hold');
  assert.equal(row.expectedNet, '');
  assert.equal(row.safetyStatus, 'hold');

  reopened.assets[0].approvalHistory![0].reason = '=HYPERLINK("https://example.invalid","audit")';
  const exported = assetsToCsv(reopened.assets, reopened.policy);
  assert.ok(exported.includes('"\'=HYPERLINK(""'));
  const imported = parseAssetCsv(exported, reopenedAt);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.assets[0].stage, 'pending');
  assert.equal(imported.assets[0].approvalHistory, undefined);
  assert.equal(imported.assets[0].approvalSnapshot, undefined);
  assert.equal(imported.assets[0].approvedRoute, undefined);
  assert.equal(imported.assets[0].outcome, undefined);
});

test('reapproval and completion export the new active snapshot while preserving archived inputs', () => {
  const first = approvalFixture();
  let current = applyWorkspaceAction(first, {
    action: 'reopen', revision: first.revision, assetId: first.assets[0].id,
    reason: 'Recheck the inspection and updated acquisition allocation.',
  }, 'demo', now);
  const archiveBefore = JSON.stringify(current.assets[0].approvalHistory);
  current = applyWorkspaceAction(current, {
    action: 'update', revision: current.revision,
    asset: { ...current.assets[0], testStatus: 'passed', safetyStatus: 'clear', acquisitionCost: 200, marketPrice: 600, approvalHistory: [] },
  }, 'demo', now);
  assert.equal(JSON.stringify(current.assets[0].approvalHistory), archiveBefore);
  current = applyWorkspaceAction(current, {
    action: 'approve', revision: current.revision, assetId: current.assets[0].id,
    route: 'wholesale', reason: 'New inspection complete and immediate exit approved.',
  }, 'demo', now);
  const activeSnapshot = current.assets[0].approvalSnapshot!;
  assert.ok(activeSnapshot.inputs);
  for (const key of ['stage', 'approvalSnapshot', 'approvalHistory', 'outcome', 'approvedRoute']) {
    assert.equal(key in activeSnapshot.inputs, false);
  }
  current = applyWorkspaceAction(current, {
    action: 'complete', revision: current.revision, assetId: current.assets[0].id,
    outcome: { grossProceeds: 350.12, actualCosts: 50.03, completedAt: now.toISOString(), notes: 'Recorded actual recovery.' },
  }, 'demo', now);
  const row = plainExportRow(current);
  assert.equal(row.stage, 'completed');
  assert.equal(row.archivedApprovalCount, '1');
  assert.equal(row.acquisitionCost, '200');
  assert.equal(row.marketPrice, '600');
  assert.equal(row.actualNetRecovery, '300.09');
  assert.equal(row.actualProfit, '100.09');
  assert.equal(row.expectedNet, String(activeSnapshot.evaluation.routes.find(route => route.id === 'wholesale')!.expectedNet));
  assert.equal(JSON.stringify(current.assets[0].approvalHistory), archiveBefore);
});
