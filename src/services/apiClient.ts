const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/rest").replace(/\/$/, "");

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

function buildUrl(entity: string, ...segments: Array<string | number>) {
  const path = [entity, ...segments].map((x) => encodeURIComponent(String(x))).join("/");
  return `${API_BASE}/${path}`;
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