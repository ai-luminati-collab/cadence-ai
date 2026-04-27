/**
 * Resilient JSON Parser — central utility for AI output handling.
 *
 * LLMs frequently return JSON wrapped in markdown fences, preceded by
 * conversational text, or truncated mid-stream. This module provides
 * hardened extraction and parsing that handles all of those cases,
 * so bare JSON.parse() is never used directly on AI output.
 *
 * Also includes retry logic for transient API failures.
 */

// ═══════════════════════════════════════════════════════════════
// 1. SAFE JSON EXTRACTION — handles all LLM output quirks
// ═══════════════════════════════════════════════════════════════

/**
 * Extracts and parses JSON from raw AI output text.
 * Handles: markdown fences, conversational preamble, trailing text,
 * truncated arrays, and malformed output.
 *
 * @returns The parsed JSON object/array, or null if extraction fails.
 */
export function safeParseJSON<T = any>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null

  // Step 1: Strip markdown code fences
  let text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  // Step 2: Try direct parse first (fast path)
  try {
    return JSON.parse(text) as T
  } catch {
    // Continue to extraction strategies
  }

  // Step 3: Extract JSON object — find outermost { ... }
  const jsonObj = extractBracketedContent(text, '{', '}')
  if (jsonObj) {
    try {
      return JSON.parse(jsonObj) as T
    } catch {
      // Try repair
    }
  }

  // Step 4: Extract JSON array — find outermost [ ... ]
  const jsonArr = extractBracketedContent(text, '[', ']')
  if (jsonArr) {
    try {
      return JSON.parse(jsonArr) as T
    } catch {
      // Try repair on truncated arrays
      const repaired = repairTruncatedArray(jsonArr)
      if (repaired) {
        try {
          return JSON.parse(repaired) as T
        } catch {
          // Fall through to object-by-object recovery
        }
      }
    }
  }

  // Step 5: Last resort — extract individual JSON objects from the text
  const objects = extractAllObjects(text)
  if (objects.length > 0) {
    // If we found multiple objects, return as array
    return (objects.length === 1 ? objects[0] : objects) as T
  }

  console.error('⚠️ safeParseJSON: All extraction strategies failed for input of length', text.length)
  return null
}

/**
 * Same as safeParseJSON but throws with a clean message instead of returning null.
 * Use when you need the parse to succeed or the action to fail cleanly.
 */
export function requireParseJSON<T = any>(raw: string, context?: string): T {
  const result = safeParseJSON<T>(raw)
  if (result === null) {
    const label = context ? `(${context})` : ''
    throw new Error(`AI returned an unexpected response format ${label}. Please try again.`)
  }
  return result
}


// ═══════════════════════════════════════════════════════════════
// 2. RETRY LOGIC — handles transient API failures
// ═══════════════════════════════════════════════════════════════

interface RetryOptions {
  maxRetries?: number       // Default: 2 (3 total attempts)
  baseDelayMs?: number      // Default: 1000
  retryOn?: (error: any) => boolean  // Custom retry predicate
}

const DEFAULT_RETRY_ON = (err: any): boolean => {
  const msg = err?.message || String(err)
  const status = err?.status || err?.error?.status
  // Retry on: rate limits, overloaded, timeouts, 500s, 503s
  return (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    /rate.?limit|overloaded|too many requests/i.test(msg) ||
    /timeout|timed.?out|ETIMEDOUT/i.test(msg) ||
    /internal.?server.?error/i.test(msg) ||
    /service.?unavailable/i.test(msg)
  )
}

/**
 * Wraps an async function with automatic retry on transient failures.
 * Uses exponential backoff with jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelayMs = 1000,
    retryOn = DEFAULT_RETRY_ON
  } = options

  let lastError: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err

      if (attempt < maxRetries && retryOn(err)) {
        // Exponential backoff with jitter: 1s, 2s, 4s (roughly)
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500
        console.warn(`⚡ Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms — ${err?.message?.slice(0, 80)}`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      throw err
    }
  }

  throw lastError
}


// ═══════════════════════════════════════════════════════════════
// 3. INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/** Extract content between matching open/close brackets, handling nesting and strings. */
function extractBracketedContent(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open)
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      continue
    }

    if (ch === '\\' && inString) {
      escape = true
      continue
    }

    if (ch === '"' && !escape) {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === open) depth++
    if (ch === close) {
      depth--
      if (depth === 0) {
        return text.substring(start, i + 1)
      }
    }
  }

  // Brackets didn't close — return what we have (truncated)
  return text.substring(start)
}

/** Repair a truncated JSON array by closing open brackets/braces. */
function repairTruncatedArray(text: string): string | null {
  // Remove trailing comma and whitespace
  let repaired = text.replace(/,\s*$/, '')

  // Count unclosed brackets
  let braces = 0
  let brackets = 0
  let inString = false
  let escape = false

  for (const ch of repaired) {
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"' && !escape) { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') braces++
    if (ch === '}') braces--
    if (ch === '[') brackets++
    if (ch === ']') brackets--
  }

  // Close any open structures
  // If we're mid-string, close it first
  if (inString) repaired += '"'
  while (braces > 0) { repaired += '}'; braces-- }
  while (brackets > 0) { repaired += ']'; brackets-- }

  return repaired
}

/** Extract all complete JSON objects from a text, skipping malformed ones. */
function extractAllObjects(text: string): any[] {
  const objects: any[] = []
  let depth = 0
  let objStart = -1
  let inString = false
  let escape = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"' && !escape) { inString = !inString; continue }
    if (inString) continue

    if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
    }
    if (ch === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        const objStr = text.substring(objStart, i + 1)
        try {
          objects.push(JSON.parse(objStr))
        } catch {
          // Skip malformed objects
        }
        objStart = -1
      }
    }
  }

  return objects
}
