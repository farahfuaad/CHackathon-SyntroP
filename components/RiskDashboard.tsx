
import React from 'react';
import { SKU } from '../types';
import { AlertTriangle, ShieldAlert, BarChart, History } from 'lucide-react';
import { BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  skus: SKU[];
}

const RiskDashboard: React.FC<Props> = ({ skus }) => {
  const chartData = skus.map(s => ({
    name: s.model,
    failureRate: s.failureRate * 100,
    defects: s.defectsCount
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Tracking (BR1) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <ShieldAlert className="text-red-500" />
            <h3 className="text-lg font-bold text-slate-800">Quality Tracking (BR1)</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ReBarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Failure %', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="failureRate" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.failureRate > 5 ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Slow Moving Identification (BR3) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <History className="text-amber-500" />
            <h3 className="text-lg font-bold text-slate-800">Inventory Velocity (BR3)</h3>
          </div>
          <div className="space-y-4">
            {skus.filter(s => s.isSlowMoving).map(s => (
              <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{s.model}</h4>
                  <p className="text-xs text-slate-500">Reason: {s.exclusionReason || 'Low demand'}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">Slow Moving</span>
                  <p className="text-[10px] text-slate-400 mt-1">Excluded from PR auto-creation</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Supplier Reliability (BR2) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
         <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="text-blue-500" />
            <h3 className="text-lg font-bold text-slate-800">Lead Time & Reliability Tracking (BR2)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skus.map(s => (
              <div key={s.id} className="p-4 border border-slate-100 rounded-xl">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-bold">{s.model}</span>
                  <span className="text-xs text-slate-500">{s.leadTimeDays}d lead time</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${s.supplierReliability > 0.8 ? 'bg-green-500' : 'bg-amber-500'}`} 
                    style={{ width: `${s.supplierReliability * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Reliability Score</span>
                  <span className="text-[10px] font-bold">{(s.supplierReliability * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
      </div>
    </div>
  );
};

export default RiskDashboard;
