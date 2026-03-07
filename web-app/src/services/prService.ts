import { apiDelete, apiGetListAll, apiPatch, apiPost } from "./apiClient";
import { PurchaseRequisition } from '../../types';

const ENTITY_PR = "PR";
const ENTITY_PR_LINE = "PRLine";
const VALID_PR_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] as const;

export type PrStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PENDING";

type PrHeaderRow = {
  pr_id: string;
  pr_title?: string | null;
  container_id?: number | null;
  status?: string | null;
  remarks?: string | null;
  createdOn?: string | null;
  updatedOn?: string | null;
};

type PrLineRow = {
  pr_line_id: number;
  pr_id?: string | null;
  sku_id?: string | null;
  supplier_id?: number | null;
  unit_qty?: number | null;
  line_status?: string | null;
};

export type PrUiLineItem = {
  lineId: number;
  prId: string;
  skuId?: string;
  supplierId?: number;
  unitQty: number;
  status: PrStatus;
};

export type PrUiItem = {
  id: string;
  title?: string;
  containerId?: number;
  status: PrStatus;
  remarks?: string;
  emailSentAt?: string;
  createdOn?: string;
  updatedOn?: string;
  lines: PrUiLineItem[];
};

export type CreatePrWithLinesInput = {
  id: string;
  title?: string;
  containerId?: number;
  status?: PrStatus;
  remarks?: string;
  createdOn?: string | Date;
  updatedOn?: string | Date;
  items: Array<{
    skuId: string;
    supplierId?: number;
    unitQty: number;
    status?: PrStatus;
  }>;
};

function toIsoDateTime(value?: string | Date): string {
  if (!value) return new Date().toISOString();
  return typeof value === "string" ? value : value.toISOString();
}

function normalizePrStatus(v?: string | null, fallback: PrStatus = "DRAFT"): PrStatus {
  const raw = (v || "").trim().toUpperCase();
  if (raw === "DRAFT" || raw === "SUBMITTED" || raw === "APPROVED" || raw === "REJECTED" || raw === "PENDING") {
    return raw;
  }
  return fallback;
}

function toUiLine(row: PrLineRow): PrUiLineItem {
  return {
    lineId: Number(row.pr_line_id) || 0,
    prId: row.pr_id || "",
    skuId: row.sku_id ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    unitQty: Number(row.unit_qty) || 0,
    status: normalizePrStatus(row.line_status, "DRAFT"),
  };
}

function toUiHeader(row: PrHeaderRow, lines: PrLineRow[]): PrUiItem {
  return {
    id: row.pr_id,
    title: row.pr_title ?? undefined,
    containerId: row.container_id ?? undefined,
    status: normalizePrStatus(row.status, "DRAFT"),
    remarks: row.remarks ?? undefined,
    createdOn: row.createdOn ?? undefined,
    updatedOn: row.updatedOn ?? undefined,
    lines: lines.map(toUiLine),
  };
}

export async function fetchPrList(): Promise<PrUiItem[]> {
  const [headers, lines] = await Promise.all([
    apiGetListAll<PrHeaderRow>(ENTITY_PR),
    apiGetListAll<PrLineRow>(ENTITY_PR_LINE),
  ]);

  const byPrId = new Map<string, PrLineRow[]>();
  for (const line of lines) {
    const key = (line.pr_id || "").trim();
    if (!key) continue;
    const arr = byPrId.get(key) || [];
    arr.push(line);
    byPrId.set(key, arr);
  }

  return headers
    .map((h) => toUiHeader(h, byPrId.get((h.pr_id || "").trim()) || []))
    .sort((a, b) => (b.createdOn || "").localeCompare(a.createdOn || ""));
}

async function replacePrLines(prId: string, items: CreatePrWithLinesInput["items"], fallbackStatus: PrStatus): Promise<void> {
  const existingLines = await apiGetListAll<PrLineRow>(ENTITY_PR_LINE);
  const linesForPr = existingLines.filter((x) => (x.pr_id || "").trim() === prId.trim());

  for (const line of linesForPr) {
    await apiDelete(ENTITY_PR_LINE, "pr_line_id", line.pr_line_id);
  }

  for (const item of items) {
    if (!item.skuId?.trim()) continue;
    await apiPost<PrLineRow>(ENTITY_PR_LINE, {
      pr_id: prId.trim(),
      sku_id: item.skuId.trim(),
      supplier_id: item.supplierId ?? null,
      unit_qty: Number(item.unitQty) || 0,
      line_status: normalizePrStatus(item.status, fallbackStatus),
    });
  }
}

