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

import { askExpertAgent, askExpertAgentPremium } from '@/lib/openai-agent'
import { BrandInfo } from '@/stores/brand'
import { buildProductContext } from '@/lib/product-context'
import { getStrategicPatternLibrary, getCompilationSources } from '@/lib/knowledge-loader'

// ═══════════════════════════════════════════════════════════════
// PHASE 1: Marketing Strategy (runs at onboarding)
// Generates: positioning, audiences, narratives, USP, competitors,
// psychographic triggers, strategic patterns, measurement plan
// ═══════════════════════════════════════════════════════════════
export async function generateMarketingStrategy(brandDetails: BrandInfo, isRefresh = false) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR_KEY_HERE')) {
    throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
  }

  const strategicPatternLibrary = await getStrategicPatternLibrary()

  const prompt = `
    You are "The Legendary Marketer" — the most adaptive, globally respected, and results-obsessed marketing strategist alive.
    You build UNIVERSAL BRAND OPERATING SYSTEMS. Your strategies are channel-agnostic at the foundation.

    Core Mandate: Ever-Evolving, Audience First, Category-Agnostic, Impact-Obsessed, Execution-Ready.
    You do NOT provide generic advice. You provide ruthless strategic leverage.

    You are tasked with generating ${isRefresh ? 'an UPDATED' : 'the master'} MARKETING STRATEGY for a client.
    This is Phase 1 — overall brand positioning and marketing intelligence. Social media specifics come later.

    Client Intake Brief:
    Brand Name: ${brandDetails.name}
    Industry: ${brandDetails.industry === 'Other (Custom)' ? brandDetails.industryCustom : brandDetails.industry}
    Website: ${brandDetails.website || 'Not provided'}
    USP: ${brandDetails.usp || 'None specified'}
    Major Competitors: ${brandDetails.competitors || 'None specified'}
    Target Platforms: ${brandDetails.platforms?.join(', ') || 'General Social Media'}

    ${buildProductContext(brandDetails.brandType, brandDetails.productCatalog, brandDetails.serviceOfferings, brandDetails.uploadedDocs) ? `
    === PRODUCT/SERVICE INTELLIGENCE ===
    ${buildProductContext(brandDetails.brandType, brandDetails.productCatalog, brandDetails.serviceOfferings, brandDetails.uploadedDocs)}
    ===================================
    ` : ''}

    ${brandDetails.aiResearchMode ? `
    PATH: AUTONOMOUS INTELLIGENCE (AI-LED RESEARCH)
    Deduce exact Target Audiences, behaviors, desires, and goals autonomously from the brand name and website.
    ` : `
    PATH: COLLABORATIVE DEEP CONTEXT
    Target Audiences: ${brandDetails.primaryAudiences?.join(' & ') || 'None'}
    Age Range: ${brandDetails.ageRange || 'Not provided'}
    Goals: ${brandDetails.primaryGoals?.join(' & ') || 'None'}
    Psychographics: ${brandDetails.psychographics || 'None'}
    Tone: ${brandDetails.tone?.join(', ') || 'Authoritative'}

    ACT AS A SCRUTINIZER. If inputs are generic or weak, OVERRIDE with Legendary Marketer insights.
    `}

    Extra Context: ${brandDetails.extraNotes || 'None'}

    ${brandDetails.aiKnowledgeBase?.length ? `
    KNOWLEDGE BASE (EPIPHANIES):
    ${brandDetails.aiKnowledgeBase.map((k, i) => `${i + 1}. ${k}`).join('\n')}
    ` : ''}

    === STRATEGIC PATTERN VAULT ===
    Select exactly 2 Positioning patterns and 1 Narrative pattern that match this brand.
    [STRATEGIC PATTERN LIBRARY BEGIN]
    ${strategicPatternLibrary}
    [STRATEGIC PATTERN LIBRARY END]

    Return STRICTLY as JSON (no markdown):
    {
       "oneLineStrategy": "A razor-sharp, powerful one-line strategy repeatable by anyone on the team.",
       "targetAudience": "100-150 word deep-dive: psychographics, behavioral triggers, JTBD, barriers/drivers.",
       "persona": "100-150 word deep-dive: tone of voice, visual codes, psychological archetype.",
       "coreNarratives": "3-4 macro stories/brand pillars. Universal (applicable to SEO, Paid Ads, PR, Social).",
       "strategyGrid": "150+ word paragraph: Problem -> Promise -> Proof -> Distinctive Assets.",
       "measurementPlan": "KPIs to track with 'kill or scale' rules.",
       "riskOpportunityMap": "Immediate threats and untapped advantages in this market.",
       "competitorAnalysis": "Ruthless breakdown of top 3 competitors, weaknesses, and warfare angle.",
       "psychographicTriggers": "5 specific psychological triggers and how content pulls them.",
       "strategicPatterns": [
         {
           "id": "Pattern ID",
           "name": "Pattern Name",
           "family": "Pattern Family",
           "description": "Why this pattern was chosen and how the brand executes it.",
           "executionMarkers": ["3-4 precise rules for execution"]
         }
       ],
       "lastRefreshed": "${new Date().toISOString()}"
    }

    Make EVERY field specific to "${brandDetails.name}". No generic marketing copy.
    Output must be 100% valid JSON.
  `;

  try {
    let res: { success: boolean; data: string }

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log('🧠 Marketing Strategy via Claude Opus (Premium)...')
        res = await withRetry(() => askExpertAgentPremium(prompt))
      } catch (claudeErr: any) {
        console.warn('⚠️ Claude failed, falling back to GPT:', claudeErr?.message?.substring(0, 100))
        res = await withRetry(() => askExpertAgent(prompt, false, ''))
      }
    } else {
      res = await withRetry(() => askExpertAgent(prompt, false, ''))
    }

    if (!res.success) throw new Error("Agent failed execution.");

    let resultText = (res.data || '').replace(/```json/ig, '').replace(/```/g, '').trim();
    if (!resultText) throw new Error("Agent returned empty strategy");
    const firstBrace = resultText.indexOf('{');
    const lastBrace = resultText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      resultText = resultText.substring(firstBrace, lastBrace + 1);
    }

    return { success: true, data: requireParseJSON(resultText) };
  } catch (error: any) {
    console.error("Marketing Strategy Failed:", error);
    return { success: false, error: sanitizeActionError(error.message) || "Failed to generate strategy" };
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: Social Media Strategy (unlocked from dashboard)
// Generates: platform playbooks, content pillars, compiled Brand OS
// Uses Phase 1 marketing strategy as context for coherence
// ═══════════════════════════════════════════════════════════════
export async function generateSocialStrategy(brandDetails: BrandInfo, marketingStrategy: {
  oneLineStrategy?: string
  targetAudience: string
  persona: string
  coreNarratives: string
  competitorAnalysis?: string
  psychographicTriggers?: string
  strategicPatterns?: any[]
}) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR_KEY_HERE')) {
    throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
  }

  const compilationSources = getCompilationSources()

  const prompt = `
    You are "The Legendary Marketer" — executing PHASE 2: Social Media Strategy.

    The brand's MARKETING STRATEGY (Phase 1) has already been generated. Use it as your strategic foundation.
    Your job is to build the social media execution layer on top of it.

    Brand: ${brandDetails.name}
    Industry: ${brandDetails.industry === 'Other (Custom)' ? brandDetails.industryCustom : brandDetails.industry}
    Platforms: ${brandDetails.platforms?.join(', ') || 'General Social Media'}
    Tone: ${brandDetails.tone?.join(', ') || 'Authoritative'}

    === PHASE 1 MARKETING STRATEGY (YOUR FOUNDATION) ===
    One-Line Strategy: ${marketingStrategy.oneLineStrategy || 'N/A'}
    Target Audience: ${marketingStrategy.targetAudience}
    Brand Persona: ${marketingStrategy.persona}
    Core Narratives: ${marketingStrategy.coreNarratives}
    Competitor Analysis: ${marketingStrategy.competitorAnalysis || 'N/A'}
    Psychographic Triggers: ${marketingStrategy.psychographicTriggers || 'N/A'}
    Strategic Patterns: ${marketingStrategy.strategicPatterns?.map(p => p.name).join(', ') || 'N/A'}
    =====================================================

    === BRAND OS COMPILATION SOURCES ===
    Extract ONLY entries relevant to this brand's industry, platforms, and content formats.

    [ANTI-PATTERN LIBRARY — 38 ENTRIES]
    ${compilationSources.antiPatterns}
    [END ANTI-PATTERN LIBRARY]

    [FORMAT STRUCTURE BLUEPRINTS — 10 FORMATS]
    ${compilationSources.formatStructures}
    [END FORMAT STRUCTURES]

    [CATEGORY CONTEXT MAPS — 15 CATEGORIES]
    ${compilationSources.categoryContextMaps}
    [END CATEGORY CONTEXT MAPS]
    ====================================

    Platform Rule: "Meta" = Instagram & Facebook combined. Lead with visual dominance.
    Creative Laws: Hook in <3s. Proof before puffery. Brand codes in every touchpoint.

    Return STRICTLY as JSON (no markdown):
    {
       "socialCreativeKit": "Master Key Visuals (KV) and Audio Visuals (AV) themes, cutdown ideas, CTA styles for Social Media.",
       "platformPlaybooks": {
         "PlatformNameHere": {
            "role": "Architectural role of this platform.",
            "mechanics": "Algorithm formatting rules.",
            "toneModifier": "How global tone shifts on this platform.",
            "cadence": "Exact frequency and pacing."
         }
       },
       "contentPillars": {
          "PlatformNameHere": [
            {
              "id": "pillar-1",
              "name": "Pillar Name",
              "description": "What this pillar covers",
              "buckets": [
                {
                  "id": "bucket-1-1",
                  "name": "Bucket Name",
                  "description": "Specific content type",
                  "pillarId": "pillar-1",
                  "suggestedMinPerMonth": 2,
                  "suggestedMaxPerMonth": 4,
                  "formats": ["Static", "Carousel"]
                }
              ]
            }
          ]
       },
       "compiledBrandOS": {
         "platformRules": {
           "PlatformNameHere": "3-5 sentence algorithm intelligence for THIS brand on THIS platform"
         },
         "categoryContext": {
           "categoryName": "Closest matching category",
           "clichesToAvoid": ["5-8 category clichés"],
           "whitespaceOpportunities": ["3-5 under-exploited angles"],
           "differentiationSignals": ["3-5 standout signals"]
         },
         "formatBlueprints": {
           "FormatNameHere": "Structural blueprint: hook → body → CTA anatomy, pacing, benchmarks"
         },
         "antiPatternChecklist": [
           {
             "pattern": "Anti-pattern name",
             "detectionMarker": "How to detect (1 sentence)",
             "fix": "What to do instead (1 sentence)"
           }
         ],
         "qualityRules": {
           "bannedWords": ["AI smog words + category-specific banned phrases"],
           "categoryCliches": ["Category-specific overused hooks"],
           "bossChecklist": ["5-7 quality checks for THIS brand"]
         },
         "compiledAt": "${new Date().toISOString()}"
       }
    }

    Generate a playbook for EVERY platform listed.
    Content pillars: 4-5 per platform, 3-4 buckets each. REAL names specific to ${brandDetails.name}.
    Output must be 100% valid JSON.
  `;

  try {
    let res: { success: boolean; data: string }

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log('🧠 Social Strategy via Claude Opus (Premium)...')
        res = await withRetry(() => askExpertAgentPremium(prompt))
      } catch (claudeErr: any) {
        console.warn('⚠️ Claude failed, falling back to GPT:', claudeErr?.message?.substring(0, 100))
        res = await withRetry(() => askExpertAgent(prompt, false, ''))
      }
    } else {
      res = await withRetry(() => askExpertAgent(prompt, false, ''))
    }

    if (!res.success) throw new Error("Agent failed execution.");

    let resultText = (res.data || '').replace(/```json/ig, '').replace(/```/g, '').trim();
    if (!resultText) throw new Error("Agent returned empty social strategy");
    const firstBrace = resultText.indexOf('{');
    const lastBrace = resultText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      resultText = resultText.substring(firstBrace, lastBrace + 1);
    }

    return { success: true, data: requireParseJSON(resultText) };
  } catch (error: any) {
    console.error("Social Strategy Failed:", error);
    return { success: false, error: sanitizeActionError(error.message) || "Failed to generate social strategy" };
  }
}

// ═══════════════════════════════════════════════════════════════
// LEGACY: Full strategy in one shot (kept for backward compat)
// ═══════════════════════════════════════════════════════════════
export async function generateBrandStrategy(brandDetails: BrandInfo, isRefresh = false) {
  // Phase 1
  const mktRes = await generateMarketingStrategy(brandDetails, isRefresh)
  if (!mktRes.success) return mktRes

  // Phase 2
  const socialRes = await generateSocialStrategy(brandDetails, mktRes.data)
  if (!socialRes.success) {
    // Return Phase 1 even if Phase 2 fails — user can unlock social later
    return mktRes
  }

  // Merge both phases
  return { success: true, data: { ...mktRes.data, ...socialRes.data } }
}
