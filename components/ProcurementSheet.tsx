
import React, { useMemo, useState } from 'react';
import { SKU, Supplier, WarehouseCategory } from '../types';
import { Info, ShoppingCart } from 'lucide-react';

interface Props {
  skus: SKU[];
  suppliers: Supplier[];
  onAddToPlanning: (skuId: string) => void;
}

const ProcurementSheet: React.FC<Props> = ({ skus, suppliers, onAddToPlanning }) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');

  const calculateTotalStock = (sku: SKU) => {
    // Exclude Project and Corporate
    const excluded = [WarehouseCategory.PROJECT, WarehouseCategory.CORPORATE];
    const inHand = Object.entries(sku.inStock).reduce((acc, [cat, val]) => {
      if (!excluded.includes(cat as WarehouseCategory)) return acc + (val as number);
      return acc;
    }, 0);
    return inHand + sku.incoming;
  };

  const filteredSkus = useMemo(() => {
    if (selectedSupplierId === 'all') return skus;
    return skus.filter((sku) => sku.supplierId === selectedSupplierId);
  }, [selectedSupplierId, skus]);

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
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
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
          {filteredSkus.map((sku) => {
            // Logic for Calculations
            const total = calculateTotalStock(sku);
            const stockLast = (total / sku.ams).toFixed(1);
            const isLow = Number(stockLast) < 1.5;

            return (
              <tr key={sku.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900">{sku.model}</span>
                    <span className="text-xs text-slate-400">{sku.id}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-center font-medium text-slate-600">{sku.backorder}</td>
                <td className="px-4 py-4 text-center font-medium text-slate-600">
                   {/* Logic to filter out specific warehouse categories from display */}
                  {Object.entries(sku.inStock).reduce((acc, [cat, val]) => 
                    ![WarehouseCategory.PROJECT, WarehouseCategory.CORPORATE].includes(cat as WarehouseCategory) ? acc + (val as number) : acc
                  , 0)}
                </td>
                <td className="px-4 py-4 text-center font-medium text-blue-600">{sku.incoming}</td>
                <td className="px-4 py-4 text-center font-bold text-slate-900">{total}</td>
                <td className="px-4 py-4 text-center font-medium text-slate-600">{sku.ams}</td>
                <td className="px-4 py-4 text-center">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    isLow ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                  }`}>
                    {stockLast} Mo
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <button 
                    onClick={() => onAddToPlanning(sku.id)}
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

    {/* 3. Footer */}
    <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center gap-2">
      <Info size={14} className="text-blue-500" />
      <p className="text-xs text-slate-500 italic">
        * Total Stocks excludes Warehouse Categories: {WarehouseCategory.PROJECT} and {WarehouseCategory.CORPORATE}.
      </p>
    </div>
  </div>
); }
export default ProcurementSheet;
