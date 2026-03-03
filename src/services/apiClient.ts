const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/rest").replace(/\/$/, "");

type DABListResponse<T> = { value: T[] };
type QueryParams = Record<string, string | number>;

function toQuery(params?: QueryParams) {
  if (!params) return "";
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => s.set(k, String(v)));
  return `?${s.toString()}`;
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
  throw new Error(`${action} ${entity} failed: ${res.status}${details ? ` - ${details}` : ""}`);
}

export async function apiGetList<T>(entity: string, params?: QueryParams): Promise<T[]> {
  const res = await fetch(`${buildUrl(entity)}${toQuery(params)}`);
  if (!res.ok) await readError(res, "GET", entity);
  const json = (await res.json()) as DABListResponse<T>;
  return json.value ?? [];
}

export async function apiPost<T>(entity: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(buildUrl(entity), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readError(res, "POST", entity);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readError(res, "PATCH", entity);
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export async function apiDelete(entity: string, pkName: string, pkValue: string | number): Promise<void> {
  const res = await fetch(buildUrl(entity, pkName, pkValue), { method: "DELETE" });
  if (!res.ok) await readError(res, "DELETE", entity);
}