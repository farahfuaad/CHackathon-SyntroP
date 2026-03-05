import React, { useEffect, useMemo, useState } from 'react';
import { SKU, Supplier } from '../types';
import { Info, ShoppingCart } from 'lucide-react';
import { fetchInventoryListingBySku, InventorySkuListing } from '../src/services/productDetailService';

interface Props {
  skus: SKU[];
  suppliers: Supplier[];
  onAddToPlanning: (skuId: string) => void;
}

const ProcurementSheet: React.FC<Props> = ({ skus: _skus, suppliers, onAddToPlanning }) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [rows, setRows] = useState<InventorySkuListing[]>([]);
  const [page, setPage] = useState<number>(1);

  const PAGE_SIZE = 20;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await fetchInventoryListingBySku();
        if (mounted) setRows(data);
      } catch (err) {
        console.error('Failed to fetch inventory listing by sku:', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (selectedSupplierId === 'all') return rows;
    return rows.filter((r) => r.supplierId === selectedSupplierId);
  }, [selectedSupplierId, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [selectedSupplierId, rows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      
      {/* 1. Header Bar: Search + Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 gap-4 border-b border-slate-200">
        <div className="relative flex-1 max-w-md">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input
            type="text"
            placeholder="Search by Model or SKU..."
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
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <button 
            onClick={() => {/* Trigger your Add Logic */}} 
            className="px-4 py-2 text-sm font-bold text-white rounded-xl shadow-md hover:opacity-90 active:scale-95 transition-all flex items-center" 
            style={{ backgroundColor: '#E31E24' }}
          >
            <i className="fa-solid fa-plus mr-2"></i> Add SKU
          </button>
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
              {visibleRows.map((row) => {
                const ams3m = row.stockLast3m > 0 ? row.stockLast3m / 3 : 0;
                const stockLast = ams3m > 0 ? (row.totalStock / ams3m).toFixed(1) : '0.0';
                const isLow = Number(stockLast) < 1.5;

                return (
                  <tr key={row.skuId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-900">{row.modelName || '-'}</span>
                        <span className="text-xs text-slate-400">{row.skuId}</span>
                        <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                          {row.categoryLabel}
                        </span>
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
                        onClick={() => onAddToPlanning(row.skuId)}
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
    </div>
  );
};

export default ProcurementSheet;
