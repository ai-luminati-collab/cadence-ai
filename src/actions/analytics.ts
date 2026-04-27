'use server'

// Server-side error message sanitizer for action return values
function sanitizeActionError(msg: any): string {
  if (!msg || typeof msg !== 'string') return 'An unexpected error occurred.';
  const patterns = [
    [/credit balance is too low/i, 'AI service temporarily unavailable.'],
    [/insufficient.?funds/i, 'AI service temporarily unavailable.'],
    [/billing/i, 'AI service temporarily unavailable.'],
    [/rate.?limit|too many requests|overloaded/i, 'AI engine is busy. Please try again.'],
    [/invalid.?api.?key|authentication|permission/i, 'AI service configuration error.'],
    [/context.?length|too.?long|token.?limit/i, 'Content too large for AI processing.'],
    [/timeout|timed.?out|ETIMEDOUT/i, 'Request timed out. Please try again.'],
    [/ECONNREFUSED|ENOTFOUND|network/i, 'Network error. Please try again.'],
    [/not valid JSON|Unexpected token/i, 'AI returned unexpected response. Please try again.'],
    [/sk-[a-zA-Z0-9]/i, 'An unexpected error occurred.'],
  ];
  for (const [pat, safe] of (patterns as [RegExp, string][])) {
    if (pat.test(msg)) return safe;
  }
  if (msg.startsWith('{') || msg.startsWith('4') || msg.startsWith('5') || msg.length > 200) {
    return 'An unexpected error occurred.';
  }
  return msg;
}

import { safeParseJSON, requireParseJSON, withRetry } from '@/lib/ai-resilience'

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
      const res = await withRetry(() => askExpertAgent(prompt, true, '')); // skipReview + skip KB
      if (!res.success) throw new Error("Agent failed forecasting.");

      let resultText = (res.data || '').replace(/```json/g, '').replace(/```/g, '').trim();
      if (!resultText) throw new Error("Agent returned empty forecast");
      const parsed = requireParseJSON(resultText);
      return { success: true, data: parsed };
   } catch (error: any) {
      console.error("Analytics Forecast Failed:", error);
      return { success: false, error: sanitizeActionError(error.message) || "Failed to generate forecast" };
   }
}
