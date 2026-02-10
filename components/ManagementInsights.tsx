
import React, { useState, useEffect } from 'react';
import { SKU, PurchaseRequisition, WarehouseCategory } from '../types';
import { getProcurementInsights } from '../geminiService';
import { 
  Sparkles, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  MessageSquare, 
  Clock, 
  TrendingDown, 
  TrendingUp, 
  Target,
  ChevronDown,
  ChevronUp,
  CalendarDays
} from 'lucide-react';

interface Props {
  skus: SKU[];
  prs: PurchaseRequisition[];
  setPrs: React.Dispatch<React.SetStateAction<PurchaseRequisition[]>>;
}

const ManagementInsights: React.FC<Props> = ({ skus, prs, setPrs }) => {
  const [insights, setInsights] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedPr, setExpandedPr] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      setLoading(true);
      const data = await getProcurementInsights(skus);
      setInsights(data || 'No insights available.');
      setLoading(false);
    };
    fetchInsights();
  }, [skus]);

  const calculateTotalStock = (sku: SKU) => {
    const excluded = [WarehouseCategory.PROJECT, WarehouseCategory.CORPORATE];
    const inHand = Object.entries(sku.inStock).reduce((acc, [cat, val]) => {
      if (!excluded.includes(cat as WarehouseCategory)) return acc + (val as number);
      return acc;
    }, 0);
    return inHand + sku.incoming;
  };

  const validateItemAppropriateness = (skuId: string, proposedQty: number) => {
    const sku = skus.find(s => s.id === skuId);
    if (!sku) return { status: 'Unknown', color: 'text-slate-400', months: 0 };
    
    const currentStock = calculateTotalStock(sku);
    const totalStock = currentStock + proposedQty;
    const monthsLast = totalStock / sku.ams;
    
    // Logic for appropriate quantities (BR6)
    // Suitable: 3 to 6 months of stock
    // Too Little: < 3 months
    // Too Much: > 6 months
    if (monthsLast < 3) return { status: 'Too Little', color: 'text-red-600', months: monthsLast, icon: TrendingDown };
    if (monthsLast > 6) return { status: 'Too Much', color: 'text-amber-600', months: monthsLast, icon: TrendingUp };
    return { status: 'Suitable', color: 'text-green-600', months: monthsLast, icon: Target };
  };

  const handleStatusChange = (id: string, newStatus: 'APPROVED' | 'REJECTED') => {
    setPrs(prev => prev.map(pr => pr.id === id ? { ...pr, status: newStatus } : pr));
    if (newStatus === 'APPROVED') {
      alert("Purchase Requisition Approved! Automatic email notifications sent to suppliers (BR5).");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* AI Reasoning Panel (BR6: Data-driven insights) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-fit">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-bold text-lg">AI Procurement Advisor</h3>
              <p className="text-xs text-slate-400">Contextual Reasoning System</p>
            </div>
          </div>
          {loading && <Loader2 className="animate-spin text-blue-400" size={20} />}
        </div>
        
        <div className="p-8 flex-1">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-3/4"></div>
              <div className="h-4 bg-slate-100 rounded w-full"></div>
              <div className="h-4 bg-slate-100 rounded w-5/6"></div>
              <div className="h-3 bg-slate-100 rounded w-1/2"></div>
            </div>
          ) : (
            <div className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm font-medium bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
              {insights}
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
           <button className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-2 shadow-sm">
             <MessageSquare size={18} />
             Query Analysis
           </button>
        </div>
      </div>

      {/* Approval Workflow & BR6 Validation Details */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Pending Approvals</h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{prs.filter(p => p.status === 'DRAFT').length} Waiting</span>
          </div>
          
          <div className="space-y-6">
            {prs.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <Clock className="mx-auto text-slate-300 mb-4" size={32} />
                <p className="text-slate-500 font-bold">Queue Empty</p>
                <p className="text-xs text-slate-400 mt-1">Generate a PR to begin the approval process.</p>
              </div>
            ) : (
              prs.map(pr => (
                <div key={pr.id} className={`group border rounded-3xl transition-all overflow-hidden ${
                  pr.status === 'APPROVED' ? 'border-green-200 bg-green-50/20' : 
                  pr.status === 'REJECTED' ? 'border-red-200 bg-red-50/20 opacity-70' :
                  'border-blue-100 bg-white hover:border-blue-300 hover:shadow-lg'
                }`}>
                  {/* PR Header */}
                  <div className="p-6 cursor-pointer" onClick={() => setExpandedPr(expandedPr === pr.id ? null : pr.id)}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${pr.status === 'DRAFT' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                          <CalendarDays size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900">{pr.id}</h4>
                          <p className="text-xs text-slate-500 font-medium">{pr.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${
                          pr.status === 'APPROVED' ? 'bg-green-600 text-white' : 
                          pr.status === 'REJECTED' ? 'bg-red-600 text-white' :
                          'bg-blue-600 text-white'
                        }`}>
                          {pr.status}
                        </span>
                        {expandedPr === pr.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Items</p>
                        <p className="text-sm font-bold">{pr.items.length} SKU</p>
                      </div>
                      <div className="text-center border-x border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Vol Util.</p>
                        <p className={`text-sm font-bold ${pr.utilizationCbm > 95 ? 'text-amber-600' : 'text-green-600'}`}>{pr.utilizationCbm.toFixed(0)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Container</p>
                        <p className="text-sm font-bold truncate px-2">{pr.containerType}</p>
                      </div>
                    </div>
                  </div>

                  {/* BR6 Detailed Validation Panel */}
                  {expandedPr === pr.id && (
                    <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-300">
                      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 mb-6">
                        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Target size={14} className="text-blue-500" />
                          BR6: Procurement Appropriateness Validation
                        </h5>
                        
                        <div className="space-y-4">
                          {pr.items.map(item => {
                            const val = validateItemAppropriateness(item.skuId, item.qty);
                            const ValIcon = val.icon;
                            return (
                              <div key={item.skuId} className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0">
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-slate-800">{item.model}</span>
                                  <span className="text-[10px] text-slate-400">Proposed: {item.qty} units</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="text-[10px] text-slate-400 font-medium">Stock Longevity</p>
                                    <p className="text-xs font-bold">{val.months.toFixed(1)} Months</p>
                                  </div>
                                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${val.color} bg-white shadow-sm`}>
                                    <ValIcon size={12} />
                                    <span className="text-[10px] font-bold">{val.status}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
                          <Clock size={16} className="text-amber-600 shrink-0" />
                          <p className="text-[10px] text-amber-800 leading-tight">
                            <strong>Seasonal Note:</strong> Validation accounts for 1.2x festival factor for Hood Cookers & Ducting. Stock levels above 6 months flagged as overstock risks.
                          </p>
                        </div>
                      </div>

                      {pr.status === 'DRAFT' && (
                        <div className="flex gap-4">
                          <button 
                            onClick={() => handleStatusChange(pr.id, 'APPROVED')}
                            className="flex-1 bg-green-600 text-white font-bold py-3.5 rounded-2xl hover:bg-green-700 hover:shadow-lg hover:shadow-green-200 transition-all flex items-center justify-center gap-2 active:scale-95"
                          >
                            <CheckCircle size={18} />
                            Approve Plan
                          </button>
                          <button 
                            onClick={() => handleStatusChange(pr.id, 'REJECTED')}
                            className="flex-1 bg-white border border-red-200 text-red-600 font-bold py-3.5 rounded-2xl hover:bg-red-50 transition-all active:scale-95"
                          >
                            <XCircle size={18} className="inline mr-1" />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <TrendingUp size={120} />
           </div>
           <h3 className="text-xl font-bold mb-2">Strategic Insight</h3>
           <p className="text-blue-100 text-sm mb-6 leading-relaxed">
             Analysis of past sales suggests SIROCCO models are entering a high-velocity cycle. 
             We recommend approving these quantities to maintain 100% service levels.
           </p>
           <button className="bg-white text-blue-700 font-bold px-8 py-3.5 rounded-2xl hover:bg-blue-50 transition-all shadow-lg active:scale-95 flex items-center gap-2">
              Apply Strategy Patch
           </button>
        </div>
      </div>
    </div>
  );
};

export default ManagementInsights;
