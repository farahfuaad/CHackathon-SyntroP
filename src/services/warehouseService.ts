import { apiGetListAll, apiPatch, apiPost } from "./apiClient";

type CsvRow = Record<string, string>;

type WarehouseRow = {
  warehouse_id: number;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  sku_id?: string | null;
  unit_qty?: number | null;
};

type ProductRow = {
  sku_id: string;
};

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

function pick(row: CsvRow, ...names: string[]) {
  for (const n of names) {
    if (row[n] != null) return row[n];
  }
  return "";
}

function toInt(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function key(v: string) {
  return (v || "").trim().toUpperCase();
}

function pairKey(code: string, sku: string) {
  return `${key(code)}::${key(sku)}`;
}

const ENTITY_WAREHOUSE = "Warehouse";
const ENTITY_PRODUCT = "Product";

function apiErr(e: any): string {
  return e?.message || e?.error?.message || "Upload failed";
}

export async function buildWarehousePreview(file: File) {
  const text = await file.text();
  const rows = parseCsv(text).slice(0, 3);

  return rows.map((r) => {
    const code = pick(r, "warehouse_code", "warehouse_id", "Warehouse_Code", "Warehouse_ID").trim();
    const name = (r["warehouse_name"] || "").trim();
    const sku = (r["sku_id"] || "").trim();

    return {
      col1: code || "-",
      col2: `${name || "-"} • ${sku || "-"}`,
      col3: code ? "Status OK" : "Review Needed",
    };
  });
}

export async function uploadWarehouseCsv(file: File) {
  const text = await file.text();
  const rows = parseCsv(text);

  const [existing, products] = await Promise.all([
    apiGetListAll<WarehouseRow>(ENTITY_WAREHOUSE),
    apiGetListAll<ProductRow>(ENTITY_PRODUCT),
  ]);

  const productSkuSet = new Set(
    products.map((p) => key(p.sku_id || "")).filter(Boolean)
  );

  const byCodeSku = new Map<string, WarehouseRow>();
  existing.forEach((w) => {
    const code = w.warehouse_code || "";
    const sku = w.sku_id || "";
    const k = pairKey(code, sku);
    if (key(code)) byCodeSku.set(k, w);
  });

  const latestByCodeSku = new Map<string, CsvRow>();
  rows.forEach((r) => {
    const code = pick(r, "warehouse_code", "warehouse_id", "Warehouse_Code", "Warehouse_ID").trim();
    const sku = (r["sku_id"] || "").trim();
    if (!code) return;
    latestByCodeSku.set(pairKey(code, sku), r);
  });

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [k, r] of latestByCodeSku.entries()) {
    try {
      const warehouse_code = pick(r, "warehouse_code", "warehouse_id", "Warehouse_Code", "Warehouse_ID").trim();
      const sku_id = (r["sku_id"] || "").trim();

      if (!warehouse_code) throw new Error("Missing warehouse_code");
      if (sku_id && !productSkuSet.has(key(sku_id))) {
        throw new Error(`SKU not found (${sku_id})`);
      }

      const payload = {
        warehouse_code,
        warehouse_name: (r["warehouse_name"] || "").trim() || null,
        sku_id: sku_id || null,
        unit_qty: toInt(r["unit_qty"] || "0", 0),
      };

      const found = byCodeSku.get(k);

      if (found) {
        await apiPatch(
          ENTITY_WAREHOUSE,
          "warehouse_id",
          found.warehouse_id,
          payload as Record<string, unknown>
        );
        updated++;
      } else {
        await apiPost(ENTITY_WAREHOUSE, payload as Record<string, unknown>);
        inserted++;
      }
    } catch (e: any) {
      failed++;
      errors.push(`${k}: ${apiErr(e)}`);
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