import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured on server' }, { status: 500 })
    }
    const openai = new OpenAI({ apiKey })

    const { audio } = await req.json()
    
    if (!audio) {
      return NextResponse.json({ error: 'No audio data provided' }, { status: 400 })
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64')
    
    // Create a File-like object for the OpenAI API
    const audioFile = new File([audioBuffer], 'voice_note.webm', { type: 'audio/webm' })

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      language: 'en',
    })

    return NextResponse.json({ text: transcription.text })
  } catch (error: any) {
    console.error('Transcription failed:', error)
    return NextResponse.json(
      { error: error.message || 'Transcription failed' }, 
      { status: 500 }
    )
  }
}
