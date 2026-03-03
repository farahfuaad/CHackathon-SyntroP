import { apiGetListAll, apiPatch, apiPost } from "./apiClient";

type CsvRow = Record<string, string>;

type ContainerRow = {
  container_id: number;
  container_type?: string | null;
  max_vol_cbm?: number | null;
  max_vol_kg?: number | null;
};

const ENTITY_CONTAINER = "ContainerSpecs";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, idx) => (row[h] = cols[idx] ?? ""));
    rows.push(row);
  }

  return rows;
}

function normalize(v: string) {
  return (v || "").trim().toLowerCase();
}

function toFloat(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toContainerPayload(row: CsvRow) {
  const containerType = (row["Container_Type"] || "").trim();
  if (!containerType) throw new Error("Missing Container_Type");

  return {
    container_type: containerType,
    max_vol_cbm: toFloat(row["Max_Volume_CBM"], 0),
    max_vol_kg: toFloat(row["Max_Weight_kg"], 0),
  };
}

export async function buildContainerPreview(file: File) {
  const text = await file.text();
  const rows = parseCsv(text).slice(0, 3);

  return rows.map((r) => {
    const type = (r["Container_Type"] || "").trim();
    const cbm = (r["Max_Volume_CBM"] || "").trim();
    const kg = (r["Max_Weight_kg"] || "").trim();
    const ok = !!type;

    return {
      col1: type || "(Missing Container_Type)",
      col2: `${cbm || "0"} cbm • ${kg || "0"} kg`,
      col3: ok ? "Status OK" : "Review Needed",
    };
  });
}

export async function uploadContainerCsv(file: File) {
  const text = await file.text();
  const rows = parseCsv(text);

  const existing = await apiGetListAll<ContainerRow>(ENTITY_CONTAINER);
  const byType = new Map<string, ContainerRow>();
  existing.forEach((c) => {
    const key = normalize(c.container_type || "");
    if (key) byType.set(key, c);
  });

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const payload = toContainerPayload(rows[i]);
      const key = normalize(payload.container_type);
      const found = byType.get(key);

      if (found) {
        await apiPatch(
          ENTITY_CONTAINER,
          "container_id",
          found.container_id,
          payload as Record<string, unknown>
        );
        updated++;
      } else {
        const created = await apiPost<ContainerRow>(
          ENTITY_CONTAINER,
          payload as Record<string, unknown>
        );
        inserted++;
        if (created?.container_type) {
          byType.set(normalize(created.container_type), created);
        }
      }
    } catch (e: any) {
      failed++;
      errors.push(`Row ${i + 2}: ${e?.message || "Unknown error"}`);
    }
  }

  return {
    total: rows.length,
    success: inserted + updated,
    failed,
    inserted,
    updated,
    errors,
  };
}