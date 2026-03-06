import { apiGetListAll, apiPatch, apiPost } from "./apiClient";
import { fetchWarehouseStockBySku } from "./warehouseService";

type CsvRow = Record<string, string>;

type SupplierRow = {
  supplier_id: number;
  supplier_name: string;
};

type ProductKeyRow = {
  sku_id: string;
};

type ProductListingRow = {
  sku_id: string;
  sku_model_name: string;
  category: number;
  supplier_id?: string | number;
  box_length_cm?: number | null;
  box_width_cm?: number | null;
  box_height_cm?: number | null;
  box_weight_kg?: number | null;
};

type InventoryStockRow = {
  sku_id: string;
  warehouse_id?: string | null;
  in_hand?: number | null;
  backorder?: number | null;
  incoming?: number | null;
  total_stock?: number | null;
  stock_last_3m?: number | null;
  stock_last_6m?: number | null;
};

export type ProductListingMeta = {
  skuId: string;
  modelName: string;
  categoryLabel: string;
};

export type InventorySkuListing = {
  skuId: string;
  modelName: string;
  categoryLabel: string;
  supplierId: string;
  inHand: number;
  backorder: number;
  incoming: number;
  totalStock: number;
  stockLast3m: number;
  stockLast6m: number;
};

const CATEGORY_MAP: Record<string, number> = {
  kitchen: 1,
  cooling: 2,
  home: 3,
  bathroom: 4,
};

const CATEGORY_ID_TO_LABEL: Record<number, string> = {
  1: "kitchen",
  2: "cooling",
  3: "home",
  4: "bathroom",
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
const ENTITY_INVENTORY_STOCKS = "InventoryStocks";

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

function normalizeSkuKey(v: string) {
  return (v || "").trim().toUpperCase();
}

function getHttpStatus(err: any): number | undefined {
  return err?.status ?? err?.response?.status;
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
  const [text, suppliers, products, inventoryStocks] = await Promise.all([
    file.text(),
    apiGetListAll<SupplierRow>(ENTITY_SUPPLIER),
    apiGetListAll<ProductKeyRow>(ENTITY_PRODUCT),
    apiGetListAll<InventoryStockRow>(ENTITY_INVENTORY_STOCKS),
  ]);

  const supplierIdSet = new Set<number>();
  suppliers.forEach((s) => {
    supplierIdSet.add(s.supplier_id);
  });

  // Keep DB sku raw value, keyed by normalized SKU
  const existingSkuByKey = new Map<string, string>();
  products.forEach((p) => {
    const raw = (p.sku_id || "").trim();
    if (raw) existingSkuByKey.set(normalizeSkuKey(raw), raw);
  });

  const existingInventorySkuKeySet = new Set(
    inventoryStocks
      .map((s) => normalizeSkuKey(s.sku_id || ""))
      .filter(Boolean)
  );

  const parsedRows = parseCsv(text);

  // Deduplicate file SKUs (last row wins), case-insensitive
  const latestRowBySkuKey = new Map<string, CsvRow>();
  for (const row of parsedRows) {
    const rawSku = (row["SKU_ID"] || "").trim();
    if (!rawSku) continue;
    latestRowBySkuKey.set(normalizeSkuKey(rawSku), row);
  }

  const rows = Array.from(latestRowBySkuKey.values());

  let success = 0;
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const payload = toProductPayload(row, supplierIdSet);
      const rawSku = (payload.sku_id || "").trim();
      if (!rawSku) throw new Error("Missing SKU_ID");

      const skuKey = normalizeSkuKey(rawSku);
      const dbSku = existingSkuByKey.get(skuKey);

      if (dbSku) {
        const { sku_id, ...patchPayload } = payload;
        await apiPatch(ENTITY_PRODUCT, "sku_id", dbSku, patchPayload);
        updated++;
      } else {
        try {
          await apiPost(ENTITY_PRODUCT, payload);
          inserted++;
          existingSkuByKey.set(skuKey, rawSku);
        } catch (e: any) {
          // If another same SKU already exists, overwrite it
          if (getHttpStatus(e) === 409) {
            const { sku_id, ...patchPayload } = payload;
            await apiPatch(ENTITY_PRODUCT, "sku_id", rawSku, patchPayload);
            updated++;
            existingSkuByKey.set(skuKey, rawSku);
          } else {
            throw e;
          }
        }
      }

      // Ensure sku_id exists in InventoryStocks (ignore duplicate conflict)
      if (!existingInventorySkuKeySet.has(skuKey)) {
        try {
          await apiPost(ENTITY_INVENTORY_STOCKS, { sku_id: rawSku });
        } catch (e: any) {
          if (getHttpStatus(e) !== 409) throw e;
        }
        existingInventorySkuKeySet.add(skuKey);
      }

      success++;
    } catch (e: any) {
      errors.push(`${row["SKU_ID"] || "UNKNOWN"}: ${e?.message || "Upload failed"}`);
    }
  }

  return {
    total: parsedRows.length,
    processedUniqueSku: rows.length,
    success,
    failed: rows.length - success,
    inserted,
    updated,
    errors,
  };
}

