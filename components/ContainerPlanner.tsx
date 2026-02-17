
import React, { useState } from 'react';
import { SKU, ContainerType, PurchaseRequisition } from '../types';
import { Box, Calculator, FileDown, Trash2, Loader2 } from 'lucide-react';

interface Props {
  skus: SKU[];
  containerTypes: ContainerType[];
  selectedSkus: { skuId: string, qty: number }[];
  setSelectedSkus: React.Dispatch<React.SetStateAction<{ skuId: string, qty: number }[]>>;
  onGeneratePr: (pr: PurchaseRequisition) => void;
}

const ContainerPlanner: React.FC<Props> = ({ skus, containerTypes, selectedSkus, setSelectedSkus, onGeneratePr }) => {
  const [containerType, setContainerType] = useState<ContainerType>(containerTypes[0]);
  const [isGenerating, setIsGenerating] = useState(false);

  const addSku = (skuId: string) => {
    if (selectedSkus.find(s => s.skuId === skuId)) return;
    setSelectedSkus([...selectedSkus, { skuId, qty: 100 }]);
  };

  const removeSku = (skuId: string) => {
    setSelectedSkus(selectedSkus.filter(s => s.skuId !== skuId));
  };

  const updateQty = (skuId: string, qty: number) => {
    setSelectedSkus(selectedSkus.map(s => s.skuId === skuId ? { ...s, qty } : s));
  };

  const calculateUtilization = () => {
    let totalCbm = 0;
    let totalKg = 0;

    selectedSkus.forEach(item => {
      const sku = skus.find(s => s.id === item.skuId);
      if (sku) {
        const itemCbm = (sku.dimensions.l * sku.dimensions.w * sku.dimensions.h) / 1000000;
        totalCbm += itemCbm * item.qty;
        totalKg += sku.weight * item.qty;
      }
    });

    return {
      cbm: totalCbm,
      kg: totalKg,
      volPercent: (totalCbm / containerType.capacityCbm) * 100,
      weightPercent: (totalKg / containerType.maxWeightKg) * 100
    };
  };

  const stats = calculateUtilization();

  const handleGenerate = async () => {
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 1500));

    const newPr: PurchaseRequisition = {
      id: `PR-${Date.now().toString().slice(-6)}`,
      title: `Stock Replenishment - ${new Date().toLocaleDateString()}`,
      items: selectedSkus.map(item => {
        const sku = skus.find(s => s.id === item.skuId);
        return {
          skuId: item.skuId,
          model: sku?.model || 'Unknown',
          qty: item.qty,
          supplierId: sku?.supplierId || 'Unknown'
        };
      }),
      containerType: containerType.name,
      utilizationCbm: stats.volPercent,
      utilizationWeight: stats.weightPercent,
      status: 'DRAFT',
      createdAt: new Date().toISOString()
    };

    onGeneratePr(newPr);
    setIsGenerating(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Configuration */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800">Shipment Items Selection</h3>
            <div className="flex gap-2">
              <select 
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                onChange={(e) => addSku(e.target.value)}
                value=""
              >
                <option value="" disabled>Add SKU to PR...</option>
                {skus.filter(s => !s.isSlowMoving).map(s => (
                  <option key={s.id} value={s.id}>{s.model}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {selectedSkus.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl">
                <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Box className="text-slate-300" />
                </div>
                <p className="text-slate-400 font-medium">No items added to the planning list yet.</p>
                <p className="text-xs text-slate-400 mt-2 italic">Select from dropdown or use the Shopping Cart in Procurement Sheet.</p>
              </div>
            )}
            {selectedSkus.map(item => {
              const sku = skus.find(s => s.id === item.skuId);
              if (!sku) return null;
              return (
                <div key={item.skuId} className="flex items-center gap-4 p-4 border border-slate-100 rounded-xl hover:border-blue-100 hover:shadow-sm transition-all">
                  <div className="h-10 w-10 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                    <Box size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-800">{sku.model}</h4>
                    <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
                      Dim: {sku.dimensions.l}x{sku.dimensions.w}x{sku.dimensions.h}cm • {sku.weight}kg
                    </p>
                  </div>
                  <div className="w-32">
                    <div className="relative">
                      <input 
                        type="number" 
                        value={item.qty}
                        onChange={(e) => updateQty(item.skuId, parseInt(e.target.value) || 0)}
                        className="w-full text-right border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none pr-8"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">QTY</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => removeSku(item.skuId)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary & Analysis */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm sticky top-8">
          <div className="flex items-center gap-2 mb-6">
            <Calculator className="text-blue-500" />
            <h3 className="text-lg font-bold text-slate-800">Utilization Analysis</h3>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Container Type</label>
            <select 
              className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
              value={containerType.name}
              onChange={(e) => setContainerType(containerTypes.find(c => c.name === e.target.value)!)}
            >
              {containerTypes.map(c => (
                <option key={c.name} value={c.name}>{c.name} ({c.capacityCbm} CBM)</option>
              ))}
            </select>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">Volume (CBM)</span>
                <span className="text-sm font-bold text-slate-900">{stats.cbm.toFixed(1)} / {containerType.capacityCbm}</span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${stats.volPercent > 100 ? 'bg-red-500' : 'bg-blue-600'}`}
                  style={{ width: `${Math.min(stats.volPercent, 100)}%` }}
                />
              </div>
              <p className={`text-[10px] text-right mt-1 font-bold ${stats.volPercent > 100 ? 'text-red-500' : 'text-slate-500'}`}>
                {stats.volPercent.toFixed(1)}% Full
              </p>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">Weight (KG)</span>
                <span className="text-sm font-bold text-slate-900">{stats.kg.toLocaleString()} / {containerType.maxWeightKg}</span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${stats.weightPercent > 100 ? 'bg-red-500' : 'bg-green-600'}`}
                  style={{ width: `${Math.min(stats.weightPercent, 100)}%` }}
                />
              </div>
              <p className={`text-[10px] text-right mt-1 font-bold ${stats.weightPercent > 100 ? 'text-red-500' : 'text-slate-500'}`}>
                {stats.weightPercent.toFixed(1)}% Full
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <button 
              disabled={selectedSkus.length === 0 || isGenerating}
              onClick={handleGenerate}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all active:scale-95"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileDown size={20} />
                  Generate PR & Packing List
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContainerPlanner;
