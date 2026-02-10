
import React from 'react';
import { SKU, WarehouseCategory } from '../types';
import { Info, AlertCircle, ShoppingCart } from 'lucide-react';

interface Props {
  skus: SKU[];
  onAddToPlanning: (skuId: string) => void;
}

const ProcurementSheet: React.FC<Props> = ({ skus, onAddToPlanning }) => {
  const calculateTotalStock = (sku: SKU) => {
    // Exclude Project and Corporate
    const excluded = [WarehouseCategory.PROJECT, WarehouseCategory.CORPORATE];
    const inHand = Object.entries(sku.inStock).reduce((acc, [cat, val]) => {
      if (!excluded.includes(cat as WarehouseCategory)) return acc + (val as number);
      return acc;
    }, 0);
    return inHand + sku.incoming;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
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
            {skus.map((sku) => {
              const total = calculateTotalStock(sku);
              const stockLast = (total / sku.ams).toFixed(1);
              const isLow = Number(stockLast) < 1.5;
              const isSlow = sku.isSlowMoving;

              return (
                <tr key={sku.id} className={`hover:bg-slate-50 transition-colors ${isSlow ? 'bg-slate-50 opacity-75' : ''}`}>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900">{sku.model}</span>
                      <span className="text-xs text-slate-500">{sku.id}</span>
                      {isSlow && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] bg-slate-200 text-slate-600 px-1.5 rounded font-medium w-fit">
                          SLOW MOVING: {sku.exclusionReason}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center font-medium text-slate-700">{sku.backorder}</td>
                  <td className="px-4 py-4 text-center font-medium text-slate-700">
                    {Object.entries(sku.inStock).reduce((acc, [cat, val]) => 
                      ![WarehouseCategory.PROJECT, WarehouseCategory.CORPORATE].includes(cat as WarehouseCategory) ? acc + (val as number) : acc
                    , 0)}
                  </td>
                  <td className="px-4 py-4 text-center font-medium text-blue-600">{sku.incoming}</td>
                  <td className="px-4 py-4 text-center font-bold text-slate-900">{total}</td>
                  <td className="px-4 py-4 text-center font-medium text-slate-700">{sku.ams}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      isLow ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                    }`}>
                      {stockLast} Months
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button 
                      onClick={() => onAddToPlanning(sku.id)}
                      title="Add to Container Plan"
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
      <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center gap-2">
        <Info size={14} className="text-blue-500" />
        <p className="text-xs text-slate-500 italic">
          * Total Stocks excludes Warehouse Categories: {WarehouseCategory.PROJECT} (Project) and {WarehouseCategory.CORPORATE} (Corporate).
        </p>
      </div>
    </div>
  );
};

export default ProcurementSheet;
