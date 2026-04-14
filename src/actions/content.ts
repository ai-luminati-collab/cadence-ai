'use server'

import { askExpertAgent } from '@/lib/openai-agent'
import { BrandInfo, Strategy, CalendarPost, ToneFingerprint } from '@/stores/brand'
import { getContentSpec, getAIInstructions } from '@/lib/platform-specs'
import { getFullKnowledgeContext } from '@/lib/knowledge-loader'
import { buildProductContext } from '@/lib/product-context'

export async function generatePostContent(
  brandInfo: BrandInfo, 
  strategy: Strategy, 
  post: CalendarPost,
  toneFingerprint?: ToneFingerprint | null
) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR_KEY_HERE')) {
    throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
  }

  const isShortAndPunchy = 
    strategy.persona.toLowerCase().includes('short') || 
    strategy.persona.toLowerCase().includes('punchy') ||
    brandInfo.tone.some(t => t.toLowerCase().includes('short') || t.toLowerCase().includes('punchy')) ||
    brandInfo.communicationStyle?.toLowerCase().includes('short') || 
    brandInfo.communicationStyle?.toLowerCase().includes('punchy')

  // Get platform-native content spec
  const spec = getContentSpec(post.platform, post.format)
  const platformInstructions = getAIInstructions(post.platform, post.format)
  
  // Load research-backed knowledge base for this specific platform+format
  const knowledgeContext = await getFullKnowledgeContext(post.platform, post.format)
  
  // Build product/service intelligence context
  const productContext = buildProductContext(
    brandInfo.brandType,
    brandInfo.productCatalog,
    brandInfo.serviceOfferings,
    brandInfo.uploadedDocs
  )

  // Build the field request dynamically from the spec
  const fieldPrompt = spec.draftFields.map(f => 
    `"${f.key}": "${f.placeholder || f.label}"`
  ).join(',\n      ')

  const prompt = `
    You are an elite Social Media Copywriter and Creative Director. 
    Your objective: Generate high-end, scroll-stopping content that sounds like a culturally-native human, NOT an AI.

    Brand DNA:
    Name: ${brandInfo.name}
    Industry: ${brandInfo.industry}
    Persona: ${strategy.persona} (STRICT ADHERENCE REQUIRED)
    Target: ${strategy.targetAudience}

    Post Brief:
    Platform: ${post.platform}
    Format: ${post.format} 
    Concept: ${post.topic}
    Pillar: ${post.pillar}
    ${post.psychTrigger ? `Psychological Lever: ${post.psychTrigger}` : ''}
    ${post.usageStory ? `Usage Context: ${post.usageStory}` : ''}

    ${productContext ? `
    === PRODUCT/SERVICE INTELLIGENCE (what this brand actually sells) ===
    ${productContext}
    ===================================================================
    ` : ''}

    ${brandInfo.coreProducts && brandInfo.coreProducts.length > 0 ? `
    === CORE PRODUCTS / MENU — ANTI-HALLUCINATION CONSTRAINT (MANDATORY) ===
    The brand "${brandInfo.name}" sells ONLY these specific products/items:
    ${brandInfo.coreProducts.map((p, i) => `  ${i+1}. ${p}`).join('\n')}
    
    IMPORTANT: Not every post needs to mention a product. But IF this post references
    a specific product or menu item, use ONLY items from this list — by their EXACT name.
    NEVER invent fake products, menu items, or features.
    ========================================================================
    ` : ''}

    === PLATFORM-NATIVE GENERATION RULES ===
    You are generating content specifically for: ${spec.displayName}
    ${platformInstructions}
    ========================================

    ${knowledgeContext ? `
    === MASTER KNOWLEDGE BASE (RESEARCH-BACKED — FOLLOW STRICTLY) ===
    The following is deeply researched, data-backed intelligence about this specific platform and format.
    You MUST follow these rules, research findings, and best practices when generating content:
    
    ${knowledgeContext}
    ================================================================
    ` : ''}

    ${brandInfo.aiKnowledgeBase && brandInfo.aiKnowledgeBase.length > 0 ? `
    === LEARNED BRAND RULES (FROM CREATIVE DIRECTOR — HIGHEST PRIORITY) ===
    These rules were learned from direct human feedback. They OVERRIDE all other instructions when they conflict:
    ${brandInfo.aiKnowledgeBase.map((rule, i) => `    ${i+1}. ${rule}`).join('\n')}
    ======================================================================
    ` : ''}

    === RUTHLESS QUALITY GUIDELINES ===
    1. BANNED WORDS (AI SMOG): "Elevate", "Unlock", "supercharge", "transform", "revolutionary", "game-changer", "dive-in", "journey", "delight", "experience", "seamless". 
       - If you use these words, the strategy fails. Use gritty, specific, human language.
    2. THE "RELATABLE TRUTH": Don't sell features. Sell the feeling. (e.g., Instead of "Authentic spices," use "That specific dadi-ka-nuskha smell that hits you before you even enter the kitchen.")
    3. ${isShortAndPunchy ? "BREVITY CONSTRAINT: MAX 40 WORDS per field. NO COMPOUND SENTENCES. ONE PUNCHY HOOK. ONE CALL TO ACTION." : "Keep it engaging but not long-winded."}
    4. NO CORPORATE CRINGE: No exclamation marks in every sentence. No "Are you ready?" intros.
    5. NEVER USE EM DASHES: Do NOT use the "---" or "--" or "\u2014" character anywhere. Use commas, periods, or short dashes (-) instead.

    ${toneFingerprint ? `
    === VOICE DNA FINGERPRINT (MATCH THIS EXACTLY) ===
    This fingerprint was computed from ${toneFingerprint.sampleSize} approved drafts. Your output MUST match these characteristics:
    - Punchiness: ${toneFingerprint.punchiness}/10 ${toneFingerprint.punchiness >= 7 ? '(VERY punchy — short sentences, direct, no fluff)' : toneFingerprint.punchiness >= 4 ? '(Balanced — mix of short and longer sentences)' : '(Narrative — longer, storytelling sentences allowed)'}
    - Average sentence length: ${toneFingerprint.avgSentenceLength.toFixed(0)} words (STAY WITHIN ±3 words of this)
    - Emoji usage: ${toneFingerprint.emojiFrequency > 1 ? 'Heavy emoji user — include emojis' : toneFingerprint.emojiFrequency > 0.3 ? 'Moderate emoji — use sparingly' : 'Minimal/no emojis'}
    - Hinglish ratio: ${toneFingerprint.hinglishRatio > 0.3 ? 'HIGH — mix Hindi/English naturally' : toneFingerprint.hinglishRatio > 0.1 ? 'Some Hinglish — occasional Hindi words OK' : 'Pure English'}
    - Signature words to use: ${toneFingerprint.topWords.join(', ')}
    ===============================================
    ` : ''}

    Generate a strict JSON object (Raw JSON, no markdown backticks) with these EXACT keys:
    {
      ${fieldPrompt}
    }

    ALSO include these legacy keys for backward compatibility:
    "hooks": ["3-5 word hook 1", "hook 2", "hook 3"],
    "caption": "Main copy body (same as your primary copy field above)",
    "visualDescription": "Technical directive for the visual team",
    "hashtags": "3-5 niche tags"
  `

  try {
     // Enable Stage 2 (Boss Review) for deep quality oversight
     const res = await askExpertAgent(prompt, false) 
     if (!res.success) throw new Error("Agent failed execution.")

     let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
     const parsed = JSON.parse(resultText)
     
     // Extract platform-specific fields into platformFields
     const platformFields: Record<string, string> = {}
     for (const field of spec.draftFields) {
       if (parsed[field.key] !== undefined) {
         platformFields[field.key] = parsed[field.key]
       }
     }
     
     return { 
       success: true, 
       data: {
         hooks: parsed.hooks || [],
         caption: parsed.caption || platformFields.caption || '',
         visualDescription: parsed.visualDescription || platformFields.visualDirective || '',
         hashtags: parsed.hashtags || platformFields.hashtags || '',
         platformFields
       }
     }
  } catch (error: any) {
     console.error("AI Content Generation Failed:", error)
     return { success: false, error: error.message || "Failed to generate Content" }
  }
}
