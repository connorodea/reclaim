import { DEFAULT_POLICY } from './engine.ts';
import type { Asset, Workspace } from './types.ts';

const DAY = 86_400_000;

/** Fictional examples for exploration. Prices are never presented as observed comps. */
export function createDemoWorkspace(now: Date = new Date()): Workspace {
  const at = now.toISOString();
  const row = (index: number, values: Partial<Asset>): Asset => ({
    id: `demo-${String(index).padStart(3, '0')}`,
    usn: `DEMO${String(index).padStart(8, '0')}`,
    sku: `DEMO-SKU-${String(index).padStart(3, '0')}`,
    title: 'Sample electronics asset',
    category: 'Laptop',
    grade: 'VG',
    receivedAt: new Date(now.getTime() - (index % 12 + 1) * DAY).toISOString(),
    location: `A-${String(Math.ceil(index / 4)).padStart(2, '0')}-${String(index % 4 + 1).padStart(2, '0')}`,
    acquisitionCost: 100,
    marketPrice: 250,
    refurbishedPrice: 300,
    wholesalePrice: 120,
    partsValue: 45,
    recycleValue: 8,
    repairCost: 40,
    repairDays: 3,
    repairSuccess: 0.85,
    expectedDays: 18,
    sellThrough: 0.85,
    returnRate: 0.06,
    testStatus: 'passed',
    dataStatus: 'cleared',
    safetyStatus: 'clear',
    priceSource: 'sample',
    priceObservedAt: new Date(now.getTime() - 2 * DAY).toISOString(),
    comparableCount: 0,
    notes: 'Fictional demonstration unit. All prices and probabilities are illustrative.',
    stage: 'pending',
    ...values,
  });
  const assets: Asset[] = [
    row(1, { title: 'MacBook Air 13″ · M1 · 256 GB', sku: 'MBA-M1-256', acquisitionCost: 190, marketPrice: 449, refurbishedPrice: 479, wholesalePrice: 255, partsValue: 95, repairCost: 35, grade: 'VG', notes: 'Demo: diagnostics pass. Light lid wear; charger included.' }),
    row(2, { title: 'iPhone 13 · 128 GB · Midnight', sku: 'IP13-128-MID', category: 'Phone', acquisitionCost: 110, marketPrice: 265, refurbishedPrice: 329, wholesalePrice: 135, partsValue: 58, repairCost: 42, repairDays: 2, testStatus: 'failed', grade: 'AC', repairSuccess: 0.94, notes: 'Demo: cracked display. Touch and cameras pass; repair quote is illustrative.' }),
    row(3, { title: 'Dell Latitude 5420 · i5 · 16 GB', sku: 'DL5420-I5-16', acquisitionCost: 95, marketPrice: 239, refurbishedPrice: 269, wholesalePrice: 140, partsValue: 48, repairCost: 30, grade: 'G', notes: 'Demo: diagnostics pass. Keyboard shine; no adapter.' }),
    row(4, { title: 'Sony WH-1000XM4 · Black', sku: 'SONY-XM4-BLK', category: 'Audio', acquisitionCost: 55, marketPrice: 159, refurbishedPrice: 169, wholesalePrice: 85, partsValue: 18, recycleValue: 2, repairCost: 16, dataStatus: 'not_required', grade: 'VG', notes: 'Demo: audio and pairing pass. Ear pads replaced.' }),
    row(5, { title: 'iPad Air · 4th generation · 64 GB', sku: 'IPADAIR4-64', category: 'Tablet', acquisitionCost: 115, marketPrice: 249, refurbishedPrice: 279, wholesalePrice: 145, partsValue: 48, dataStatus: 'pending', grade: 'VG', notes: 'Demo: data-erasure evidence is missing. Outbound movement remains blocked.' }),
    row(6, { title: 'HP EliteBook 840 G6 · i7 · 16 GB', sku: 'HP840G6-I7-16', acquisitionCost: 70, marketPrice: 215, refurbishedPrice: 245, wholesalePrice: 120, partsValue: 42, repairCost: 25, grade: 'G', expectedDays: 30, sellThrough: 0.68, notes: 'Demo: battery tested at 74% design capacity. Review channel requirements.' }),
    row(7, { title: 'Nintendo Switch · Neon · 32 GB', sku: 'NSW-32-NEON', category: 'Console', acquisitionCost: 72, marketPrice: 179, refurbishedPrice: 209, wholesalePrice: 95, partsValue: 38, repairCost: 23, repairDays: 2, repairSuccess: 0.96, testStatus: 'failed', grade: 'AC', notes: 'Demo: left Joy-Con drift. Console and dock pass diagnostics.' }),
    row(8, { title: 'Samsung Galaxy S21 · 128 GB', sku: 'SGS21-128', category: 'Phone', acquisitionCost: 65, marketPrice: 169, refurbishedPrice: 209, wholesalePrice: 85, partsValue: 34, repairCost: 95, repairSuccess: 0.55, testStatus: 'failed', grade: 'S', notes: 'Demo: intermittent boot failure. Board repair has uncertain success.' }),
    row(9, { title: 'Lenovo ThinkPad T14 · Ryzen 5', sku: 'T14-R5-256', acquisitionCost: 105, marketPrice: 289, refurbishedPrice: 319, wholesalePrice: 175, partsValue: 52, grade: 'VG', priceObservedAt: new Date(now.getTime() - 35 * DAY).toISOString(), notes: 'Demo: diagnostics pass. Pricing assumptions are deliberately stale.' }),
    row(10, { title: 'AirPods Pro · 2nd generation', sku: 'APP2-USBC', category: 'Audio', acquisitionCost: 58, marketPrice: 139, refurbishedPrice: 159, wholesalePrice: 78, partsValue: 18, recycleValue: 1, repairCost: 20, dataStatus: 'not_required', grade: 'NDCL', notes: 'Demo: cleaning and hygiene inspection required before retail release.' }),
    row(11, { title: 'Microsoft Surface Pro 7 · i5', sku: 'SP7-I5-128', category: 'Tablet', acquisitionCost: 80, marketPrice: 229, refurbishedPrice: 269, wholesalePrice: 130, partsValue: 40, safetyStatus: 'hold', testStatus: 'failed', grade: 'DNL', notes: 'Demo: battery swelling observed. Safety hold overrides recovery economics.' }),
    row(12, { title: 'PlayStation 5 · Digital edition', sku: 'PS5-DIGITAL', category: 'Console', acquisitionCost: 160, marketPrice: 339, refurbishedPrice: 369, wholesalePrice: 215, partsValue: 90, repairCost: 45, testStatus: 'untested', grade: 'G', notes: 'Demo: intake received. Functional diagnostics still required.' }),
    row(13, { title: 'JBL Flip 6 · Blue', sku: 'JBL-FLIP6-BLU', category: 'Audio', acquisitionCost: 25, marketPrice: 69, refurbishedPrice: 79, wholesalePrice: 42, partsValue: 8, recycleValue: 1, repairCost: 18, dataStatus: 'not_required', grade: 'LN', sellThrough: 0.55, expectedDays: 35, notes: 'Demo: open box. Low selling price makes fees and shipping material.' }),
    row(14, { title: 'HP ProBook 640 G5 · i5 · 8 GB', sku: 'HP640G5-I5', acquisitionCost: 30, marketPrice: 95, refurbishedPrice: 119, wholesalePrice: 65, partsValue: 22, repairCost: 28, expectedDays: 42, sellThrough: 0.58, grade: 'G', notes: 'Demo: working corporate return. Compare wholesale speed with retail handling.' }),
    row(15, { title: 'MacBook Pro 13″ · 2019 · 512 GB', sku: 'MBP13-2019-512', acquisitionCost: 60, marketPrice: 279, refurbishedPrice: 329, wholesalePrice: 75, partsValue: 118, repairCost: 245, repairSuccess: 0.45, testStatus: 'failed', grade: 'S', notes: 'Demo: liquid damage. Repair estimate exceeds the likely incremental recovery.' }),
    row(16, { title: 'Logitech MX Master 3S · Graphite', sku: 'MXM3S-GRAPH', category: 'Other', acquisitionCost: 22, marketPrice: 59, refurbishedPrice: 69, wholesalePrice: 38, partsValue: 9, recycleValue: 1, repairCost: 12, dataStatus: 'not_required', grade: 'VG', notes: 'Demo: all controls pass. Receiver included.' }),
    row(17, { title: 'Dell OptiPlex 7060 · Small form', sku: 'D7060-SFF-I5', category: 'Other', acquisitionCost: 48, marketPrice: 159, refurbishedPrice: 199, wholesalePrice: 90, partsValue: 35, repairCost: 20, grade: 'NRFB', notes: 'Demo: corporate desktop awaiting refurbishment and regrading. Initial diagnostics and erasure recorded.' }),
    row(18, { title: 'Legacy Wi-Fi router · 802.11n', sku: 'LEGACY-N300', category: 'Other', acquisitionCost: 2, marketPrice: 12, refurbishedPrice: 15, wholesalePrice: 4, partsValue: 2, recycleValue: 11, repairCost: 25, repairSuccess: 0.2, expectedDays: 60, sellThrough: 0.2, testStatus: 'failed', grade: 'S', notes: 'Demo: no power. Illustrative recycling rebate; confirm processor terms before use.' }),
  ];
  return {
    assets,
    policy: { ...DEFAULT_POLICY },
    events: [{ id: 'demo-created', assetId: null, action: 'workspace_created', label: 'Demo workspace created', details: '18 fictional electronics assets. Prices, condition notes, and probabilities are examples, not market observations.', createdAt: at }],
    revision: 0,
    updatedAt: at,
  };
}

export function createEmptyWorkspace(): Workspace {
  return { assets: [], policy: { ...DEFAULT_POLICY }, events: [], revision: 0, updatedAt: new Date().toISOString() };
}
