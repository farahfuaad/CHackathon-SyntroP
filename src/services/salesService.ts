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

  const headers = lines[0].split(',').map((h) => h.trim());

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

export async function uploadSalesCsv(file: File): Promise<UploadResult> {
  const records = await parseFileToRecords(file);

  const valid: SalesRow[] = [];
  const errors: string[] = [];

  records.forEach((r, idx) => {
    const mapped = mapRecordToSalesRow(r);
    if (!mapped.row) {
      errors.push(`Row ${idx + 2}: ${mapped.error ?? 'Invalid row'}`);
      return;
    }
    valid.push(mapped.row);
  });

  if (valid.length === 0) {
    return {
      total: records.length,
      success: 0,
      failed: errors.length,
      inserted: 0,
      updated: 0,
      errors,
    };
  }

  const chunks = chunkArray(valid, CHUNK_SIZE);

  let success = 0;
  let failed = errors.length;
  let inserted = 0;
  let updated = 0;
  const apiErrors: string[] = [];

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
    }
  }

  return {
    total: records.length,
    success,
    failed,
    inserted,
    updated,
    errors: [...errors, ...apiErrors],
  };
}