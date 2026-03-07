import React, { useState, useEffect } from 'react';
import { SKU, PurchaseRequisition } from '../types';
import { MOCK_SUPPLIERS } from '../constants';
import { fetchPrWithLines, updatePr } from '../src/services/prService';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Download,
  FileText,
  UserCheck,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface Props {
  skus: SKU[];
  buParams: any;
}

const QueueApprovals: React.FC<Props> = ({ skus: _skus, buParams: _buParams }) => {
  const [prs, setPrs] = useState<PurchaseRequisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedPr, setExpandedPr] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionLabel, setActionLabel] = useState<string>('');
  const [selectedHistoryPr, setSelectedHistoryPr] = useState<PurchaseRequisition | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadQueue = async () => {
      try {
        setIsLoading(true);
        setFetchError(null);

        const data = await fetchPrWithLines();
        if (!mounted) return;

        const safeData = Array.isArray(data) ? (data as PurchaseRequisition[]) : [];
        setPrs(safeData);
      } catch (err) {
        console.error('Failed to fetch PR queue:', err);
        if (mounted) setFetchError('Failed to load purchase requisitions. Please refresh and try again.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadQueue();

    return () => {
      mounted = false;
    };
  }, []);

  const pendingPrs = prs.filter(p => p.status === 'PENDING');
  const historyPrs = prs.filter(p => p.status === 'APPROVED' || p.status === 'REJECTED');

  const handleApprove = async (id: string) => {
    if (processingId) return;

    setProcessingId(id);
    setActionLabel('Approving & Notifying...');

    const now = new Date().toISOString();
    
    try {
      await updatePr(id, {
        status: "APPROVED",
        emailSentAt: now,
        updatedOn: now,
      });

      console.log(`Email sent to Approvers and Suppliers for PR ${id}`);
      
      setPrs(prev => prev.map(p => p.id === id ? { 
        ...p, 
        status: 'APPROVED' as const, 
        emailSentAt: now,
        updatedOn: now,
      } : p));
    } catch (err) {
      console.error("Failed to approve PR:", err);
      alert("Failed to approve PR. Please try again.");
    } finally {
      setProcessingId(null);
      setExpandedPr(null);
      setActionLabel('');
    }
  };

  const handleReject = async (id: string) => {
    if (processingId) return;

    setProcessingId(id);
    setActionLabel('Rejecting & Notifying Procurement...');

    const now = new Date().toISOString();
    
    try {
      await updatePr(id, {
        status: "REJECTED",
        updatedOn: now,
      });

      console.log(`Email sent to Procurement Team for rejection of PR ${id}`);

      setPrs(prev => prev.map(p => p.id === id ? { 
        ...p, 
        status: 'REJECTED' as const,
        updatedOn: now,
      } : p));
    } catch (err) {
      console.error("Failed to reject PR:", err);
      alert("Failed to reject PR. Please try again.");
    } finally {
      setProcessingId(null);
      setExpandedPr(null);
      setActionLabel('');
    }
  };

  const downloadPackingList = (pr: PurchaseRequisition, supplierId: string) => {
    const supplier = MOCK_SUPPLIERS.find(s => s.id === supplierId);
    const supplierItems = pr.items.filter(i => i.supplierId === supplierId);

    if (supplierItems.length === 0) {
      alert('No line items found for this supplier.');
      return;
    }

    const supplierName = supplier?.name ?? `Supplier_${supplierId}`;
    const supplierEmail = supplier?.email ?? 'N/A';
    
    const content = `
APPROVED PACKING LIST - FIAMMA GROUP
------------------------------------
PR ID: ${pr.id}
Date: ${new Date().toLocaleDateString()}
Supplier: ${supplierName} (${supplierEmail})
Container Type: ${pr.containerType}

ITEMS:
${supplierItems.map(i => `- ${i.model} (${i.skuId}): ${i.qty} units`).join('\n')}

Utilization: Vol ${pr.utilizationCbm.toFixed(1)}%, Weight ${pr.utilizationWeight.toFixed(1)}%
------------------------------------
STATUS: SYSTEM APPROVED
    `.trim();
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = supplierName.replace(/[^\w.-]+/g, '_');

    a.href = url;
    a.download = `${pr.id}_PackingList_${safeName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Pending Queue Section */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-100">
              <UserCheck size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">Queue and Approvals </h3>
              <p className="text-sm text-slate-500 font-medium">Manage and process pending purchase requisitions</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="block text-xs font-bold text-slate-400 uppercase">Queue Status</span>
              <span className="text-sm font-bold text-blue-600">{pendingPrs.length} Pending Requests</span>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="mb-4 bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-600 mt-0.5" />
            <p className="text-xs text-red-800">{fetchError}</p>
          </div>
        )}
        
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <Loader2 className="mx-auto text-blue-500 mb-4 animate-spin" size={48} />
              <p className="text-slate-500 font-bold text-lg">Loading PR Queue...</p>
              <p className="text-slate-400 text-sm mt-1">Fetching purchase requisitions from database.</p>
            </div>
          ) : pendingPrs.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <Clock className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500 font-bold text-lg">Requisition Queue Empty</p>
              <p className="text-slate-400 text-sm mt-1">New container plans will appear here for review.</p>
            </div>
          ) : (
            pendingPrs.map(pr => (
              <div key={pr.id} className="group border rounded-3xl transition-all overflow-hidden border-slate-100 bg-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5">
                <div 
                  className="p-6 cursor-pointer flex items-center justify-between" 
                  onClick={() => setExpandedPr(expandedPr === pr.id ? null : pr.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
                      <CalendarDays size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-lg">{pr.id}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest bg-blue-600 text-white shadow-lg shadow-blue-100">
                          {pr.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">{pr.title}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Utilization</p>
                      <p className="text-sm font-bold text-slate-700">{pr.utilizationCbm.toFixed(0)}% CBM</p>
                    </div>
                    {expandedPr === pr.id ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                  </div>
                </div>

                {expandedPr === pr.id && (
                  <div className="px-6 pb-8 animate-in slide-in-from-top-4 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6 border-t border-slate-50">
                      <div>
                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Line Items Breakdown</h5>
                        <div className="space-y-3">
                          {pr.items.map((item, idx) => (
                            <div key={`${item.skuId}-${idx}`} className="flex justify-between items-center bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                              <div>
                                <p className="text-sm font-bold text-slate-800">{item.model}</p>
                                <p className="text-[10px] text-slate-500">{item.skuId}</p>
                              </div>
                              <span className="font-bold text-blue-600 text-sm">{item.qty} units</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col justify-between">
                        <div>
                          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Action Summary</h5>
                          {processingId !== pr.id && (
                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6">
                              <div className="flex items-start gap-3">
                                <AlertCircle size={18} className="text-blue-600 mt-0.5" />
                                <p className="text-xs text-blue-800 leading-relaxed">
                                  Review the container utilization and line items before processing. 
                                  Approved requests will be dispatched to suppliers immediately.
                                </p>
                              </div>
                            </div>
                          )}

                          {processingId === pr.id ? (
                            <div className="bg-slate-900 text-white rounded-2xl p-8 flex flex-col items-center text-center">
                              <Loader2 className="animate-spin mb-4" size={32} />
                              <h4 className="font-bold mb-1">{actionLabel}</h4>
                              <p className="text-slate-400 text-[10px] uppercase tracking-widest">Processing Request...</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <button 
                                type="button"
                                disabled={!!processingId}
                                onClick={() => handleApprove(pr.id)}
                                className="w-full bg-green-600 text-white font-bold py-4 rounded-2xl hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-200 active:scale-95"
                              >
                                <CheckCircle size={18} />
                                Approve and Email 
                              </button>
                              <button 
                                type="button"
                                disabled={!!processingId}
                                onClick={() => handleReject(pr.id)}
                                className="w-full bg-white border border-red-200 text-red-600 font-bold py-4 rounded-2xl hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95"
                              >
                                <XCircle size={18} />
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* History Section */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-slate-100 p-3 rounded-2xl text-slate-600">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800 tracking-tight">Approval History</h3>
            <p className="text-sm text-slate-500 font-medium">Log of processed purchase requisitions</p>
          </div>
        </div>

        {historyPrs.length === 0 ? (
          <div className="text-center py-12 bg-slate-50/50 rounded-3xl border border-slate-100">
            <p className="text-slate-400 text-sm font-medium">No history available yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead>
                <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                  <th className="px-6 py-3">PR ID</th>
                  <th className="px-6 py-3">Title</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Utilization</th>
                  <th className="px-6 py-3">Processed Date</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyPrs.map(pr => (
                  <tr 
                    key={pr.id} 
                    className="group bg-white hover:bg-slate-50 transition-all cursor-pointer"
                    onClick={() => setSelectedHistoryPr(pr)}
                  >
                    <td className="px-6 py-4 border-y border-l border-slate-100 rounded-l-2xl font-bold text-slate-900">{pr.id}</td>
                    <td className="px-6 py-4 border-y border-slate-100 text-sm text-slate-600">{pr.title}</td>
                    <td className="px-6 py-4 border-y border-slate-100">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest ${
                        pr.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {pr.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 border-y border-slate-100 text-sm font-bold text-slate-700">{pr.utilizationCbm.toFixed(0)}%</td>
                    <td className="px-6 py-4 border-y border-slate-100 text-xs text-slate-500">
                      {(pr.updatedOn || pr.emailSentAt) ? new Date(pr.updatedOn || pr.emailSentAt as string).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 border-y border-r border-slate-100 rounded-r-2xl text-right">
                      <button type="button" className="text-blue-600 font-bold text-xs hover:underline">View Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History Details Modal */}
      {selectedHistoryPr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl ${
                  selectedHistoryPr.status === 'APPROVED' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                }`}>
                  <FileText size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{selectedHistoryPr.id} Details</h4>
                  <p className="text-xs text-slate-500">{selectedHistoryPr.title}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedHistoryPr(null)}
                className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              >
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-widest ${
                    selectedHistoryPr.status === 'APPROVED' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  }`}>
                    {selectedHistoryPr.status}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Utilization</p>
                  <p className="font-bold text-slate-800">{selectedHistoryPr.utilizationCbm.toFixed(1)}% CBM / {selectedHistoryPr.utilizationWeight.toFixed(1)}% Weight</p>
                </div>
              </div>

              <div>
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Line Items</h5>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {selectedHistoryPr.items.map((item, idx) => (
                    <div key={`${item.skuId}-${idx}`} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{item.model}</p>
                        <p className="text-[10px] text-slate-500">{item.skuId}</p>
                      </div>
                      <span className="font-bold text-slate-700 text-sm">{item.qty} units</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedHistoryPr.status === 'APPROVED' && (
                <div className="space-y-4">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Supplier Documents</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Array.from(
                      new Set(
                        selectedHistoryPr.items
                          .map(i => i.supplierId)
                          .filter((v): v is string => !!v)
                      )
                    ).map((sId) => {
                      const supplier = MOCK_SUPPLIERS.find(s => s.id === sId);
                      return (
                        <button 
                          type="button"
                          key={sId}
                          onClick={() => downloadPackingList(selectedHistoryPr, sId)}
                          className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-400 group transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <FileText size={18} className="text-slate-400 group-hover:text-blue-500" />
                            <div className="text-left">
                              <p className="text-[10px] font-bold text-slate-900">{supplier?.name ?? `Supplier ${sId}`}</p>
                              <p className="text-[9px] text-slate-500 uppercase tracking-tight">Packing List</p>
                            </div>
                          </div>
                          <Download size={14} className="text-slate-300 group-hover:text-blue-500" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedHistoryPr.status === 'REJECTED' && (
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex items-start gap-3">
                  <AlertCircle size={18} className="text-red-600 mt-0.5" />
                  <p className="text-xs text-red-800">This request was rejected and returned to procurement for adjustment. No documents were generated.</p>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                type="button"
                onClick={() => setSelectedHistoryPr(null)}
                className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueApprovals;