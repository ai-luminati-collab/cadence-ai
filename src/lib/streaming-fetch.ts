/**
 * Parse a streaming response from our API routes.
 *
 * Our long-running API routes (strategy, calendar) use streaming with heartbeat
 * whitespace to keep the Vercel connection alive. The actual JSON payload is sent
 * at the end after a `\n__JSON__\n` delimiter.
 *
 * This helper reads the full stream, extracts the JSON, and returns it parsed.
 * Falls back to direct JSON.parse if no delimiter is found (backward compat).
 */
export async function parseStreamedResponse<T = any>(res: Response): Promise<T> {
  const rawText = await res.text()

  // Extract JSON after the delimiter
  const delimiterIdx = rawText.lastIndexOf('\n__JSON__\n')
  const jsonStr = delimiterIdx !== -1
    ? rawText.substring(delimiterIdx + '\n__JSON__\n'.length).trim()
    : rawText.trim()

  if (!jsonStr) {
    throw new Error('Empty response from server.')
  }

  try {
    return JSON.parse(jsonStr) as T
  } catch {
    // If the response looks like an error page (HTML/text), give a clean message
    if (jsonStr.startsWith('<!') || jsonStr.startsWith('<html') || jsonStr.includes('An error occurred')) {
      throw new Error('Server returned an error page. Please try again.')
    }
    throw new Error('Received an invalid response from the server. Please try again.')
  }
}
