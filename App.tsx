import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  AlertTriangle, 
  ShoppingCart, 
  Settings, 
  ChevronRight,
  TrendingUp,
  Box,
  BrainCircuit,
  FileCheck,
  Menu,
  X
} from 'lucide-react';
import { SKU, WarehouseCategory, PurchaseRequisition, BUParameters } from './types';
import { MOCK_SKUS } from './constants';
import ProcurementSheet from './components/ProcurementSheet';
import RiskDashboard from './components/RiskDashboard';
import ContainerPlanner from './components/ContainerPlanner';
import QueueApprovals from './components/QueueApprovals';

const DEFAULT_BU_PARAMS: BUParameters = {
  leadGrowthTarget: 15,
  seasonalMultiplier: 1.2,
  safetyStockBufferWeeks: 2,
  promotionalActivity: "Standard operational cycle with focus on growth."
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'risk' | 'container' | 'management'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [skus, setSkus] = useState<SKU[]>(MOCK_SKUS);
  const [plannedSkus, setPlannedSkus] = useState<{ skuId: string, qty: number }[]>([]);
  const [prs, setPrs] = useState<PurchaseRequisition[]>([]);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on tab change on mobile
  const handleTabChange = (tab: any) => {
    setActiveTab(tab);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

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
    handleTabChange('container');
  };

  const handleGeneratePr = (newPr: PurchaseRequisition) => {
    setPrs([newPr, ...prs]);
    setPlannedSkus([]);
    handleTabChange('management');
  };

  const SidebarItem = ({ id, label, icon: Icon }: { id: any, label: string, icon: any }) => (
    <button
      onClick={() => handleTabChange(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        activeTab === id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 hover:bg-blue-50'
      }`}
    >
      <Icon size={20} className="shrink-0" />
      <span className={`font-medium ${sidebarOpen ? 'block' : 'hidden lg:block'}`}>{label}</span>
      {activeTab === id && sidebarOpen && <ChevronRight size={16} className="ml-auto" />}
    </button>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static top-0 left-0 h-screen bg-white border-r border-slate-200 p-4 lg:p-6 flex flex-col gap-8 transition-all duration-300 z-40 ${
        sidebarOpen ? 'w-64' : 'w-20 lg:w-64'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 px-2 ${sidebarOpen ? 'flex' : 'hidden lg:flex'}`}>
            <div className="bg-blue-600 p-2 rounded-lg text-white shrink-0">
              <BrainCircuit size={24} />
            </div>
            <h1 className="font-bold text-xl text-slate-800 tracking-tight">Syntro-P</h1>
          </div>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors lg:hidden"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2">
          <SidebarItem id="dashboard" label="Dashboard" icon={LayoutDashboard} />
          <SidebarItem id="planning" label="Procurement Sheet" icon={Package} />
          <SidebarItem id="risk" label="Risk & Quality" icon={AlertTriangle} />
          <SidebarItem id="container" label="Container Planning" icon={Truck} />
          <SidebarItem id="management" label="Queue & Approvals" icon={FileCheck} />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full lg:w-auto overflow-auto">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 p-4 lg:p-8 sticky top-0 z-20">
          <div className="flex justify-between items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-4 mb-2 lg:mb-0">
                <button 
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors hidden max-lg:block"
                >
                  <Menu size={20} />
                </button>
                <h2 className="text-xl lg:text-2xl font-bold text-slate-800 truncate">
                  {activeTab === 'dashboard' && 'Operations Overview'}
                  {activeTab === 'planning' && 'Procurement Planning Sheet'}
                  {activeTab === 'risk' && 'Quality & Risk Indicators'}
                  {activeTab === 'container' && 'Automated Container Planning'}
                  {activeTab === 'management' && 'Queue and Approvals'}
                </h2>
              </div>
              <p className="text-sm text-slate-500 hidden md:block">Intelligent Supply Chain Management System</p>
            </div>
            <div className="flex gap-4 items-center shrink-0">
              <button className="bg-white border border-slate-200 p-2 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors hidden sm:block">
                <Settings size={20} />
              </button>
              <div className="h-10 w-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden shrink-0">
                <img src="https://picsum.photos/40" alt="Avatar" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <section className="p-4 lg:p-8 animate-in fade-in duration-500">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                <StatCard title="Total SKUs" value={skus.length} icon={Package} trend="+2%" color="blue" />
                <StatCard title="Critical Low Stock" value={skus.filter(s => calculateTotalStock(s) / s.ams < 1).length} icon={AlertTriangle} trend="-1" color="red" />
                <StatCard title="Target Growth" value={`+${DEFAULT_BU_PARAMS.leadGrowthTarget}%`} icon={TrendingUp} trend="Forecasted" color="green" />
                <StatCard title="Active Shipments" value={skus.reduce((a, b) => a + (b.incoming > 0 ? 1 : 0), 0)} icon={Truck} trend="+3" color="green" />
              </div>
            </div>
          )}

          {activeTab === 'planning' && <ProcurementSheet skus={skus} onAddToPlanning={handleAddToPlanning} />}
          {activeTab === 'risk' && <RiskDashboard skus={skus} />}
          {activeTab === 'container' && (
            <ContainerPlanner 
              skus={skus} 
              selectedSkus={plannedSkus} 
              setSelectedSkus={setPlannedSkus}
              onGeneratePr={handleGeneratePr}
            />
          )}
          {activeTab === 'management' && (
            <QueueApprovals 
              skus={skus} 
              prs={prs} 
              setPrs={setPrs} 
              buParams={DEFAULT_BU_PARAMS}
            />
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
    <div className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 lg:p-3 rounded-xl border ${colorMap[color]}`}>
          <Icon size={20} className="lg:w-6 lg:h-6" />
        </div>
        <span className={`text-[10px] lg:text-xs font-bold px-2 py-1 rounded-full ${colorMap[color]}`}>{trend}</span>
      </div>
      <h3 className="text-slate-500 font-medium text-xs lg:text-sm mb-1">{title}</h3>
      <p className="text-2xl lg:text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
};

export default App;