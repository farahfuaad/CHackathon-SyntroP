const rawApiBase = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL =
  rawApiBase && /^https?:\/\//i.test(rawApiBase)
    ? rawApiBase.replace(/\/+$/, "")
    : (import.meta.env.DEV
        ? "http://localhost:5000/api"
        : "https://mcp-syntropdb-latest.onrender.com/api");

// Backward-compatible alias used below
const API_BASE = API_BASE_URL;

const ENTITY_ALIASES: Record<string, string> = {
  Sales: "sales",
  Warehouse: "warehouse",
  Supplier: "supplier",
};

function resolveEntityName(entity: string): string {
  return ENTITY_ALIASES[entity] ?? entity;
}

function buildUrl(entity: string, pkName?: string, pkValue?: string | number): string {
  const resolved = resolveEntityName(entity);

  if (pkName && pkValue !== undefined && pkValue !== null) {
    // Explicit PK route for DAB (avoids implicit PK template error)
    return `${API_BASE}/${resolved}/${encodeURIComponent(pkName)}/${encodeURIComponent(String(pkValue))}`;
  }

  if (pkValue !== undefined && pkValue !== null) {
    // fallback legacy shape
    return `${API_BASE}/${resolved}/${encodeURIComponent(String(pkValue))}`;
  }

  return `${API_BASE}/${resolved}`;
}

type DABListResponse<T> = { value: T[]; nextLink?: string };
type QueryParams = Record<string, string | number>;

function defaultHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    ...(extra || {}),
  };

  // Optional: set in .env if your DAB requires them
  const role = import.meta.env.VITE_DAB_ROLE as string | undefined; // e.g. "anonymous"
  const apiKey = import.meta.env.VITE_DAB_API_KEY as string | undefined;

  if (role) h["X-MS-API-ROLE"] = role;
  if (apiKey) h["x-api-key"] = apiKey;

  return h;
}

function toQuery(params?: QueryParams) {
  if (!params) return "";
  const parts: string[] = [];
  Object.entries(params).forEach(([k, v]) => {
    // Keep $-prefixed params readable for DAB (e.g. $after)
    parts.push(`${k}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join("&")}` : "";
}

async function readError(res: Response, action: string, entity: string) {
  let details = "";
  try {
    details = await res.text();
  } catch {
    details = "";
  }
  throw new Error(`${action} ${entity} failed: ${res.status} [${res.url}]${details ? ` - ${details}` : ""}`);
}

function resolveNextUrl(nextLink: string) {
  if (/^https?:\/\//i.test(nextLink)) return nextLink;
  return `${API_BASE}${nextLink.startsWith("/") ? "" : "/"}${nextLink}`;
}

async function fetchListPage<T>(url: string): Promise<{ items: T[]; nextLink?: string }> {
  const res = await fetch(url, { method: "GET", headers: defaultHeaders() });
  if (!res.ok) await readError(res, "GET", "list");

  const data = (await res.json()) as T[] | DABListResponse<T>;
  if (Array.isArray(data)) return { items: data };

  return {
    items: data.value ?? [],
    nextLink: data.nextLink,
  };
}

function extractAfterToken(nextLink?: string): string | undefined {
  if (!nextLink) return undefined;
  try {
    // Works for absolute or relative nextLink
    const u = new URL(nextLink, `${API_BASE}/`);
    return u.searchParams.get("$after") ?? u.searchParams.get("after") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function apiGetList<T>(entity: string, params?: QueryParams): Promise<T[]> {
  const url = `${buildUrl(entity)}${toQuery(params)}`;
  const { items } = await fetchListPage<T>(url);
  return items;
}

export async function apiGetListAll<T>(entity: string): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined = undefined;

  while (true) {
    const url = `${buildUrl(entity)}${after ? toQuery({ $after: after }) : ""}`;
    const page = await fetchListPage<T>(url);
    all.push(...page.items);

    const nextAfter = extractAfterToken(page.nextLink);
    if (!nextAfter) break;
    after = nextAfter;
  }

  return all;
}

export async function apiPost<T>(entity: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(buildUrl(entity), {
    method: "POST",
    headers: defaultHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readError(res, "POST", entity);
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export async function apiPatch<T>(
  entity: string,
  pkName: string,
  pkValue: string | number,
  payload: Record<string, unknown>
): Promise<T | null> {
  const res = await fetch(buildUrl(entity, pkName, pkValue), {
    method: "PATCH",
    headers: defaultHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readError(res, "PATCH", entity);
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export async function apiDelete(entity: string, pkName: string, pkValue: string | number): Promise<void> {
  const res = await fetch(buildUrl(entity, pkName, pkValue), {
    method: "DELETE",
    headers: defaultHeaders(),
  });
  if (!res.ok) await readError(res, "DELETE", entity);
}

export type BatchUploadOptions = {
  batchSize?: number;      // default 1000
  concurrency?: number;    // default 3
  onProgress?: (done: number, total: number) => void;
};

export async function apiPostRaw<T>(entity: string, payload: unknown): Promise<T> {
  const res = await fetch(buildUrl(entity), {
    method: "POST",
    headers: defaultHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readError(res, "POST", entity);
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function apiPostBatched<TItem, TResult = unknown>(
  entity: string,
  items: TItem[],
  toPayload: (batch: TItem[]) => unknown,
  opts: BatchUploadOptions = {}
): Promise<TResult[]> {
  const batchSize = Math.max(1, opts.batchSize ?? 1000);
  const concurrency = Math.max(1, opts.concurrency ?? 3);

  const batches = chunkArray(items, batchSize);
  const results: TResult[] = [];
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const current = next++;
      const payload = toPayload(batches[current]);
      const res = await apiPostRaw<TResult>(entity, payload);
      results[current] = res;
      done += batches[current].length;
      opts.onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));
  return results;
}