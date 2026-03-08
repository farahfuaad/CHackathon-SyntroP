type PreviewRow = {
  col1: string;
  col2: string;
  col3: string;
};

type UploadResult = {
  total: number;
  success: number;
  failed: number;
  inserted: number;
  updated: number;
  errors: string[];
};

type SalesRow = {
  sku_id: string;
  month: string; // YYYY-MM-01
  units_sold: number;
  ams_3m: number | null;
  ams_6m: number | null;
};

const MONTH_RE = /^\d{4}-\d{2}$/;

function normalizeHeader(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '_');
}

function toMonthString(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (MONTH_RE.test(s)) return s;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return null;
}

function parseUnits(raw: unknown): number | null {
  const n = Number(String(raw ?? '').trim());
  if (!Number.isInteger(n)) return null;
  return n;
}

function mapRecordToSalesRow(record: Record<string, unknown>): { row: SalesRow | null; error?: string } {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) normalized[normalizeHeader(k)] = v;

  const sku = String(normalized['sku_id'] ?? normalized['sku'] ?? '').trim();
  const monthRaw = normalized['month'];
  const unitsRaw = normalized['units_sold'] ?? normalized['unit_sold'] ?? normalized['units'];

  if (!sku) return { row: null, error: 'Missing sku_id' };

  const month = toMonthString(monthRaw);
  if (!month) return { row: null, error: `Invalid month for sku_id=${sku}` };

  const units = parseUnits(unitsRaw);
  if (units === null) return { row: null, error: `Invalid units_sold for sku_id=${sku}` };

  return {
    row: {
      sku_id: sku,
      month: `${month}-01`,
      units_sold: units,
      ams_3m: null,
      ams_6m: null,
    },
  };
}

async function parseCsv(file: File): Promise<Record<string, unknown>[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // remove UTF-8 BOM if present
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
    throw new Error('Sales upload currently supports .csv only.');
  }
  return parseCsv(file);
}

export async function buildSalesPreview(file: File): Promise<PreviewRow[]> {
  const records = await parseFileToRecords(file);
  return records.slice(0, 3).map((r) => {
    const mapped = mapRecordToSalesRow(r);
    if (!mapped.row) {
      return {
        col1: String(r['SKU_ID'] ?? r['sku_id'] ?? '-'),
        col2: String(r['Month'] ?? r['month'] ?? '-'),
        col3: `Review Needed: ${mapped.error ?? 'Invalid row'}`,
      };
    }

    return {
      col1: mapped.row.sku_id,
      col2: `${mapped.row.month} • ${mapped.row.units_sold}`,
      col3: 'Status OK',
    };
  });
}

type SalesUploadApiResponse = Partial<UploadResult>;

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/data-api/rest').replace(/\/$/, '');
const SALES_UPLOAD_ENDPOINT = import.meta.env.VITE_SALES_UPLOAD_ENDPOINT || '/api/sales/upload';
const DAB_SALES_ENDPOINT = `${API_BASE}/Sales`;

