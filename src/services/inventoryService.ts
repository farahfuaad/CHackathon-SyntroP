import { apiDelete, apiGetListAll, apiPost } from "./apiClient";

type CsvRow = Record<string, string>;

type ProductRow = { sku_id: string };

type InventoryRow = {
  stock_id: number;
  sku_id?: string | null;
};

type WarehouseRow = {
  warehouse_id: number;
  warehouse_code?: string | null;
  sku_id?: string | null;
};

const ENTITY_PRODUCT = "Product";
const ENTITY_INVENTORY = "InventoryStocks";
const ENTITY_WAREHOUSE = "Warehouse";

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

function key(v: string) {
  return (v || "")
    .replace(/\uFEFF/g, "")      // strip BOM
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");  // ignore -, _, spaces
}

function pick(row: CsvRow, ...names: string[]) {
  for (const n of names) {
    if (row[n] != null) return row[n];
  }
  return "";
}

function pairKey(skuKey: string, whCodeKey: string) {
  return `${skuKey}::${whCodeKey}`;
}

function toInt(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toInventoryPayload(row: CsvRow, warehouseId: number) {
  const skuId = pick(row, "sku_id", "SKU_ID", "Sku_ID", "SKU ID").trim();
  if (!skuId) throw new Error("Missing sku_id");

  const inHand = toInt(pick(row, "in_hand", "In_Hand", "unit_qty", "Unit_Qty"), 0);
  const backorder = toInt(pick(row, "backorder", "Backorder"), 0);
  const incoming = toInt(pick(row, "incoming", "Incoming"), 0);

  const totalStockRaw = pick(row, "total_stock", "Total_Stock");
  const totalStock = totalStockRaw ? toInt(totalStockRaw, 0) : inHand + incoming - backorder;

  return {
    sku_id: skuId,
    warehouse_id: warehouseId, // INT FK to dbo.warehouse.warehouse_id
    in_hand: inHand,
    backorder,
    incoming,
    total_stock: totalStock,
    stock_last_3m: toInt(pick(row, "stock_last_3m", "Stock_Last_3m"), 0),
    stock_last_6m: toInt(pick(row, "stock_last_6m", "Stock_Last_6m"), 0),
  };
}

export async function buildInventoryPreview(file: File) {
  const text = await file.text();
  const rows = parseCsv(text).slice(0, 3);

  return rows.map((r) => {
    const sku = pick(r, "sku_id", "SKU_ID").trim();
    const wh = pick(r, "warehouse_code", "warehouse_id", "Warehouse_Code", "Warehouse_ID").trim();
    return {
      col1: sku || "-",
      col2: `${wh || "-"} • BO ${pick(r, "backorder", "Backorder") || "0"}`,
      col3: sku && wh ? "Status OK" : "Review Needed",
    };
  });
}

export async function uploadInventoryCsv(file: File) {
  const text = await file.text();
  const csvRows = parseCsv(text);

  const [products, existingStocks, warehouses] = await Promise.all([
    apiGetListAll<ProductRow>(ENTITY_PRODUCT),
    apiGetListAll<InventoryRow>(ENTITY_INVENTORY),
    apiGetListAll<WarehouseRow>(ENTITY_WAREHOUSE),
  ]);

  const productSkuSet = new Set(products.map((p) => key(p.sku_id || "")).filter(Boolean));

  // maps for warehouse lookup
  const whIdBySkuAndCode = new Map<string, number>();
  const whIdByCode = new Map<string, number>();

  warehouses.forEach((w) => {
    const skuKey = key(w.sku_id || "");
    const codeKey = key(w.warehouse_code || "");
    if (!codeKey) return;

    if (!whIdByCode.has(codeKey)) whIdByCode.set(codeKey, w.warehouse_id);
    if (skuKey) whIdBySkuAndCode.set(pairKey(skuKey, codeKey), w.warehouse_id);
  });

  // Existing stock ids grouped by sku
  const stockIdsBySku = new Map<string, number[]>();
  for (const s of existingStocks) {
    const skuKey = key(s.sku_id || "");
    if (!skuKey) continue;
    if (!stockIdsBySku.has(skuKey)) stockIdsBySku.set(skuKey, []);
    stockIdsBySku.get(skuKey)!.push(s.stock_id);
  }

  // Validate + dedupe by sku+warehouse_code (last row wins)
  const rowsBySku = new Map<string, Map<string, { row: CsvRow; warehouseId: number }>>();
  let failed = 0;
  const errors: string[] = [];

  csvRows.forEach((r, idx) => {
    const line = idx + 2;
    const skuRaw = pick(r, "sku_id", "SKU_ID").trim();
    const whCodeRaw = pick(r, "warehouse_code", "warehouse_id", "Warehouse_Code", "Warehouse_ID").trim();

    const skuKey = key(skuRaw);
    const whCodeKey = key(whCodeRaw);

    if (!skuRaw) {
      failed++;
      errors.push(`Row ${line}: Missing sku_id`);
      return;
    }
    if (!whCodeRaw) {
      failed++;
      errors.push(`Row ${line}: Missing warehouse_code`);
      return;
    }
    if (!productSkuSet.has(skuKey)) {
      failed++;
      errors.push(`Row ${line}: SKU not found (${skuRaw})`);
      return;
    }

    const warehouseId =
      whIdBySkuAndCode.get(pairKey(skuKey, whCodeKey)) ??
      whIdByCode.get(whCodeKey);

    if (!warehouseId) {
      failed++;
      errors.push(`Row ${line}: Warehouse not found (${whCodeRaw})`);
      return;
    }

    if (!rowsBySku.has(skuKey)) rowsBySku.set(skuKey, new Map());
    rowsBySku.get(skuKey)!.set(whCodeKey, { row: r, warehouseId });
  });

  let inserted = 0;
  let updated = 0;
  let success = 0;

  // overwrite by sku_id
  for (const [skuKey, byWh] of rowsBySku.entries()) {
    const skuRows = Array.from(byWh.values());
    try {
      const existingIds = stockIdsBySku.get(skuKey) || [];
      const hadExisting = existingIds.length > 0;

      for (const stockId of existingIds) {
        await apiDelete(ENTITY_INVENTORY, "stock_id", stockId);
      }

      for (const item of skuRows) {
        const payload = toInventoryPayload(item.row, item.warehouseId);
        await apiPost(ENTITY_INVENTORY, payload as Record<string, unknown>);
      }

      success += skuRows.length;
      if (hadExisting) updated += skuRows.length;
      else inserted += skuRows.length;
    } catch (e: any) {
      failed += skuRows.length;
      errors.push(`${skuKey}: ${e?.message || "Upload failed"}`);
    }
  }

  return {
    total: csvRows.length,
    success,
    failed,
    inserted,
    updated,
    errors,
  };
}