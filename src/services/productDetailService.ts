import { apiGetList, apiPatch, apiPost } from "./apiClient";

type SupplierRow = {
  supplier_id: number;
  supplier_name: string;
};

type ProductKeyRow = {
  sku_id: string;
};

type CsvRow = Record<string, string>;

const CATEGORY_MAP: Record<string, number> = {
  kitchen: 1,
  cooling: 2,
  home: 3,
  bathroom: 4,
};

// CSV uses ELBA/FABR/RUBI/VINO/HAUS

const SUPPLIER_CODE_TO_ID: Record<string, number> = {
  ELBA: 1,
  FABR: 2,
  RUBI: 3,
  VINO: 4,
  HAUS: 5,
};

const ENTITY_PRODUCT = "Product";
const ENTITY_SUPPLIER = "Supplier";

function normalize(v: string) {
  return (v || "").trim().toLowerCase();
}

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

function toBoolString(v: string): "True" | "False" {
  return /^(true|1|yes|y)$/i.test((v || "").trim()) ? "True" : "False";
}

function toInt(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function resolveSupplierId(codeOrId: string, supplierIdSet: Set<number>): number {
  const raw = (codeOrId || "").trim();
  if (!raw) throw new Error("Missing Default_Supplier_ID");

  // If CSV already numeric
  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    if (!supplierIdSet.has(id)) throw new Error(`Unknown supplier id: ${id}`);
    return id;
  }

  // If CSV uses code (ELBA/FABR/...)
  const id = SUPPLIER_CODE_TO_ID[raw.toUpperCase()];
  if (!id) throw new Error(`Unknown supplier code: ${raw}`);
  if (!supplierIdSet.has(id)) throw new Error(`Supplier id not found in DB: ${id}`);
  return id;
}

function toProductPayload(
  row: CsvRow,
  supplierIdSet: Set<number>
) {
  const categoryKey = normalize(row["Category"]);
  const category = CATEGORY_MAP[categoryKey];
  if (!category) throw new Error(`Unknown category: ${row["Category"]}`);

  return {
    sku_id: (row["SKU_ID"] || "").trim(),
    sku_model_name: row["SKU_Name"],
    category,
    supplier_id: resolveSupplierId(row["Default_Supplier_ID"], supplierIdSet),
    box_length_cm: toInt(row["Unit_Length_cm"]),
    box_width_cm: toInt(row["Unit_Width_cm"]),
    box_height_cm: toInt(row["Unit_Height_cm"]),
    box_weight_kg: toInt(row["Unit_Weight_kg"]),
    is_active: toBoolString(row["Is_Active"]),
    is_slowmoving_threshol: toInt(row["Is_SlowMoving_Threshold_Months"]),
  };
}

export async function buildProductPreview(file: File) {
  const text = await file.text();
  const rows = parseCsv(text).slice(0, 3);

  return rows.map((r) => ({
    col1: r["SKU_ID"] || "-",
    col2: r["SKU_Name"] || "-",
    col3: r["SKU_ID"] && r["SKU_Name"] ? "Status OK" : "Review Needed",
  }));
}

export async function uploadProductCsv(file: File) {
  const [text, suppliers, products] = await Promise.all([
    file.text(),
    apiGetList<SupplierRow>(ENTITY_SUPPLIER),
    apiGetList<ProductKeyRow>(ENTITY_PRODUCT),
  ]);

  const supplierNameMap = new Map<string, number>();
  const supplierIdSet = new Set<number>();
  suppliers.forEach((s) => {
    supplierNameMap.set(normalize(s.supplier_name), s.supplier_id);
    supplierIdSet.add(s.supplier_id);
  });

  const existingSkuSet = new Set(
    products.map((p) => (p.sku_id || "").trim()).filter(Boolean)
  );

  const rows = parseCsv(text);
  let success = 0;
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const payload = toProductPayload(row, supplierIdSet);
      const skuId = payload.sku_id;
      if (!skuId) throw new Error("Missing SKU_ID");

      if (existingSkuSet.has(skuId)) {
        const { sku_id, ...patchPayload } = payload;
        await apiPatch(ENTITY_PRODUCT, "sku_id", skuId, patchPayload);
        updated++;
      } else {
        await apiPost(ENTITY_PRODUCT, payload);
        existingSkuSet.add(skuId);
        inserted++;
      }

      success++;
    } catch (e: any) {
      errors.push(`${row["SKU_ID"] || "UNKNOWN"}: ${e?.message || "Upload failed"}`);
    }
  }

  return {
    total: rows.length,
    success,
    failed: rows.length - success,
    inserted,
    updated,
    errors,
  };
}