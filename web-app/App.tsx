import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Truck,
  AlertTriangle,
  Settings,
  ChevronRight,
  ClipboardClock,
  PencilRuler,
  ListStart,
  Upload,
  LogOut,
  Sheet
} from 'lucide-react';
import {
  SKU,
  WarehouseCategory,
  PurchaseRequisition,
  Supplier,
  ContainerType,
  PlanningDraft
} from './types';
import { MOCK_SKUS, MOCK_SUPPLIERS, CONTAINER_TYPES } from './constants';
import ProcurementSheet from './components/ProcurementSheet';
import RiskDashboard from './components/RiskDashboard';
import ContainerPlanner from './components/ShipmentPlanner';
import QueueApprovals from './components/QueueApprovals';
import SpecUpdate from './components/SpecUpdate';
import DataUpload from './components/DataUpload';
import SignIn from './components/SignIn';
import { authenticateUserByDb, type AuthenticatedUser } from './src/services/userAccessService';
import { fetchPrList, type PrUiItem, type PrUiLineItem } from './src/services/prService';
import { fetchContainerReference } from './src/services/containerService';
import {
  fetchInventoryListingBySku,
  fetchProductSpecListing,
  type InventorySkuListing,
} from './src/services/productDetailService';
import { fetchAms3mBySku } from './src/services/salesService';
import { fetchSupplierListing, type SupplierListing } from './src/services/supplierService';
import { fetchComplaintAggBySku, type ComplaintAggBySku } from './src/services/complaintService';

// local type to fix missing BUParameters export
type BUParameters = {
  leadGrowthTarget: number;
  seasonalMultiplier: number;
  safetyStockBufferWeeks: number;
  promotionalActivity: string;
};