const CHUNK_SIZE = Math.max(1, Number(import.meta.env.VITE_SALES_UPLOAD_CHUNK_SIZE ?? 2000));
const MAX_RETRIES = Math.max(0, Number(import.meta.env.VITE_SALES_UPLOAD_MAX_RETRIES ?? 3));
const RETRY_BASE_DELAY_MS = Math.max(100, Number(import.meta.env.VITE_SALES_UPLOAD_RETRY_BASE_MS ?? 500));
const DAB_ROW_CONCURRENCY = Math.max(1, Number(import.meta.env.VITE_SALES_DAB_CONCURRENCY ?? 8));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function upsertSalesRowViaDab(row: SalesRow): Promise<{ inserted: number; updated: number; error?: string }> {
  // Try insert first
  const createRes = await fetch(DAB_SALES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(row),
  });

  if (createRes.ok) return { inserted: 1, updated: 0 };

  // If duplicate, try PATCH (composite key path)
  if (createRes.status === 409) {
    const patchUrl = `${DAB_SALES_ENDPOINT}/sku_id/${encodeURIComponent(row.sku_id)}/month/${encodeURIComponent(row.month)}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        units_sold: row.units_sold,
        ams_3m: row.ams_3m,
        ams_6m: row.ams_6m,
      }),
    });

    if (patchRes.ok) return { inserted: 0, updated: 1 };

    const patchMsg = await patchRes.text().catch(() => '');
    return { inserted: 0, updated: 0, error: `PATCH failed (${patchRes.status}) ${patchMsg}` };
  }

  const createMsg = await createRes.text().catch(() => '');
  return { inserted: 0, updated: 0, error: `POST failed (${createRes.status}) ${createMsg}` };
}

async function uploadChunkViaDab(rows: SalesRow[]): Promise<SalesUploadApiResponse> {
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.min(DAB_ROW_CONCURRENCY, rows.length) }, async () => {
    while (cursor < rows.length) {
      const idx = cursor++;
      const row = rows[idx];
      try {
        const res = await upsertSalesRowViaDab(row);
        inserted += res.inserted;
        updated += res.updated;
        if (res.error) {
          failed += 1;
          errors.push(`Row ${idx + 1}: ${res.error}`);
        }
      } catch (e: any) {
        failed += 1;
        errors.push(`Row ${idx + 1}: ${e?.message || 'Unknown error'}`);
      }
    }
  });

  await Promise.all(workers);

  const success = rows.length - failed;
  return { success, failed, inserted, updated, errors };
}

async function postSalesChunkWithRetry(
  rows: SalesRow[],
  chunkIndex: number,
  totalChunks: number
): Promise<SalesUploadApiResponse> {
  let lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(SALES_UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });

      if (res.ok) {
        return (await res.json().catch(() => ({}))) as SalesUploadApiResponse;
      }

      // Fallback to DAB when custom API route is missing
      if (res.status === 404) {
        return uploadChunkViaDab(rows);
      }

      const msg = await res.text().catch(() => '');
      lastError = msg || `HTTP ${res.status}`;

      if (!isRetryableStatus(res.status) || attempt === MAX_RETRIES) {
        throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed: ${lastError}`);
      }
    } catch (e: any) {
      lastError = e?.message || 'Network error';
      if (attempt === MAX_RETRIES) {
        throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed after retries: ${lastError}`);
      }
    }

    const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    await sleep(backoff);
  }

  throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed: ${lastError}`);
}

import { apiGetListAll, apiPostBatched } from "./apiClient";

type BulkChunkResult = { inserted?: number; updated?: number; failed?: number; errors?: string[] };
const SALES_BULK_ENTITY = import.meta.env.VITE_SALES_BULK_ENTITY || "sales_bulk_upsert";

export type AmsBySku = {
  ams3m: number;
  ams6m: number;
};

function normalizeSkuKey(v: string) {
  return (v || "").trim().toUpperCase();
}

function monthToTime(v: string): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

// Single AMS cache block (keep only this one)
let _amsBothPromise: Promise<Map<string, AmsBySku>> | null = null;
let _amsBothPromiseTs = 0;
const AMS_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateAmsCache(): void {
  _amsBothPromise = null;
}

export function fetchAmsBySku(): Promise<Map<string, AmsBySku>> {
  if (_amsBothPromise && Date.now() - _amsBothPromiseTs < AMS_CACHE_TTL_MS) {
    return _amsBothPromise;
  }

  _amsBothPromiseTs = Date.now();
  _amsBothPromise = (async (): Promise<Map<string, AmsBySku>> => {
    const rows = await apiGetListAll<SalesRow>("Sales");

    const bySku = new Map<string, SalesRow[]>();
    rows.forEach((row) => {
      const skuKey = normalizeSkuKey(row.sku_id || "");
      if (!skuKey) return;
      if (!bySku.has(skuKey)) bySku.set(skuKey, []);
      bySku.get(skuKey)!.push(row);
    });

    const out = new Map<string, AmsBySku>();

    bySku.forEach((salesRows, skuKey) => {
      const sorted = salesRows
        .slice()
        .sort((a, b) => monthToTime(b.month) - monthToTime(a.month));

      const latest3 = sorted.slice(0, 3);
      const latest6 = sorted.slice(0, 6);

      const sum3 = latest3.reduce((sum, r) => sum + (Number(r.units_sold) || 0), 0);
      const sum6 = latest6.reduce((sum, r) => sum + (Number(r.units_sold) || 0), 0);

      out.set(skuKey, {
        ams3m: latest3.length ? sum3 / latest3.length : 0,
        ams6m: latest6.length ? sum6 / latest6.length : 0,
      });
    });

    return out;
  })();

  return _amsBothPromise;
}

