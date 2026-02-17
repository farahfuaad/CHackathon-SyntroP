
import React, { useState } from 'react';
import { SKU } from '../types';
import { 
  ShieldAlert, 
  History, 
  ChevronRight, 
  X, 
  Sparkles, 
  TrendingDown, 
  PackageSearch,
  ArrowRightCircle,
  AlertCircle,
  Loader2,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  skus: SKU[];
}

const RiskDashboard: React.FC<Props> = ({ skus }) => {
  const [selectedSku, setSelectedSku] = useState<SKU | null>(null);
  const [aiAction, setAiAction] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState(false);

  const chartData = skus.map(s => ({
    name: s.model,
    failureRate: s.failureRate * 100,
    defects: s.defectsCount
  }));

  const handleItemClick = async (sku: SKU) => {
    setSelectedSku(sku);
    setLoadingAction(true);
    setAiAction(`Recommendation for SKU ${sku.model}: Consider reducing inventory levels and reviewing supplier performance.`);
    setLoadingAction(false);
  };

  return (
    <div className="space-y-6 relative">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Tracking (BR1) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="bg-red-50 p-2 rounded-xl text-red-500">
              <ShieldAlert size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Quality Tracking</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ReBarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Failure %', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="failureRate" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.failureRate > 5 ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Slow Moving Identification */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="bg-amber-50 p-2 rounded-xl text-amber-500">
                <History size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Slow Moving Analysis</h3>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase">Action Required</span>
          </div>
          <div className="space-y-3">
            {skus.filter(s => s.isSlowMoving).map(s => (
              <button 
                key={s.id} 
                onClick={() => handleItemClick(s)}
                className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-300 hover:bg-white hover:shadow-md transition-all group"
              >
                <div className="text-left">
                  <h4 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{s.model}</h4>
                  <p className="text-[10px] text-slate-500 font-medium">Aging Status: {s.exclusionReason || 'Low demand'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">STAGNANT</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Supplier Reliability (BR2) - Table Format */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="bg-blue-50 p-2 rounded-xl text-blue-500">
              <Clock size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Lead Time & Reliability</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-11">Precise reorder timing and safety stock depth mapping for each model.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model Information</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Category</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Lead Time</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reliability Index</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {skus.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                        <PackageSearch size={16} />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-slate-900 block">{s.model}</span>
                        <span className="text-[10px] text-slate-400">{s.id}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg uppercase">{s.category}</span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="text-sm font-bold text-blue-600">{s.leadTimeDays} Days</span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 ${s.supplierReliability > 0.8 ? 'bg-green-500' : 'bg-amber-500'}`} 
                          style={{ width: `${s.supplierReliability * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-12 text-right">{(s.supplierReliability * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Action Overlay (Drawer) */}
      {selectedSku && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end animate-in fade-in duration-300">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            {/* Drawer Header */}
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 p-2.5 rounded-xl text-white shadow-lg shadow-amber-200">
                  <TrendingDown size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Slow-Moving Action Plan</h3>
                  <p className="text-sm text-slate-500">Inventory Remediation Strategy</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedSku(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={24} className="text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* SKU Breakdown */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <PackageSearch size={18} className="text-blue-500" />
                  <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Item Profile</h4>
                </div>
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Model / SKU</p>
                    <p className="font-bold text-slate-900">{selectedSku.model}</p>
                    <p className="text-xs text-slate-500">{selectedSku.id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">AMS (Last 3m)</p>
                    <p className="font-bold text-slate-900">{selectedSku.ams} Units</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Stock Locations (Total: {Object.values(selectedSku.inStock).reduce((a, b) => a + (b as number), 0)})</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedSku.inStock).map(([cat, val]) => (
                        val > 0 && (
                          <span key={cat} className="text-[10px] font-bold bg-white border border-slate-200 px-2 py-1 rounded-lg">
                            {cat}: {val}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Reasoning */}
              <section className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={18} className="text-blue-600" />
                  <h4 className="font-bold text-blue-900 text-sm">Action Requirement Analysis</h4>
                </div>
                <p className="text-sm text-blue-800 leading-relaxed font-medium">
                  This SKU has effectively <strong>{((Object.values(selectedSku.inStock).reduce((a, b) => a + (b as number), 0)) / (selectedSku.ams || 1)).toFixed(0)} months</strong> of stock in hand. 
                  Immediate liquidation is required to free up warehouse slotting.
                </p>
              </section>
            </div>

            {/* Commit to Action */}
            <div className="p-8 bg-slate-50 border-t border-slate-200 flex gap-4">
              <button 
                className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                onClick={() => {
                   alert(`Inventory action for ${selectedSku.model} has been recorded.`);
                   setSelectedSku(null);
                }}
              >
                <ArrowRightCircle size={20} />
                Initiate Movement Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskDashboard;
