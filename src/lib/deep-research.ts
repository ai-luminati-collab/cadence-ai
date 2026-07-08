import { GoogleGenAI } from '@google/genai'

/**
 * Deep Research Client — Google Interactions API (post-May-2026 schema)
 *
 * Launches a comprehensive, multi-step research agent that browses the web,
 * reads pages, and synthesizes a full brand intelligence report.
 * Takes 2-10 minutes. Must run in background mode.
 *
 * Requires @google/genai >= 2.0.0 — the May 2026 API change replaced the
 * `outputs` array with typed `steps` and rejects the legacy request schema.
 */

const AGENT_ID = 'deep-research-max-preview-04-2026'

// Interaction statuses that mean the run is over without a report
const TERMINAL_FAILURE_STATUSES = ['failed', 'cancelled', 'incomplete', 'budget_exceeded', 'requires_action']
const DEEP_RESEARCH_AGENT_CONFIG = {
  type: 'deep-research',
  collaborative_planning: false,
} as const

function createClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('Missing GOOGLE_API_KEY')
  return new GoogleGenAI({ apiKey })
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

    console.log('🔬 Starting Deep Research via Interactions API...')
    console.log(`📝 Query length: ${query.length} chars`)

    const interaction = await client.interactions.create({
      agent: AGENT_ID,
      background: true,
      input: query,
      agent_config: DEEP_RESEARCH_AGENT_CONFIG,
    })

    const interactionId = interaction.id
    console.log(`✅ Deep Research started. ID: ${interactionId}`)
    console.log(`   Status: ${interaction.status}`)

    if (!interactionId) {
      return { success: false, error: 'No interaction ID returned' }
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
    const interaction = await client.interactions.get(interactionId)

    if (interaction.status === 'completed') {
      // SDK-computed concatenation of the last model output
      let report = interaction.output_text ?? ''

      // Fallback: walk steps from the end for the last model_output with text
      if (!report && interaction.steps) {
        for (let i = interaction.steps.length - 1; i >= 0; i--) {
          const step = interaction.steps[i]
          if (step.type === 'model_output' && step.content) {
            report = step.content
              .map((c) => (c.type === 'text' ? c.text : ''))
              .filter(Boolean)
              .join('\n')
            if (report) break
          }
        }
      }

      if (!report) {
        console.error('❌ Deep Research completed but returned no text output')
        return { status: 'failed', error: 'Research completed without a report' }
      }

      console.log(`✅ Deep Research complete. Report length: ${report.length} chars`)
      return { status: 'completed', report }
    }

    if (TERMINAL_FAILURE_STATUSES.includes(interaction.status)) {
      // Surface the most recent step-level error, if the API reported one
      const stepError = interaction.steps
        ?.map((step) => ('error' in step ? step.error?.message : undefined))
        .filter(Boolean)
        .pop()
      const errorMsg = stepError || `Research ended with status: ${interaction.status}`
      console.error(`❌ Deep Research failed: ${errorMsg}`)
      return { status: 'failed', error: errorMsg }
    }

    // in_progress (or an unrecognized transient status)
    console.log(`⏳ Deep Research still in progress... (status: ${interaction.status})`)
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