export async function createPrWithLines(input: CreatePrWithLinesInput): Promise<PrUiItem> {
  if (!input.id?.trim()) throw new Error("pr_id is required");
  if (!input.items?.length) throw new Error("At least one PR line is required");

  const status = normalizePrStatus(input.status, "SUBMITTED");

  const createdHeader = await apiPost<PrHeaderRow>(ENTITY_PR, {
    pr_id: input.id.trim(),
    pr_title: input.title?.trim() || null,
    container_id: input.containerId ?? null,
    status,
    remarks: input.remarks?.trim() || null,
    createdOn: toIsoDateTime(input.createdOn),
    updatedOn: toIsoDateTime(input.updatedOn),
  });

  await replacePrLines(input.id, input.items, status);

  const allLines = await apiGetListAll<PrLineRow>(ENTITY_PR_LINE);
  const linesForPr = allLines.filter((x) => (x.pr_id || "").trim() === input.id.trim());
  return toUiHeader(createdHeader, linesForPr);
}

export async function saveDraftPr(input: CreatePrWithLinesInput): Promise<PrUiItem> {
  if (!input.id?.trim()) throw new Error("pr_id is required");

  const prId = input.id.trim();
  const headers = await apiGetListAll<PrHeaderRow>(ENTITY_PR);
  const exists = headers.find((h) => (h.pr_id || "").trim() === prId);

  const patchPayload = {
    pr_title: input.title?.trim() || null,
    container_id: input.containerId ?? null,
    status: "DRAFT",
    remarks: input.remarks?.trim() || null,
    updatedOn: toIsoDateTime(input.updatedOn),
  };

  let header: PrHeaderRow;
  if (exists) {
    await apiPatch(ENTITY_PR, "pr_id", prId, patchPayload as Record<string, unknown>);
    header = { ...exists, ...patchPayload, pr_id: prId };
  } else {
    header = await apiPost<PrHeaderRow>(ENTITY_PR, {
      pr_id: prId,
      ...patchPayload,
      createdOn: toIsoDateTime(input.createdOn),
    });
  }

  await replacePrLines(prId, input.items || [], "DRAFT");

  const allLines = await apiGetListAll<PrLineRow>(ENTITY_PR_LINE);
  const linesForPr = allLines.filter((x) => (x.pr_id || "").trim() === prId);
  return toUiHeader(header, linesForPr);
}

export async function updatePr(
  prId: string,
  patch: Partial<Pick<PrUiItem, "title" | "containerId" | "status" | "remarks" | "emailSentAt" | "updatedOn">>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) payload.pr_title = patch.title?.trim() || null;
  if (patch.containerId !== undefined) payload.container_id = patch.containerId ?? null;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.remarks !== undefined) payload.remarks = patch.remarks?.trim() || null;
  // Keep queue API compatible: if emailSentAt is provided, persist the nearest available timestamp column.
  if (patch.emailSentAt !== undefined && patch.updatedOn === undefined) {
    payload.updatedOn = toIsoDateTime(patch.emailSentAt);
  }
  if (patch.updatedOn !== undefined) payload.updatedOn = toIsoDateTime(patch.updatedOn);

  await apiPatch(ENTITY_PR, "pr_id", prId, payload);
}

export async function deletePr(prId: string): Promise<void> {
  const lines = await apiGetListAll<PrLineRow>(ENTITY_PR_LINE);
  const toDelete = lines.filter((x) => (x.pr_id || "").trim() === prId.trim());

  for (const line of toDelete) {
    await apiDelete(ENTITY_PR_LINE, "pr_line_id", line.pr_line_id);
  }

  await apiDelete(ENTITY_PR, "pr_id", prId);
}

export async function fetchPrWithLines(): Promise<PurchaseRequisition[]> {
  const [headers, lines] = await Promise.all([
    apiGetListAll<PrHeaderRow>(ENTITY_PR),
    apiGetListAll<PrLineRow>(ENTITY_PR_LINE),
  ]);

  const byPrId = new Map<string, PrLineRow[]>();
  for (const line of lines) {
    const key = (line.pr_id || "").trim();
    if (!key) continue;
    const arr = byPrId.get(key) || [];
    arr.push(line);
    byPrId.set(key, arr);
  }

  return headers
    .map((header) => {
      const id = (header.pr_id || "").trim();
      const lineItems = byPrId.get(id) || [];
      return {
        id,
        title: (header.pr_title || id || "Untitled PR").trim(),
        containerType: header.container_id != null ? `Container #${header.container_id}` : "N/A",
        utilizationCbm: 0,
        utilizationWeight: 0,
        status: normalizeStatus(header.status),
        createdAt: header.createdOn || new Date().toISOString(),
        emailSentAt: undefined,
        updatedOn: header.updatedOn || undefined,
        items: lineItems.map((line) => ({
          skuId: (line.sku_id || "").trim(),
          model: (line.sku_id || "Unknown").trim() || "Unknown",
          qty: Number(line.unit_qty) || 0,
          supplierId: line.supplier_id != null ? String(line.supplier_id) : undefined,
        })),
      } as PurchaseRequisition;
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function normalizeStatus(value: unknown): PurchaseRequisition['status'] {
  const s = String(value ?? 'DRAFT').toUpperCase();
  if (s === 'SUBMITTED') return 'PENDING';
  return (VALID_PR_STATUSES as readonly string[]).includes(s)
    ? (s as PurchaseRequisition['status'])
    : 'DRAFT';
}