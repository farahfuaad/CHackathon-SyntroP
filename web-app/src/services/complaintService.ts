import { apiGetListAll, apiPost } from './apiClient';

type PreviewRow = {
  col1: string;
  col2: string;
  col3: string;
};

type ComplaintIssueRow = {
  issue_id: number;
  sku_id: string;
  complaint_date: string;
  issues: string;
  cause: string;
  failure_count: number;
};

export type ComplaintAggBySku = {
  skuId: string;
  totalFailures: number;
  complaintCount: number;
};

export async function fetchComplaintAggBySku(): Promise<Map<string, ComplaintAggBySku>> {
  const rows = await apiGetListAll<ComplaintIssueRow>(COMPLAINT_ENTITY);
  const map = new Map<string, ComplaintAggBySku>();

  rows.forEach((row) => {
    const skuId = (row.sku_id || '').trim();
    if (!skuId) return;

    if (!map.has(skuId)) {
      map.set(skuId, { skuId, totalFailures: 0, complaintCount: 0 });
    }
    const agg = map.get(skuId)!;
    agg.totalFailures += Number(row.failure_count) || 0;
    agg.complaintCount += 1;
  });

  return map;
}

type UploadResult = {
  total: number;
  success: number;
  failed: number;
  inserted: number;
  updated: number;
  errors: string[];
};

type ComplaintRow = {
  sku_id: string;
  complaint_date: string; // YYYY-MM-DD
  issues: string;
  cause: string;
  failure_count: number;
};

const CHUNK_SIZE = Math.max(1, Number(import.meta.env.VITE_COMPLAINT_UPLOAD_CHUNK_SIZE ?? 1000));
const ROW_CONCURRENCY = Math.max(1, Number(import.meta.env.VITE_COMPLAINT_DAB_CONCURRENCY ?? 8));

const COMPLAINT_ENTITY =
  import.meta.env.VITE_COMPLAINT_ENTITY || 'ComplaintIssue';

function normalizeHeader(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeText(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function toDateString(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // keep YYYY-MM-DD if already valid
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toInt(raw: unknown): number | null {
  const n = Number(String(raw ?? '').trim());
  return Number.isInteger(n) ? n : null;
}

function mapRecordToComplaintRow(record: Record<string, unknown>): { row: ComplaintRow | null; error?: string } {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) normalized[normalizeHeader(k)] = v;

  const sku = String(normalized['sku_id'] ?? normalized['sku'] ?? '').trim();
  const complaintDate = toDateString(normalized['complaint_date'] ?? normalized['date']);
  const issueCode = String(normalized['issues'] ?? normalized['issue']);
  const causeCode = String(normalized['cause']);
  const failureCount = toInt(normalized['failure_count'] ?? normalized['failure'] ?? normalized['failures']);

  if (!sku) return { row: null, error: 'Missing sku_id' };
  if (!complaintDate) return { row: null, error: `Invalid complaint_date for sku_id=${sku}` };
  if (issueCode === null) return { row: null, error: `Invalid issues value for sku_id=${sku}` };
  if (causeCode === null) return { row: null, error: `Invalid cause value for sku_id=${sku}` };
  if (failureCount === null) return { row: null, error: `Invalid failure_count for sku_id=${sku}` };

  return {
    row: {
      sku_id: sku,
      complaint_date: complaintDate,
      issues: issueCode,
      cause: causeCode,
      failure_count: failureCount,
    },
  };
}

async function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const firstLine = lines[0].replace(/^\uFEFF/, '');
  const headers = firstLine.split(',').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      rec[h] = cols[i]?.trim() ?? '';
    });
    return rec;
  });
}

async function parseFileToRecords(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv')) {
    throw new Error('Complaint upload currently supports .csv only.');
  }
  return parseCsv(file);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function buildComplaintPreview(file: File): Promise<PreviewRow[]> {
  const records = await parseFileToRecords(file);
  return records.slice(0, 3).map((r) => {
    const mapped = mapRecordToComplaintRow(r);
    if (!mapped.row) {
      return {
        col1: String(r['SKU_ID'] ?? r['sku_id'] ?? '-'),
        col2: String(r['Complaint_Date'] ?? r['complaint_date'] ?? '-'),
        col3: `Review Needed: ${mapped.error ?? 'Invalid row'}`,
      };
    }

    return {
      col1: mapped.row.sku_id,
      col2: `${mapped.row.complaint_date} • fail=${mapped.row.failure_count}`,
      col3: 'Status OK',
    };
  });
}

async function uploadChunk(rows: ComplaintRow[]) {
  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.min(ROW_CONCURRENCY, rows.length) }, async () => {
    while (cursor < rows.length) {
      const idx = cursor++;
      const row = rows[idx];

      try {
        await apiPost<unknown>(COMPLAINT_ENTITY, row as Record<string, unknown>);
        inserted += 1;
      } catch (e: any) {
        failed += 1;
        errors.push(`Row ${idx + 1}: ${e?.message || 'Insert failed'}`);
      }
    }
  });

  await Promise.all(workers);
  return { inserted, failed, errors, success: inserted };
}

export async function uploadComplaintCsv(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<UploadResult> {
  const records = await parseFileToRecords(file);
  const totalRows = records.length;
  onProgress?.(0, totalRows);

  const valid: ComplaintRow[] = [];
  const errors: string[] = [];

  records.forEach((r, idx) => {
    const mapped = mapRecordToComplaintRow(r);
    if (!mapped.row) {
      errors.push(`Row ${idx + 2}: ${mapped.error ?? 'Invalid row'}`);
      return;
    }
    valid.push(mapped.row);
  });

  const invalidCount = errors.length;

  if (valid.length === 0) {
    onProgress?.(totalRows, totalRows);
    return { total: totalRows, success: 0, failed: invalidCount, inserted: 0, updated: 0, errors };
  }

  const chunks = chunkArray(valid, CHUNK_SIZE);

  let success = 0;
  let failed = invalidCount;
  let inserted = 0;
  const apiErrors: string[] = [];
  let processedValid = 0;

  for (const chunk of chunks) {
    const res = await uploadChunk(chunk);
    success += res.success;
    inserted += res.inserted;
    failed += res.failed;
    apiErrors.push(...res.errors);

    processedValid += chunk.length;
    onProgress?.(Math.min(totalRows, invalidCount + processedValid), totalRows);
  }

  return {
    total: totalRows,
    success,
    failed,
    inserted,
    updated: 0,
    errors: [...errors, ...apiErrors],
  };
}