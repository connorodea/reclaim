export type Grade = 'LN' | 'VG' | 'G' | 'AC' | 'S' | 'DNL' | 'NRFB' | 'NDCL';
export type RouteId = 'retail' | 'refurbish' | 'wholesale' | 'parts' | 'recycle' | 'hold';
export type Stage = 'pending' | 'approved' | 'completed';
export interface Policy {
  retailFeeRate: number;
  wholesaleFeeRate: number;
  partsFeeRate: number;
  shippingCost: number;
  partsShippingCost: number;
  packagingCost: number;
  returnHandlingCost: number;
  warrantyReserveRate: number;
  holdingCostPerDay: number;
  depreciationRatePerDay: number;
  recyclingCost: number;
  minimumUplift: number;
  minimumEvidenceScore: number;
  staleAfterDays: number;
  maxRepairDays: number;
}
export interface RouteEconomics {
  id: RouteId;
  label: string;
  channel: string;
  eligible: boolean;
  blockedReasons: string[];
  expectedNet: number;
  expectedProfit: number;
  expectedDays: number;
  grossValue: number;
  fees: number;
  fulfillment: number;
  holdingCost: number;
  repairSpend: number;
  riskCost: number;
  netIfSuccessful: number;
  netIfUnsuccessful: number;
  probability: number;
  explanation: string;
}
export interface Evaluation {
  engineVersion: string;
  evaluatedAt: string;
  recommendedRoute: RouteId;
  recommended: RouteEconomics | null;
  routes: RouteEconomics[];
  baselineNet: number;
  uplift: number;
  evidenceScore: number;
  evidenceLabel: 'Strong' | 'Moderate' | 'Limited';
  reviewRequired: boolean;
  reviewReasons: string[];
  blockers: string[];
  summary: string;
}
export interface Outcome {
  grossProceeds: number;
  actualCosts: number;
  completedAt: string;
  notes: string;
}
/** Decision inputs only: never embeds workflow state, approvals, or history. */
export interface AssetDecisionInputs {
  id: string;
  usn: string;
  sku: string;
  title: string;
  category: 'Laptop' | 'Phone' | 'Tablet' | 'Audio' | 'Console' | 'Other';
  grade: Grade;
  receivedAt: string;
  location: string;
  acquisitionCost: number;
  marketPrice: number;
  refurbishedPrice: number;
  wholesalePrice: number;
  partsValue: number;
  recycleValue: number;
  repairCost: number;
  repairDays: number;
  repairSuccess: number;
  expectedDays: number;
  sellThrough: number;
  returnRate: number;
  testStatus: 'passed' | 'failed' | 'untested';
  dataStatus: 'cleared' | 'pending' | 'not_required';
  safetyStatus: 'clear' | 'hold';
  priceSource: 'sample' | 'estimate' | 'observed';
  priceObservedAt: string;
  comparableCount: number;
  notes: string;
}
export interface ApprovalSnapshot {
  evaluation: Evaluation;
  policy: Policy;
  approvedAt: string;
  reason: string;
  /** Present on new approvals; older saved workspaces may omit this field. */
  inputs?: AssetDecisionInputs;
}
export interface ApprovalHistoryEntry {
  approvedRoute: RouteId;
  approvalSnapshot: ApprovalSnapshot & { inputs: AssetDecisionInputs };
  reopenedAt: string;
  reason: string;
}
export interface Asset extends AssetDecisionInputs {
  stage: Stage;
  approvedRoute?: RouteId;
  approvalSnapshot?: ApprovalSnapshot;
  approvalHistory?: ApprovalHistoryEntry[];
  outcome?: Outcome;
}
export interface ActivityEvent {
  id: string;
  assetId: string | null;
  usn?: string;
  action: string;
  label: string;
  details: string;
  createdAt: string;
}
export interface Workspace {
  assets: Asset[];
  policy: Policy;
  events: ActivityEvent[];
  revision: number;
  updatedAt: string;
}
export interface ApiState { workspace: Workspace; persistence: 'durable' | 'preview'; mode: 'demo' | 'live' }
