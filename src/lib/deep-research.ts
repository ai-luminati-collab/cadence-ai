import OpenAI from 'openai'

/**
 * Deep Research Client — OpenAI Responses API
 *
 * Launches a comprehensive, multi-step research agent that browses the web,
 * reads pages, and synthesizes a full brand intelligence report.
 * Takes 2-10 minutes. Must run in background mode.
 */

const DEEP_RESEARCH_MODEL = 'o3-deep-research'

const TERMINAL_FAILURE_STATUSES = ['failed', 'cancelled', 'incomplete']

function createClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
  return new OpenAI({ apiKey })
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

/** Start a deep research interaction. Returns immediately with an ID to poll. */
export async function startDeepResearch(query: string): Promise<{
  success: boolean
  interactionId?: string
  error?: string
}> {
  try {
    const client = createClient()

    console.log('🔬 Starting Deep Research via OpenAI Responses API...')
    console.log(`📝 Query length: ${query.length} chars`)

    const response = await client.responses.create({
      model: DEEP_RESEARCH_MODEL,
      background: true,
      input: query,
      tools: [
        { type: 'web_search_preview' },
        { type: 'code_interpreter', container: { type: 'auto' } },
      ],
    })

    const interactionId = response.id
    console.log(`✅ Deep Research started. ID: ${interactionId}`)
    console.log(`   Status: ${response.status}`)

    if (!interactionId) {
      return { success: false, error: 'No response ID returned' }
    }

    return { success: true, interactionId }
  } catch (error) {
    const message = formatErrorMessage(error)
    console.error('Failed to start Deep Research:', message)
    return { success: false, error: `Deep Research init failed: ${message}` }
  }
}

/** Check the status of an ongoing deep research interaction */
export async function checkDeepResearchStatus(interactionId: string): Promise<{
  status: 'in_progress' | 'completed' | 'failed'
  report?: string
  error?: string
}> {
  try {
    const client = createClient()
    const response = await client.responses.retrieve(interactionId)

    if (response.status === 'completed') {
      const report = response.output_text ?? ''

      if (!report) {
        console.error('❌ Deep Research completed but returned no text output')
        return { status: 'failed', error: 'Research completed without a report' }
      }

      console.log(`✅ Deep Research complete. Report length: ${report.length} chars`)
      return { status: 'completed', report }
    }

    if (response.status && TERMINAL_FAILURE_STATUSES.includes(response.status)) {
      const errorMsg = response.error?.message || `Research ended with status: ${response.status}`
      console.error(`❌ Deep Research failed: ${errorMsg}`)
      return { status: 'failed', error: errorMsg }
    }

    // in_progress (or an unrecognized transient status)
    console.log(`⏳ Deep Research still in progress... (status: ${response.status})`)
    return { status: 'in_progress' }
  } catch (error) {
    const message = formatErrorMessage(error)
    console.error('Status check error:', message)
    if (/\b(400|401|403|404)\b|invalid|not found|permission|auth/i.test(message)) {
      return { status: 'failed', error: `Deep Research status check failed: ${message}` }
    }

    // Don't immediately mark transient network/server errors as failed.
    return { status: 'in_progress' }
  }
}
