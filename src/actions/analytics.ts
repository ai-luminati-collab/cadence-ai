'use server'

import { askExpertAgent } from '@/lib/openai-agent'
import { BrandInfo, Strategy, PredictedMetrics } from '@/stores/brand'

export async function generatePredictedPerformance(brandInfo: BrandInfo, strategy: Strategy): Promise<{ success: boolean; data?: PredictedMetrics; error?: string }> {
   if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
   }

   const prompt = `
      You are the "Legendary Marketer" AI Engine.
      Using the following Brand Strategy, predict the next 30 days of performance if this brand executes perfectly on social media.
      
      Brand: ${brandInfo.name}
      Strategy One-Liner: ${strategy.oneLineStrategy}
      Target Audience: ${strategy.targetAudience}
      Industry: ${brandInfo.industry}
      
      Requirements:
      1. Reach: Estimated total views/impressions.
      2. Engagement: Average percentage based on industry benchmarks + strategy quality.
      3. Profile Visits: Traffic driven back to brand.
      4. ROI Score: 1-100 score of strategy effectiveness.
      5. Growth Trajectory: A list of 7 points (x from 0-30 days, y as arbitrary growth units) for a chart.
      
      Return STRICTLY a JSON object with this shape:
      {
         "reach": { "value": "e.g. 150k", "trend": "+22%" },
         "engagement": { "value": "e.g. 4.8%", "trend": "+0.5%" },
         "visits": { "value": "e.g. 8,240", "trend": "+12%" },
         "roi": { "value": "92/100", "status": "Optimal" },
         "growthData": [
            { "x": 0, "y": 10 },
            { "x": 5, "y": 15 },
            ... (7 points total)
         ]
      }
   `;

   try {
      const res = await askExpertAgent(prompt, true, ''); // skipReview + skip KB
      if (!res.success) throw new Error("Agent failed forecasting.");

      let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim();
      return { success: true, data: JSON.parse(resultText) };
   } catch (error: any) {
      console.error("Analytics Forecast Failed:", error);
      return { success: false, error: error.message || "Failed to generate forecast" };
   }
}
