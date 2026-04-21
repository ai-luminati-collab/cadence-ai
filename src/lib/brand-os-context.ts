import { CompiledBrandOS } from '@/stores/brand'

/**
 * Build a prompt-injectable context block from the compiled Brand OS.
 * This replaces the raw knowledge-base loading for all downstream calls
 * (content, calendar, director, etc.) — strategy.ts is the ONLY consumer
 * that reads the full knowledge base files.
 *
 * Returns empty string if no Brand OS exists (legacy fallback).
 */
export function buildBrandOSContext(compiledBrandOS?: CompiledBrandOS | null): string {
  if (!compiledBrandOS) return ''

  const sections: string[] = []

  // 1. Platform algorithm rules
  if (compiledBrandOS.platformRules && Object.keys(compiledBrandOS.platformRules).length > 0) {
    const platformLines = Object.entries(compiledBrandOS.platformRules)
      .map(([platform, rules]) => `[${platform.toUpperCase()}]\n${rules}`)
      .join('\n\n')
    sections.push(`=== PLATFORM ALGORITHM INTELLIGENCE (from Brand OS) ===\n${platformLines}\n===`)
  }

  // 2. Format blueprints
  if (compiledBrandOS.formatBlueprints && Object.keys(compiledBrandOS.formatBlueprints).length > 0) {
    const formatLines = Object.entries(compiledBrandOS.formatBlueprints)
      .map(([format, blueprint]) => `[${format.toUpperCase()}]\n${blueprint}`)
      .join('\n\n')
    sections.push(`=== FORMAT STRUCTURE BLUEPRINTS (from Brand OS) ===\n${formatLines}\n===`)
  }

  // 3. Category context
  if (compiledBrandOS.categoryContext) {
    const cc = compiledBrandOS.categoryContext
    const catLines = [
      `Category: ${cc.categoryName}`,
      cc.clichesToAvoid?.length ? `Cliches to AVOID: ${cc.clichesToAvoid.join('; ')}` : '',
      cc.whitespaceOpportunities?.length ? `Whitespace Opportunities: ${cc.whitespaceOpportunities.join('; ')}` : '',
      cc.differentiationSignals?.length ? `Differentiation Signals: ${cc.differentiationSignals.join('; ')}` : '',
    ].filter(Boolean).join('\n')
    sections.push(`=== CATEGORY INTELLIGENCE (from Brand OS) ===\n${catLines}\n===`)
  }

  // 4. Anti-pattern checklist
  if (compiledBrandOS.antiPatternChecklist?.length) {
    const apLines = compiledBrandOS.antiPatternChecklist
      .map(ap => `- ${ap.pattern}: ${ap.detectionMarker} → FIX: ${ap.fix}`)
      .join('\n')
    sections.push(`=== ANTI-PATTERN CHECKLIST (from Brand OS) ===\n${apLines}\n===`)
  }

  // 5. Quality rules
  if (compiledBrandOS.qualityRules) {
    const qr = compiledBrandOS.qualityRules
    const qrLines = [
      qr.bannedWords?.length ? `BANNED WORDS: ${qr.bannedWords.join(', ')}` : '',
      qr.categoryCliches?.length ? `CATEGORY CLICHES TO AVOID: ${qr.categoryCliches.join(', ')}` : '',
      qr.bossChecklist?.length ? `QUALITY CHECKLIST:\n${qr.bossChecklist.map(c => `  - ${c}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')
    sections.push(`=== QUALITY RULES (from Brand OS) ===\n${qrLines}\n===`)
  }

  return sections.join('\n\n')
}
