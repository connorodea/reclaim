import { createAssetId } from './id.ts';
import { evaluateAsset, DEFAULT_POLICY } from './engine.ts';
import type { Asset, Policy } from './types.ts';

const REQUIRED = ['usn', 'sku', 'title', 'category', 'grade', 'acquisitionCost', 'marketPrice', 'wholesalePrice', 'partsValue', 'testStatus', 'dataStatus'] as const;
const INTAKE_FIELDS = ['usn', 'sku', 'title', 'category', 'grade', 'acquisitionCost', 'marketPrice', 'refurbishedPrice', 'wholesalePrice', 'partsValue', 'recycleValue', 'repairCost', 'repairDays', 'repairSuccess', 'expectedDays', 'sellThrough', 'returnRate', 'testStatus', 'dataStatus', 'safetyStatus', 'location', 'receivedAt', 'priceSource', 'priceObservedAt', 'comparableCount', 'notes'] as const;
// Export metadata is accepted on reimport for convenience, but never restores
// workflow state or audit records. Only server actions can create approvals.
const EXPORT_FIELDS = ['stage', 'approvedRoute', 'approvedAt', 'approvalReason', 'archivedApprovalCount', 'lastReopenedAt', 'lastReopenReason', 'recommendedRoute', 'economicRoute', 'valuationBasis', 'inputBasis', 'evaluatedAt', 'engineVersion', 'expectedNet', 'expectedProfit', 'evidenceScore', 'actualGrossProceeds', 'actualCosts', 'actualNetRecovery', 'actualProfit', 'completedAt'] as const;
const ENUMS = {
  category: ['Laptop', 'Phone', 'Tablet', 'Audio', 'Console', 'Other'],
  grade: ['LN', 'VG', 'G', 'AC', 'S', 'DNL', 'NRFB', 'NDCL'],
  testStatus: ['passed', 'failed', 'untested'],
  dataStatus: ['cleared', 'pending', 'not_required'],
  safetyStatus: ['clear', 'hold'],
  priceSource: ['sample', 'estimate', 'observed'],
};
const NUMERIC = ['acquisitionCost', 'marketPrice', 'refurbishedPrice', 'wholesalePrice', 'partsValue', 'recycleValue', 'repairCost', 'repairDays', 'repairSuccess', 'expectedDays', 'sellThrough', 'returnRate', 'comparableCount'] as const;
const PROBABILITIES: ReadonlySet<string> = new Set(['repairSuccess', 'sellThrough', 'returnRate']);
const INTEGERS: ReadonlySet<string> = new Set(['repairDays', 'expectedDays', 'comparableCount']);
const MAX_BYTES = 2_000_000;

export const CSV_TEMPLATE = 'usn,sku,title,category,grade,acquisitionCost,marketPrice,wholesalePrice,partsValue,testStatus,dataStatus,location,priceSource,priceObservedAt,comparableCount,notes\r\nUSN00000001,EXAMPLE-LAPTOP,Example laptop,Laptop,VG,100,250,130,40,untested,pending,A-01,estimate,,0,Replace this example and inspect the item before approving\r\n';

/** RFC 4180 style reader: quoted commas, escaped quotes, and embedded newlines. */
function readRows(input: string): { rows: string[][]; error?: string } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  let fieldStarted = false;
  const finishCell = () => { row.push(cell); cell = ''; closedQuote = false; fieldStarted = false; };
  const finishRow = () => { finishCell(); if (row.some(value => value.trim() !== '')) rows.push(row); row = []; };
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
      continue;
    }
    if (char === ',') { finishCell(); continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
      if (rows.length > 502) return { rows: [], error: 'CSV contains more than 500 asset rows.' };
      continue;
    }
    if (char === '"') {
      if (fieldStarted || closedQuote) return { rows: [], error: `Unexpected quote near CSV record ${rows.length + 1}. Quote the complete field and escape quotes as "".` };
      quoted = true; fieldStarted = true; continue;
    }
    if (closedQuote) {
      if (char === ' ' || char === '\t') continue;
      return { rows: [], error: `Unexpected text after a closing quote near CSV record ${rows.length + 1}.` };
    }
    cell += char;
    fieldStarted = true;
  }
  if (quoted) return { rows: [], error: 'CSV has an unterminated quoted field.' };
  if (cell !== '' || row.length > 0 || fieldStarted || closedQuote) finishRow();
  return { rows: rows.filter(values => values.some(value => value.trim() !== '')) };
}

function isoDate(value: string): string | null {
  // Reject locale-dependent dates and rollovers such as February 31.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split('-').map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== calendar) return null;
  return date.toISOString();
}

