import { GoogleGenAI } from '@google/genai'

/**
 * Deep Research Client — Google Interactions API
 * 
 * Launches a comprehensive, multi-step research agent that browses the web,
 * reads pages, and synthesizes a full brand intelligence report.
 * Takes 2-10 minutes. Must run in background mode.
 */

const AGENT_ID = 'deep-research-pro-preview-12-2025'

/** Start a deep research interaction. Returns immediately with an ID to poll. */
export async function startDeepResearch(query: string): Promise<{
  success: boolean
  interactionId?: string
  error?: string
}> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return { success: false, error: 'Missing GOOGLE_API_KEY' }

  try {
    const client = new GoogleGenAI({ apiKey })

    console.log('🔬 Starting Deep Research via Interactions API...')
    console.log(`📝 Query length: ${query.length} chars`)

    const interaction = await (client as any).interactions.create({
      agent: AGENT_ID,
      background: true,
      input: query,
    })

    const interactionId = interaction?.id
    console.log(`✅ Deep Research started. ID: ${interactionId}`)
    console.log(`   Status: ${interaction?.status}`)
    
    if (!interactionId) {
      return { success: false, error: 'No interaction ID returned' }
    }

    return { success: true, interactionId }
  } catch (error: any) {
    console.error('Failed to start Deep Research:', error?.message || error)
    return { success: false, error: `Deep Research init failed: ${error?.message || 'Unknown error'}` }
  }
}

/** Check the status of an ongoing deep research interaction */
export async function checkDeepResearchStatus(interactionId: string): Promise<{
  status: 'in_progress' | 'completed' | 'failed'
  report?: string
  error?: string
}> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return { status: 'failed', error: 'Missing GOOGLE_API_KEY' }

  try {
    const client = new GoogleGenAI({ apiKey })
    const result = await (client as any).interactions.get(interactionId)

    const status = result?.status?.toLowerCase()

    if (status === 'completed' || status === 'done') {
      // Extract the report text from the response
      let report = ''
      
      if (result?.outputs && Array.isArray(result.outputs)) {
        // outputs is an array of messages; last one is the final report
        const last = result.outputs[result.outputs.length - 1]
        report = last?.text || last?.content?.parts?.[0]?.text || ''
        if (!report && last?.content) {
          report = typeof last.content === 'string' ? last.content : JSON.stringify(last.content)
        }
      } else if (result?.output) {
        report = typeof result.output === 'string' ? result.output : (result.output?.text || JSON.stringify(result.output))
      } else if (result?.text) {
        report = typeof result.text === 'string' ? result.text : ''
      }

      // Fallback: stringify the whole result if we couldn't extract text
      if (!report && result) {
        const full = JSON.stringify(result)
        // Try to find any text content in the full response
        const textMatch = full.match(/"text"\s*:\s*"([^"]{100,})"/)?.[1]
        report = textMatch || full
      }
      
      console.log(`✅ Deep Research complete. Report length: ${report.length} chars`)
      return { status: 'completed', report }
    }

    if (status === 'failed' || status === 'error') {
      const errorMsg = result?.error?.message || result?.error || 'Research failed'
      console.error(`❌ Deep Research failed: ${errorMsg}`)
      return { status: 'failed', error: String(errorMsg) }
    }

    // Still in progress
    console.log(`⏳ Deep Research still in progress... (status: ${result?.status})`)
    return { status: 'in_progress' }
  } catch (error: any) {
    console.error('Status check error:', error?.message)
    // Don't immediately mark as failed — could be transient
    return { status: 'in_progress' }
  }
}
