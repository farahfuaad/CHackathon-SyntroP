import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Truck,
  AlertTriangle,
  Settings,
  ChevronRight,
  TrendingUp,
  ClipboardClock,
  PencilRuler,
  ListStart,
  Upload,
  LogOut
} from 'lucide-react';
import { SKU, WarehouseCategory, PurchaseRequisition, Supplier, ContainerType } from './types';
import { MOCK_SKUS, MOCK_SUPPLIERS, CONTAINER_TYPES } from './constants';
import ProcurementSheet from './components/ProcurementSheet';
import RiskDashboard from './components/RiskDashboard';
import ContainerPlanner from './components/ContainerPlanner';
import QueueApprovals from './components/QueueApprovals';
import SpecUpdate from './components/SpecUpdate';
import DataUpload from './components/DataUpload';
import SignIn from './components/SignIn';
import { authenticateUserByDb, type AuthenticatedUser } from './src/services/userAccessService';

// local type to fix missing BUParameters export
type BUParameters = {
  leadGrowthTarget: number;
  seasonalMultiplier: number;
  safetyStockBufferWeeks: number;
  promotionalActivity: string;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'container' | 'approvals' | 'spec' | 'data'>('dashboard');
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [skus, setSkus] = useState<SKU[]>(MOCK_SKUS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(MOCK_SUPPLIERS);
  const [containers, setContainers] = useState<ContainerType[]>(CONTAINER_TYPES);
  const [plannedSkus, setPlannedSkus] = useState<{ skuId: string, qty: number }[]>([]);
  const [prs, setPrs] = useState<PurchaseRequisition[]>([]);
  const [uploadedData, setUploadedData] = useState<any>(null);

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
    if (!plannedSkus.find(s => s.skuId === skuId)) {
      setPlannedSkus([...plannedSkus, { skuId, qty: 100 }]);
    }
    setActiveTab('container');
  };

  const handleGeneratePr = (newPr: PurchaseRequisition) => {
    setPrs([newPr, ...prs]);
    setPlannedSkus([]); 
    setActiveTab('approvals'); 
  };

  const handleSignIn = async (email: string, password: string) => {
    const user = await authenticateUserByDb(email, password);
    if (!user) {
      throw new Error('Invalid email or password.');
    }
    setCurrentUser(user);
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  if (!currentUser) {
    return <SignIn onSignIn={handleSignIn} />;
  }

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
          <SidebarItem id="planning" label="Procurement Sheet" icon={Package} />
          <SidebarItem id="container" label="Container Planning" icon={Truck} />
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
              {activeTab === 'container' && 'Automated Container Planning'}
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
                <StatCard title="Total SKUs" value={skus.length} icon={Package} trend="+2%" color="blue" />
                <StatCard title="Critical Low Stock" value={skus.filter(s => calculateTotalStock(s) / s.ams < 1).length} icon={AlertTriangle} trend="-1" color="red" />
                <StatCard title="Active Shipments" value={skus.reduce((a, b) => a + (b.incoming > 0 ? 1 : 0), 0)} icon={Truck} trend="+3" color="green" />
              </div>
              <RiskDashboard skus={skus} />
            </>
          )}

          {activeTab === 'planning' && (
            <ProcurementSheet
              skus={skus}
              suppliers={suppliers}
              onAddToPlanning={handleAddToPlanning}
            />
          )}
          {activeTab === 'container' && (
            <ContainerPlanner 
              skus={skus} 
              suppliers={suppliers}
              containerTypes={containers}
              selectedSkus={plannedSkus} 
              setSelectedSkus={setPlannedSkus}
              onGeneratePr={handleGeneratePr}
            />
          )}
          {activeTab === 'approvals' && (
            <QueueApprovals
              skus={skus}
              prs={prs}
              setPrs={setPrs}
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
};

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
