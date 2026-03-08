import { apiGetListAll, apiPatch } from "./apiClient";
import type { InventorySkuListing } from "./productDetailService";
import type { AmsBySku } from "./salesService";

type InventoryStockDbRow = {
  stock_id: number;
  sku_id?: string | null;
  in_hand?: number | null;
  total_stock?: number | null;
  stock_last_3m?: number | null;
  stock_last_6m?: number | null;
};

type SalesDbRow = {
  sales_id: number;
  sku_id?: string | null;
  ams_3m?: number | null;
  ams_6m?: number | null;
};

const ENTITY_INVENTORY = import.meta.env.VITE_INVENTORY_ENTITY || "InventoryStocks";
const ENTITY_SALES = import.meta.env.VITE_SALES_ENTITY || "Sales";
const WRITE_CONCURRENCY = Math.max(1, Number(import.meta.env.VITE_PROCUREMENT_WRITE_CONCURRENCY ?? 24));

function normalizeSkuKey(v: string) {
  return (v || "").trim().toUpperCase();
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      await tasks[idx]();
    }
  });
  await Promise.all(workers);
}

export async function saveProcurementMetricsSnapshot(
  rows: InventorySkuListing[],
  amsBySku: Map<string, AmsBySku>
): Promise<void> {
  if (!rows.length) return;

  // Build one calculated snapshot per SKU
  const calcBySku = new Map<
    string,
    { in_hand: number; total_stock: number; stock_last_3m: number; stock_last_6m: number; ams_3m: number; ams_6m: number }
  >();

  for (const row of rows) {
    const skuKey = normalizeSkuKey(row.skuId);
    if (!skuKey) continue;

    const ams = amsBySku.get(skuKey);
    const ams3m = toNum(ams?.ams3m, row.stockLast3m > 0 ? row.stockLast3m / 3 : 0);
    const ams6m = toNum(ams?.ams6m, row.stockLast6m > 0 ? row.stockLast6m / 6 : 0);
    const totalStock = toNum(row.totalStock, 0);
    const inHand = toNum(row.inHand, 0);

    calcBySku.set(skuKey, {
      in_hand: Math.round(inHand),
      total_stock: Math.round(totalStock),
      stock_last_3m: Math.round(ams3m > 0 ? totalStock / ams3m : 0),
      stock_last_6m: Math.round(ams6m > 0 ? totalStock / ams6m : 0),
      ams_3m: Math.round(ams3m),
      ams_6m: Math.round(ams6m),
    });
  }

  const [inventoryRows, salesRows] = await Promise.all([
    apiGetListAll<InventoryStockDbRow>(ENTITY_INVENTORY),
    apiGetListAll<SalesDbRow>(ENTITY_SALES),
  ]);

  const tasks: Array<() => Promise<void>> = [];

  // Update InventoryStocks rows once
  for (const inv of inventoryRows) {
    const skuKey = normalizeSkuKey(inv.sku_id || "");
    const calc = calcBySku.get(skuKey);
    if (!calc) continue;

    const unchanged =
      toNum(inv.in_hand) === calc.in_hand &&
      toNum(inv.total_stock) === calc.total_stock &&
      toNum(inv.stock_last_3m) === calc.stock_last_3m &&
      toNum(inv.stock_last_6m) === calc.stock_last_6m;

    if (unchanged) continue;

    tasks.push(() =>
      apiPatch(ENTITY_INVENTORY, "stock_id", inv.stock_id, {
        in_hand: calc.in_hand,
        total_stock: calc.total_stock,
        stock_last_3m: calc.stock_last_3m,
        stock_last_6m: calc.stock_last_6m,
      }).then(() => undefined)
    );
  }

  // Update Sales rows once
  for (const s of salesRows) {
    const skuKey = normalizeSkuKey(s.sku_id || "");
    const calc = calcBySku.get(skuKey);
    if (!calc) continue;

    const unchanged = toNum(s.ams_3m) === calc.ams_3m && toNum(s.ams_6m) === calc.ams_6m;
    if (unchanged) continue;

    tasks.push(() =>
      apiPatch(ENTITY_SALES, "sales_id", s.sales_id, {
        ams_3m: calc.ams_3m,
        ams_6m: calc.ams_6m,
      }).then(() => undefined)
    );
  }

  if (!tasks.length) return;
  await runWithConcurrency(tasks, WRITE_CONCURRENCY);
}