import React, { useState } from "react";
import { createPrWithLines, saveDraftPr } from "../src/services/prService";
import { fetchContainerReference } from "../src/services/containerService";
import { SKU, ContainerType, PurchaseRequisition, PlanningDraft } from '../types';
import { Box, Calculator, FileDown, Trash2, Loader2, Save, History, ChevronRight, Container } from 'lucide-react';

interface Props {
  skus: SKU[];
  containerTypes: ContainerType[];
  selectedSkus: { skuId: string, qty: number }[];
  setSelectedSkus: React.Dispatch<React.SetStateAction<{ skuId: string, qty: number }[]>>;
  planningTitle: string;
  setPlanningTitle: (title: string) => void;
  currentDraftId: string | null;
  setCurrentDraftId: (id: string | null) => void;
  selectedContainerName: string;
  setSelectedContainerName: (name: string) => void;
  drafts: PlanningDraft[];
  onSaveDraft: (draft: PlanningDraft) => void;
  onLoadDraft: (draft: PlanningDraft) => void;
  onGeneratePr: (pr: PurchaseRequisition) => void;
}

const ContainerPlanner: React.FC<Props> = ({
  skus,
  containerTypes,
  selectedSkus,
  setSelectedSkus,
  planningTitle,
  setPlanningTitle,
  currentDraftId,
  setCurrentDraftId,
  selectedContainerName,
  setSelectedContainerName,
  drafts,
  onSaveDraft,
  onLoadDraft,
  onGeneratePr
}) => {
  const containerType = containerTypes.find(c => c.name === selectedContainerName) || containerTypes[0];
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPr, setIsSavingPr] = useState(false);

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

  function normalizeContainerKey(v: string): string {
    return (v || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, "")      // remove "(33.1 CBM)"
      .replace(/[^a-z0-9]/g, "");   // remove spaces/_/-
  }

  const resolveContainerId = async (): Promise<number> => {
    const selected = containerTypes.find((c) => c.name === selectedContainerName) as (ContainerType & { id?: number }) | undefined;
    const localId = Number(selected?.id);
    if (Number.isFinite(localId) && localId > 0) return localId;

    const refs = await fetchContainerReference();
    const selectedKey = normalizeContainerKey(selectedContainerName);

    // 1) match by normalized name
    let hit = refs.find((r) => normalizeContainerKey(r.name) === selectedKey);

    // 2) fallback: match by capacity/weight if name differs
    if (!hit && selected) {
      hit = refs.find(
        (r) =>
          Number(r.capacityCbm) === Number(selected.capacityCbm) &&
          Number(r.maxWeightKg) === Number(selected.maxWeightKg)
      );
    }

    if (hit?.id) return hit.id;
    throw new Error(`Selected container is not mapped in DB: "${selectedContainerName}"`);
  };

  const handleSaveDraft = async () => {
    const validSelections = selectedSkus.filter((x) => x?.skuId?.trim() && Number(x.qty) > 0);
    if (!validSelections.length) {
      alert("Please add at least one SKU with qty > 0 before saving draft.");
      return;
    }

    setIsSaving(true);
    const draftId = currentDraftId || `PR-${Date.now().toString().slice(-10)}`;

    try {
      const containerId = await resolveContainerId();

      await saveDraftPr({
        id: draftId,
        title: planningTitle?.trim() || "Shipment Draft",
        containerId,
        status: "DRAFT",
        items: validSelections.map((item) => {
          const sku = skus.find((s) => s.id === item.skuId);
          const rawSupplier = Number((sku as any)?.supplierId);
          return {
            skuId: item.skuId,
            supplierId: Number.isFinite(rawSupplier) ? rawSupplier : undefined,
            unitQty: Number(item.qty) || 0,
            status: "DRAFT",
          };
        }),
      });

      const newDraft: PlanningDraft = {
        id: draftId,
        title: planningTitle,
        items: selectedSkus,
        containerType: selectedContainerName,
        updatedAt: new Date().toLocaleString(),
      };

      onSaveDraft(newDraft);
      setCurrentDraftId(draftId);
      alert("Draft saved.");
    } catch (e) {
      console.error("Failed to save draft PR:", e);
      alert("Selected container is not mapped in DB. Upload Container Specs first.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePr = async () => {
    const validSelections = selectedSkus.filter(
      (x) => x?.skuId?.trim() && Number(x.qty) > 0
    );

    if (!validSelections.length) {
      alert("Please select at least one SKU with qty > 0.");
      return;
    }

    const prName = planningTitle?.trim() || `PR ${new Date().toISOString().slice(0, 10)}`;
    const prId = `PR-${Date.now().toString().slice(-10)}`;
    const util = calculateUtilization();

    try {
      setIsSavingPr(true);
      const containerId = await resolveContainerId();

      await createPrWithLines({
        id: prId,
        title: prName,
        containerId, // always persisted to PR.container_id
        status: "SUBMITTED",
        items: validSelections.map(item => {
          const sku = skus.find(s => s.id === item.skuId);
          const rawSupplier = Number((sku as any)?.supplierId);
          return {
            skuId: item.skuId,
            supplierId: Number.isFinite(rawSupplier) ? rawSupplier : undefined,
            unitQty: item.qty,
            status: "SUBMITTED",
          };
        }),
      });

      const newPr: PurchaseRequisition = {
        id: prId,
        title: prName,
        items: validSelections.map(item => {
          const sku = skus.find(s => s.id === item.skuId);
          return {
            skuId: item.skuId,
            model: sku?.model || item.skuId || 'Unknown',
            qty: item.qty,
            supplierId: sku?.supplierId || 'Unknown'
          };
        }),
        containerType: selectedContainerName,
        utilizationCbm: (util.cbm / containerType.capacityCbm) * 100,
        utilizationWeight: (util.kg / containerType.maxWeightKg) * 100,
        status: 'SUBMITTED',
        createdAt: new Date().toISOString()
      };

      onGeneratePr(newPr);
      alert("PR saved successfully.");
    } catch (error) {
      console.error("Failed to save PR:", error);
      alert("Failed to save PR. Check container mapping/API.");
    } finally {
      setIsSavingPr(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Planning Title</label>
                <input 
                  type="text"
                  value={planningTitle}
                  onChange={(e) => setPlanningTitle(e.target.value)}
                  className="w-full text-lg font-bold text-slate-800 border-b-2 border-transparent focus:border-blue-500 outline-none bg-transparent py-1"
                  placeholder="Enter planning title..."
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleSaveDraft}
                  disabled={selectedSkus.length === 0 || isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {currentDraftId ? 'Update Draft' : 'Save Draft'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {selectedSkus.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl">
                  <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Box className="text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-medium">No items added to the planning list yet.</p>
                  <p className="text-xs text-slate-400 mt-2 italic">Add items from the Procurement Planning Sheet.</p>
                </div>
              )}
              {selectedSkus.map(item => {
                const sku = skus.find(s => s.id === item.skuId);

                const modelLabel = sku?.model || item.skuId || "Unknown SKU";

                return (
                  <div key={item.skuId} className="flex items-center gap-4 p-4 border border-slate-100 rounded-xl hover:border-blue-100 hover:shadow-sm transition-all">
                    <div className="h-10 w-10 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                      <Box size={20} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-800">{modelLabel}</h4>
                      <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
                        {sku
                          ? `Dim: ${sku.dimensions.l}x${sku.dimensions.w}x${sku.dimensions.h}cm • ${sku.weight}kg`
                          : `SKU: ${item.skuId} • Specs unavailable`}
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
              <Container className="text-blue-500" />
              <h3 className="text-lg font-bold text-slate-800">Container Utilization</h3>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Container Type</label>
              <select 
                className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedContainerName}
                onChange={(e) => setSelectedContainerName(e.target.value)}
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
                disabled={selectedSkus.length === 0 || isSavingPr}
                onClick={handleGeneratePr}
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all active:scale-95"
              >
                {isSavingPr ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Saving PR...
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

      {/* Drafts Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-xl text-slate-600">
            <History size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Planning Drafts</h3>
            <p className="text-sm text-slate-500">Resume previously saved shipment plans.</p>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Draft Title</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Items</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Container</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Updated</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {drafts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-slate-400 text-sm italic">
                    No saved drafts found.
                  </td>
                </tr>
              ) : (
                drafts.map((draft) => (
                  <tr 
                    key={draft.id} 
                    className={`hover:bg-slate-50/50 transition-colors group cursor-pointer ${currentDraftId === draft.id ? 'bg-blue-50/30' : ''}`}
                    onClick={() => onLoadDraft(draft)}
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${currentDraftId === draft.id ? 'bg-blue-500' : 'bg-slate-300'}`} />
                        <span className="text-sm font-bold text-slate-900">{draft.title}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                        {draft.items.length} SKUs
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500">
                      {draft.containerType}
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500">
                      {draft.updatedAt}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button className="text-blue-600 font-bold text-xs flex items-center gap-1 ml-auto group-hover:translate-x-1 transition-all">
                        Load Plan <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ContainerPlanner;