/** Parses a complete import. Any error prevents partial intake. */
export function parseAssetCsv(text: string, now: Date = new Date()): { assets: Asset[]; errors: string[] } {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) return { assets: [], errors: ['CSV must be smaller than 2 MB.'] };
  const parsed = readRows(text);
  if (parsed.error) return { assets: [], errors: [parsed.error] };
  if (parsed.rows.length < 2) return { assets: [], errors: ['Include a header and at least one asset row.'] };
  const [rawHeader, ...rows] = parsed.rows;
  if (rows.length > 500) return { assets: [], errors: ['Import at most 500 assets at a time.'] };
  const header = rawHeader.map(item => item.trim());
  const errors: string[] = [];
  const seenHeaders = new Set<string>();
  for (const name of header) {
    if (!name) errors.push('Every column needs a header.');
    else if (seenHeaders.has(name)) errors.push(`Duplicate column: ${name}.`);
    seenHeaders.add(name);
  }
  for (const required of REQUIRED) if (!seenHeaders.has(required)) errors.push(`Missing required column: ${required}.`);
  const knownHeaders = new Set<string>([...INTAKE_FIELDS, 'id', ...EXPORT_FIELDS]);
  for (const name of header) if (name && !knownHeaders.has(name)) errors.push(`Unknown column: ${name}. Use the template headers exactly.`);
  if (errors.length) return { assets: [], errors };
  const assets: Asset[] = [];
  const seenUsns = new Set<string>();
  for (let index = 0; index < rows.length; index++) {
    const rowNumber = index + 2;
    const values = rows[index];
    const prefix = `Row ${rowNumber}`;
    if (values.length !== header.length) { errors.push(`${prefix}: expected ${header.length} columns, found ${values.length}.`); continue; }
    const data = Object.fromEntries(header.map((name, i) => [name, values[i].trim()]));
    let valid = true;
    const fail = (message: string) => { valid = false; errors.push(`${prefix}: ${message}`); };
    for (const name of REQUIRED) if (!data[name]) fail(`${name} is required.`);
    if (data.usn.length > 80 || data.sku.length > 100 || data.title.length > 200) fail('usn, sku, or title exceeds its length limit (80, 100, and 200 characters).');
    if ((data.notes || '').length > 4000 || (data.location || '').length > 100) fail('notes or location is too long.');
    const normalizedUsn = data.usn.toUpperCase();
    if (seenUsns.has(normalizedUsn)) fail(`duplicate USN ${data.usn}.`);
    seenUsns.add(normalizedUsn);
    const numeric: Record<string, number> = {};
    const defaults: Record<string, number> = { refurbishedPrice: Number(data.marketPrice), recycleValue: 0, repairCost: 0, repairDays: 0, repairSuccess: 0, expectedDays: 30, sellThrough: 0.65, returnRate: 0.1, comparableCount: 0 };
    for (const field of NUMERIC) {
      const raw = data[field];
      if (raw === undefined || raw === '') {
        if (field in defaults) numeric[field] = defaults[field];
        else { numeric[field] = Number.NaN; if (raw) fail(`${field} is required.`); }
        continue;
      }
      // Numbers must be ordinary decimal text, never currency, commas, hex, or Infinity.
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) { fail(`${field} must be a nonnegative decimal number.`); continue; }
      const number = Number(raw);
      const maximum = PROBABILITIES.has(field) ? 1 : field === 'comparableCount' ? 1_000_000 : field.endsWith('Days') ? 3650 : 1_000_000;
      const minimum = field === 'expectedDays' ? 1 : 0;
      if (!Number.isFinite(number) || number < minimum || number > maximum) { fail(`${field} must be between ${minimum} and ${maximum}.`); continue; }
      if (INTEGERS.has(field) && !Number.isInteger(number)) { fail(`${field} must be a whole number.`); continue; }
      numeric[field] = number;
    }
    const enums: Record<string, string> = { ...data, safetyStatus: data.safetyStatus || 'clear', priceSource: data.priceSource || 'estimate' };
    for (const [field, allowed] of Object.entries(ENUMS)) if (!allowed.includes(enums[field])) fail(`${field} must be one of: ${allowed.join(', ')}.`);
    const receivedAt = data.receivedAt ? isoDate(data.receivedAt) : now.toISOString();
    const priceObservedAt = data.priceObservedAt ? isoDate(data.priceObservedAt) : now.toISOString();
    if (!receivedAt) fail('receivedAt must be an ISO date or timestamp.');
    if (!priceObservedAt) fail('priceObservedAt must be an ISO date or timestamp.');
    if (receivedAt && new Date(receivedAt).getTime() > now.getTime() + 300_000) fail('receivedAt cannot be in the future.');
    if (priceObservedAt && new Date(priceObservedAt).getTime() > now.getTime() + 300_000) fail('priceObservedAt cannot be in the future.');
    if (enums.priceSource === 'observed' && (!data.priceObservedAt || numeric.comparableCount < 1)) fail('observed pricing requires priceObservedAt and at least one comparable.');
    if (!valid) continue;
    assets.push({
      id: createAssetId(), usn: data.usn, sku: data.sku, title: data.title,
      category: data.category as Asset['category'], grade: data.grade as Asset['grade'],
      receivedAt: receivedAt!, location: data.location || 'Unassigned',
      acquisitionCost: numeric.acquisitionCost, marketPrice: numeric.marketPrice, refurbishedPrice: numeric.refurbishedPrice,
      wholesalePrice: numeric.wholesalePrice, partsValue: numeric.partsValue, recycleValue: numeric.recycleValue,
      repairCost: numeric.repairCost, repairDays: numeric.repairDays, repairSuccess: numeric.repairSuccess,
      expectedDays: numeric.expectedDays, sellThrough: numeric.sellThrough, returnRate: numeric.returnRate,
      testStatus: data.testStatus as Asset['testStatus'], dataStatus: data.dataStatus as Asset['dataStatus'],
      safetyStatus: enums.safetyStatus as Asset['safetyStatus'], priceSource: enums.priceSource as Asset['priceSource'],
      priceObservedAt: priceObservedAt!, comparableCount: numeric.comparableCount,
      notes: data.notes || '', stage: 'pending',
    });
  }
  return errors.length ? { assets: [], errors } : { assets, errors: [] };
}

