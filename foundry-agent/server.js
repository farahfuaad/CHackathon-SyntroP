try { require("dotenv").config(); } catch {}

const { webcrypto } = require("crypto");
const express = require("express");
const { AzureCliCredential, getBearerTokenProvider } = require("@azure/identity");
const cors = require("cors");

// Polyfill Web Crypto for Node 18
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const app = express();

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/postman
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} is not allowed by Access-Control-Allow-Origin`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
};

app.use(cors(corsOptions));
// app.options("*", cors(corsOptions)); // Express 5: invalid wildcard
app.options(/.*/, cors(corsOptions));
app.use(express.json());

const BASE_URL =
  "https://aimbitious-syntrop-resource.services.ai.azure.com/api/projects/aimbitious-syntrop/applications/SyntroP-FlagProduct/protocols/openai";
const API_VERSION = "2025-11-15-preview";

const credential = new AzureCliCredential();
const getToken = getBearerTokenProvider(credential, "https://ai.azure.com/.default");

const DEFAULT_PROMPT =
  "Analyze all SKUs and classify each as DoNotReorder, Watchlist, or ReorderOK. Return strict JSON array only.";
const RETRY_PROMPT =
  "Analyze ALL SKUs from sales, InventoryStocks, and warehouse. Return one JSON object per SKU with flag_level DoNotReorder | Watchlist | ReorderOK. Return strict JSON array only. Do not return [] unless all source entities have zero rows.";
const FALLBACK_SCOPED_PROMPT =
  "Context is constrained. Use MCP with narrow reads only: first identify candidate slow-moving SKUs from sales (ams_3m <= 20 OR ams_6m <= 20 OR latest month units <= 10). Then fetch InventoryStocks and warehouse only for those candidate sku_ids. Return strict JSON array only with flag_level DoNotReorder|Watchlist|ReorderOK. If no candidates, return [].";

function extractAssistantText(payload) {
  const out = Array.isArray(payload?.output) ? payload.output : [];
  for (let i = out.length - 1; i >= 0; i--) {
    const item = out[i];
    if (item?.type === "message" && item?.role === "assistant") {
      const content = Array.isArray(item.content) ? item.content : [];
      const textPart = content.find((c) => c?.type === "output_text" && typeof c?.text === "string");
      if (textPart?.text) return textPart.text.trim();
    }
  }
  return null;
}

function tryParseJsonText(text) {
  if (!text) return null;
  let t = text.trim();

  // strip markdown fences if present
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }

  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

const CACHE_TTL_MS = 60_000;
let lastResult = null;
let lastResultAt = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readJsonSafe(resp) {
  const t = await resp.text();
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

async function callResponsesApiWithRetry(token, input, maxRetries = 4) {
  let attempt = 0;

  while (true) {
    const upstream = await fetch(`${BASE_URL}/responses?api-version=${API_VERSION}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input, stream: false }),
    });

    const payload = await readJsonSafe(upstream);

    const retriable = upstream.status === 429 || upstream.status >= 500;
    if (!retriable || attempt >= maxRetries) return { upstream, payload };

    const retryAfter = Number(upstream.headers.get("retry-after") || "0");
    const backoff = retryAfter > 0 ? retryAfter * 1000 : 700 * Math.pow(2, attempt);
    attempt += 1;
    await sleep(backoff + Math.floor(Math.random() * 250));
  }
}

app.post("/api/agent/chat", async (req, res) => {
  try {
    const now = Date.now();
    if (lastResult && now - lastResultAt < CACHE_TTL_MS) {
      return res.status(200).json(lastResult);
    }

    const { messages = [], stream = false } = req.body || {};
    if (stream) return res.status(400).json({ error: "stream=true not supported" });

    const token = await getToken();

    const input =
      Array.isArray(messages) && messages.length
        ? messages.map((m) => ({
            role: m.role,
            content: [{ type: "input_text", text: m.content || "" }],
          }))
        : [{ role: "user", content: [{ type: "input_text", text: DEFAULT_PROMPT }] }];

    const { upstream, payload } = await callResponsesApiWithRetry(token, input);

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return res.status(503).json({ error: { message: "Agent busy. Please retry in 10-30s.", code: "agent_throttled" } });
      }
      return res.status(upstream.status).json(payload);
    }

    const assistantText = extractAssistantText(payload);
    const parsed = tryParseJsonText(assistantText);

    const result = parsed ?? { message: assistantText || "No assistant output_text found" };
    lastResult = result;
    lastResultAt = Date.now();

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

const PORT = process.env.PORT || 7071;
app.listen(PORT, () => console.log(`foundry-agent listening on :${PORT}`));