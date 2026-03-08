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

const AGENT_API_URL =
  import.meta.env.VITE_AGENT_API_URL || "/api/agent/slow-moving";

function toNum(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
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

export async function getSlowMovingAgentItems(): Promise<SlowMovingAgentItem[]> {
  const prompt =
    "Identify slow-moving SKUs that do not need reordering. " +
    "Always use MCP tools first and return strict JSON array in the required schema.";

  const res = await fetch(AGENT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) throw new Error(`Agent request failed (${res.status})`);
  const data = await res.json();
  const rows = extractRows(data);

  return rows.map((r) => {
    const ev = r.evidence ?? {};
    const ams = toNum(ev.avg_monthly_units, 0);
    const totalStock = toNum(ev.total_stock, 0);
    const stockMonths =
      toNum(ev.months_of_cover, ams > 0 ? totalStock / ams : totalStock > 0 ? 999 : 0);

    return {
      skuId: r.sku_id,
      model: r.sku_id,
      ams,
      totalStock,
      stockMonths,
      reason: r.reasons?.[0] ?? "No reason provided",
      flagLevel: r.flag_level,
      recommendation: r.recommendation ?? "",
      source: "agent",
    };
  });
}