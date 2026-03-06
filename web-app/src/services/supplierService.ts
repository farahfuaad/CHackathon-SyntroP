import { apiGetListAll, apiPatch, apiPost } from "./apiClient";

type CsvRow = Record<string, string>;

type SupplierRow = {
  supplier_id: number;
  supplier_name: string;
  email?: string | null;
  lead_time_days?: number | null;
};

export type SupplierListing = {
  id: string;
  name: string;
  email: string;
  leadTimeDays: number;
};

const ENTITY_SUPPLIER = "Supplier";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, idx) => (row[h] = cols[idx] ?? ""));
    rows.push(row);
  }

  return rows;
}

function normalize(v: string) {
  return (v || "").trim().toLowerCase();
}

function toInt(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toSupplierPayload(row: CsvRow) {
  const supplierName = (row["Supplier_Name"] || "").trim();
  if (!supplierName) throw new Error("Missing Supplier_Name");

  return {
    supplier_name: supplierName,
    email: (row["Email"] || "").trim() || null,
    lead_time_days: toInt(row["Lead_Time_Days"], 0),
  };
}

export async function buildSupplierPreview(file: File) {
  const text = await file.text();
  const rows = parseCsv(text).slice(0, 3);

  return rows.map((r) => {
    const name = (r["Supplier_Name"] || "").trim();
    const email = (r["Email"] || "").trim();
    const lead = (r["Lead_Time_Days"] || "").trim();
    const ok = !!name;

    return {
      col1: name || "(Missing Supplier_Name)",
      col2: `${email || "no-email"} • LT ${lead || "0"} days`,
      col3: ok ? "Status OK" : "Review Needed",
    };
  });
}

export async function uploadSupplierCsv(file: File) {
  const text = await file.text();
  const rows = parseCsv(text);

  const existing = await apiGetListAll<SupplierRow>(ENTITY_SUPPLIER);
  const byName = new Map<string, SupplierRow>();
  existing.forEach((s) => {
    const key = normalize(s.supplier_name || "");
    if (key) byName.set(key, s);
  });

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const payload = toSupplierPayload(rows[i]);
      const key = normalize(payload.supplier_name);
      const found = byName.get(key);

      if (found) {
        await apiPatch(
          ENTITY_SUPPLIER,
          "supplier_id",
          found.supplier_id,
          payload as Record<string, unknown>
        );
        updated++;
      } else {
        const created = await apiPost<SupplierRow>(
          ENTITY_SUPPLIER,
          payload as Record<string, unknown>
        );
        inserted++;
        if (created?.supplier_name) {
          byName.set(normalize(created.supplier_name), created);
        }
      }
    } catch (e: any) {
      failed++;
      errors.push(`Row ${i + 2}: ${e?.message || "Unknown error"}`);
    }
  }

  return {
    total: rows.length,
    success: inserted + updated,
    failed,
    inserted,
    updated,
    errors,
  };
}

export async function fetchSupplierListing(): Promise<SupplierListing[]> {
  const rows = await apiGetListAll<SupplierRow>(ENTITY_SUPPLIER);

  return rows
    .map((row) => ({
      id: String(row.supplier_id),
      name: (row.supplier_name || "").trim(),
      email: (row.email || "").trim(),
      leadTimeDays: Number(row.lead_time_days) || 0,
    }))
    .filter((row) => !!row.id && !!row.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}