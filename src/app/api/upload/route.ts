import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { parseDocument, ParsedDocument } from '@/lib/document-parser'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min — vision OCR on multiple files can take a while

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB
const MAX_FILES = 10

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/markdown',
])

const ACCEPTED_EXT = /\.(pdf|docx|pptx|doc|ppt|png|jpe?g|webp|gif|txt|md)$/i

/**
 * POST /api/upload
 *
 * Multipart body — field name "files" repeated for each file.
 * Returns { documents: ParsedDocument[], errors: string[] }
 *
 * Stateless: nothing is stored. Caller (onboarding page) takes the extracted
 * text and feeds it into the product extractor, then drops the files.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files.length) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} files per upload` }, { status: 400 })
    }

    const documents: ParsedDocument[] = []
    const errors: string[] = []

    for (const file of files) {
      if (!(file instanceof File)) continue

      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: exceeds 50 MB limit`)
        continue
      }

      const isAcceptedMime = ACCEPTED_MIME.has(file.type)
      const isAcceptedExt = ACCEPTED_EXT.test(file.name)
      if (!isAcceptedMime && !isAcceptedExt) {
        errors.push(`${file.name}: unsupported type (${file.type || 'unknown'})`)
        continue
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const parsed = await parseDocument(file.name, file.type, buffer)
        documents.push(parsed)
      } catch (e: any) {
        errors.push(`${file.name}: ${e?.message ?? 'parse failed'}`)
      }
    }

    return NextResponse.json({ documents, errors })
  } catch (e: any) {
    console.error('upload route error', e)
    return NextResponse.json({ error: e?.message ?? 'Upload failed' }, { status: 500 })
  }
}