const AUTH_KEY = 'syntrop_auth'; // or store token under a different key
const AUTH_USER_KEY = 'syntrop_auth_user';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'container' | 'approvals' | 'spec' | 'data'>('dashboard');
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [skus, setSkus] = useState<SKU[]>(MOCK_SKUS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(MOCK_SUPPLIERS);
  const [containers, setContainers] = useState<ContainerType[]>(CONTAINER_TYPES);
  const [plannedSkus, setPlannedSkus] = useState<{ skuId: string, qty: number }[]>([]);
  const [planningTitle, setPlanningTitle] = useState('New Shipment Planning');
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [selectedContainerName, setSelectedContainerName] = useState(CONTAINER_TYPES[0]?.name ?? '');
  const [drafts, setDrafts] = useState<PlanningDraft[]>([]);
  const [prs, setPrs] = useState<PurchaseRequisition[]>([]);
  const [uploadedData, setUploadedData] = useState<any>(null);

  // ── Dashboard live data ───────────────────────────────────────────
  const [dashLoading, setDashLoading] = useState(false);
  const [dashInventory, setDashInventory] = useState<InventorySkuListing[]>([]);
  const [dashAmsMap, setDashAmsMap] = useState<Map<string, number>>(new Map());
  const [dashComplaintMap, setDashComplaintMap] = useState<Map<string, ComplaintAggBySku>>(new Map());
  const [dashSuppliers, setDashSuppliers] = useState<SupplierListing[]>([]);
  const [dashPendingPrCount, setDashPendingPrCount] = useState(0);

  const [buParams, setBuParams] = useState<BUParameters>({
    leadGrowthTarget: 0,
    seasonalMultiplier: 1,
    safetyStockBufferWeeks: 0,
    promotionalActivity: 'None',
  });

  const calculateTotalStock = (sku: SKU) => {
    const excluded = [WarehouseCategory.PROJECT, WarehouseCategory.CORPORATE];
    const inHand = Object.entries(sku.inStock).reduce((acc, [cat, val]) => {
      if (!excluded.includes(cat as WarehouseCategory)) return acc + (val as number);
      return acc;
    }, 0);
    return inHand + sku.incoming;
  };

  const handleAddToPlanning = (skuId: string) => {
    const cleanSkuId = (skuId || '').trim().toUpperCase();
    if (!cleanSkuId) return;

    // Keep canonical SKU id from master list (case-safe lookup)
    const canonicalSkuId =
      skus.find((s) => (s.id || '').trim().toUpperCase() === cleanSkuId)?.id || cleanSkuId;

    setPlannedSkus((prev) => {
      if (prev.some((s) => (s.skuId || '').trim().toUpperCase() === cleanSkuId)) return prev;
      return [...prev, { skuId: canonicalSkuId, qty: 100 }];
    });

    setActiveTab('container');
  };

  const handleGeneratePr = (newPr: PurchaseRequisition) => {
    setPrs((prev) => [newPr, ...prev]);
    setDrafts((prev) => prev.filter((d) => d.id !== newPr.id)); // remove converted draft
    setPlannedSkus([]);
    setPlanningTitle('New Shipment Planning');
    setCurrentDraftId(null);
    setSelectedContainerName(containers[0]?.name ?? '');
    setActiveTab('approvals');
  };

  const handleSaveDraft = (draft: PlanningDraft) => {
    const idx = drafts.findIndex(d => d.id === draft.id);
    if (idx >= 0) {
      const next = [...drafts];
      next[idx] = draft;
      setDrafts(next);
    } else {
      setDrafts([draft, ...drafts]);
    }
    setCurrentDraftId(draft.id);
  };

  const handleLoadDraft = (draft: PlanningDraft) => {
    setPlannedSkus(draft.items);
    setPlanningTitle(draft.title);
    setSelectedContainerName(draft.containerType);
    setCurrentDraftId(draft.id);
  };

  const handleSignIn = async (email: string, password: string) => {
    const user = await authenticateUserByDb(email, password);
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    setCurrentUser(user);
    localStorage.setItem(AUTH_KEY, '1');
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  };

  const handleSignOut = () => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  useEffect(() => {
    const savedAuth = localStorage.getItem(AUTH_KEY);
    const savedUser = localStorage.getItem(AUTH_USER_KEY);

    if (savedAuth === '1' && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as AuthenticatedUser;
        setCurrentUser(parsedUser);
      } catch {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setPrs([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const refs = await fetchContainerReference();
        if (cancelled || !refs.length) return;

        const mapped: ContainerType[] = refs.map((r) => ({
          id: r.id as any,
          name: r.name,
          capacityCbm: r.capacityCbm,
          maxWeightKg: r.maxWeightKg,
        }));

        setContainers(mapped);
        setSelectedContainerName((prev) =>
          prev && mapped.some((c) => c.name === prev) ? prev : mapped[0]?.name ?? ""
        );
      } catch (err) {
        console.error("Failed to load container references:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const mapDbPrToUiPr = (pr: PrUiItem): PurchaseRequisition => {
    const items = (pr.lines || [])
      .map((line: PrUiLineItem) => {
        const sku = skus.find((s) => s.id === line.skuId);
        const supplierFromSku = (sku as any)?.supplierId;

        return {
          skuId: line.skuId || '',
          model: sku?.model || line.skuId || 'Unknown',
          qty: Number(line.unitQty) || 0,
          supplierId:
            line.supplierId != null
              ? String(line.supplierId)
              : supplierFromSku != null
                ? String(supplierFromSku)
                : 'Unknown',
        };
      })
      .filter((x: { skuId: string }) => Boolean(x.skuId));

    const containerName =
      (containers as Array<{ id?: number; name?: string }>).find(
        (c: { id?: number }) => Number(c?.id) === Number(pr.containerId)
      )?.name ||
      (pr.containerId != null ? `Container #${pr.containerId}` : 'N/A');

    return {
      id: pr.id,
      title: pr.title || pr.id,
      items,
      containerType: containerName,
      utilizationCbm: 0,
      utilizationWeight: 0,
      status: (pr.status as any) || 'DRAFT',
      createdAt: pr.createdOn || new Date().toISOString(),
    };
  };

  const mapDbPrToDraft = (pr: PrUiItem): PlanningDraft => {
    const items = (pr.lines || [])
      .map((line: PrUiLineItem) => ({
        skuId: (line.skuId || "").trim(),
        qty: Number(line.unitQty) || 0,
      }))
      .filter((x) => Boolean(x.skuId));

    const containerName =
      (containers as Array<{ id?: number; name?: string }>).find(
        (c: { id?: number }) => Number(c?.id) === Number(pr.containerId)
      )?.name ||
      (pr.containerId != null ? `Container #${pr.containerId}` : 'N/A');

    return {
      id: pr.id,
      title: pr.title || pr.id,
      items,
      containerType: containerName,
      updatedAt: pr.updatedOn || pr.createdOn || new Date().toISOString(),
    };
  };

  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    (async () => {
      try {
        const dbPrs = await fetchPrList();
        if (cancelled) return;

        const dbDrafts = dbPrs.filter((p) => String(p.status).toUpperCase() === "DRAFT");
        const dbQueue = dbPrs.filter((p) => String(p.status).toUpperCase() !== "DRAFT");

        setDrafts(dbDrafts.map(mapDbPrToDraft));
        setPrs(dbQueue.map(mapDbPrToUiPr));
      } catch (err) {
        console.error('Failed to load PR list:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, containers, skus]);

  // ── Dashboard data fetch ──────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || activeTab !== 'dashboard') return;

    let cancelled = false;
    setDashLoading(true);

    (async () => {
      try {
        const [inventory, amsMap, complaintMap, supplierList, prList] = await Promise.all([
          fetchInventoryListingBySku(),
          fetchAms3mBySku(),
          fetchComplaintAggBySku(),
          fetchSupplierListing(),
          fetchPrList(),
        ]);

        if (cancelled) return;

        setDashInventory(inventory);
        setDashAmsMap(amsMap);
        setDashComplaintMap(complaintMap);
        setDashSuppliers(supplierList);

        const pendingCount = prList.filter(
          (p) => { const s = String(p.status).toUpperCase(); return s === 'PENDING' || s === 'SUBMITTED'; }
        ).length;
        setDashPendingPrCount(pendingCount);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        if (!cancelled) setDashLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentUser, activeTab]);

  // ── Derived dashboard values ──────────────────────────────────────
  const dashTotalSkus = dashInventory.length;

  const dashCriticalLowStock = dashInventory.filter((row) => {
    const ams = dashAmsMap.get(row.skuId) ?? 0;
    if (ams <= 0) return false;
    return row.totalStock / ams < 1.5;
  }).length;

  const SidebarItem = ({ id, label, icon: Icon }: { id: any, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        activeTab === id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 hover:bg-blue-50'
      }`}
    >
      <Icon size={20} className="flex-shrink-0" />
      <span className="font-medium whitespace-nowrap flex-1">{label}</span>
      {activeTab === id && <ChevronRight size={16} className="flex-shrink-0" />}
    </button>
  );

  if (!currentUser) {
    return <SignIn onSignIn={handleSignIn} />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 fixed h-full">
        <div className="flex items-center gap-2 px-2">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <ListStart size={24} />
          </div>
          <h1 className="font-bold text-xl text-slate-800 tracking-tight">Syntro-P</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <SidebarItem id="dashboard" label="Dashboard" icon={LayoutDashboard} />
          <SidebarItem id="planning" label="Procurement Sheet" icon={Sheet} />
          <SidebarItem id="container" label="Shipment Planning" icon={Package} />
          <SidebarItem id="approvals" label="Queue and Approvals" icon={ClipboardClock} />
          <SidebarItem id="spec" label="Specification Update" icon={PencilRuler} />
          <SidebarItem id="data" label="Data Upload" icon={Upload} />
        </nav>
      </aside>

      <main className="flex-1 ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === 'dashboard' && 'Operations Dashboard'}
              {activeTab === 'planning' && 'Procurement Planning Sheet'}
              {activeTab === 'container' && 'Automated Shipment Planning'}
              {activeTab === 'approvals' && 'Queue and Approvals'}
              {activeTab === 'spec' && 'Specification Update'}
              {activeTab === 'data' && 'Data Upload'}
            </h2>
            <p className="text-slate-500">Intelligent Procurement Planning Agent</p>
          </div>

          <div className="flex gap-4 items-center">
            <button
              onClick={handleSignOut}
              className="bg-white border border-slate-200 px-4 py-2 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all flex items-center gap-2 font-semibold text-sm"
            >
              <LogOut size={16} />
              Sign Out
            </button>

            <button className="bg-white border border-slate-200 p-2 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              <Settings size={20} />
            </button>

            <div className="h-10 w-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
              <img src="https://picsum.photos/40" alt="Avatar" />
            </div>
          </div>
        </header>

        <section className="animate-in fade-in duration-500">
          {activeTab === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Total SKUs" value={dashLoading ? '…' : dashTotalSkus} icon={Package} trend="" color="blue" />
                <StatCard title="Critical Low Stock" value={dashLoading ? '…' : dashCriticalLowStock} icon={AlertTriangle} trend="" color="red" />
                <StatCard title="Active Shipments" value={dashLoading ? '…' : dashPendingPrCount} icon={Truck} trend="" color="green" />
              </div>
              <RiskDashboard
                inventory={dashInventory}
                amsMap={dashAmsMap}
                complaintMap={dashComplaintMap}
                suppliers={dashSuppliers}
                loading={dashLoading}
                onNavigate={(tab) => setActiveTab(tab as any)}
              />
            </>
          )}

          {activeTab === 'planning' && (
            <ProcurementSheet
              onAddToPlanning={handleAddToPlanning}
            />
          )}
          {activeTab === 'container' && (
            <ContainerPlanner 
              skus={skus}
              containerTypes={containers}
              selectedSkus={plannedSkus}
              setSelectedSkus={setPlannedSkus}
              planningTitle={planningTitle}
              setPlanningTitle={setPlanningTitle}
              currentDraftId={currentDraftId}
              setCurrentDraftId={setCurrentDraftId}
              selectedContainerName={selectedContainerName}
              setSelectedContainerName={setSelectedContainerName}
              drafts={drafts}
              onSaveDraft={handleSaveDraft}
              onLoadDraft={handleLoadDraft}
              onGeneratePr={handleGeneratePr}
            />
          )}
          {activeTab === 'approvals' && (
            <QueueApprovals
              skus={skus}
              buParams={buParams}
            />
          )}
          {activeTab === 'spec' && (
            <SpecUpdate 
              skus={skus} 
              setSkus={setSkus} 
              suppliers={suppliers} 
              setSuppliers={setSuppliers} 
              containers={containers} 
              setContainers={setContainers} 
            />
          )}
          {activeTab === 'data' && (
            <DataUpload />
          )}
        </section>
      </main>
    </div>
  );
}

const StatCard = ({ title, value, icon: Icon, trend, color }: any) => {
  const colorMap: any = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    green: 'bg-green-50 text-green-600 border-green-100',
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl border ${colorMap[color]}`}>
          <Icon size={24} />
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${colorMap[color]}`}>{trend}</span>
      </div>
      <h3 className="text-slate-500 font-medium mb-1">{title}</h3>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
};

export default App;
