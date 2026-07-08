type StrategyRecord = Record<string, unknown>

const TEXT_KEYS = ['text', 'content', 'value', 'description', 'summary'] as const

function isPlainObject(value: unknown): value is StrategyRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

function hasOwn(record: StrategyRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function generatedId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function appendText(base: unknown, extra: unknown): string {
  const baseText = asText(base).trim()
  const extraText = asText(extra).trim()
  if (!extraText) return baseText
  return baseText ? `${baseText}\n${extraText}` : extraText
}

export function asText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(asText).filter(Boolean).join('\n')
  }
  if (isPlainObject(value)) {
    for (const key of TEXT_KEYS) {
      const textish = value[key]
      if (typeof textish === 'string') return textish
    }

    return Object.entries(value)
      .map(([key, entryValue]) => `${key}: ${asText(entryValue)}`)
      .join('\n')
  }
  return String(value)
}

export function asTextArray(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.map(asText).map(text => text.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split('\n').map(text => text.trim()).filter(Boolean)
  }
  if (isPlainObject(value)) {
    return Object.values(value).map(asText).map(text => text.trim()).filter(Boolean)
  }

  const text = asText(value).trim()
  return text ? [text] : []
}

export function asRecord(value: unknown): StrategyRecord {
  return isPlainObject(value) ? value : {}
}

function normalizePillars(value: unknown): StrategyRecord[] | undefined {
  if (!Array.isArray(value)) return undefined

  return value.map((pillar) => {
    const source = isPlainObject(pillar)
      ? pillar
      : { title: asText(pillar), val: asText(pillar) }

    return {
      ...source,
      title: asText(source.title),
      val: asText(source.val),
    }
  })
}

function normalizePlaybooks(value: unknown): StrategyRecord | undefined {
  const source = asRecord(value)
  const entries = Object.entries(source)
    .filter(([, playbook]) => isPlainObject(playbook))
    .map(([platform, playbook]) => {
      const record = playbook as StrategyRecord
      return [
        platform,
        {
          ...record,
          role: asText(record.role),
          mechanics: asText(record.mechanics),
          toneModifier: asText(record.toneModifier),
          cadence: asText(record.cadence),
        },
      ]
    })

  return entries.length ? Object.fromEntries(entries) : undefined
}

function normalizeBucket(value: unknown, index: number, pillarId: string): StrategyRecord {
  const source = isPlainObject(value)
    ? value
    : { name: asText(value), description: asText(value) }

  const id = asText(source.id).trim() || generatedId('bucket', index)
  const min = asNumber(source.suggestedMinPerMonth, 0)

  return {
    ...source,
    id,
    name: asText(source.name).trim() || `Bucket ${index + 1}`,
    description: asText(source.description),
    pillarId: asText(source.pillarId).trim() || pillarId,
    suggestedMinPerMonth: min,
    suggestedMaxPerMonth: asNumber(source.suggestedMaxPerMonth, min),
    formats: hasOwn(source, 'formats') ? asTextArray(source.formats) : [],
  }
}

function normalizeContentPillars(value: unknown): StrategyRecord | undefined {
  const source = asRecord(value)
  const entries = Object.entries(source)
    .filter(([, pillars]) => Array.isArray(pillars))
    .map(([platform, pillars]) => {
      const normalized = (pillars as unknown[])
        .map((pillar, pillarIndex) => {
          const sourcePillar = isPlainObject(pillar)
            ? pillar
            : { name: asText(pillar), description: asText(pillar) }
          const id = asText(sourcePillar.id).trim() || generatedId('pillar', pillarIndex)
          const bucketSource = Array.isArray(sourcePillar.buckets) ? sourcePillar.buckets : []

          return {
            ...sourcePillar,
            id,
            name: asText(sourcePillar.name).trim() || `Pillar ${pillarIndex + 1}`,
            description: asText(sourcePillar.description),
            buckets: bucketSource.map((bucket, bucketIndex) => normalizeBucket(bucket, bucketIndex, id)),
          }
        })

      return [platform, normalized]
    })

  return entries.length ? Object.fromEntries(entries) : undefined
}

function normalizeStrategicPatterns(value: unknown): StrategyRecord[] | undefined {
  if (!Array.isArray(value)) return undefined

  const patterns = value
    .filter(isPlainObject)
    .map((pattern, index) => ({
      ...pattern,
      id: asText(pattern.id).trim() || `Pattern ${index + 1}`,
      name: asText(pattern.name),
      family: asText(pattern.family),
      description: asText(pattern.description),
      executionMarkers: asTextArray(pattern.executionMarkers),
    }))

  return patterns
}

export function normalizeStrategy(raw: unknown): StrategyRecord {
  const source = asRecord(raw)
  const strategy: StrategyRecord = { ...source }

  strategy.targetAudience = asText(source.targetAudience)
  strategy.persona = asText(source.persona)
  strategy.coreNarratives = asText(source.coreNarratives)

  for (const key of [
    'oneLineStrategy',
    'strategyGrid',
    'socialCreativeKit',
    'socialMediaSpine',
    'measurementPlan',
    'riskOpportunityMap',
    'competitorAnalysis',
    'psychographicTriggers',
  ]) {
    if (hasOwn(source, key)) {
      strategy[key] = asText(source[key])
    }
  }

  if (hasOwn(source, 'pillars')) {
    const pillars = normalizePillars(source.pillars)
    if (pillars) strategy.pillars = pillars
    else delete strategy.pillars
  }

  if (hasOwn(source, 'competitors')) {
    const competitors = asTextArray(source.competitors)
    if (competitors.length) strategy.competitors = competitors
    else delete strategy.competitors
  }

  if (hasOwn(source, 'platformPlaybooks')) {
    const playbooks = normalizePlaybooks(source.platformPlaybooks)
    if (playbooks) strategy.platformPlaybooks = playbooks
    else delete strategy.platformPlaybooks
  }

  if (hasOwn(source, 'contentPillars')) {
    const contentPillars = normalizeContentPillars(source.contentPillars)
    if (contentPillars) strategy.contentPillars = contentPillars
    else delete strategy.contentPillars
  }

  if (hasOwn(source, 'strategicPatterns')) {
    if (Array.isArray(source.strategicPatterns)) {
      strategy.strategicPatterns = normalizeStrategicPatterns(source.strategicPatterns) || []
    } else if (source.strategicPatterns != null) {
      const patternText = asText(source.strategicPatterns)
      strategy.strategicPatterns = []
      strategy.strategyGrid = appendText(strategy.strategyGrid, patternText ? `Strategic Patterns:\n${patternText}` : '')
    } else {
      delete strategy.strategicPatterns
    }
  }

  if (hasOwn(source, 'compiledBrandOS')) {
    if (isPlainObject(source.compiledBrandOS)) strategy.compiledBrandOS = source.compiledBrandOS
    else delete strategy.compiledBrandOS
  }

  if (hasOwn(source, 'lastRefreshed')) {
    if (typeof source.lastRefreshed === 'string') strategy.lastRefreshed = source.lastRefreshed
    else delete strategy.lastRefreshed
  }

  return strategy
}

export function normalizeSocialStrategy(raw: unknown): StrategyRecord {
  return normalizeStrategy(raw)
}
