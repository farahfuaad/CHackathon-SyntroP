import React, { useEffect, useMemo, useState } from 'react';
import { Info, ShoppingCart, X } from 'lucide-react';
import { fetchInventoryListingAndWarehouseMap, InventorySkuListing } from '../src/services/productDetailService';
import { fetchAms3mBySku } from '../src/services/salesService';
import { fetchSupplierListing, SupplierListing } from '../src/services/supplierService';
import { WarehouseStockDetail } from '../src/services/warehouseService';

interface Props {
  onAddToPlanning: (skuId: string) => void;
}

function normalizeSkuKey(v: string) {
  return (v || '').trim().toUpperCase();
}

const ProcurementSheet: React.FC<Props> = ({ onAddToPlanning }) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [rows, setRows] = useState<InventorySkuListing[]>([]);
  const [ams3mBySku, setAms3mBySku] = useState<Map<string, number>>(new Map());
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

        // All three fetches run in parallel. fetchAms3mBySku is cached after first
        // call so every subsequent render (navigation back, etc.) is instant.
        const [{ listing, warehouseMap }, suppliers, salesAmsMap] = await Promise.all([
          fetchInventoryListingAndWarehouseMap(),
          fetchSupplierListing(),
          fetchAms3mBySku(),
        ]);

        if (!mounted) return;

        setRows(listing);
        setSupplierOptions(suppliers);
        setWarehouseBySku(warehouseMap);
        setAms3mBySku(salesAmsMap);
      } catch (err) {
        console.error('Failed to fetch procurement sheet data:', err);
      } finally {
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
        </div>
      </div>

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
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Stock Last (Mo)</th>
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
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-4 text-center">
                        <div className="h-3.5 bg-slate-200 rounded mx-auto w-10" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visibleRows.map((row) => {
                const skuKey = normalizeSkuKey(row.skuId);
                const ams3m = ams3mBySku.get(skuKey) ?? 0;
                const stockLast = ams3m > 0 ? (row.totalStock / ams3m).toFixed(1) : '0.0';
                const isLow = Number(stockLast) < 1.5;
                const hasIncoming = row.incoming > 0;
                const derivedStatus = !hasIncoming && row.inHand === 0
                  ? (ams3m > 0 ? 'inactive' : 'new')
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
                        isLow ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {stockLast} Mo
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToPlanning(row.skuId);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
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
                      <th className="px-5 py-2.5 font-semibold">Name</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedWarehouseDetailsForDisplay.map((warehouse) => (
                      <tr
                        key={`${selectedSkuForModal.skuId}-${warehouse.warehouseCode}-${warehouse.warehouseName}`}
                        className="border-b border-slate-50 last:border-b-0"
                      >
                        <td className="px-5 py-2.5 font-mono text-xs text-slate-700">{warehouse.warehouseCode}</td>
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
    </div>
  );
};

export default ProcurementSheet;
