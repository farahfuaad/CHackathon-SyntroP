export type AgentFlagLevel = "DoNotReorder" | "Watchlist" | "ReorderOK";

type AgentEvidence = {
  latest_month_units?: number;
  avg_monthly_units?: number;
  months_of_cover?: number;
  total_stock?: number;
  in_hand?: number;
  backorder?: number;
  incoming?: number;
  warehouse_stock?: number;
};

type AgentRow = {
  sku_id: string;
  flag_level: AgentFlagLevel;
  reasons?: string[];
  recommendation?: string;
  evidence?: AgentEvidence;
};

export type SlowMovingAgentItem = {
  skuId: string;
  model: string;
  ams: number;
  totalStock: number;
  stockMonths: number;
  reason: string;
  flagLevel: AgentFlagLevel;
  recommendation: string;
  source: "agent";
};

// Prefer env override; default to local foundry-agent server
const AGENT_API_URL =
  (import.meta as any)?.env?.VITE_AGENT_API_URL ||
  "http://localhost:7071/api/agent/chat";

function toNum(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

function normalizeFlag(v: unknown): AgentFlagLevel {
  if (v === "DoNotReorder" || v === "Watchlist" || v === "ReorderOK") return v;
  const s = String(v ?? "").toLowerCase();
  if (s.includes("donotreorder") || s.includes("do_not_reorder")) return "DoNotReorder";
  if (s.includes("watch")) return "Watchlist";
  return "ReorderOK";
}

function parseJsonArray(text: string): AgentRow[] {
  const t = text.trim();
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const start = t.indexOf("[");
    const end = t.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(t.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [parsed];
    }
    throw new Error("Agent response was not valid JSON.");
  }
}

function extractRows(payload: any): AgentRow[] {
  if (Array.isArray(payload)) return payload as AgentRow[];
  if (Array.isArray(payload?.items)) return payload.items as AgentRow[];
  if (typeof payload?.output_text === "string") return parseJsonArray(payload.output_text);

  const output = payload?.output;
  if (Array.isArray(output)) {
    for (const o of output) {
      const content = o?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (typeof c?.text === "string") return parseJsonArray(c.text);
      }
    }
  }

  throw new Error("Unexpected agent response shape.");
}

let inFlight: Promise<SlowMovingAgentItem[]> | null = null;

export async function getSlowMovingAgentItems(): Promise<SlowMovingAgentItem[]> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const prompt =
      "Analyze ALL SKUs and classify each as DoNotReorder, Watchlist, or ReorderOK. Return strict JSON array only.";

    const res = await fetch(
      (import.meta as any)?.env?.VITE_AGENT_API_URL || "http://localhost:7071/api/agent/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Agent request failed (${res.status})`);
    }

    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    return rows.map((r: any) => ({
      skuId: String(r?.sku_id ?? ""),
      model: String(r?.sku_id ?? ""),
      ams: Number(r?.evidence?.avg_monthly_units ?? 0),
      totalStock: Number(r?.evidence?.total_stock ?? 0),
      stockMonths: Number(r?.evidence?.months_of_cover ?? 0),
      reason: Array.isArray(r?.reasons) && r.reasons.length ? String(r.reasons[0]) : "No reason provided",
      flagLevel: (r?.flag_level ?? "Watchlist") as AgentFlagLevel,
      recommendation: String(r?.recommendation ?? ""),
      source: "agent",
    }));
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}