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

import { askExpertAgentPremium } from '@/lib/openai-agent'
import { BrandInfo } from '@/stores/brand'
import { buildProductContext } from '@/lib/product-context'
import { getStrategicPatternLibrary, getCompilationSources } from '@/lib/knowledge-loader'

export async function generateBrandStrategy(brandDetails: BrandInfo, isRefresh = false) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR_KEY_HERE')) {
    throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
  }

  const strategicPatternLibrary = await getStrategicPatternLibrary()
  const compilationSources = getCompilationSources()

  const prompt = `
    System Prompt – Legendary Marketer (Universal Brand OS Architect)
    You are “The Legendary Marketer” — the most adaptive, globally respected, and results-obsessed marketing strategist alive.
    You build UNIVERSAL BRAND OPERATING SYSTEMS. Your strategies are channel-agnostic at the foundation, capable of scaling across Paid Ads, SEO, AEO, Influencer Marketing, and Social Media.
    
    Core Mandate: Ever-Evolving, Audience First, Category-Agnostic, Impact-Obsessed, Execution-Ready.
    World-Class Edge: Business Model Visionary, Competitive Warfare Expert, Subconscious Psychology Mastery, Cultural Architect.
    
    You do NOT provide generic advice. You provide ruthless strategic leverage. 
    You understand that Social Media is a game of status, survival, and belonging. You pull those levers.

    You are tasked with generating ${isRefresh ? 'an UPDATED' : 'the master'} strategy for a client. 

    Client Intake Brief:
    Brand Name: ${brandDetails.name}
    Industry: ${brandDetails.industry === 'Other (Custom)' ? brandDetails.industryCustom : brandDetails.industry}
    Website: ${brandDetails.website || 'Not provided'}
    Unique Selling Proposition (USP): ${brandDetails.usp || 'None specified'}
    Major Competitors: ${brandDetails.competitors || 'None specified'}
    Target Platforms: ${brandDetails.platforms?.join(', ') || 'General Social Media'}
    
    ${buildProductContext(brandDetails.brandType, brandDetails.productCatalog, brandDetails.serviceOfferings, brandDetails.uploadedDocs) ? `
    === PRODUCT/SERVICE INTELLIGENCE ===
    ${buildProductContext(brandDetails.brandType, brandDetails.productCatalog, brandDetails.serviceOfferings, brandDetails.uploadedDocs)}
    ===================================
    ` : ''}
    
    ${brandDetails.aiResearchMode ? `
    PATH: AUTONOMOUS INTELLIGENCE (AI-LED RESEARCH)
    The client has opted for full AI research.
    You MUST aggressively use the provided Brand Name and Website to run a simulated deep-dive research scan.
    Deduce exact Target Audiences, Age Ranges, hidden behaviors, desires, and optimal social media goals autonomously. 
    Map the market landscape based on your internal knowledge of the industry and the website's positioning.
    ` : `
    PATH: COLLABORATIVE DEEP CONTEXT (MANUAL INPUT + AI VALIDATION)
    The user has provided their own strategic foundation.
    Target Audiences: ${brandDetails.primaryAudiences?.join(' & ') || 'None'}
    Age Range: ${brandDetails.ageRange || 'Not provided'}
    Primary Social Media Goals: ${brandDetails.primaryGoals?.join(' & ') || 'None'}
    Deep Psychographics & Behaviors: ${brandDetails.psychographics || 'None'}
    Tone: ${brandDetails.tone?.join(', ') || 'Authoritative'}
    
    CRITICAL INSTRUCTION: ACT AS A SCRUTINIZER/VALIDATOR. 
    Analyze the user's inputs. If they are generic, weak, or clash with market realities (for their industry/competitors), you MUST OVERRIDE or ENRICH them with Legendary Marketer insights. 
    If they say their USP is 'quality', find the REAL strategic edge behind it.
    Your goal is to validate their vision and then UPGRADE it to world-class standards.
    `}

    Extra Context/Founder Background: ${brandDetails.extraNotes || 'None'}
    
    ${brandDetails.aiKnowledgeBase && brandDetails.aiKnowledgeBase.length > 0 ? `
    MASTER KNOWLEDGE BASE (EPIPHANIES):
    The AI Copilot has studied this brand's inputs and deduced the following profound market realities. You MUST aggressively use these epiphanies to shape the final strategy:
    ${brandDetails.aiKnowledgeBase.map((k, i) => `${i + 1}. ${k}`).join('\n')}
    ` : ''}

    === STRATEGIC PATTERN VAULT ===
    You have access to a master vault of 47 world-class strategic patterns. 
    You MUST select exactly 2 Positioning patterns and 1 Narrative pattern that PERFECTLY match this brand's state (preconditions vs anti-conditions).
    DO NOT choose generic patterns; choose high-leverage structural moves.
    
    [STRATEGIC PATTERN LIBRARY BEGIN]
    ${strategicPatternLibrary}
    [STRATEGIC PATTERN LIBRARY END]
    ================================

    === BRAND OS COMPILATION SOURCES (READ AND EXTRACT — DO NOT DUMP VERBATIM) ===
    You have access to three intelligence databases below. During strategy generation, you MUST read these
    and extract ONLY the entries relevant to this brand's industry, platforms, and content formats.
    Compile them into the "compiledBrandOS" field in the JSON output.
    - From the Anti-Pattern Library: pick the 8-10 anti-patterns MOST likely to appear for this brand's category and formats.
    - From the Format Structures: extract blueprints for ONLY the formats this brand will actually use (based on platform playbooks).
    - From the Category Context Maps: find the closest matching category and extract clichés, whitespace, and differentiation signals.

    [ANTI-PATTERN LIBRARY — 38 ENTRIES]
    ${compilationSources.antiPatterns}
    [END ANTI-PATTERN LIBRARY]

    [FORMAT STRUCTURE BLUEPRINTS — 10 FORMATS]
    ${compilationSources.formatStructures}
    [END FORMAT STRUCTURES]

    [CATEGORY CONTEXT MAPS — 15 CATEGORIES]
    ${compilationSources.categoryContextMaps}
    [END CATEGORY CONTEXT MAPS]
    =============================================================================

    Creative Laws: Hook in <3s. Proof before puffery. No cultural clichés; only culturally resonant assets. Brand codes in every touchpoint.
    Platform Rule: "Meta" is your primary vehicle for Instagram & Facebook combined. Strategy for Meta must lead with visual dominance and high-retention storytelling.

    Return your response STRICTLY as a JSON object with this exact structure (no markdown wrappers):
    {
       "oneLineStrategy": "A razor-sharp, powerful one-line strategy repeatable by anyone on the team.",
       "targetAudience": "A highly insightful 100-150 word deep-dive into the audience's psychographics, behavioral triggers, JTBD (Jobs to be Done), and barriers/drivers.",
       "persona": "A 100-150 word deep-dive describing the brand's precise tone of voice, visual codes, and psychological archetype.",
       "coreNarratives": "A brilliant, omni-channel breakdown of the 3-4 macro stories or brand pillars this brand tells. These must be universal (applicable to SEO, Paid Ads, PR, and Social).",
       "strategyGrid": "A detailed 150+ word paragraph mapping the Universal Go-To-Market Mechanics: Problem -> Promise -> Proof -> Distinctive Assets.",
       "socialCreativeKit": "PHASE 1 (Social Media Focus): A descriptive list of Master Key Visuals (KV) and Audio Visuals (AV) themes, cutdown ideas, and CTA styles specifically for Social Media.",
       "platformPlaybooks": {
         // Create a dynamic key for EVERY SINGLE PLATFORM listed in the Target Platforms: e.g. "Instagram", "LinkedIn", "Twitter"
         "PlatformNameHere": {
            "role": "The strict architectural role of this platform (e.g. 'Brand Awareness & High-Octane Visuals').",
            "mechanics": "The exact algorithm formatting (e.g. '70% high-contrast short-form video, 30% deep-dive carousels. Maximize watch-time hooks').",
            "toneModifier": "How the global tone shifts here (e.g. 'Dial up the aggression by 20% compared to LinkedIn. Use internet slang').",
            "cadence": "Exact frequency and pacing guidance (e.g. 'Post 4x a week, heavily indexed on trending audios.')."
         }
       },
       "measurementPlan": "A list of KPIs to track, defining the 'kill or scale' rules.",
       "riskOpportunityMap": "Immediate threats and untapped advantages in this specific market.",
       "competitorAnalysis": "A ruthless breakdown of the top 3 competitors, their weaknesses, and our warfare angle to displace them.",
       "psychographicTriggers": "A list of 5 specific psychological triggers (FOMO, status, belonging, etc.) and how our content will pull them.",
       "contentPillars": {
          // For EACH platform in Target Platforms (e.g. "Meta (Instagram & Facebook)", "LinkedIn"), generate 4-5 content pillars.
          // Each pillar has 3-4 content buckets. Each bucket has a suggested min and max frequency per month.
          // This is used to structure the content calendar. Be specific to the brand and platform.
          "PlatformNameHere": [
            {
              "id": "pillar-1",
              "name": "Product Spotlight",
              "description": "Showcasing core products in aspirational, lifestyle contexts",
              "buckets": [
                {
                  "id": "bucket-1-1",
                  "name": "Hero Product Close-Ups",
                  "description": "Macro shots of signature items with ingredient callouts",
                  "pillarId": "pillar-1",
                  "suggestedMinPerMonth": 2,
                  "suggestedMaxPerMonth": 4,
                  "formats": ["Static", "Carousel"]
                }
              ]
            }
          ]
       },
       "strategicPatterns": [
         {
           "id": "e.g., Pattern 01",
           "name": "e.g., Polarization-as-Positioning",
           "family": "e.g., Positioning Moves",
           "description": "Justify WHY this pattern was chosen, why its preconditions are met, and exactly how the brand will execute it.",
           "executionMarkers": ["Specify 3-4 precise formatting/stylistic/structural rules the AI copywriter must follow when executing this pattern."]
         }
       ],
       "compiledBrandOS": {
         "platformRules": {
           // For EACH platform in Target Platforms, extract the critical algorithm rules from the knowledge base.
           // Key = platform name, Value = 3-5 sentence summary of the most important algo rules for THIS brand on THIS platform.
           "PlatformNameHere": "Extracted algorithm intelligence relevant to this brand..."
         },
         "categoryContext": {
           "categoryName": "The closest matching category from the Category Context Maps (e.g. 'Food & Beverage', 'D2C Beauty & Skincare')",
           "clichesToAvoid": ["5-8 category-specific clichés this brand MUST avoid — extracted from the Category Context Maps"],
           "whitespaceOpportunities": ["3-5 under-exploited angles in this category where this brand can differentiate"],
           "differentiationSignals": ["3-5 signals that actually stand out in this vertical"]
         },
         "formatBlueprints": {
           // For EACH format this brand will use (based on platform playbooks), extract the structural anatomy.
           // e.g. "Carousel" → slide 1 hook rules, body pacing, payoff slide, benchmarks
           // e.g. "Reel" → 0-1.5s hook, beat structure, visual variety, closing mechanics
           "FormatNameHere": "Structural blueprint: hook → body → CTA anatomy, pacing rules, benchmarks"
         },
         "antiPatternChecklist": [
           // Select 8-10 MOST relevant anti-patterns from the library for this brand's category, platforms, and formats.
           {
             "pattern": "Name of the anti-pattern (e.g. 'The Throat-Clear')",
             "detectionMarker": "How to detect this in generated content (1 sentence)",
             "fix": "What to do instead (1 sentence)"
           }
         ],
         "qualityRules": {
           "bannedWords": ["All AI smog words PLUS category-specific banned phrases extracted from the context map"],
           "categoryCliches": ["Category-specific overused hooks and phrases this brand must never use"],
           "bossChecklist": ["5-7 ruthless quality checks the Boss model must enforce for THIS specific brand"]
         },
         "compiledAt": "${new Date().toISOString()}"
       },
       "lastRefreshed": "${new Date().toISOString()}"
    }
    
    Make sure EVERY component is world-class. Break down the coreNarratives clearly.
    Make sure the contentPillars are platform-specific - Instagram content buckets differ from LinkedIn.
    Generate REAL bucket names specific to this brand (not generic marketing buckets).
    For EACH platform, generate exactly 4-5 pillars with 3-4 buckets each (12-15 total buckets per platform).
    Output must be 100% valid JSON. Do not include \`\`\`json blocks.
  `;

  try {
    // Strategy uses Premium (pure Claude Opus) — too large and important for GPT-mini draft
    const res = await withRetry(() => askExpertAgentPremium(prompt));
    if (!res.success) throw new Error("Agent failed execution.");

    let resultText = (res.data || '').replace(/```json/ig, '').replace(/```/g, '').trim();
    if (!resultText) throw new Error("Agent returned empty strategy");
    // Sometimes OpenAI adds preamble text before the JSON block starts
    const firstBrace = resultText.indexOf('{');
    const lastBrace = resultText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      resultText = resultText.substring(firstBrace, lastBrace + 1);
    }
    
    return { success: true, data: requireParseJSON(resultText) };
  } catch (error: any) {
    console.error("AI Strategy Generation Failed:", error);
    return { success: false, error: sanitizeActionError(error.message) || "Failed to generate AI Strategy" };
  }
}
