import React, { useState } from 'react';
import { SKU, PurchaseRequisition, Supplier } from '../types';
import { MOCK_SUPPLIERS } from '../constants';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Mail,
  Download,
  FileText,
  UserCheck,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface Props {
  skus: SKU[];
  prs: PurchaseRequisition[];
  setPrs: React.Dispatch<React.SetStateAction<PurchaseRequisition[]>>;
  buParams: any;
}

const ManagementInsights: React.FC<Props> = ({ skus, prs, setPrs }) => {
  const [expandedPr, setExpandedPr] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionLabel, setActionLabel] = useState<string>('');

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    setActionLabel('Approving & Notifying...');
    
    // BR 2: Simulate sending email to Approvers and Suppliers
    await new Promise(r => setTimeout(r, 1200));
    console.log(`Email sent to Approvers and Suppliers for PR ${id}`);
    
    setPrs(prev => prev.map(p => p.id === id ? { 
      ...p, 
      status: 'APPROVED', 
      emailSentAt: new Date().toISOString() 
    } : p));
    
    setProcessingId(null);
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    setActionLabel('Rejecting & Notifying Procurement...');
    
    // BR 2: Simulate sending email to Procurement Team
    await new Promise(r => setTimeout(r, 1000));
    console.log(`Email sent to Procurement Team for rejection of PR ${id}`);

    setPrs(prev => prev.map(p => p.id === id ? { 
      ...p, 
      status: 'REJECTED'
    } : p));
    
    setProcessingId(null);
  };

  const downloadPackingList = (pr: PurchaseRequisition, supplierId: string) => {
    const supplier = MOCK_SUPPLIERS.find(s => s.id === supplierId);
    const supplierItems = pr.items.filter(i => i.supplierId === supplierId);
    
    const content = `
APPROVED PACKING LIST - FIAMMA GROUP
------------------------------------
PR ID: ${pr.id}
Date: ${new Date().toLocaleDateString()}
Supplier: ${supplier?.name} (${supplier?.email})
Container Type: ${pr.containerType}

ITEMS:
${supplierItems.map(i => `- ${i.model} (${i.skuId}): ${i.qty} units`).join('\n')}

Utilization: Vol ${pr.utilizationCbm.toFixed(1)}%, Weight ${pr.utilizationWeight.toFixed(1)}%
------------------------------------
STATUS: SYSTEM APPROVED
    `;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pr.id}_PackingList_${supplier?.name.replace(/\s+/g, '_')}.txt`;
    a.click();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-100">
              <UserCheck size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">Queue and Approvals</h3>
              <p className="text-sm text-slate-500 font-medium">Manage and process pending purchase requisitions</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="block text-xs font-bold text-slate-400 uppercase">Queue Status</span>
              <span className="text-sm font-bold text-blue-600">{prs.filter(p => p.status === 'DRAFT').length} Pending Requests</span>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          {prs.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <Clock className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500 font-bold text-lg">Requisition Queue Empty</p>
              <p className="text-slate-400 text-sm mt-1">New container plans will appear here for review.</p>
            </div>
          ) : (
            prs.map(pr => (
              <div key={pr.id} className={`group border rounded-3xl transition-all overflow-hidden ${
                pr.status === 'APPROVED' ? 'border-green-200 bg-green-50/10' : 
                pr.status === 'REJECTED' ? 'border-red-200 bg-red-50/30' :
                'border-slate-100 bg-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5'
              }`}>
                <div 
                  className="p-6 cursor-pointer flex items-center justify-between" 
                  onClick={() => setExpandedPr(expandedPr === pr.id ? null : pr.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${
                      pr.status === 'APPROVED' ? 'bg-green-100 text-green-600' : 
                      pr.status === 'REJECTED' ? 'bg-red-100 text-red-600' :
                      'bg-blue-50 text-blue-600'
                    }`}>
                      <CalendarDays size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-lg">{pr.id}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
                          pr.status === 'APPROVED' ? 'bg-green-600 text-white' : 
                          pr.status === 'REJECTED' ? 'bg-red-600 text-white' :
                          'bg-blue-600 text-white shadow-lg shadow-blue-100'
                        }`}>
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
                            <div key={idx} className="flex justify-between items-center bg-slate-50/50 p-3 rounded-xl border border-slate-100">
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
                          {pr.status === 'DRAFT' && processingId !== pr.id && (
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
                              <p className="text-slate-400 text-[10px] uppercase tracking-widest">Simulating Email Protocol...</p>
                            </div>
                          ) : pr.status === 'DRAFT' ? (
                            <div className="space-y-3">
                              <button 
                                onClick={() => handleApprove(pr.id)}
                                className="w-full bg-green-600 text-white font-bold py-4 rounded-2xl hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-200 active:scale-95"
                              >
                                <CheckCircle size={18} />
                                Approve and Email
                              </button>
                              <button 
                                onClick={() => handleReject(pr.id)}
                                className="w-full bg-white border border-red-200 text-red-600 font-bold py-4 rounded-2xl hover:bg-red-50 transition-all flex items-center justify-center gap-2 active:scale-95"
                              >
                                <XCircle size={18} />
                                Reject
                              </button>
                            </div>
                          ) : pr.status === 'APPROVED' ? (
                            <div className="space-y-4">
                              <div className="bg-green-50 border border-green-100 rounded-2xl p-5 flex items-start gap-4">
                                <div className="bg-green-100 p-2 rounded-xl text-green-600">
                                  <Mail size={20} />
                                </div>
                                <div>
                                  <h5 className="font-bold text-green-900 text-sm">Notifications Sent</h5>
                                  <p className="text-[10px] text-green-700 font-medium">Email dispatched to Approvers & Suppliers on {new Date(pr.emailSentAt || '').toLocaleString()}.</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-3">
                                {Array.from(new Set(pr.items.map(i => i.supplierId))).map(sId => {
                                  const supplier = MOCK_SUPPLIERS.find(s => s.id === sId);
                                  return (
                                    <button 
                                      key={sId}
                                      onClick={() => downloadPackingList(pr, sId)}
                                      className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-400 group transition-all"
                                    >
                                      <div className="flex items-center gap-3">
                                        <FileText size={18} className="text-slate-400 group-hover:text-blue-500" />
                                        <div className="text-left">
                                          <p className="text-[10px] font-bold text-slate-900">{supplier?.name}</p>
                                          <p className="text-[9px] text-slate-500 uppercase tracking-tight">Download Packing List</p>
                                        </div>
                                      </div>
                                      <Download size={14} className="text-slate-300 group-hover:text-blue-500" />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col items-center text-center">
                              <XCircle className="text-red-500 mb-2" size={32} />
                              <h5 className="font-bold text-red-900">Request Rejected</h5>
                              <p className="text-xs text-red-700 mt-2">Notification has been sent to the Procurement Team for revisions.</p>
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
      
      <div className="bg-slate-900 p-6 rounded-3xl text-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-xl">
            <CheckCircle size={20} />
          </div>
          <div>
            <h4 className="font-bold text-sm">Approver Accountability</h4>
            <p className="text-xs text-slate-400">All actions are logged and synchronized with the supplier communication API.</p>
          </div>
        </div>
        <div className="hidden md:flex gap-2">
           <span className="text-[9px] font-bold border border-slate-700 px-2 py-1 rounded uppercase tracking-widest text-slate-500">System Log: Active</span>
        </div>
      </div>
    </div>
  );
};

export default ManagementInsights;