function csvCell(value: string | number | undefined): string {
  let text = String(value ?? '');
  // Spreadsheet applications may execute formulas even in quoted CSV fields.
  if (typeof value !== 'number' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function assetsToCsv(assets: Asset[], policy: Policy = DEFAULT_POLICY): string {
  const header = [...INTAKE_FIELDS, ...EXPORT_FIELDS];
  const rows = assets.map(asset => {
    const frozen = asset.stage !== 'pending' && !!asset.approvalSnapshot;
    const evaluation = frozen ? asset.approvalSnapshot!.evaluation : evaluateAsset(asset, policy);
    const economicRoute = frozen && asset.approvedRoute ? evaluation.routes.find(route => route.id === asset.approvedRoute) : evaluation.recommended;
    const inputs = frozen ? asset.approvalSnapshot!.inputs ?? asset : asset;
    const history = asset.approvalHistory ?? [];
    const lastReopen = history[history.length - 1];
    const extras = {
      stage: asset.stage, approvedRoute: frozen ? asset.approvedRoute || '' : '',
      approvedAt: frozen ? asset.approvalSnapshot!.approvedAt : '',
      approvalReason: frozen ? asset.approvalSnapshot!.reason : '',
      archivedApprovalCount: history.length,
      lastReopenedAt: lastReopen?.reopenedAt ?? '', lastReopenReason: lastReopen?.reason ?? '',
      recommendedRoute: evaluation.recommendedRoute, economicRoute: economicRoute?.id ?? 'hold',
      valuationBasis: frozen ? 'approval_snapshot' : 'current_assumptions',
      inputBasis: frozen ? asset.approvalSnapshot!.inputs ? 'approval_inputs' : 'legacy_locked_asset' : 'current_inputs',
      evaluatedAt: evaluation.evaluatedAt, engineVersion: evaluation.engineVersion,
      expectedNet: economicRoute?.expectedNet ?? '', expectedProfit: economicRoute?.expectedProfit ?? '', evidenceScore: evaluation.evidenceScore,
      actualGrossProceeds: asset.outcome?.grossProceeds ?? '', actualCosts: asset.outcome?.actualCosts ?? '',
      actualNetRecovery: asset.outcome ? Math.round((asset.outcome.grossProceeds - asset.outcome.actualCosts) * 100) / 100 : '',
      actualProfit: asset.outcome ? Math.round((asset.outcome.grossProceeds - asset.outcome.actualCosts - inputs.acquisitionCost) * 100) / 100 : '',
      completedAt: asset.outcome?.completedAt ?? '',
    };
    return [...INTAKE_FIELDS.map(field => csvCell(inputs[field])), ...EXPORT_FIELDS.map(field => csvCell(extras[field]))].join(',');
  });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
