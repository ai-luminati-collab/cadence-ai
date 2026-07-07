import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // 25 MB (Whisper limit)

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }
    const openai = new OpenAI({ apiKey })

    const { audio } = await req.json()

    if (!audio) {
      return NextResponse.json({ error: 'No audio data provided' }, { status: 400 })
    }

    if (typeof audio !== 'string' || audio.length > MAX_AUDIO_BYTES * 1.37) {
      return NextResponse.json({ error: 'Audio data too large (max 25 MB)' }, { status: 400 })
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
      { error: 'Transcription failed' },
      { status: 500 }
    )
  }
}
