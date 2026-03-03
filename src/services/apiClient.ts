const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/rest";

type DABListResponse<T> = { value: T[] };
type QueryParams = Record<string, string | number>;

function toQuery(params?: QueryParams) {
  if (!params) return "";
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => s.set(k, String(v)));
  return `?${s.toString()}`;
}

export async function apiGetList<T>(entity: string, params?: QueryParams): Promise<T[]> {
  const res = await fetch(`${API_BASE}/${entity}${toQuery(params)}`);
  if (!res.ok) throw new Error(`GET ${entity} failed: ${res.status}`);
  const json = (await res.json()) as DABListResponse<T>;
  return json.value ?? [];
}

export async function apiPost<T>(entity: string, payload: Record<string, unknown>): Promise<T> {
  const base = (import.meta.env.VITE_API_BASE_URL || '/rest').replace(/\/$/, '');
  const url = `${base}/${entity}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let details = '';
    try {
      details = await res.text();
    } catch {
      details = '';
    }
    throw new Error(`POST ${entity} failed: ${res.status}${details ? ` - ${details}` : ''}`);
  }

  return (await res.json()) as T;
}

export async function apiPatch<T>(
  entity: string,
  pkName: string,
  pkValue: string | number,
  payload: Record<string, unknown>
): Promise<T | null> {
  const res = await fetch(`${API_BASE}/${entity}/${pkName}/${pkValue}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PATCH ${entity} failed: ${res.status}`);
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export async function apiDelete(entity: string, pkName: string, pkValue: string | number): Promise<void> {
  const res = await fetch(`${API_BASE}/${entity}/${pkName}/${pkValue}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${entity} failed: ${res.status}`);
}