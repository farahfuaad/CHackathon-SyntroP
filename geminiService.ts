
import { GoogleGenAI, Type } from "@google/genai";
import { SKU } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getProcurementInsights = async (skus: SKU[]) => {
  const modelName = 'gemini-3-flash-preview';
  
  const prompt = `
    Analyze the following procurement data for Fiamma Group.
    Based on AMS (Average Monthly Sales), Current Stock (excluding Project/Corporate), and lead times, 
    identify high-risk items, slow-moving SKUs, and recommended purchase quantities for the next 3 months.
    
    Data: ${JSON.stringify(skus.map(s => ({
      model: s.model,
      ams: s.ams,
      stock: s.inStock,
      incoming: s.incoming,
      failureRate: s.failureRate,
      isSlowMoving: s.isSlowMoving
    })))}
    
    Provide a professional summary with specific focus on:
    1. Overstocking risks (Slow moving).
    2. Understocking risks (Stock lasting less than 1 month).
    3. Quality issues (High failure rates).
    4. Suggested Strategic actions.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.95,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "Unable to fetch AI insights at this moment.";
  }
};

export const suggestPurchaseQuantity = async (sku: SKU) => {
    // Intelligent quantity suggestion using Gemini
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Suggest a purchase order quantity for SKU ${sku.model}. AMS: ${sku.ams}, Current Stock: ${sku.ams * 2.5}, Incoming: ${sku.incoming}, Seasonal factor: 1.2 (Upcoming festival).`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    recommendedQty: { type: Type.NUMBER },
                    reasoning: { type: Type.STRING }
                },
                required: ["recommendedQty", "reasoning"]
            }
        }
    });
    return JSON.parse(response.text);
}
