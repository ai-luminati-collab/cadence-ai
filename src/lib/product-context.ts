import { ProductEntry, ServiceEntry } from '@/stores/brand'

/**
 * Build the product context string for AI prompts.
 * This is a pure utility function — no server dependencies.
 */
export function buildProductContext(
  brandType?: string,
  products?: ProductEntry[],
  services?: ServiceEntry[],
  uploadedDocs?: { extractedContent?: string }[]
): string {
  const parts: string[] = []

  if (brandType) {
    parts.push(`Business Type: ${brandType === 'hybrid' ? 'Product + Service' : brandType}`)
  }

  if (products && products.length > 0) {
    parts.push('=== PRODUCT CATALOG ===')
    products.forEach((p, i) => {
      parts.push(`${i + 1}. ${p.name}: ${p.description}`)
      if (p.features.length) parts.push(`   Features: ${p.features.join(', ')}`)
      if (p.priceRange) parts.push(`   Price: ${p.priceRange}`)
      if (p.targetSegment) parts.push(`   For: ${p.targetSegment}`)
    })
  }

  if (services && services.length > 0) {
    parts.push('=== SERVICE OFFERINGS ===')
    services.forEach((s, i) => {
      parts.push(`${i + 1}. ${s.name}: ${s.description}`)
      if (s.deliverables.length) parts.push(`   Delivers: ${s.deliverables.join(', ')}`)
      if (s.targetSegment) parts.push(`   For: ${s.targetSegment}`)
    })
  }

  // Include extracted content from uploaded documents
  if (uploadedDocs && uploadedDocs.length > 0) {
    const extractedParts = uploadedDocs
      .filter(d => d.extractedContent)
      .map(d => d.extractedContent!)
    if (extractedParts.length > 0) {
      parts.push('=== ADDITIONAL BRAND INTELLIGENCE (from uploaded documents) ===')
      parts.push(extractedParts.join('\n'))
    }
  }

  return parts.length > 0 ? parts.join('\n') : ''
}
