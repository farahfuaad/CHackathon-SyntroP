import React, { useEffect, useMemo, useState } from 'react';
import { Info, ShoppingCart, X } from 'lucide-react';
import { fetchInventoryListingAndWarehouseMap, InventorySkuListing } from '../src/services/productDetailService';
import { fetchAmsBySku, AmsBySku } from '../src/services/salesService';
import { fetchSupplierListing, SupplierListing } from '../src/services/supplierService';
import { WarehouseStockDetail } from '../src/services/warehouseService';
import { saveProcurementMetricsSnapshot } from '../src/services/procurementMetricsService';

interface Props {
  onAddToPlanning: (skuId: string) => void;
}

function normalizeSkuKey(v: string) {
  return (v || '').trim().toUpperCase();
}

const ProcurementSheet: React.FC<Props> = ({ onAddToPlanning }) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [cartSkuIds, setCartSkuIds] = useState<string[]>([]);
  const [lastAddedSkuId, setLastAddedSkuId] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [rows, setRows] = useState<InventorySkuListing[]>([]);
  const [amsBySku, setAmsBySku] = useState<Map<string, AmsBySku>>(new Map());
  const [supplierOptions, setSupplierOptions] = useState<SupplierListing[]>([]);
  const [warehouseBySku, setWarehouseBySku] = useState<Map<string, WarehouseStockDetail[]>>(new Map());
  const [selectedSkuForModal, setSelectedSkuForModal] = useState<InventorySkuListing | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  const PAGE_SIZE = 20;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setIsLoading(true);

        // Load all data needed by ProcurementSheet in parallel
        const [
          { listing, warehouseMap },
          suppliers,
          salesAmsMap,
        ] = await Promise.all([
          fetchInventoryListingAndWarehouseMap(),
          fetchSupplierListing(),
          fetchAmsBySku(),
        ]);

        if (!mounted) return;

        // Render listing first
        setRows(listing);
        setWarehouseBySku(warehouseMap);
        setSupplierOptions(suppliers);
        setAmsBySku(salesAmsMap);
        setIsLoading(false);

        // Push computed snapshot to DB in background (non-blocking UI)
        void saveProcurementMetricsSnapshot(listing, salesAmsMap).catch((err) => {
          console.error('Failed to persist procurement metrics snapshot:', err);
        });
      } catch (err) {
        console.error('Failed to fetch procurement sheet data:', err);
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return rows.filter((r) => {
      const passSupplier = selectedSupplierId === 'all' || r.supplierId === selectedSupplierId;
      if (!passSupplier) return false;
      if (!q) return true;

      const sku = (r.skuId || '').toLowerCase();
      const model = (r.modelName || '').toLowerCase();
      return sku.includes(q) || model.includes(q);
    });
  }, [selectedSupplierId, rows, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [selectedSupplierId, searchTerm, rows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const selectedWarehouseDetails = selectedSkuForModal
    ? warehouseBySku.get(normalizeSkuKey(selectedSkuForModal.skuId)) || []
    : [];

  const selectedWarehouseDetailsForDisplay = selectedWarehouseDetails.filter((item) => item.quantity > 0);

  const selectedWarehouseTotal = selectedWarehouseDetailsForDisplay.reduce((sum, item) => sum + item.quantity, 0);

  const cartRows = useMemo(() => {
    const bySku = new Map(rows.map((row) => [normalizeSkuKey(row.skuId), row] as const));
    return cartSkuIds
      .map((skuId) => bySku.get(normalizeSkuKey(skuId)))
      .filter((row): row is InventorySkuListing => Boolean(row));
  }, [cartSkuIds, rows]);

  useEffect(() => {
    if (!lastAddedSkuId) return;
    const t = window.setTimeout(() => setLastAddedSkuId(null), 1800);
    return () => window.clearTimeout(t);
  }, [lastAddedSkuId]);

  const handleAddSkuToCart = (skuId: string) => {
    setCartSkuIds((prev) => {
      if (prev.includes(skuId)) return prev;
      return [...prev, skuId];
    });
    setLastAddedSkuId(skuId);
  };

  const handleRemoveSkuFromCart = (skuId: string) => {
    setCartSkuIds((prev) => prev.filter((id) => id !== skuId));
  };

  const handleCheckoutCart = () => {
    if (!cartSkuIds.length) return;

    const uniqueSkuIds = Array.from(new Set(cartSkuIds.map((id) => (id || '').trim()).filter(Boolean)));
    uniqueSkuIds.forEach((skuId) => onAddToPlanning(skuId));

    setCartSkuIds([]);
    setIsCartOpen(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      
      {/* 1. Header Bar: Search + Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 gap-4 border-b border-slate-200">
        <div className="relative flex-1 max-w-md">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input
            type="text"
            placeholder="Search by Model or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-10 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl flex items-center gap-2">
            <i className="fa-solid fa-filter"></i>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="all">All Suppliers</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsCartOpen(true)}
            className="relative px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <ShoppingCart size={16} />
            Cart
            {cartSkuIds.length > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {cartSkuIds.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {lastAddedSkuId && (
        <div className="px-4 py-2 border-b border-slate-100 bg-green-50 text-green-700 text-xs font-semibold">
          Added to cart: {lastAddedSkuId}
        </div>
      )}

      {/* 2. Table Section: Displaying the SKUs */}
      <div className="overflow-x-auto">
        <div className="max-h-[700px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Model / SKU</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Backorder</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">In Hand</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Incoming</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Total Stock</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">AMS (3m)</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Stock Last (3m)</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">AMS (6m)</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Stock Last (6m)</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-2">
                        <div className="h-3.5 bg-slate-200 rounded w-36" />
                        <div className="h-2.5 bg-slate-100 rounded w-24" />
                        <div className="h-2.5 bg-slate-100 rounded w-16" />
                      </div>
                    </td>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-4 text-center">
                        <div className="h-3.5 bg-slate-200 rounded mx-auto w-10" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visibleRows.map((row) => {
                const skuKey = normalizeSkuKey(row.skuId);
                const ams = amsBySku.get(skuKey);

                const ams3m = ams?.ams3m ?? (row.stockLast3m > 0 ? row.stockLast3m / 3 : 0);
                const ams6m = ams?.ams6m ?? (row.stockLast6m > 0 ? row.stockLast6m / 6 : 0);

                const stockLast3m = ams3m > 0 ? row.totalStock / ams3m : 0;
                const stockLast6m = ams6m > 0 ? row.totalStock / ams6m : 0;

                const isLow3m = stockLast3m < 1.5;
                const isLow6m = stockLast6m < 1.5;

                const hasIncoming = row.incoming > 0;
                const demandSignal = ams3m > 0 ? ams3m : ams6m;
                const derivedStatus = !hasIncoming && row.inHand === 0
                  ? (demandSignal > 0 ? 'inactive' : 'new')
                  : null;

                return (
                  <tr
                    key={row.skuId}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedSkuForModal(row)}
                  >
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-900">{row.modelName || '-'}</span>
                        <span className="text-xs text-slate-400">{row.skuId}</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {row.categoryLabel}
                          </span>
                          {derivedStatus && (
                            <span
                              className={`inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                derivedStatus === 'inactive'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-cyan-100 text-cyan-700'
                              }`}
                            >
                              {derivedStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-medium text-slate-600">{row.backorder}</td>
                    <td className="px-4 py-4 text-center font-medium text-slate-600">{row.inHand}</td>
                    <td className="px-4 py-4 text-center font-medium text-blue-600">{row.incoming}</td>
                    <td className="px-4 py-4 text-center font-bold text-slate-900">{row.totalStock}</td>

                    <td className="px-4 py-4 text-center font-medium text-slate-600">{ams3m.toFixed(1)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        isLow3m ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {stockLast3m.toFixed(1)} Mo
                      </span>
                    </td>

                    <td className="px-4 py-4 text-center font-medium text-slate-600">{ams6m.toFixed(1)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        isLow6m ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {stockLast6m.toFixed(1)} Mo
                      </span>
                    </td>

                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddSkuToCart(row.skuId);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title={cartSkuIds.includes(row.skuId) ? 'Already in cart' : 'Add to cart'}
                      >
                        <ShoppingCart size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-blue-500" />
          <p className="text-xs text-slate-500 italic">
            * 20 rows per page. Use Previous/Next to navigate.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="text-xs text-slate-600 font-semibold">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {selectedSkuForModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 p-4 flex items-center justify-center"
          onClick={() => setSelectedSkuForModal(null)}
        >
          <div
            className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Warehouse Breakdown</h3>
                <p className="text-sm text-slate-500">
                  {selectedSkuForModal.modelName || '-'} ({selectedSkuForModal.skuId})
                </p>
              </div>
              <button
                onClick={() => setSelectedSkuForModal(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close warehouse details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 text-sm text-slate-600 flex flex-wrap gap-4">
              <span>
                In Hand (listing): <strong className="text-slate-900">{selectedSkuForModal.inHand}</strong>
              </span>
              <span>
                Warehouse total: <strong className="text-slate-900">{selectedWarehouseTotal}</strong>
              </span>
            </div>

            {selectedWarehouseDetailsForDisplay.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No non-zero warehouse quantities found for this SKU.</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr className="text-left text-slate-500">
                      <th className="px-5 py-2.5 font-semibold">Warehouse</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedWarehouseDetailsForDisplay.map((warehouse) => (
                      <tr
                        key={`${selectedSkuForModal.skuId}-${warehouse.warehouseCode}-${warehouse.warehouseName}`}
                        className="border-b border-slate-50 last:border-b-0"
                      >
                        <td className="px-5 py-2.5 text-slate-700">{warehouse.warehouseName}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-slate-900">{warehouse.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {isCartOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/45 p-4 flex items-center justify-center"
          onClick={() => setIsCartOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Cart Items</h3>
                <p className="text-sm text-slate-500">{cartRows.length} SKU(s) selected for planning</p>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close cart"
              >
                <X size={16} />
              </button>
            </div>

            {cartRows.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">Cart is empty. Add items using the cart icon in each row.</p>
            ) : (
              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                {cartRows.map((row) => (
                  <div key={row.skuId} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.modelName || '-'}</p>
                      <p className="text-xs text-slate-500">{row.skuId}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveSkuFromCart(row.skuId)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsCartOpen(false)}
                className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 text-slate-600"
              >
                Continue Selecting
              </button>
              <button
                onClick={handleCheckoutCart}
                disabled={cartRows.length === 0}
                className="px-4 py-2 text-xs font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Checkout to Container Planner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcurementSheet;
