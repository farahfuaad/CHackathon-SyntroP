import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/agent/slow-moving", async (req, res) => {
  try {
    const endpoint = process.env.FOUNDRY_AGENT_RESPONSES_ENDPOINT;
    const apiKey = process.env.FOUNDRY_API_KEY;

    if (!endpoint || !apiKey) {
      return res.status(500).json({
        error: "Missing FOUNDRY_AGENT_RESPONSES_ENDPOINT or FOUNDRY_API_KEY",
      });
    }

    const prompt =
      req.body?.prompt ??
      "Identify slow-moving SKUs that do not need reordering and return strict JSON.";

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
        temperature: 0.1,
      }),
    });

    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Agent proxy failed", detail: String(e) });
  }
});

app.listen(7071, () => console.log("foundry-agent listening on :7071"));