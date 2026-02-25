
import { SKU, WarehouseCategory, Supplier, ContainerType } from './types';

export const MOCK_SKUS: SKU[] = [
  {
    id: 'TAE11-005T',
    supplierId: 'S1',
    model: 'RDS-DC-18 (CB)',
    description: 'Ducting System High Performance',
    category: 'Ducting',
    inStock: {
      [WarehouseCategory.RETAIL]: 413,
      [WarehouseCategory.TIKTOK]: 3,
      [WarehouseCategory.PROJECT]: 33, // Excluded
      [WarehouseCategory.REWORK]: 4,
      [WarehouseCategory.EAST_MAS]: 0,
    } as any,
    incoming: 168,
    backorder: 12,
    ams: 45,
    failureRate: 0.02,
    defectsCount: 5,
    leadTimeDays: 45,
    supplierReliability: 0.95,
    dimensions: { l: 60, w: 60, h: 40 },
    weight: 15,
    isSlowMoving: false
  },
  {
    id: 'TAE11-M310/XR',
    supplierId: 'S1',
    model: 'SIROCCO XR-BL (WM)',
    description: 'Hood Cooker SIROCCO with Cap',
    category: 'Hood Cooker',
    inStock: {
      [WarehouseCategory.RETAIL]: 150,
      [WarehouseCategory.TIKTOK]: 3,
      [WarehouseCategory.PROJECT]: 0,
      [WarehouseCategory.REWORK]: 2,
      [WarehouseCategory.EAST_MAS]: 3,
    } as any,
    incoming: 0,
    backorder: 0,
    ams: 23,
    failureRate: 0.08,
    defectsCount: 18,
    leadTimeDays: 60,
    supplierReliability: 0.72,
    dimensions: { l: 90, w: 50, h: 50 },
    weight: 22,
    isSlowMoving: false
  },
  {
    id: 'TAE11-M323/XR',
    supplierId: 'S2',
    model: 'BOXLINE XR (WM)',
    description: 'BOXLINE XR - No Project',
    category: 'Hood Cooker',
    inStock: {
      [WarehouseCategory.RETAIL]: 1,
      [WarehouseCategory.TIKTOK]: 0,
      [WarehouseCategory.PROJECT]: 48,
      [WarehouseCategory.REWORK]: 0,
      [WarehouseCategory.EAST_MAS]: 0,
    } as any,
    incoming: 0,
    backorder: 5,
    ams: 2.5,
    failureRate: 0.01,
    defectsCount: 1,
    leadTimeDays: 30,
    supplierReliability: 0.98,
    dimensions: { l: 80, w: 45, h: 45 },
    weight: 18,
    isSlowMoving: true,
    exclusionReason: 'Low demand / Obsolete'
  }
];

export const MOCK_SUPPLIERS: Supplier[] = [
  { id: 'S1', name: 'Zhongshan Appliances Ltd', email: 'sales@zhongshan.cn', rating: 4.5, standardLeadTime: 45 },
  { id: 'S2', name: 'Global Medical Systems', email: 'orders@globalmed.com', rating: 3.8, standardLeadTime: 60 }
];

export const CONTAINER_TYPES: ContainerType[] = [
  { name: "20' Standard", capacityCbm: 33.1, maxWeightKg: 28000 },
  { name: "40' Standard", capacityCbm: 67.5, maxWeightKg: 28500 },
  { name: "40' High Cube", capacityCbm: 76.1, maxWeightKg: 28500 }
];
