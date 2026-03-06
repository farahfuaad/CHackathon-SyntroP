import { apiDelete, apiGetListAll, apiPatch, apiPost } from "./apiClient";
import type { Supplier } from "../../types";

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

function toSupplierModel(row: SupplierRow): Supplier {
  return {
    id: String(row.supplier_id),
    name: (row.supplier_name || "").trim(),
    email: (row.email || "").trim(),
    standardLeadTime: Number(row.lead_time_days) || 0,
    rating: 0,
  };
}

export async function fetchSupplierReference(): Promise<Supplier[]> {
  const rows = await apiGetListAll<SupplierRow>(ENTITY_SUPPLIER);

  return rows
    .map(toSupplierModel)
    .filter((row) => !!row.id && !!row.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSupplierReference(input: {
  name: string;
  email?: string;
  standardLeadTime?: number;
}): Promise<Supplier> {
  const payload = {
    supplier_name: (input.name || "").trim(),
    email: (input.email || "").trim() || null,
    lead_time_days: Number(input.standardLeadTime) || 0,
  };

  if (!payload.supplier_name) {
    throw new Error("Supplier name is required");
  }

  const created = await apiPost<SupplierRow>(
    ENTITY_SUPPLIER,
    payload as Record<string, unknown>
  );

  return toSupplierModel(created);
}

export async function updateSupplierReference(
  supplierId: string,
  patch: Partial<Pick<Supplier, "name" | "email" | "standardLeadTime">>
): Promise<void> {
  const idNum = Number(supplierId);
  if (!Number.isFinite(idNum)) {
    throw new Error(`Invalid supplier id: ${supplierId}`);
  }

  const payload: Record<string, unknown> = {};

  if (patch.name != null) payload.supplier_name = String(patch.name).trim();
  if (patch.email != null) payload.email = String(patch.email).trim() || null;
  if (patch.standardLeadTime != null) payload.lead_time_days = Number(patch.standardLeadTime) || 0;

  await apiPatch(ENTITY_SUPPLIER, "supplier_id", idNum, payload);
}

export async function deleteSupplierReference(supplierId: string): Promise<void> {
  const idNum = Number(supplierId);
  if (!Number.isFinite(idNum)) {
    throw new Error(`Invalid supplier id: ${supplierId}`);
  }

  await apiDelete(ENTITY_SUPPLIER, "supplier_id", idNum);
}