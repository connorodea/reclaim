import type { ActivityEvent, Asset, AssetDecisionInputs, Outcome, Policy, RouteId, Workspace } from './types.ts';
import { evaluateAsset } from './engine.ts';
import { createDemoWorkspace } from './seed.ts';

export const MAX_BATCH_ASSETS = 500;
export const MAX_WORKSPACE_ASSETS = 5000;
export const MAX_WORKSPACE_BYTES = 1_800_000;

export class WorkspaceError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 422, code = 'validation_error') {
    super(message);
    this.name = 'WorkspaceError';
    this.status = status;
    this.code = code;
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkspaceError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 200, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string') throw new WorkspaceError(`${label} must be text.`);
  const result = value.trim();
  if ((!optional && !result) || result.length > max) {
    throw new WorkspaceError(`${label} must contain ${optional ? '0' : '1'}–${max} characters.`);
  }
  return result;
}

function number(value: unknown, label: string, min = 0, max = 10_000_000, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new WorkspaceError(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
  return value;
}

function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) {
    throw new WorkspaceError(`${label} must be one of: ${options.join(', ')}.`);
  }
  return value as T;
}

function date(value: unknown, label: string, now: Date): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    throw new WorkspaceError(`${label} must be an ISO date.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > now.getTime() + 300_000) {
    throw new WorkspaceError(`${label} must be a valid date that is not in the future.`);
  }
  // Validate the written calendar date independently of its timezone offset.
  // Date.parse otherwise normalizes impossible dates such as February 31.
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new WorkspaceError(`${label} must be a valid calendar date.`);
  }
  return parsed.toISOString();
}

export function validateAsset(input: unknown, now = new Date()): Asset {
  const v = record(input, 'Asset');
  const id = text(v.id, 'Asset ID', 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new WorkspaceError('Asset ID may contain only letters, numbers, underscores, and hyphens.');
  const result: Asset = {
    id,
    usn: text(v.usn, 'USN', 80),
    sku: text(v.sku, 'SKU', 100, true),
    title: text(v.title, 'Title', 200),
    category: choice(v.category, ['Laptop', 'Phone', 'Tablet', 'Audio', 'Console', 'Other'], 'Category'),
    grade: choice(v.grade, ['LN', 'VG', 'G', 'AC', 'S', 'DNL', 'NRFB', 'NDCL'], 'Grade'),
    receivedAt: date(v.receivedAt, 'Received date', now),
    location: text(v.location, 'Location', 100, true),
    acquisitionCost: number(v.acquisitionCost, 'Acquisition cost'),
    marketPrice: number(v.marketPrice, 'Market price'),
    refurbishedPrice: number(v.refurbishedPrice, 'Refurbished price'),
    wholesalePrice: number(v.wholesalePrice, 'Wholesale price'),
    partsValue: number(v.partsValue, 'Parts value'),
    recycleValue: number(v.recycleValue, 'Recycle value'),
    repairCost: number(v.repairCost, 'Repair cost'),
    repairDays: number(v.repairDays, 'Repair days', 0, 3650),
    repairSuccess: number(v.repairSuccess, 'Repair success probability', 0, 1),
    expectedDays: number(v.expectedDays, 'Expected sale days', 1, 3650),
    sellThrough: number(v.sellThrough, 'Sell-through probability', 0, 1),
    returnRate: number(v.returnRate, 'Return rate', 0, 1),
    testStatus: choice(v.testStatus, ['passed', 'failed', 'untested'], 'Test status'),
    dataStatus: choice(v.dataStatus, ['cleared', 'pending', 'not_required'], 'Data status'),
    safetyStatus: choice(v.safetyStatus, ['clear', 'hold'], 'Safety status'),
    priceSource: choice(v.priceSource, ['sample', 'estimate', 'observed'], 'Price source'),
    priceObservedAt: date(v.priceObservedAt, 'Price observation date', now),
    comparableCount: number(v.comparableCount, 'Comparable count', 0, 1_000_000, true),
    notes: text(v.notes, 'Notes', 4000, true),
    // The server exclusively controls workflow and approval fields.
    stage: 'pending',
  };
  if (result.priceSource === 'observed' && result.comparableCount < 1) {
    throw new WorkspaceError('Observed pricing requires at least one comparable. Choose estimate when you have no observations.');
  }
  return result;
}

/** Copy only explicit decision inputs, so repeated reopens cannot nest history. */
function snapshotDecisionInputs(asset: AssetDecisionInputs): AssetDecisionInputs {
  return {
    id: asset.id,
    usn: asset.usn,
    sku: asset.sku,
    title: asset.title,
    category: asset.category,
    grade: asset.grade,
    receivedAt: asset.receivedAt,
    location: asset.location,
    acquisitionCost: asset.acquisitionCost,
    marketPrice: asset.marketPrice,
    refurbishedPrice: asset.refurbishedPrice,
    wholesalePrice: asset.wholesalePrice,
    partsValue: asset.partsValue,
    recycleValue: asset.recycleValue,
    repairCost: asset.repairCost,
    repairDays: asset.repairDays,
    repairSuccess: asset.repairSuccess,
    expectedDays: asset.expectedDays,
    sellThrough: asset.sellThrough,
    returnRate: asset.returnRate,
    testStatus: asset.testStatus,
    dataStatus: asset.dataStatus,
    safetyStatus: asset.safetyStatus,
    priceSource: asset.priceSource,
    priceObservedAt: asset.priceObservedAt,
    comparableCount: asset.comparableCount,
    notes: asset.notes,
  };
}

export function validatePolicy(input: unknown): Policy {
  const v = record(input, 'Policy');
  return {
    retailFeeRate: number(v.retailFeeRate, 'Retail fee rate', 0, 1),
    wholesaleFeeRate: number(v.wholesaleFeeRate, 'Wholesale fee rate', 0, 1),
    partsFeeRate: number(v.partsFeeRate, 'Parts fee rate', 0, 1),
    shippingCost: number(v.shippingCost, 'Shipping cost', 0, 1_000_000),
    partsShippingCost: number(v.partsShippingCost, 'Parts shipping cost', 0, 1_000_000),
    packagingCost: number(v.packagingCost, 'Packaging cost', 0, 1_000_000),
    returnHandlingCost: number(v.returnHandlingCost, 'Return handling cost', 0, 1_000_000),
    warrantyReserveRate: number(v.warrantyReserveRate, 'Warranty reserve rate', 0, 1),
    holdingCostPerDay: number(v.holdingCostPerDay, 'Daily holding cost', 0, 1_000_000),
    depreciationRatePerDay: number(v.depreciationRatePerDay, 'Daily depreciation rate', 0, 1),
    recyclingCost: number(v.recyclingCost, 'Recycling cost', 0, 1_000_000),
    minimumUplift: number(v.minimumUplift, 'Minimum uplift', 0, 1_000_000),
    minimumEvidenceScore: number(v.minimumEvidenceScore, 'Minimum evidence score', 0, 100),
    staleAfterDays: number(v.staleAfterDays, 'Evidence freshness window', 1, 3650),
    maxRepairDays: number(v.maxRepairDays, 'Maximum repair days', 0, 3650),
  };
}

export function validateOutcome(input: unknown, now = new Date()): Outcome {
  const v = record(input, 'Outcome');
  return {
    grossProceeds: number(v.grossProceeds, 'Gross proceeds'),
    actualCosts: number(v.actualCosts, 'Actual costs'),
    completedAt: date(v.completedAt, 'Completion date', now),
    notes: text(v.notes, 'Outcome notes', 4000, true),
  };
}

export interface WorkspaceAction {
  revision: number;
  action: 'intake' | 'update' | 'approve' | 'reopen' | 'complete' | 'policy' | 'reset_demo';
  assets?: unknown;
  asset?: unknown;
  assetId?: unknown;
  route?: unknown;
  reason?: unknown;
  outcome?: unknown;
  policy?: unknown;
}

export function validateAction(input: unknown): WorkspaceAction {
  const v = record(input, 'Action');
  const revision = number(v.revision, 'Workspace revision', 0, Number.MAX_SAFE_INTEGER, true);
  const action = choice(v.action, ['intake', 'update', 'approve', 'reopen', 'complete', 'policy', 'reset_demo'], 'Action');
  return { revision, action, assets: v.assets, asset: v.asset, assetId: v.assetId, route: v.route, reason: v.reason, outcome: v.outcome, policy: v.policy };
}

function event(now: Date, action: string, label: string, details: string, asset?: Asset): ActivityEvent {
  return { id: crypto.randomUUID(), assetId: asset?.id ?? null, ...(asset ? { usn: asset.usn } : {}), action, label, details, createdAt: now.toISOString() };
}

function findAsset(workspace: Workspace, id: unknown): Asset {
  const assetId = text(id, 'Asset ID', 100);
  const asset = workspace.assets.find(a => a.id === assetId);
  if (!asset) throw new WorkspaceError('This asset no longer exists. Refresh the workspace.', 404, 'asset_not_found');
  return asset;
}

export function checkWorkspaceCapacity(workspace: Workspace): string {
  const payload = JSON.stringify(workspace);
  if (new TextEncoder().encode(payload).byteLength > MAX_WORKSPACE_BYTES) {
    throw new WorkspaceError('This pilot workspace has reached its storage capacity. Your existing records and history are safe; this change was not saved. Export the workspace before moving to a larger deployment.', 413, 'workspace_capacity');
  }
  return payload;
}

/** Pure, atomic state transition. The database separately enforces the revision CAS. */
export function applyWorkspaceAction(current: Workspace, input: unknown, mode: 'demo' | 'live', now = new Date()): Workspace {
  const command = validateAction(input);
  if (command.revision !== current.revision) throw new WorkspaceError('The workspace changed in another tab. Refresh and try again.', 409, 'revision_conflict');
  const next: Workspace = structuredClone(current);

  if (command.action === 'reset_demo') {
    if (mode !== 'demo') throw new WorkspaceError('Only the sample workspace can be reset.', 403, 'reset_forbidden');
    const reset = createDemoWorkspace(now);
    reset.revision = current.revision + 1;
    reset.updatedAt = now.toISOString();
    reset.events.push(event(now, 'reset_demo', 'Sample workspace reset', 'Restored fictional inventory and default assumptions. Live inventory was not changed.'));
    checkWorkspaceCapacity(reset);
    return reset;
  }

  if (command.action === 'intake') {
    if (!Array.isArray(command.assets) || command.assets.length === 0 || command.assets.length > MAX_BATCH_ASSETS) {
      throw new WorkspaceError(`Add between 1 and ${MAX_BATCH_ASSETS} assets in one import.`);
    }
    if (next.assets.length + command.assets.length > MAX_WORKSPACE_ASSETS) throw new WorkspaceError(`A workspace can hold up to ${MAX_WORKSPACE_ASSETS} assets.`, 413, 'workspace_capacity');
    const assets = command.assets.map((value, index) => {
      try { return validateAsset(value, now); }
      catch (error) { if (error instanceof WorkspaceError) throw new WorkspaceError(`Row ${index + 1}: ${error.message}`); throw error; }
    });
    const ids = new Set(next.assets.map(a => a.id));
    const usns = new Set(next.assets.map(a => a.usn.toLowerCase()));
    for (const asset of assets) {
      if (ids.has(asset.id) || usns.has(asset.usn.toLowerCase())) throw new WorkspaceError(`Duplicate asset: ${asset.usn}. The whole import was rejected; no rows were added.`, 409, 'duplicate_asset');
      ids.add(asset.id); usns.add(asset.usn.toLowerCase());
    }
    next.assets.push(...assets);
    next.events.push(event(now, 'intake', `${assets.length} ${assets.length === 1 ? 'asset' : 'assets'} received`, assets.map(a => a.usn).join(', '), assets.length === 1 ? assets[0] : undefined));
  } else if (command.action === 'update') {
    const validated = validateAsset(command.asset, now);
    const old = findAsset(next, validated.id);
    if (old.stage !== 'pending') throw new WorkspaceError('Approved and completed assets are locked to preserve their decision history.', 409, 'asset_locked');
    if (next.assets.some(a => a.id !== old.id && a.usn.toLowerCase() === validated.usn.toLowerCase())) throw new WorkspaceError(`USN ${validated.usn} already exists.`, 409, 'duplicate_asset');
    const changed = Object.keys(validated).filter(key => JSON.stringify(old[key as keyof Asset]) !== JSON.stringify(validated[key as keyof Asset]));
    if (changed.length === 0) throw new WorkspaceError('No asset changes to save.');
    // Approval history is server-owned. A client cannot inject, alter, or remove it.
    if (old.approvalHistory) validated.approvalHistory = structuredClone(old.approvalHistory);
    next.assets[next.assets.findIndex(a => a.id === old.id)] = validated;
    next.events.push(event(now, 'update', 'Inspection and assumptions updated', changed.map(key => `${key}: ${JSON.stringify(old[key as keyof Asset])} → ${JSON.stringify(validated[key as keyof Asset])}`).join('; '), validated));
  } else if (command.action === 'policy') {
    const policy = validatePolicy(command.policy);
    next.policy = policy;
    next.events.push(event(now, 'policy', 'Recovery policy updated', JSON.stringify(policy)));
  } else if (command.action === 'approve') {
    const asset = findAsset(next, command.assetId);
    if (asset.stage !== 'pending') throw new WorkspaceError('This asset already has an approved decision.', 409, 'asset_locked');
    const route = choice(command.route, ['retail', 'refurbish', 'wholesale', 'parts', 'recycle'], 'Recovery route') as RouteId;
    const evaluation = evaluateAsset(asset, next.policy, now);
    const selected = evaluation.routes.find(r => r.id === route);
    // Enforce these independently of the recommendation engine and browser UI.
    if (asset.safetyStatus === 'hold' || asset.dataStatus === 'pending' || evaluation.recommendedRoute === 'hold' || !selected?.eligible) {
      throw new WorkspaceError(`This route is blocked. ${[...evaluation.blockers, ...(selected?.blockedReasons ?? [])].join(' ') || 'Resolve the inspection and release requirements first.'}`, 403, 'route_blocked');
    }
    const reason = text(command.reason, 'Review reason', 2000, true);
    if ((evaluation.reviewRequired || route !== evaluation.recommendedRoute) && reason.length < 10) {
      throw new WorkspaceError('Enter a review reason of at least 10 characters when evidence needs review or you choose another route.', 422, 'review_reason_required');
    }
    asset.stage = 'approved';
    asset.approvedRoute = route;
    asset.approvalSnapshot = { evaluation: structuredClone(evaluation), policy: structuredClone(next.policy), approvedAt: now.toISOString(), reason, inputs: snapshotDecisionInputs(asset) };
    next.events.push(event(now, 'approve', `${selected.label} approved`, `Expected net recovery: $${selected.expectedNet.toFixed(2)}. ${reason || 'Selected the recommended eligible route.'} This approval records an internal decision; no marketplace listing or shipment was created.`, asset));
  } else if (command.action === 'reopen') {
    const asset = findAsset(next, command.assetId);
    if (asset.stage !== 'approved' || !asset.approvedRoute || !asset.approvalSnapshot) {
      throw new WorkspaceError('Only an approved asset can be reopened for inspection. Completed outcomes remain locked.', 409, 'reopen_forbidden');
    }
    const reason = text(command.reason, 'Reinspection reason', 2000, true);
    if (reason.length < 10) throw new WorkspaceError('Enter a reinspection reason of at least 10 characters.', 422, 'reopen_reason_required');
    const previousRoute = asset.approvedRoute;
    const previousSnapshot = asset.approvalSnapshot;
    // Legacy approvals lacked input snapshots. Their assets were locked, so the
    // still-unchanged input fields recover the original decision inputs safely.
    const originalInputs = snapshotDecisionInputs(previousSnapshot.inputs ?? asset);
    asset.approvalHistory = [
      ...(asset.approvalHistory ?? []),
      {
        approvedRoute: previousRoute,
        approvalSnapshot: { ...structuredClone(previousSnapshot), inputs: originalInputs },
        reopenedAt: now.toISOString(),
        reason,
      },
    ];
    asset.stage = 'pending';
    asset.testStatus = 'untested';
    asset.safetyStatus = 'hold';
    // Preserve recorded data-clearance status; reinspection must explicitly
    // update it if the reason for reopening also changes data-release evidence.
    delete asset.approvedRoute;
    delete asset.approvalSnapshot;
    delete asset.outcome;
    next.events.push(event(now, 'reopen', 'Approval reopened for inspection', `Archived the ${previousRoute} approval from ${previousSnapshot.approvedAt}. ${reason} The asset is pending with an untested inspection and safety hold; a new approval is required after reinspection.`, asset));
  } else if (command.action === 'complete') {
    const asset = findAsset(next, command.assetId);
    if (asset.stage !== 'approved' || !asset.approvedRoute || !asset.approvalSnapshot) throw new WorkspaceError('Only an approved asset can have a realized outcome recorded.', 409, 'approval_required');
    const outcome = validateOutcome(command.outcome, now);
    if (new Date(outcome.completedAt).getTime() < new Date(asset.receivedAt).getTime()) throw new WorkspaceError('Completion cannot be before the item was received.');
    asset.stage = 'completed';
    asset.outcome = outcome;
    const net = outcome.grossProceeds - outcome.actualCosts;
    next.events.push(event(now, 'complete', 'Recovery outcome recorded', `Gross proceeds: $${outcome.grossProceeds.toFixed(2)}. Recovery costs: $${outcome.actualCosts.toFixed(2)}. Realized net recovery: $${net.toFixed(2)}. ${outcome.notes}`, asset));
  }

  next.revision = current.revision + 1;
  next.updatedAt = now.toISOString();
  checkWorkspaceCapacity(next);
  return next;
}