export async function fetchProductListingMeta() {
  const rows = await apiGetListAll<ProductListingRow>(ENTITY_PRODUCT);

  const map = new Map<string, ProductListingMeta>();
  rows.forEach((r: ProductListingRow) => {
    const skuId = (r.sku_id || "").trim();
    if (!skuId) return;

    map.set(skuId, {
      skuId,
      modelName: r.sku_model_name || "",
      categoryLabel: CATEGORY_ID_TO_LABEL[r.category] || "Uncategorized",
    });
  });

  return map;
}

// Shared builder so listing and warehouseMap come from a single set of fetches.
async function _fetchListingData() {
  const [products, inventoryRows, warehouseMap] = await Promise.all([
    apiGetListAll<ProductListingRow>(ENTITY_PRODUCT),
    apiGetListAll<InventoryStockRow>(ENTITY_INVENTORY_STOCKS),
    fetchWarehouseStockBySku(),
  ]);

  const productBySkuKey = new Map<string, ProductListingRow>();
  products.forEach((p) => {
    const rawSku = (p.sku_id || "").trim();
    if (!rawSku) return;
    productBySkuKey.set(normalizeSkuKey(rawSku), p);
  });

  const bySku = new Map<string, InventorySkuListing>();

  inventoryRows.forEach((row) => {
    const rawSku = (row.sku_id || "").trim();
    if (!rawSku) return;

    const skuKey = normalizeSkuKey(rawSku);
    const product = productBySkuKey.get(skuKey);

    if (!bySku.has(skuKey)) {
      bySku.set(skuKey, {
        skuId: product?.sku_id?.trim() || rawSku,
        modelName: product?.sku_model_name || "",
        categoryLabel: CATEGORY_ID_TO_LABEL[product?.category ?? 0] || "Uncategorized",
        supplierId: product?.supplier_id != null ? String(product.supplier_id) : "",
        inHand: 0,
        backorder: 0,
        incoming: 0,
        totalStock: 0,
        stockLast3m: 0,
        stockLast6m: 0,
      });
    }

    const agg = bySku.get(skuKey)!;
    agg.backorder += toNum(row.backorder);
    agg.incoming += toNum(row.incoming);
    agg.totalStock += toNum(row.total_stock);
    agg.stockLast3m += toNum(row.stock_last_3m);
    agg.stockLast6m += toNum(row.stock_last_6m);
  });

  // Ensure SKUs that exist in Product/Warehouse appear even when inventory rows are sparse.
  productBySkuKey.forEach((product, skuKey) => {
    if (bySku.has(skuKey)) return;

    bySku.set(skuKey, {
      skuId: (product.sku_id || "").trim(),
      modelName: product.sku_model_name || "",
      categoryLabel: CATEGORY_ID_TO_LABEL[product.category ?? 0] || "Uncategorized",
      supplierId: product?.supplier_id != null ? String(product.supplier_id) : "",
      inHand: 0,
      backorder: 0,
      incoming: 0,
      totalStock: 0,
      stockLast3m: 0,
      stockLast6m: 0,
    });
  });

  bySku.forEach((agg, skuKey) => {
    const warehouses = warehouseMap.get(skuKey) || [];
    if (!warehouses.length) return;

    const inHandFromWarehouse = warehouses.reduce((sum, wh) => sum + toNum(wh.quantity), 0);
    agg.inHand = inHandFromWarehouse;
    agg.totalStock = inHandFromWarehouse + agg.incoming;
  });

  const listing = Array.from(bySku.values()).sort((a, b) => a.skuId.localeCompare(b.skuId));
  return { listing, warehouseMap };
}

/** Returns listing + warehouse map together so the caller avoids a second warehouse fetch. */
export async function fetchInventoryListingAndWarehouseMap() {
  return _fetchListingData();
}

export async function fetchInventoryListingBySku(): Promise<InventorySkuListing[]> {
  const { listing } = await _fetchListingData();
  return listing;
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type ProductSpecListing = {
  skuId: string;
  modelName: string;
  categoryLabel: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
};

export async function fetchProductSpecListing(): Promise<ProductSpecListing[]> {
  const rows = await apiGetListAll<ProductListingRow>(ENTITY_PRODUCT);

  return rows
    .map((r) => ({
      skuId: (r.sku_id || "").trim(),
      modelName: r.sku_model_name || "",
      categoryLabel: CATEGORY_ID_TO_LABEL[r.category] || "Uncategorized",
      lengthCm: toNum(r.box_length_cm),
      widthCm: toNum(r.box_width_cm),
      heightCm: toNum(r.box_height_cm),
      weightKg: toNum(r.box_weight_kg),
    }))
    .filter((r) => !!r.skuId)
    .sort((a, b) => a.skuId.localeCompare(b.skuId));
}

export async function updateProductSpecDimensions(
  skuId: string,
  patch: Partial<Pick<ProductSpecListing, "lengthCm" | "widthCm" | "heightCm" | "weightKg">>
): Promise<void> {
  const cleanSku = (skuId || "").trim();
  if (!cleanSku) {
    throw new Error("skuId is required");
  }

  const payload: Record<string, unknown> = {};
  if (patch.lengthCm != null) payload.box_length_cm = Number(patch.lengthCm) || 0;
  if (patch.widthCm != null) payload.box_width_cm = Number(patch.widthCm) || 0;
  if (patch.heightCm != null) payload.box_height_cm = Number(patch.heightCm) || 0;
  if (patch.weightKg != null) payload.box_weight_kg = Number(patch.weightKg) || 0;

  await apiPatch(ENTITY_PRODUCT, "sku_id", cleanSku, payload);
}