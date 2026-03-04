
export enum WarehouseCategory {
  RETAIL = 'BR-NM',
  TIKTOK = 'BR-NM6',
  LAZADA = 'BR-NM8',
  SHOPEE = 'BR-NM9',
  ESTORE = 'BR-NM1',
  PROJECT = 'BR-NM10', // To be excluded from planning
  CORPORATE = 'BR-NM2', // To be excluded from planning
  EAST_MAS = 'BR-NM3',
  MINOR_BP = 'BR-NM11',
  REWORK = 'BR-RP',
  SIRIM = 'BR-INC',
  INCOMPLETE = 'BR-INC2'
}

export interface SKU {
  id: string;
  model: string;
  description: string;
  category: 'Ducting' | 'Hood Cooker' | 'Medical' | 'Appliances';
  inStock: Record<WarehouseCategory, number>;
  incoming: number; // On the way to port
  backorder: number;
  ams: number; // Average Monthly Sales
  failureRate: number; // BR1
  defectsCount: number; // BR1
  leadTimeDays: number; // BR2
  supplierReliability: number; // BR2 (0-1)
  dimensions: { l: number; w: number; h: number }; // BR4
  weight: number;
  isSlowMoving: boolean; // BR3
  exclusionReason?: string; // BR3
  supplierId: string; // Linked to MOCK_SUPPLIERS
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  rating: number;
  standardLeadTime: number;
}

export interface ContainerType {
  name: string;
  capacityCbm: number;
  maxWeightKg: number;
}

export interface PRItem {
  skuId: string;
  model: string;
  qty: number;
  supplierId: string;
}

export interface PurchaseRequisition {
  id: string;
  title: string;
  items: PRItem[];
  containerType: string;
  utilizationCbm: number;
  utilizationWeight: number;
  status: 'DRAFT' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  emailSentAt?: string;
}