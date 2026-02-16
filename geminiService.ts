import { SKU } from "./types";

export const getProcurementInsights = async (skus: SKU[]) => {
  // Mock insights without AI
  const criticalLowStock = skus.filter(s => {
    const totalStock = Object.values(s.inStock).reduce((a, b) => a + b, 0);
    return totalStock / s.ams < 1;
  });
  
  const slowMoving = skus.filter(s => s.isSlowMoving);
  const highFailureRate = skus.filter(s => s.failureRate > 0.05);

  return `
## Procurement Analysis Summary

### 🔴 Critical Risks
- **${criticalLowStock.length} SKUs** with less than 1 month of stock
- **${highFailureRate.length} items** showing quality concerns (>5% failure rate)

### 📊 Overstocking Risks
- **${slowMoving.length} slow-moving SKUs** requiring review

### ✅ Recommended Actions
1. Prioritize restocking for critical low-stock items
2. Review slow-moving inventory for markdown/discontinuation
3. Implement quality control measures for high-failure SKUs
4. Optimize lead times with supplier negotiations
  `;
};

export const suggestPurchaseQuantity = async (sku: SKU) => {
  // Simple calculation without AI
  const totalStock = Object.values(sku.inStock).reduce((a, b) => a + b, 0) + sku.incoming;
  const monthsOfStock = totalStock / sku.ams;
  const targetMonths = 3;
  const recommendedQty = Math.max(0, Math.ceil((targetMonths - monthsOfStock) * sku.ams));

  return {
    recommendedQty,
    reasoning: `Based on ${sku.ams} AMS and current ${monthsOfStock.toFixed(1)} months of stock, recommend ${recommendedQty} units to reach 3-month target.`
  };
};
