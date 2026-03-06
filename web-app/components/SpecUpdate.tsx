import React, { useEffect, useMemo, useState } from 'react';
import { SKU, Supplier, ContainerType } from '../types';
import {
  fetchProductSpecListing,
  ProductSpecListing,
  updateProductSpecDimensions,
} from '../src/services/productDetailService';
import {
  createContainerReference,
  deleteContainerReference,
  fetchContainerReference,
  updateContainerReference,
} from '../src/services/containerService';
import {
  createSupplierReference,
  deleteSupplierReference,
  fetchSupplierReference,
  updateSupplierReference,
} from '../src/services/supplierService';
import { 
  Users, 
  Container, 
  Maximize, 
  Save, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';

interface Props {
  skus: SKU[];
  setSkus: React.Dispatch<React.SetStateAction<SKU[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  containers: ContainerType[];
  setContainers: React.Dispatch<React.SetStateAction<ContainerType[]>>;
}

type EditableContainer = ContainerType & {
  _key: string;
  _dbId?: number;
  _isNew?: boolean;
  _isDeleted?: boolean;
  _dirty?: boolean;
};

const SpecUpdate: React.FC<Props> = ({ skus, setSkus, suppliers, setSuppliers, containers, setContainers }) => {
  const [activeSubTab, setActiveSubTab] = useState<'suppliers' | 'containers' | 'sku-specs'>('suppliers');
  const [saveStatus, setSaveStatus] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isContainerModalOpen, setIsContainerModalOpen] = useState(false);
  const [skuSpecRows, setSkuSpecRows] = useState<ProductSpecListing[]>([]);
  const [containerRows, setContainerRows] = useState<EditableContainer[]>([]);
  const [pendingDeletedSupplierIds, setPendingDeletedSupplierIds] = useState<Set<string>>(new Set());
  const [pendingSkuSpecIds, setPendingSkuSpecIds] = useState<Set<string>>(new Set());
  const [skuSpecPage, setSkuSpecPage] = useState<number>(1);
  const SKU_PAGE_SIZE = 20;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchProductSpecListing();
        if (mounted) setSkuSpecRows(data);
      } catch (err) {
        console.error('Failed to fetch product spec listing:', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const dbSuppliers = await fetchSupplierReference();
        if (!mounted) return;
        setSuppliers(dbSuppliers);
      } catch (err) {
        console.error('Failed to fetch supplier reference:', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [setSuppliers]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const dbContainers = await fetchContainerReference();
        if (!mounted) return;

        const rows = dbContainers.map((c) => ({
          _key: `db-${c.id}`,
          _dbId: c.id,
          _dirty: false,
          _isDeleted: false,
          _isNew: false,
          name: c.name,
          capacityCbm: c.capacityCbm,
          maxWeightKg: c.maxWeightKg,
        }));

        setContainerRows(rows);
        setContainers(rows.map(({ name, capacityCbm, maxWeightKg }) => ({ name, capacityCbm, maxWeightKg })));
      } catch (err) {
        console.error('Failed to fetch container reference:', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [setContainers]);

  const skuSpecTotalPages = Math.max(1, Math.ceil(skuSpecRows.length / SKU_PAGE_SIZE));

  useEffect(() => {
    if (skuSpecPage > skuSpecTotalPages) setSkuSpecPage(skuSpecTotalPages);
  }, [skuSpecPage, skuSpecTotalPages]);

  const visibleSkuSpecRows = useMemo(() => {
    const start = (skuSpecPage - 1) * SKU_PAGE_SIZE;
    return skuSpecRows.slice(start, start + SKU_PAGE_SIZE);
  }, [skuSpecRows, skuSpecPage]);

  const updateDbSkuSpecLocal = (
    skuId: string,
    field: 'lengthCm' | 'widthCm' | 'heightCm' | 'weightKg',
    value: number
  ) => {
    const safe = Number.isFinite(value) ? value : 0;
    setSkuSpecRows((prev) => prev.map((r) => (r.skuId === skuId ? { ...r, [field]: safe } : r)));
    setPendingSkuSpecIds((prev) => {
      const next = new Set(prev);
      next.add(skuId);
      return next;
    });
  };

  const handleSaveNotification = () => {
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
  };

  const updateSupplier = (id: string, field: keyof Supplier, value: any) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const persistSupplier = async (id: string, field: keyof Supplier, value: any) => {
    try {
      if (field === 'name') {
        await updateSupplierReference(id, { name: String(value || '') });
      } else if (field === 'email') {
        await updateSupplierReference(id, { email: String(value || '') });
      } else if (field === 'standardLeadTime') {
        await updateSupplierReference(id, { standardLeadTime: Number(value) || 0 });
      } else {
        return;
      }

      handleSaveNotification();
    } catch (err) {
      console.error('Failed to update supplier in DB:', err);
    }
  };

  const updateContainer = (key: string, field: keyof ContainerType, value: any) => {
    setContainerRows((prev) =>
      prev.map((c) => (c._key === key ? { ...c, [field]: value, _dirty: true } : c))
    );
  };

  const handleDeleteContainer = (key: string) => {
    setContainerRows((prev) =>
      prev
        .map((c) => {
          if (c._key !== key) return c;
          if (c._isNew) return { ...c, _isDeleted: true };
          return { ...c, _isDeleted: true, _dirty: true };
        })
        .filter((c) => !(c._isNew && c._isDeleted))
    );
  };

  const handleDeleteSupplier = (supplierId: string) => {
    // UI-only delete; persisted only when Save Changes is clicked.
    setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
    setPendingDeletedSupplierIds((prev) => {
      const next = new Set(prev);
      next.add(supplierId);
      return next;
    });
  };

  const handleSaveChanges = async () => {
    if (isSaving) return;

    try {
      setIsSaving(true);

      if (pendingDeletedSupplierIds.size > 0) {
        await Promise.all(
          Array.from(pendingDeletedSupplierIds).map(async (supplierId) => {
            await deleteSupplierReference(supplierId);
          })
        );
      }

      const pendingContainerRows = containerRows.filter((c) => c._isNew || c._isDeleted || c._dirty);
      if (pendingContainerRows.length > 0) {
        for (const c of pendingContainerRows) {
          if (c._isDeleted && c._dbId) {
            await deleteContainerReference(c._dbId);
            continue;
          }

          if (c._isNew && !c._isDeleted) {
            await createContainerReference({
              name: c.name,
              capacityCbm: c.capacityCbm,
              maxWeightKg: c.maxWeightKg,
            });
            continue;
          }

          if (c._dbId && c._dirty && !c._isDeleted) {
            await updateContainerReference(c._dbId, {
              name: c.name,
              capacityCbm: c.capacityCbm,
              maxWeightKg: c.maxWeightKg,
            });
          }
        }
      }

      if (pendingSkuSpecIds.size > 0) {
        for (const skuId of Array.from(pendingSkuSpecIds)) {
          const row = skuSpecRows.find((r) => r.skuId === skuId);
          if (!row) continue;
          await updateProductSpecDimensions(row.skuId, {
            lengthCm: row.lengthCm,
            widthCm: row.widthCm,
            heightCm: row.heightCm,
            weightKg: row.weightKg,
          });
        }
      }

      setPendingDeletedSupplierIds(new Set());
      setPendingSkuSpecIds(new Set());

      try {
        const dbContainers = await fetchContainerReference();
        const rows = dbContainers.map((c) => ({
          _key: `db-${c.id}`,
          _dbId: c.id,
          _dirty: false,
          _isDeleted: false,
          _isNew: false,
          name: c.name,
          capacityCbm: c.capacityCbm,
          maxWeightKg: c.maxWeightKg,
        }));
        setContainerRows(rows);
      } catch (err) {
        console.error('Failed to refresh containers after save:', err);
      }

      handleSaveNotification();
    } catch (err) {
      console.error('Failed to save changes to DB:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <Trash2 size={20} /> {/* Or an X icon */}
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
  };

  const handleAddSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      const newSupplier = await createSupplierReference({
        name: String(formData.get('name') || ''),
        email: String(formData.get('email') || ''),
        standardLeadTime: parseInt(String(formData.get('leadTime') || '0'), 10) || 0,
      });

      setSuppliers((prev) => [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)));
      setIsSupplierModalOpen(false);
      handleSaveNotification();
    } catch (err) {
      console.error('Failed to create supplier in DB:', err);
    }
  };

  //Helper to add Container
  const handleAddContainer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newContainer: EditableContainer = {
      _key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      _isNew: true,
      _isDeleted: false,
      _dirty: true,
      name: formData.get('name') as string,
      capacityCbm: parseFloat(formData.get('cbm') as string) || 0,
      maxWeightKg: parseFloat(formData.get('kg') as string) || 0,
    };
    setContainerRows((prev) => [...prev, newContainer]);
    setIsContainerModalOpen(false);
    handleSaveNotification();
  };

  const visibleContainers = useMemo(
    () => containerRows.filter((c) => !c._isDeleted),
    [containerRows]
  );

  useEffect(() => {
    setContainers(
      visibleContainers.map(({ name, capacityCbm, maxWeightKg }) => ({
        name,
        capacityCbm,
        maxWeightKg,
      }))
    );
  }, [visibleContainers, setContainers]);

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 inline-flex gap-2 shadow-sm">
        <TabButton 
          active={activeSubTab === 'suppliers'} 
          onClick={() => setActiveSubTab('suppliers')} 
          icon={Users} 
          label="Suppliers" 
        />
        <TabButton 
          active={activeSubTab === 'containers'} 
          onClick={() => setActiveSubTab('containers')} 
          icon={Container} 
          label="Containers" 
        />
        <TabButton 
          active={activeSubTab === 'sku-specs'} 
          onClick={() => setActiveSubTab('sku-specs')} 
          icon={Maximize} 
          label="SKU Specs (Box Sizes)" 
        />
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
        {/* Suppliers Section */}
        {activeSubTab === 'suppliers' && (
          <div className="p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Supplier Reference Master</h3>
                <p className="text-sm text-slate-500">Update lead times and contact details for vendor portfolio.</p>
              </div>
              <button 
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
              onClick={() => setIsSupplierModalOpen(true)}>
                <Plus size={18} /> Add Supplier
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Vendor Name</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Email Contact</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase text-center">Lead Time (Days)</th>
                    <th className="pb-4 text-xs font-bold text-slate-400 uppercase text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {suppliers.map(s => (
                    <tr key={s.id} className="group">
                      <td className="py-4">
                        <input 
                          type="text" 
                          value={s.name} 
                          onChange={(e) => updateSupplier(s.id, 'name', e.target.value)}
                          onBlur={(e) => persistSupplier(s.id, 'name', e.target.value)}
                          className="w-full bg-transparent font-bold text-slate-800 border-0 focus:ring-1 focus:ring-blue-500 rounded px-2 outline-none"
                        />
                      </td>
                      <td className="py-4">
                        <input 
                          type="email" 
                          value={s.email} 
                          onChange={(e) => updateSupplier(s.id, 'email', e.target.value)}
                          onBlur={(e) => persistSupplier(s.id, 'email', e.target.value)}
                          className="w-full bg-transparent text-slate-600 border-0 focus:ring-1 focus:ring-blue-500 rounded px-2 outline-none"
                        />
                      </td>
                      <td className="py-4 text-center">
                        <input 
                          type="number" 
                          value={s.standardLeadTime} 
                          onChange={(e) => updateSupplier(s.id, 'standardLeadTime', parseInt(e.target.value))}
                          onBlur={(e) => persistSupplier(s.id, 'standardLeadTime', parseInt(e.target.value))}
                          className="w-20 text-center bg-slate-50 border border-slate-100 rounded-lg py-1 font-bold text-blue-600"
                        />
                      </td>
                      <td className="py-4 text-center">
                        <button
                          onClick={() => handleDeleteSupplier(s.id)}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                          title="Delete supplier"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Containers Section */}
        {activeSubTab === 'containers' && (
          <div className="p-8">
             <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Container Reference Specs</h3>
                <p className="text-sm text-slate-500">Used for global shipping vessel capacities (CBM/Weight).</p>
              </div>
              <button 
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                onClick={() => setIsContainerModalOpen(true)}
              >
                <Plus size={18} /> New Container Type
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleContainers.map((c) => (
                <div key={c._key} className="p-6 border border-slate-100 rounded-3xl bg-slate-50/50 hover:bg-white hover:border-blue-200 transition-all group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 rounded-2xl bg-blue-100 text-blue-600">
                      <Container size={24} />
                    </div>
                    <button
                      onClick={() => handleDeleteContainer(c._key)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Container Label</label>
                      <input 
                        type="text" 
                        value={c.name} 
                        onChange={(e) => updateContainer(c._key, 'name', e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Cap. CBM</label>
                        <input 
                          type="number" 
                          value={c.capacityCbm} 
                          onChange={(e) => updateContainer(c._key, 'capacityCbm', parseFloat(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Max KG</label>
                        <input 
                          type="number" 
                          value={c.maxWeightKg} 
                          onChange={(e) => updateContainer(c._key, 'maxWeightKg', parseFloat(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SKU Specs Section */}
        {activeSubTab === 'sku-specs' && (
          <div className="p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900">SKU Reference Specs</h3>
                <p className="text-sm text-slate-500">Dimensions for container utilization.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="max-h-[700px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model / SKU</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Length (cm)</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Width (cm)</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Height (cm)</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Weight (kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {visibleSkuSpecRows.map((s) => (
                      <tr key={s.skuId} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-6 py-5">
                          <span className="font-bold text-slate-900 block">{s.modelName || '-'}</span>
                          <span className="text-[10px] text-slate-400 uppercase">{s.categoryLabel}</span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <input
                            type="number"
                            value={s.lengthCm}
                            onChange={(e) => updateDbSkuSpecLocal(s.skuId, 'lengthCm', parseFloat(e.target.value))}
                            className="w-20 text-center bg-white border border-slate-200 rounded-lg py-1.5 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-5 text-center">
                          <input
                            type="number"
                            value={s.widthCm}
                            onChange={(e) => updateDbSkuSpecLocal(s.skuId, 'widthCm', parseFloat(e.target.value))}
                            className="w-20 text-center bg-white border border-slate-200 rounded-lg py-1.5 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-5 text-center">
                          <input
                            type="number"
                            value={s.heightCm}
                            onChange={(e) => updateDbSkuSpecLocal(s.skuId, 'heightCm', parseFloat(e.target.value))}
                            className="w-20 text-center bg-white border border-slate-200 rounded-lg py-1.5 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-5 text-center">
                          <input
                            type="number"
                            value={s.weightKg}
                            onChange={(e) => updateDbSkuSpecLocal(s.skuId, 'weightKg', parseFloat(e.target.value))}
                            className="w-20 text-center bg-white border border-slate-200 rounded-lg py-1.5 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setSkuSpecPage((p) => Math.max(1, p - 1))}
                disabled={skuSpecPage <= 1}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-xs text-slate-600 font-semibold">
                Page {skuSpecPage} / {skuSpecTotalPages}
              </span>
              <button
                onClick={() => setSkuSpecPage((p) => Math.min(skuSpecTotalPages, p + 1))}
                disabled={skuSpecPage >= skuSpecTotalPages}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-500">
            <AlertCircle size={16} />
            <p className="text-xs italic">
              {(pendingDeletedSupplierIds.size > 0 || pendingSkuSpecIds.size > 0 || containerRows.some((c) => c._isDeleted || c._isNew || c._dirty))
                ? `Pending: ${pendingDeletedSupplierIds.size} supplier delete(s), ${containerRows.filter((c) => c._isDeleted || c._isNew || c._dirty).length} container change(s), ${pendingSkuSpecIds.size} SKU spec change(s). Click Save Changes to apply in DB.`
                : 'All changes are updated in the local session state.'}
            </p>
          </div>
          <button 
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saveStatus ? <CheckCircle2 size={20} /> : <Save size={20} />}
            {isSaving ? 'Saving...' : saveStatus ? 'Changes Applied' : 'Save Changes'}
          </button>
        </div>
        {/* Supplier Modal */}
        <Modal 
        isOpen={isSupplierModalOpen} 
        onClose={() => setIsSupplierModalOpen(false)} 
        title="Add New Supplier"
        >
  <form onSubmit={handleAddSupplier} className="space-y-4">
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Vendor Name</label>
      <input name="name" required className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Email</label>
      <input name="email" type="email" required className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lead Time (Days)</label>
      <input name="leadTime" type="number" required className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all">
      Create Supplier
    </button>
  </form>
</Modal>

{/* Container Modal */}
<Modal 
  isOpen={isContainerModalOpen} 
  onClose={() => setIsContainerModalOpen(false)} 
  title="Add New Container"
>
  <form onSubmit={handleAddContainer} className="space-y-4">
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Container Name (e.g. 40ft HC)</label>
      <input name="name" required className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Max CBM</label>
        <input name="cbm" type="number" step="0.01" required className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Max KG</label>
        <input name="kg" type="number" step="0.01" required className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
    </div>
    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all">
      Create Container
    </button>
  </form>
</Modal>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon: Icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
      active ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'
    }`}
  >
    <Icon size={18} />
    {label}
  </button>
);

export default SpecUpdate;
