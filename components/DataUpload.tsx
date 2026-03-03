import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  Database, 
  Users, 
  Package, 
  Truck,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { buildProductPreview, uploadProductCsv } from '@/src/services/productDetailService';

type UploadType = 'product' | 'supplier' | 'container' | 'inventory';

interface UploadHistoryEntry {
  id: string;
  fileName: string;
  type: string;
  date: string;
  status: 'success' | 'error';
  size: string;
}

interface UploadOption {
  id: UploadType;
  label: string;
  description: string;
  icon: any;
  color: string;
}

const UPLOAD_OPTIONS: UploadOption[] = [
  { 
    id: 'product', 
    label: 'Product Details', 
    description: 'Update SKU models, categories, and specifications.', 
    icon: Package,
    color: 'blue'
  },
  { 
    id: 'supplier', 
    label: 'Supplier Details', 
    description: 'Manage vendor contact info and lead times.', 
    icon: Users,
    color: 'emerald'
  },
  { 
    id: 'container', 
    label: 'Container Assets', 
    description: 'Update shipping vessel capacities and types.', 
    icon: Truck,
    color: 'amber'
  },
  { 
    id: 'inventory', 
    label: 'Inventory Master', 
    description: 'Bulk update current stock levels across warehouses.', 
    icon: Database,
    color: 'purple'
  },
];

const DataUpload: React.FC = () => {
  const [selectedType, setSelectedType] = useState<UploadType>('product');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [history, setHistory] = useState<UploadHistoryEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<{ inserted: number; updated: number } | null>(null);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem('upload_history');
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem('upload_history', JSON.stringify(history));
    } catch {
      // ignore
    }
  }, [history]);

  const addHistoryEntry = (status: 'success' | 'error') => {
    if (!file) return;
    const newEntry: UploadHistoryEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name,
      type: UPLOAD_OPTIONS.find(o => o.id === selectedType)?.label || selectedType,
      date: new Date().toLocaleString(),
      status,
      size: `${(file.size / 1024).toFixed(1)} KB`,
    };
    setHistory(prev => [newEntry, ...prev]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setUploadStatus('idle');
    setUploadError(null);
    setUploadSummary(null);

    if (selectedType === 'product') {
      const preview = await buildProductPreview(selectedFile);
      setPreviewData(preview);
      return;
    }

    const mockPreview = [
      { col1: 'Data Point A', col2: 'Value 1', col3: 'Status OK' },
      { col1: 'Data Point B', col2: 'Value 2', col3: 'Status OK' },
      { col1: 'Data Point C', col2: 'Value 3', col3: 'Review Needed' },
    ];
    setPreviewData(mockPreview);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadStatus('uploading');
    setUploadError(null);
    setUploadSummary(null);

    try {
      if (selectedType === 'product') {
        const result = await uploadProductCsv(file);
        setUploadSummary({ inserted: result.inserted, updated: result.updated });

        const isSuccess = result.failed === 0;
        setUploadStatus(isSuccess ? 'success' : 'error');

        if (!isSuccess) {
          setUploadError(`Uploaded ${result.success}/${result.total}. First error: ${result.errors[0] || 'Unknown error'}`);
        }

        addHistoryEntry(isSuccess ? 'success' : 'error');
        return;
      }

      // Mock branch for non-product uploads
      setTimeout(() => {
        setUploadStatus('success');
        addHistoryEntry('success');
      }, 2000);
    } catch (e: any) {
      setUploadStatus('error');
      setUploadError(e?.message || 'Upload failed');
      addHistoryEntry('error');
    }
  };

  const resetUpload = () => {
    setFile(null);
    setPreviewData([]);
    setUploadStatus('idle');
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Selection */}
        <div className="lg:col-span-1 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">1. Select Data Type</h3>
            <p className="text-sm text-slate-500">Choose the master data category you wish to update.</p>
          </div>
          
          <div className="space-y-3">
            {UPLOAD_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setSelectedType(option.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  selectedType === option.id 
                    ? 'bg-white border-blue-600 shadow-md ring-1 ring-blue-600' 
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex gap-4 items-center">
                  <div className={`p-2 rounded-xl ${
                    selectedType === option.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'
                  }`}>
                    <option.icon size={20} />
                  </div>
                  <div>
                    <h4 className={`font-bold text-sm ${selectedType === option.id ? 'text-slate-900' : 'text-slate-600'}`}>
                      {option.label}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">{option.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Upload Area */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">2. Upload File</h3>
            <p className="text-sm text-slate-500">Supported formats: .csv, .xlsx, .xls</p>
          </div>

          {!file ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative h-64 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging 
                  ? 'border-blue-600 bg-blue-50' 
                  : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden" 
                accept=".csv,.xlsx,.xls"
              />
              <div className="bg-blue-50 p-4 rounded-full text-blue-600 mb-4">
                <Upload size={32} />
              </div>
              <p className="font-bold text-slate-700">Click to upload or drag and drop</p>
              <p className="text-sm text-slate-400 mt-1">Maximum file size: 10MB</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="bg-white p-3 rounded-2xl border border-slate-200 text-blue-600 shadow-sm">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{file.name}</h4>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB • Ready to process</p>
                  </div>
                </div>
                <button 
                  onClick={resetUpload}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Data Preview (First 3 rows)</h5>
                <div className="overflow-hidden border border-slate-100 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-2 font-bold text-slate-600">Column 1</th>
                        <th className="px-4 py-2 font-bold text-slate-600">Column 2</th>
                        <th className="px-4 py-2 font-bold text-slate-600">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {previewData.map((row, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 text-slate-600">{row.col1}</td>
                          <td className="px-4 py-2 text-slate-600">{row.col2}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.col3.includes('OK') ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                            }`}>
                              {row.col3.includes('OK') ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                              {row.col3}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end">
                {uploadStatus === 'idle' && (
                  <button 
                    onClick={handleUpload}
                    className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
                  >
                    Process Master Data <ArrowRight size={18} />
                  </button>
                )}
                {uploadStatus === 'uploading' && (
                  <button 
                    disabled
                    className="bg-slate-200 text-slate-500 px-8 py-3 rounded-2xl font-bold flex items-center gap-2 cursor-not-allowed"
                  >
                    <Loader2 size={18} className="animate-spin" /> Processing...
                  </button>
                )}
                {uploadStatus === 'success' && (
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-2 text-green-600 font-bold">
                        <CheckCircle2 size={20} />
                        Upload Successful
                      </div>
                      {uploadSummary && (
                        <div className="text-xs text-slate-500 mt-1">
                          Inserted: {uploadSummary.inserted} • Updated: {uploadSummary.updated}
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={resetUpload}
                      className="text-slate-500 hover:text-slate-700 font-bold text-sm"
                    >
                      Upload Another
                    </button>
                  </div>
                )}
                {uploadStatus === 'error' && (
                  <div className="text-red-600 text-sm font-bold">
                    {uploadError || 'Upload failed'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload History Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-xl text-slate-600">
            <FileText size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Upload History</h3>
            <p className="text-sm text-slate-500">Track your recent master data updates.</p>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">File Name</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Type</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Upload Date</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Size</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-slate-400 text-sm italic">
                    No upload history available.
                  </td>
                </tr>
              ) : (
                history.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-blue-500" />
                        <span className="text-sm font-bold text-slate-900">{entry.fileName}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500">
                      {entry.date}
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500">
                      {entry.size}
                    </td>
                    <td className="px-8 py-5">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold ${
                        entry.status === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {entry.status === 'success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        {entry.status === 'success' ? 'SUCCESS' : 'FAILED'}
                      </span>
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

export default DataUpload;