export async function fetchAms3mBySku(): Promise<Map<string, number>> {
  const both = await fetchAmsBySku();
  const only3m = new Map<string, number>();
  both.forEach((v, k) => only3m.set(k, v.ams3m));
  return only3m;
}

export async function uploadSalesRowsFast(
  rows: SalesRow[],
  onProgress?: (done: number, total: number) => void
) {
  return apiPostBatched<SalesRow, BulkChunkResult>(
    SALES_BULK_ENTITY,
    rows,
    (batch) => ({ rows: batch }),
    { batchSize: 1000, concurrency: 3, onProgress }
  );
}

export async function uploadSalesCsv(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<UploadResult> {
  const records = await parseFileToRecords(file);
  const totalRows = records.length;
  onProgress?.(0, totalRows);

  const valid: SalesRow[] = [];
  const errors: string[] = [];

  records.forEach((r, idx) => {
    const mapped = mapRecordToSalesRow(r);
    if (!mapped.row) {
      errors.push(`Row ${idx + 2}: ${mapped.error ?? "Invalid row"}`);
      return;
    }
    valid.push(mapped.row);
  });

  const invalidCount = errors.length;

  if (valid.length === 0) {
    onProgress?.(totalRows, totalRows);
    return { total: totalRows, success: 0, failed: invalidCount, inserted: 0, updated: 0, errors };
  }

  // Try fast bulk path first
  try {
    const batchResults = await uploadSalesRowsFast(valid, onProgress);

    let inserted = 0;
    let updated = 0;
    let failed = invalidCount;
    const apiErrors: string[] = [...errors];

    for (const r of batchResults) {
      inserted += Number(r?.inserted ?? 0);
      updated += Number(r?.updated ?? 0);
      failed += Number(r?.failed ?? 0);
      if (Array.isArray(r?.errors)) apiErrors.push(...r.errors);
    }

    const success = Math.max(0, valid.length - (failed - invalidCount));
    onProgress?.(totalRows, totalRows);

    return { total: totalRows, success, failed, inserted, updated, errors: apiErrors };
  } catch {
    // fallback to existing chunk+retry path
  }

  const chunks = chunkArray(valid, CHUNK_SIZE);

  let success = 0;
  let failed = invalidCount;
  let inserted = 0;
  let updated = 0;
  const apiErrors: string[] = [];

  let processedValid = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const api = await postSalesChunkWithRetry(chunk, i, chunks.length);

      const chunkFailed = Math.max(0, Number(api.failed ?? 0));
      const chunkSuccess = Math.max(
        0,
        Math.min(chunk.length, Number(api.success ?? chunk.length - chunkFailed))
      );

      success += chunkSuccess;
      failed += chunkFailed;
      inserted += Math.max(0, Number(api.inserted ?? chunkSuccess));
      updated += Math.max(0, Number(api.updated ?? 0));

      if (Array.isArray(api.errors)) apiErrors.push(...api.errors);
    } catch (e: any) {
      failed += chunk.length;
      apiErrors.push(e?.message || `Chunk ${i + 1}/${chunks.length} failed`);
    } finally {
      processedValid += chunk.length;
      onProgress?.(Math.min(totalRows, invalidCount + processedValid), totalRows);
    }
  }

  return {
    total: totalRows,
    success,
    failed,
    inserted,
    updated,
    errors: [...errors, ...apiErrors],
  };
}