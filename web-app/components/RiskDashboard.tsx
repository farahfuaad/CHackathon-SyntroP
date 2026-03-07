
import React, { useMemo, useState } from 'react';
import type { InventorySkuListing } from '../src/services/productDetailService';
import type { SupplierListing } from '../src/services/supplierService';
import type { ComplaintAggBySku } from '../src/services/complaintService';
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
  inventory: InventorySkuListing[];
  amsMap: Map<string, number>;
  complaintMap: Map<string, ComplaintAggBySku>;
  suppliers: SupplierListing[];
  loading: boolean;
  onNavigate?: (tab: string) => void;
}

const DASHBOARD_TOP_N = 5;
const LEAD_TIME_THRESHOLD_DAYS = 30;
const RELIABILITY_THRESHOLD = 0.9;

type SlowMovingItem = {
  skuId: string;
  model: string;
  ams: number;
  totalStock: number;
  stockMonths: number;
  reason: string;
};

const SLOW_MOVING_THRESHOLD_MONTHS = 6;

const RiskDashboard: React.FC<Props> = ({ inventory, amsMap, complaintMap, suppliers, loading, onNavigate }) => {
  const [selectedItem, setSelectedItem] = useState<SlowMovingItem | null>(null);

  // ── Derived data ──────────────────────────────────────────────────

  // Quality chart: failure rate relative to AMS, per SKU with complaints
  const chartData = useMemo(() => {
    const items: { name: string; failureRate: number; defects: number }[] = [];
    complaintMap.forEach((agg) => {
      const inv = inventory.find((i) => i.skuId === agg.skuId);
      const ams = amsMap.get(agg.skuId) ?? 0;
      const failureRate = ams > 0 ? (agg.totalFailures / (ams * 3)) * 100 : (agg.totalFailures > 0 ? 100 : 0);
      items.push({
        name: inv?.modelName || agg.skuId,
        failureRate: Math.min(failureRate, 100),
        defects: agg.totalFailures,
      });
    });
    return items.sort((a, b) => b.failureRate - a.failureRate).slice(0, DASHBOARD_TOP_N);
  }, [inventory, amsMap, complaintMap]);

  // Slow moving: stock months > threshold or zero AMS with stock on hand
  const slowMovingItems = useMemo(() => {
    const items: SlowMovingItem[] = [];
    inventory.forEach((row) => {
      const ams = amsMap.get(row.skuId) ?? 0;
      const stockMonths = ams > 0 ? row.totalStock / ams : (row.totalStock > 0 ? Infinity : 0);

      if (stockMonths > SLOW_MOVING_THRESHOLD_MONTHS) {
        items.push({
          skuId: row.skuId,
          model: row.modelName || row.skuId,
          ams,
          totalStock: row.totalStock,
          stockMonths: Number.isFinite(stockMonths) ? stockMonths : 999,
          reason: ams === 0 ? 'Zero sales (3m)' : `${stockMonths.toFixed(1)} months of stock`,
        });
      }
    });
    return items.sort((a, b) => b.stockMonths - a.stockMonths);
  }, [inventory, amsMap]);

  const slowMovingTop5 = slowMovingItems.slice(0, DASHBOARD_TOP_N);

  // Supplier lead time: link inventory SKUs to their supplier
  const supplierMap = useMemo(() => {
    const map = new Map<string, SupplierListing>();
    suppliers.forEach((s) => map.set(s.id, s));
    return map;
  }, [suppliers]);

  const leadTimeRows = useMemo(() => {
    return inventory
      .filter((row) => row.supplierId)
      .map((row) => {
        const sup = supplierMap.get(row.supplierId);
        const complaints = complaintMap.get(row.skuId);
        const ams = amsMap.get(row.skuId) ?? 0;
        // Reliability proxy: lower if many complaints relative to sales
        let reliability = 1;
        if (complaints && ams > 0) {
          reliability = Math.max(0, 1 - complaints.totalFailures / (ams * 3));
        } else if (complaints && complaints.totalFailures > 0) {
          reliability = Math.max(0, 1 - complaints.totalFailures / 100);
        }
        return {
          skuId: row.skuId,
          model: row.modelName || row.skuId,
          category: row.categoryLabel,
          leadTimeDays: sup?.leadTimeDays ?? 0,
          supplierName: sup?.name ?? 'Unknown',
          reliability,
        };
      })
      .filter((row) => row.reliability < RELIABILITY_THRESHOLD || row.leadTimeDays > LEAD_TIME_THRESHOLD_DAYS)
      .sort((a, b) => b.leadTimeDays - a.leadTimeDays)
      .slice(0, DASHBOARD_TOP_N);
  }, [inventory, supplierMap, complaintMap, amsMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
        <Loader2 size={20} className="animate-spin" /> Loading dashboard data…
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Tracking (BR1) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="bg-red-50 p-2 rounded-xl text-red-500">
              <ShieldAlert size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Top Quality Issues</h3>
          </div>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No complaint data available.</p>
          ) : (
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
          )}
        </div>

        {/* Slow Moving Identification */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="bg-amber-50 p-2 rounded-xl text-amber-500">
                <History size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Slow Moving Alerts</h3>
            </div>
            {slowMovingItems.length > 0 && (
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase">{slowMovingItems.length} Alert{slowMovingItems.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="space-y-3">
            {slowMovingTop5.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No slow-moving SKUs detected.</p>
            ) : (
              slowMovingTop5.map((item) => (
                <button 
                  key={item.skuId} 
                  onClick={() => setSelectedItem(item)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-300 hover:bg-white hover:shadow-md transition-all group"
                >
                  <div className="text-left">
                    <h4 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{item.model}</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Aging Status: {item.reason}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">STAGNANT</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              ))
            )}
            {slowMovingItems.length > DASHBOARD_TOP_N && (
              <button
                onClick={() => onNavigate?.('planning')}
                className="w-full text-center text-sm font-semibold text-blue-600 hover:text-blue-700 pt-2 transition-colors flex items-center justify-center gap-1"
              >
                View All <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Supplier Risk Alerts */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="bg-blue-50 p-2 rounded-xl text-blue-500">
              <Clock size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Supplier Risk Alerts</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-11">Suppliers with reliability &lt; 90% or lead time &gt; {LEAD_TIME_THRESHOLD_DAYS} days.</p>
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
              {leadTimeRows.length === 0 && (
                <tr><td colSpan={4} className="px-8 py-8 text-sm text-slate-400 text-center">No supplier risk alerts.</td></tr>
              )}
              {leadTimeRows.map((row) => (
                <tr key={row.skuId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                        <PackageSearch size={16} />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-slate-900 block">{row.model}</span>
                        <span className="text-[10px] text-slate-400">{row.skuId}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg uppercase">{row.category}</span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="text-sm font-bold text-blue-600">{row.leadTimeDays} Days</span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 ${row.reliability > 0.8 ? 'bg-green-500' : 'bg-amber-500'}`} 
                          style={{ width: `${row.reliability * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-12 text-right">{(row.reliability * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Action Overlay (Drawer) */}
      {selectedItem && (
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
                onClick={() => setSelectedItem(null)}
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
                    <p className="font-bold text-slate-900">{selectedItem.model}</p>
                    <p className="text-xs text-slate-500">{selectedItem.skuId}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">AMS (Last 3m)</p>
                    <p className="font-bold text-slate-900">{selectedItem.ams.toFixed(1)} Units</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Total Stock: {selectedItem.totalStock}</p>
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
                  This SKU has effectively <strong>{Number.isFinite(selectedItem.stockMonths) ? selectedItem.stockMonths.toFixed(0) : '∞'} months</strong> of stock in hand. 
                  Immediate liquidation is required to free up warehouse slotting.
                </p>
              </section>
            </div>

            {/* Commit to Action */}
            <div className="p-8 bg-slate-50 border-t border-slate-200 flex gap-4">
              <button 
                className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                onClick={() => {
                   setSelectedItem(null);
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
