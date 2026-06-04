/**
 * Client-side error sanitizer — second line of defense.
 *
 * Even though the server-side AI agent already sanitizes errors,
 * this utility catches anything that slips through (e.g. network
 * errors, Vercel proxy errors, malformed responses) and ensures
 * the user never sees raw technical messages.
 */

const SENSITIVE_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /anthropic/i,
  /openai/i,
  /credit.?balance/i,
  /billing/i,
  /insufficient.?funds/i,
  /\{"type":"error"/i,
  /request_id/i,
  /invalid_request_error/i,
  /Bearer\s/i,
  /sk-[a-zA-Z0-9]/i,
]

const CLIENT_ERROR_MAP: { pattern: RegExp; message: string }[] = [
  { pattern: /credit balance|insufficient.?funds|billing/i,   message: 'AI service temporarily unavailable. Please try again later.' },
  { pattern: /rate.?limit|too many requests|overloaded/i,     message: 'AI engine is busy. Please wait a moment and try again.' },
  { pattern: /timed?\s*out|timeout|ETIMEDOUT/i,               message: 'Request timed out. Please try again.' },
  { pattern: /network|ECONNREFUSED|ENOTFOUND|fetch failed/i,  message: 'Network error. Check your connection and try again.' },
  { pattern: /Unexpected token|not valid JSON/i,               message: 'Something went wrong. Please try again.' },
  { pattern: /413|Payload Too Large/i,                         message: 'Request too large. Try simplifying your input.' },
  { pattern: /500|Internal Server Error/i,                     message: 'Server error. Please try again.' },
  { pattern: /503|Service Unavailable/i,                       message: 'Service temporarily unavailable. Please try again later.' },
  { pattern: /Server error \(\d+\):/i,                         message: 'Something went wrong on the server. Please try again.' },
]

/**
 * Sanitize an error message before displaying to the user.
 * Returns a clean, user-friendly message.
 */
export function sanitizeErrorForUI(error: string | Error | any): string {
  const rawMsg = typeof error === 'string'
    ? error
    : error?.message || String(error)

  // Check against known error patterns
  for (const { pattern, message } of CLIENT_ERROR_MAP) {
    if (pattern.test(rawMsg)) return message
  }

  // Check if the message contains sensitive data we should never show
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(rawMsg)) {
      return 'Something went wrong. Please try again.'
    }
  }

  // If the message looks like raw JSON, a status code dump, or is very long, hide it
  if (
    rawMsg.startsWith('{') ||
    rawMsg.startsWith('4') ||
    rawMsg.startsWith('5') ||
    rawMsg.length > 150
  ) {
    return 'Something went wrong. Please try again.'
  }

  // The message seems safe to show — return it (but cap length)
  return rawMsg.slice(0, 120)
}
