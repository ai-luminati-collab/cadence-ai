'use server'

import { GoogleGenAI } from '@google/genai'

/**
 * Deep Research Client — Google Interactions API
 * 
 * Launches a comprehensive, multi-step research agent that browses the web,
 * reads pages, and synthesizes a full brand intelligence report.
 * Takes 2-10 minutes. Must run in background mode.
 */

const AGENT_ID = 'deep_research'

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

    console.log('🔬 Starting Deep Research...')
    console.log(`📝 Query: ${query.substring(0, 200)}...`)

    const interaction = await (client as any).agentic.create({
      model: 'gemini-2.5-pro',
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { includeThoughts: true },
      },
      background: true,
      userMessage: query,
    })

    const interactionId = interaction?.name || interaction?.id || interaction
    console.log(`✅ Deep Research started. ID: ${interactionId}`)
    
    return { success: true, interactionId: String(interactionId) }
  } catch (error: any) {
    console.error('Failed to start Deep Research:', error)
    // Fallback info for debugging
    return { success: false, error: `Deep Research init failed: ${error.message}` }
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
    const result = await (client as any).agentic.get(interactionId)

    if (result.status === 'completed' || result.done === true) {
      // Extract the final text output
      const outputs = result.outputs || result.candidates || []
      let report = ''
      if (outputs.length > 0) {
        const last = outputs[outputs.length - 1]
        report = last.text || last.content?.parts?.[0]?.text || JSON.stringify(last)
      } else if (result.text) {
        report = result.text
      } else if (result.response?.text) {
        report = result.response.text()
      }
      
      console.log(`✅ Deep Research complete. Report length: ${report.length} chars`)
      return { status: 'completed', report }
    }

    if (result.status === 'failed' || result.error) {
      return { status: 'failed', error: result.error?.message || 'Research failed' }
    }

    return { status: 'in_progress' }
  } catch (error: any) {
    console.error('Status check failed:', error)
    return { status: 'failed', error: error.message }
  }
}
