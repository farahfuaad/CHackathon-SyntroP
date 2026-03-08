import React, { useEffect, useMemo, useState } from "react";
import { createPrWithLines, saveDraftPr, updatePr } from "../src/services/prService";
import { fetchContainerReference } from "../src/services/containerService";
import {
  fetchProductSpecListing,
  type ProductSpecListing,
} from "../src/services/productDetailService";
import { SKU, ContainerType, PurchaseRequisition, PlanningDraft } from "../types";
import {
  Box,
  FileDown,
  Trash2,
  Loader2,
  Save,
  History,
  ChevronRight,
  Container,
  AlertCircle,
  CheckCircle2,
  X,
  RotateCcw,
  PenLine,
} from "lucide-react";

interface Props {
  skus: SKU[];
  containerTypes: ContainerType[];
  selectedSkus: { skuId: string; qty: number }[];
  setSelectedSkus: React.Dispatch<React.SetStateAction<{ skuId: string; qty: number }[]>>;
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

type BannerState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type SkuSpecForCalc = {
  skuId: string;
  model: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  supplierId?: string;
};

type UtilizationStats = {
  cbm: number;
  kg: number;
  volPercent: number;
  weightPercent: number;
};

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
  onGeneratePr,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPr, setIsSavingPr] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [dbProductSpecs, setDbProductSpecs] = useState<Map<string, ProductSpecListing>>(new Map());

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const rows = await fetchProductSpecListing();
        if (!mounted) return;

        const bySku = new Map<string, ProductSpecListing>();
        rows.forEach((row) => {
          const key = (row.skuId || "").trim().toUpperCase();
          if (!key) return;
          bySku.set(key, row);
        });

        setDbProductSpecs(bySku);
      } catch (err) {
        console.error("Failed to load Product specs for utilization:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleLoadDraftLocal = (draft: PlanningDraft) => {
    onLoadDraft(draft);
    setBanner({
      type: "success",
      message: `Draft "${draft.title}" loaded.`,
    });
  };

  const handleResetPlanner = () => {
    setSelectedSkus([]);
    setPlanningTitle("New Shipment Planning");
    setSelectedContainerName(containerTypes[0]?.name ?? "");
    setCurrentDraftId(null);
    setBanner({
      type: "success",
      message: "Planner has been reset. You can start a new shipment plan.",
    });
  };

  const containerType = useMemo(
    () => containerTypes.find((c) => c.name === selectedContainerName) || containerTypes[0],
    [containerTypes, selectedContainerName]
  );

  const findSkuById = (skuId: string) => {
    const key = (skuId || "").trim().toUpperCase();
    return skus.find((s) => (s.id || "").trim().toUpperCase() === key);
  };

  const getSkuSpecForCalc = (skuId: string): SkuSpecForCalc | null => {
    const key = (skuId || "").trim().toUpperCase();
    if (!key) return null;

    const dbSpec = dbProductSpecs.get(key);
    const localSku = findSkuById(skuId);

    if (dbSpec) {
      return {
        skuId: dbSpec.skuId,
        model: dbSpec.modelName || localSku?.model || dbSpec.skuId,
        lengthCm: Number(dbSpec.lengthCm) || 0,
        widthCm: Number(dbSpec.widthCm) || 0,
        heightCm: Number(dbSpec.heightCm) || 0,
        weightKg: Number(dbSpec.weightKg) || 0,
        supplierId: dbSpec.supplierId || localSku?.supplierId,
      };
    }

    if (!localSku) return null;

    return {
      skuId: localSku.id,
      model: localSku.model || localSku.id,
      lengthCm: Number(localSku.dimensions?.l || 0),
      widthCm: Number(localSku.dimensions?.w || 0),
      heightCm: Number(localSku.dimensions?.h || 0),
      weightKg: Number(localSku.weight || 0),
      supplierId: localSku.supplierId,
    };
  };

  const updateQty = (skuId: string, qty: number) => {
    const safeQty = Number.isFinite(qty) ? Math.max(0, qty) : 0;
    const key = (skuId || "").trim().toUpperCase();

    setSelectedSkus((prev) =>
      prev.map((item) =>
        (item.skuId || "").trim().toUpperCase() === key
          ? { ...item, qty: safeQty }
          : item
      )
    );
  };

  const removeSku = (skuId: string) => {
    const key = (skuId || "").trim().toUpperCase();
    setSelectedSkus((prev) =>
      prev.filter((item) => (item.skuId || "").trim().toUpperCase() !== key)
    );
  };

  const calculateUtilizationForContainer = (container: ContainerType): UtilizationStats => {
    let totalCbm = 0;
    let totalKg = 0;

    selectedSkus.forEach((item) => {
      const sku = getSkuSpecForCalc(item.skuId);
      if (sku) {
        const l = Number(sku.lengthCm || 0);
        const w = Number(sku.widthCm || 0);
        const h = Number(sku.heightCm || 0);
        const weight = Number(sku.weightKg || 0);

        const itemCbm = (l * w * h) / 1000000;
        totalCbm += itemCbm * Number(item.qty || 0);
        totalKg += weight * Number(item.qty || 0);
      }
    });

    const capacityCbm = Number(container?.capacityCbm) || 0;
    const maxWeightKg = Number(container?.maxWeightKg) || 0;

    return {
      cbm: totalCbm,
      kg: totalKg,
      volPercent: capacityCbm > 0 ? (totalCbm / capacityCbm) * 100 : 0,
      weightPercent: maxWeightKg > 0 ? (totalKg / maxWeightKg) * 100 : 0,
    };
  };

  const calculateUtilization = () => calculateUtilizationForContainer(containerType);

  const stats = useMemo(
    () => calculateUtilization(),
    [selectedSkus, containerType, skus, dbProductSpecs]
  );

  function normalizeContainerKey(v: string): string {
    return (v || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  const resolveContainerId = async (): Promise<number> => {
    const selected = containerTypes.find((c) => c.name === selectedContainerName) as
      | (ContainerType & { id?: number })
      | undefined;

    const localId = Number(selected?.id);
    if (Number.isFinite(localId) && localId > 0) return localId;

    const refs = await fetchContainerReference();
    const selectedKey = normalizeContainerKey(selectedContainerName);

    let hit = refs.find((r) => normalizeContainerKey(r.name) === selectedKey);

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

  const getInvalidSkuMessages = (items: { skuId: string; qty: number }[]) => {
    const errors: string[] = [];

    items.forEach((item) => {
      const sku = getSkuSpecForCalc(item.skuId);

      // If SKU is absent from both DB specs and local list, skip strict validation.
      if (!sku) return;

      const l = Number(sku.lengthCm || 0);
      const w = Number(sku.widthCm || 0);
      const h = Number(sku.heightCm || 0);
      const weight = Number(sku.weightKg || 0);

      if (l <= 0 || w <= 0 || h <= 0) {
        errors.push(`SKU "${sku.model || sku.skuId}" has missing or invalid dimensions.`);
      }

      if (weight <= 0) {
        errors.push(`SKU "${sku.model || sku.skuId}" has missing or invalid weight.`);
      }
    });

    return errors;
  };

  const resetPlannerAfterSubmit = () => {
    setSelectedSkus([]);
    setPlanningTitle("");
    setCurrentDraftId(null);
    setBanner({
      type: "success",
      message: "PR submitted to approval queue successfully. Status: Pending Approval.",
    });
  };

  const handleSaveDraft = async () => {
    setBanner(null);

    const validSelections = selectedSkus.filter((x) => x?.skuId?.trim() && Number(x.qty) > 0);
    if (!validSelections.length) {
      setBanner({
        type: "error",
        message: "Please add at least one SKU with quantity greater than 0 before saving draft.",
      });
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
          const sku = getSkuSpecForCalc(item.skuId);
          const rawSupplier = Number(sku?.supplierId);
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
        title: planningTitle?.trim() || "Shipment Draft",
        items: validSelections,
        containerType: selectedContainerName,
        updatedAt: new Date().toLocaleString(),
      };

      onSaveDraft(newDraft);
      setCurrentDraftId(draftId);
      setBanner({
        type: "success",
        message: "Draft saved successfully.",
      });
    } catch (e) {
      console.error("Failed to save draft PR:", e);
      setBanner({
        type: "error",
        message: `Failed to save draft. Selected container "${selectedContainerName}" is not mapped in DB.`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePr = async () => {
    setBanner(null);

    const validSelections = selectedSkus.filter((x) => x?.skuId?.trim() && Number(x.qty) > 0);

    if (!validSelections.length) {
      setBanner({
        type: "error",
        message: "Please select at least one SKU with quantity greater than 0.",
      });
      return;
    }

    const skuValidationErrors = getInvalidSkuMessages(validSelections);
    if (skuValidationErrors.length > 0) {
      setBanner({
        type: "error",
        message: skuValidationErrors[0],
      });
      return;
    }

    if (stats.volPercent > 100 || stats.weightPercent > 100) {
      setBanner({
        type: "error",
        message:
          "Shipment plan exceeds container capacity and must be corrected before submission to approval queue.",
      });
      return;
    }

    const prName = planningTitle?.trim() || `PR ${new Date().toISOString().slice(0, 10)}`;
    const prId = currentDraftId || `PR-${Date.now().toString().slice(-10)}`;
    const util = calculateUtilization();

    try {
      setIsSavingPr(true);
      const containerId = await resolveContainerId();

      if (currentDraftId) {
        await saveDraftPr({
          id: prId,
          title: prName,
          containerId,
          status: "DRAFT",
          items: validSelections.map((item) => {
            const sku = getSkuSpecForCalc(item.skuId);
            const rawSupplier = Number(sku?.supplierId);
            return {
              skuId: item.skuId,
              supplierId: Number.isFinite(rawSupplier) ? rawSupplier : undefined,
              unitQty: Number(item.qty) || 0,
              status: "DRAFT",
            };
          }),
        });

        await updatePr(prId, {
          status: "PENDING",
          updatedOn: new Date().toISOString(),
        });
      } else {
        await createPrWithLines({
          id: prId,
          title: prName,
          containerId,
          status: "PENDING",
          items: validSelections.map((item) => {
            const sku = getSkuSpecForCalc(item.skuId);
            const rawSupplier = Number(sku?.supplierId);
            return {
              skuId: item.skuId,
              supplierId: Number.isFinite(rawSupplier) ? rawSupplier : undefined,
              unitQty: Number(item.qty) || 0,
              status: "PENDING",
            };
          }),
        });
      }

      const newPr: PurchaseRequisition = {
        id: prId,
        title: prName,
        items: validSelections.map((item) => {
          const sku = getSkuSpecForCalc(item.skuId);
          return {
            skuId: item.skuId,
            model: sku?.model || item.skuId || "Unknown",
            qty: item.qty,
            supplierId: sku?.supplierId || "Unknown",
          };
        }),
        containerType: selectedContainerName,
        utilizationCbm: util.volPercent,
        utilizationWeight: util.weightPercent,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      };

      onGeneratePr(newPr);
      resetPlannerAfterSubmit();
    } catch (error) {
      console.error("Failed to save PR:", error);
      setBanner({
        type: "error",
        message: "Failed to save PR. Please check container mapping or PR API.",
      });
    } finally {
      setIsSavingPr(false);
    }
  };

  return (
    <div className="space-y-8">
      {banner && (
        <div
          className={`rounded-2xl border px-4 py-3 flex items-start justify-between gap-3 ${
            banner.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-start gap-3">
            {banner.type === "success" ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
            )}
            <p className="text-sm font-medium">{banner.message}</p>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="shrink-0 rounded-lg p-1 hover:bg-white/60 transition-colors"
            aria-label="Close message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Planning Title
                </label>
                <input
                  type="text"
                  value={planningTitle}
                  onChange={(e) => setPlanningTitle(e.target.value)}
                  className="w-full text-lg font-bold text-slate-800 border-b-2 border-transparent focus:border-blue-500 outline-none bg-transparent py-1"
                  placeholder="Enter planning title..."
                />
                {currentDraftId && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <PenLine size={12} className="text-blue-500" />
                    <span className="text-xs text-blue-600 font-medium">
                      Editing Draft: {currentDraftId}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {currentDraftId && (
                  <button
                    type="button"
                    onClick={handleResetPlanner}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-50 hover:text-slate-700 transition-all"
                  >
                    <RotateCcw size={16} />
                    New Plan
                  </button>
                )}
                <button
                  onClick={handleSaveDraft}
                  disabled={selectedSkus.length === 0 || isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {currentDraftId ? "Update Draft" : "Save Draft"}
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
                  <p className="text-xs text-slate-400 mt-2 italic">
                    Add items from the Procurement Planning Sheet.
                  </p>
                </div>
              )}

              {selectedSkus.map((item) => {
                const sku = getSkuSpecForCalc(item.skuId);
                const modelLabel = sku?.model || item.skuId || "Unknown SKU";

                return (
                  <div
                    key={item.skuId}
                    className="flex items-center gap-4 p-4 border border-slate-100 rounded-xl hover:border-blue-100 hover:shadow-sm transition-all"
                  >
                    <div className="h-10 w-10 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                      <Box size={20} />
                    </div>

                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-800">{modelLabel}</h4>
                      <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
                        {sku
                          ? `Dim: ${sku.lengthCm}x${sku.widthCm}x${sku.heightCm}cm • ${sku.weightKg}kg`
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
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">
                          QTY
                        </span>
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

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm sticky top-8">
            <div className="flex items-center gap-2 mb-6">
              <Container className="text-blue-500" />
              <h3 className="text-lg font-bold text-slate-800">Container Utilization</h3>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                Container Type
              </label>
              <select
                className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedContainerName}
                onChange={(e) => setSelectedContainerName(e.target.value)}
              >
                {containerTypes.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.capacityCbm} CBM)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Volume (CBM)</span>
                  <span className="text-sm font-bold text-slate-900">
                    {stats.cbm.toFixed(1)} / {containerType.capacityCbm}
                  </span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      stats.volPercent > 100 ? "bg-red-500" : "bg-blue-600"
                    }`}
                    style={{ width: `${Math.min(stats.volPercent, 100)}%` }}
                  />
                </div>
                <p
                  className={`text-[10px] text-right mt-1 font-bold ${
                    stats.volPercent > 100 ? "text-red-500" : "text-slate-500"
                  }`}
                >
                  {stats.volPercent.toFixed(1)}% Full
                </p>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Weight (KG)</span>
                  <span className="text-sm font-bold text-slate-900">
                    {stats.kg.toLocaleString()} / {containerType.maxWeightKg}
                  </span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      stats.weightPercent > 100 ? "bg-red-500" : "bg-green-600"
                    }`}
                    style={{ width: `${Math.min(stats.weightPercent, 100)}%` }}
                  />
                </div>
                <p
                  className={`text-[10px] text-right mt-1 font-bold ${
                    stats.weightPercent > 100 ? "text-red-500" : "text-slate-500"
                  }`}
                >
                  {stats.weightPercent.toFixed(1)}% Full
                </p>
              </div>
            </div>

            {(stats.volPercent > 100 || stats.weightPercent > 100) && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-xs font-semibold">
                Shipment plan exceeds container capacity. Reduce quantity or select a larger container.
              </div>
            )}

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
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Draft Title
                </th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Items
                </th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Container
                </th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Last Updated
                </th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                  Action
                </th>
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
                drafts.map((draft) => {
                  const isActive = currentDraftId === draft.id;
                  return (
                    <tr
                      key={draft.id}
                      className={`transition-colors group ${
                        isActive
                          ? "bg-blue-50 border-l-4 border-l-blue-500"
                          : "hover:bg-slate-50/50 border-l-4 border-l-transparent"
                      }`}
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${
                              isActive ? "bg-blue-500 ring-4 ring-blue-100" : "bg-slate-300"
                            }`}
                          />
                          <span className={`text-sm font-bold ${
                            isActive ? "text-blue-900" : "text-slate-900"
                          }`}>{draft.title}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                          isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                        }`}>
                          {draft.items.length} SKUs
                        </span>
                      </td>
                      <td className="px-8 py-5 text-sm text-slate-500">{draft.containerType}</td>
                      <td className="px-8 py-5 text-sm text-slate-500">{draft.updatedAt}</td>
                      <td className="px-8 py-5 text-right">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLoadDraftLocal(draft)}
                            className="text-blue-600 font-bold text-xs flex items-center gap-1 ml-auto hover:translate-x-1 transition-all"
                          >
                            Load Plan <ChevronRight size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ContainerPlanner;
